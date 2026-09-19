#!/usr/bin/env python3
"""生成 /wtrp/ v4 单页计算器的 data/catalog.json —— 唯一数据源。

v4 修复(v3 用户验收失败项的根因):
  1. 名字清块字符:names-zh 里 259 条带游戏"缴获"标记(▀▅▄▃▂ 等 U+2580-259F),统一剥除;
     v4.7 起不丢信息:有标记的节点记 captured=true,前端换成本树国籍小国旗(游戏原样);
  2. 缺图治理:image 仅在实际存在 png 时给出,否则 null,前端不再出现裂图;
  3. 分区:zone 由 availability 决定(游戏右区=非 researchable 全部),不再误信列号;
  4. 文件夹语义:组成员的前置=组根的前置(游戏"任选其一"),后继车从组内每一辆连边,
     研发链计算取 min,不再虚高;
  5. v4.7 活动别名去重:shop.blkx 同树并存 X 与 X_event 是历年活动重复上架(如德国
     一战车),只保留基础条目;无基础的 _event(英一战车/F-4E)保留并回退基础图。

输入:
  WTAPI_DIST/vehicles-full.json   (经济字段全量)
  WTAPI_DIST/names-zh.json        (简中名)
  WTAPI_IMG/                      (png 实存清单)
  data/ttm/c_<country>.json       (shop.blkx 列序/文件夹结构,gen_data.py 产物)

用法: PYTHONIOENCODING=utf-8 python gen_catalog.py
"""
import glob
import json
import os
import re
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
WTAPI = os.environ.get("WTAPI_DIST", "E:/ah/wtapi-build/dist/api")
IMGDIR = os.environ.get("WTAPI_IMG", "E:/ah/wtapi-build/dist/assets/images")

CLASS_MAP = {"ground": "army", "aviation": "aviation", "helicopters": "helicopter",
             "naval_blue": "bluewater", "naval_coastal": "coastal"}
NATION_ZH = {"usa": "美国", "germany": "德国", "ussr": "苏联", "britain": "英国", "japan": "日本",
             "china": "中国", "france": "法国", "italy": "意大利", "sweden": "瑞典", "israel": "以色列"}
AVAIL = {"researchable": "researchable", "premium": "premium", "pack": "pack",
         "market": "marketplace", "squadron": "squadron", "event": "event"}
EFFICIENCY = {
    "premium_max_target_rank_offset": 1,
    "target_above": {"0": 1.0, "1": 1.0, "2": 0.4, "3": 0.3}, "target_above_default": 0.2,
    "target_below": {"1": 0.9, "2": 0.3, "3": 0.1}, "target_below_default": 0.05,
}
BLOCK_CHARS = re.compile(r"[▀-▟]")
JUNK_CHARS = re.compile(r"[\u0000-\u001F\u2580-\u259F\u2419\u2421]")


def clean(s):
    return JUNK_CHARS.sub("", s).strip() if s else s


def main():
    veh = {v["identifier"]: v for v in json.load(open(os.path.join(WTAPI, "vehicles-full.json"), encoding="utf-8"))}
    names = json.load(open(os.path.join(WTAPI, "names-zh.json"), encoding="utf-8"))
    imgs = {f.lower() for f in os.listdir(IMGDIR) if f.lower().endswith(".png")}
    version = None
    nodes, edges, trees = [], [], []
    nid = {}
    next_id = 1
    stats = {"cleaned": 0, "noimg": 0, "folders": 0}

    for path in sorted(glob.glob(os.path.join(BASE, "data/ttm/c_*.json"))):
        cdata = json.load(open(path, encoding="utf-8"))
        country = cdata["country"]
        version = cdata["version"]
        for branch, entries in cdata["branches"].items():
            cls = CLASS_MAP[branch]
            # 历年活动重复上架去重:同树内 X_event 与基础条目并存时只留基础条目(有图);
            # 无基础的 _event(如 uk_garford_putilov_event、f_4e_event)保留,图回退基础名
            tree_ids = {e["id"] for e in entries}
            before = len(entries)
            entries = [e for e in entries
                       if not (e["id"].endswith("_event") and e["id"][:-6] in tree_ids)]
            stats["event_dupe"] = stats.get("event_dupe", 0) + (before - len(entries))
            for e in entries:
                nid[e["id"]] = next_id
                next_id += 1
            tnodes, tedges = [], []
            for e in entries:
                ident = e["id"]
                v = veh.get(ident)
                raw = names.get(ident.lower()) or ident.replace("_", " ")
                captured = bool(raw and BLOCK_CHARS.search(raw))
                disp = clean(raw)
                if disp != raw:
                    stats["cleaned"] += 1
                img_name = f"{ident.lower()}.png"
                if img_name not in imgs and ident.endswith("_event"):
                    base = f"{ident[:-6].lower()}.png"
                    # f_4e_event → f_4e 无图时再试 f-4e(美机连字符命名)
                    img_name = base if base in imgs else base.replace("_", "-")
                img = f"/wtapi/assets/images/{img_name}" if img_name in imgs else None
                if img is None:
                    stats["noimg"] += 1
                researchable = e["type"] == "researchable"
                rp_cost = (v.get("req_exp") or None) if v else None
                node = {
                    "id": nid[ident],
                    "identifier": ident,
                    "name": disp,
                    "nation": country,
                    "class": cls,
                    "rank": e["rank"],
                    "availability": AVAIL.get(e["type"], "special"),
                    "zone": "research" if researchable else "premium",
                    "tree_column": int(e["branch"][1:]),
                    "tree_order": 0,
                    "image": img,
                    "folder_of": None,
                    "rp_cost": rp_cost,
                    "ge_cost": (v.get("ge_cost") or None) if v else None,
                    "is_reserve": bool(researchable and not rp_cost),
                }
                if v and v.get("realistic_br"):
                    node["br"] = round(v["realistic_br"], 1)
                if captured:
                    node["captured"] = True
                tnodes.append(node)

            # tree_order(列×等级段内序号)+ folder_of(组根 id)
            seg_idx, last_root = {}, {}
            for e, node in zip(entries, tnodes):
                key = (node["tree_column"], node["rank"])
                seg_idx[key] = seg_idx.get(key, 0) + 1
                node["tree_order"] = seg_idx[key]
                if e.get("connection") == "folder":
                    node["folder_of"] = last_root.get(key)
                else:
                    last_root[key] = node["id"]

            # 文件夹索引:root/member -> 组内全部 id(解析 required_vehicle 用)
            group_of = {}
            groups = {}
            for node in tnodes:
                fo = node["folder_of"]
                if fo and fo != node["id"]:
                    groups.setdefault(fo, [fo]).append(node["id"])
            for g, members in groups.items():
                for m in members:
                    group_of[m] = g

            # 边:游戏文件夹语义(任选其一)重连;锚点按列隔离(跨列不连线)
            anchors, folder, prev_col = {}, None, None
            for i, (e, node) in enumerate(zip(entries, tnodes)):
                if e["type"] != "researchable":
                    continue
                col = node["tree_column"]
                if col != prev_col:
                    folder = None
                    prev_col = col
                if e.get("connection") == "folder" and folder:
                    for p in folder["preds"]:
                        tedges.append({"parent": p, "child": node["id"]})
                    folder["ids"].append(node["id"])
                    continue
                src = folder["ids"] if folder else anchors.get(col, [])
                if folder:
                    stats["folders"] += 1
                folder = None
                req = e.get("required_vehicle")
                if req and req in nid:
                    g = group_of.get(nid[req])
                    preds = list(groups[g]) if g else [nid[req]]
                else:
                    preds = list(src)
                for p in preds:
                    tedges.append({"parent": p, "child": node["id"]})
                anchors[col] = [node["id"]]
                nxt = entries[i + 1] if i + 1 < len(entries) else None
                if nxt and nxt.get("connection") == "folder":
                    folder = {"ids": [node["id"]], "preds": preds}

            # 分体防空配对(X_fcs 雷达车 + X_launcher 发射车 = 同一作战单元):
            # shop.blkx 把发射车塞在活动列(type=event);实际游戏里两者是同一研发单元的
            # 折叠卡。配对后:发射车归研究区雷达车位置、folder_of=雷达车、rp_cost=0,
            # 加一条 fcs->launcher 边(need(launcher)=0+need(fcs),选即整个单元)
            by_ident = {n["identifier"]: n for n in tnodes}
            for node in tnodes:
                ident = node["identifier"]
                if not ident.endswith("_launcher"):
                    continue
                fcs = by_ident.get(ident[: -len("_launcher")] + "_fcs")
                if not fcs or fcs["zone"] != "research":
                    continue
                node["zone"] = "research"
                node["availability"] = "researchable"
                node["ge_cost"] = None
                node["rp_cost"] = 0
                node["is_reserve"] = False
                node["tree_column"] = fcs["tree_column"]
                node["rank"] = fcs["rank"]
                node["tree_order"] = fcs["tree_order"] + 0.5
                node["folder_of"] = fcs["id"]
                tedges.append({"parent": fcs["id"], "child": node["id"]})
                stats["paired_sam"] = stats.get("paired_sam", 0) + 1

            research_cols = [n["tree_column"] for n in tnodes if n["zone"] == "research"]
            trees.append({
                "nation": country, "class": cls,
                "vehicle_count": len(tnodes),
                "research_column_count": max(research_cols) if research_cols else 0,
                "research_efficiency": EFFICIENCY,
                "source_version": version,
                "source_revision": None,
                "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })
            nodes.extend(tnodes)
            edges.extend(tedges)

    nations = [{"id": i + 1, "slug": s, "name": NATION_ZH[s]}
               for i, s in enumerate(["usa", "germany", "ussr", "britain", "japan",
                                       "china", "france", "italy", "sweden", "israel"])]
    catalog = {
        "schema_version": 1,
        "source": {"source": "war-thunder-datamine(anhappy /wtapi pipeline)", "version": version},
        "nations": nations,
        "classes": [{"id": 1, "name": "army"}, {"id": 2, "name": "helicopter"}, {"id": 3, "name": "aviation"},
                    {"id": 4, "name": "bluewater"}, {"id": 5, "name": "coastal"}],
        "nodes": nodes, "edges": edges, "trees": trees,
    }
    out = os.path.join(BASE, "data/catalog.json")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    print(f"catalog: {len(nodes)} 节点 / {len(edges)} 边 / {len(trees)} 树 / 版本 {version} / "
          f"{os.path.getsize(out) / 1024:.0f} KB")
    print(f"清洗块字符名 {stats['cleaned']} / 无图置空 {stats['noimg']} / 后继车接文件夹组 {stats['folders']} 处")
    m = next(n for n in nodes if n["identifier"] == "us_m1a2_abrams")
    print("抽检 M1A2:", m["name"], "rank", m["rank"], "rp", m["rp_cost"], "zone", m["zone"])


if __name__ == "__main__":
    main()
