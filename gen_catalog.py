#!/usr/bin/env python3
"""生成 GrindTracker 前端的 data/catalog.json(schema_version 1)——用我们自己的 2.59 数据
替换作者 2.58 的英文 catalog,数据一次点亮中文名+图片+前置链。

输入:
  ../wtapi-build/dist/api/vehicles-full.json   (经济字段全量)
  ../wtapi-build/dist/api/names-zh.json        (简中名)
  tree/ttm-data/c_<country>.json               (shop.blkx 列序/文件夹结构,gen_data.py 产物)
  app/public/data/catalog.json(上游原件,读其中的 research_efficiency 规则与类别表)

用法: PYTHONIOENCODING=utf-8 <venv>/python gen_catalog.py
"""
import glob
import json
import os
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
WTAPI = os.environ.get("WTAPI_DIST", "E:/ah/wtapi-build/dist/api")

CLASS_MAP = {"ground": "army", "aviation": "aviation", "helicopters": "helicopter",
             "naval_blue": "bluewater", "naval_coastal": "coastal"}
NATION_ZH = {"usa": "美国", "germany": "德国", "ussr": "苏联", "britain": "英国", "japan": "日本",
             "china": "中国", "france": "法国", "italy": "意大利", "sweden": "瑞典", "israel": "以色列"}
AVAIL = {"researchable": "researchable", "premium": "premium", "pack": "pack",
         "market": "marketplace", "squadron": "squadron", "event": "event"}


def main():
    veh = {v["identifier"]: v for v in json.load(open(os.path.join(WTAPI, "vehicles-full.json"), encoding="utf-8"))}
    names = json.load(open(os.path.join(WTAPI, "names-zh.json"), encoding="utf-8"))
    upstream = json.load(open(os.path.join(BASE, "app/public/data/catalog.json"), encoding="utf-8"))
    efficiency = upstream["trees"][0].get("research_efficiency") or {
        "premium_max_target_rank_offset": 1,
        "target_above": {"0": 1.0, "1": 1.0, "2": 0.4, "3": 0.3}, "target_above_default": 0.2,
        "target_below": {"1": 0.9, "2": 0.3, "3": 0.1}, "target_below_default": 0.05,
    }
    version = None
    nodes, edges, trees = [], [], []
    nid = {}          # identifier -> 数字 id(顺序分配,稳定)
    next_id = 1

    for path in sorted(glob.glob(os.path.join(BASE, "tree/ttm-data/c_*.json"))):
        cdata = json.load(open(path, encoding="utf-8"))
        country = cdata["country"]
        version = cdata["version"]
        for branch, entries in cdata["branches"].items():
            cls = CLASS_MAP[branch]
            # 数字 id 分配(整树先分配,建边要用)
            for e in entries:
                nid[e["id"]] = next_id
                next_id += 1
            # 科技树列数 = 科技树车所在的最大列(shop 布局:高级/市场列总在最后)
            research_cols = [int(e["branch"][1:]) for e in entries if e["type"] == "researchable"]
            col_count = max(research_cols) if research_cols else 0
            tnodes, tedges = [], []
            per_col_prev = {}
            for e in entries:
                ident = e["id"]
                v = veh.get(ident)
                node = {
                    "id": nid[ident],
                    "identifier": ident,
                    "name": names.get(ident.lower()) or ident.replace("_", " "),
                    "nation": country,
                    "class": cls,
                    "rank": e["rank"],
                    "type": "tree" if e["type"] == "researchable" else "premium",
                    "is_reserve": False,
                    "availability": AVAIL.get(e["type"], "special"),
                    "tree_column": int(e["branch"][1:]),
                    "tree_order": 0,
                    "image": f"/wtapi/assets/images/{ident.lower()}.png",
                    "folder_of": None,
                }
                if v:
                    node["br"] = {"ab": v.get("arcade_br"), "rb": v.get("realistic_br"), "sb": v.get("simulator_br")}
                    node["rp_multiplier"] = v.get("exp_mul")
                    node["rp_cost"] = v.get("req_exp") or None
                    node["ge_cost"] = v.get("ge_cost") or None
                    node["marketplace_item_id"] = v.get("on_marketplace") and 1 or None
                tnodes.append(node)
            # tree_order + folder_of + 边(同列顺序推进)
            col_idx = {}
            folder_root = {}
            last_group_root = {}
            for e, node in zip(entries, tnodes):
                ci = node["tree_column"]
                col_idx[ci] = col_idx.get(ci, 0) + 1
                node["tree_order"] = col_idx[ci]
                if e.get("connection") == "folder":
                    node["folder_of"] = last_group_root.get((ci, node["rank"]))
                else:
                    last_group_root[(ci, node["rank"])] = node["id"]
            for e, node in zip(entries, tnodes):
                if e["type"] != "researchable":
                    continue
                req = e.get("required_vehicle")
                if req and req in nid:
                    tedges.append({"parent": nid[req], "child": node["id"], "unlock_rp": None})
                else:
                    prev = per_col_prev.get(node["tree_column"])
                    if prev is not None:
                        tedges.append({"parent": prev, "child": node["id"], "unlock_rp": None})
                per_col_prev[node["tree_column"]] = node["id"]
            nodes.extend(tnodes)
            edges.extend(tedges)
            trees.append({
                "nation": country, "class": cls,
                "vehicle_count": len(tnodes),
                "research_column_count": col_count,
                "research_efficiency": efficiency,
                "source_version": version,
                "source_revision": None,
                "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })

    classes = [{"id": 1, "name": "army"}, {"id": 2, "name": "helicopter"}, {"id": 3, "name": "aviation"},
               {"id": 4, "name": "bluewater"}, {"id": 5, "name": "coastal"}]
    nations = [{"id": i + 1, "slug": s, "name": NATION_ZH[s]}
               for i, s in enumerate(["usa", "germany", "ussr", "britain", "japan",
                                       "china", "france", "italy", "sweden", "israel"])]
    catalog = {
        "schema_version": 1,
        "source": {"source": "war-thunder-datamine(anhappy /wtapi pipeline)", "version": version},
        "nations": nations, "classes": classes, "nodes": nodes, "edges": edges, "trees": trees,
    }
    out = os.path.join(BASE, "app/public/data/catalog.json")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    print(f"catalog: {len(nodes)} 节点 / {len(edges)} 边 / {len(trees)} 树 / 版本 {version} / {os.path.getsize(out)/1024:.0f} KB")
    # 抽检
    m = next(n for n in nodes if n["identifier"] == "us_m1a2_abrams")
    print("抽检 M1A2:", m["name"], "rank", m["rank"], "rp", m["rp_cost"], "前置边",
          [e for e in edges if e["child"] == m["id"]])


if __name__ == "__main__":
    main()
