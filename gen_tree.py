#!/usr/bin/env python3
"""从 datamine shop.blkx 生成 /wtrp/ 的科技树布局 JSON。

shop.blkx 结构(2026-09-19 解剖):
  country_<n> -> {army|aviation|helicopters|ships|boats} -> range = [列0, 列1, ...]
  每列是有序 dict:键 = 载具 id 或 "<名>_group";组值含 "image" 键 + 嵌套载具(有序);
  载具条目 = {"rank": N}

输出(写到本目录 data/trees.json):
  { "version": <游戏版本>, "generated": <日期>,
    "columns": { "<country>": { "ground|aviation|helicopters|naval_blue|naval_coastal": [[id,...], ...] } },
    "groups":  { "<id>": "<组名>" },          # 折叠组归属(组名去掉 _group)
    "gates":   { "<id>": [n1,n2,n3,n4] } }    # wpcost 的 needBuyToOpenNextInTier1-4

用法: PYTHONIOENCODING=utf-8 <venv>/python gen_tree.py   (在 wtrp 目录跑)
"""
import json
import os
import sys
from datetime import date

DATAMINE = os.environ.get("DATAMINE", "E:/ah/wtapi-build/datamine")

BRANCH_MAP = {"army": "ground", "aviation": "aviation", "helicopters": "helicopters",
              "ships": "naval_blue", "boats": "naval_coastal"}


def main():
    shop = json.load(open(os.path.join(DATAMINE, "char.vromfs.bin_u/config/shop.blkx"), encoding="utf-8"))
    wpcost = json.load(open(os.path.join(DATAMINE, "char.vromfs.bin_u/config/wpcost.blkx"), encoding="utf-8"))
    version = open(os.path.join(DATAMINE, "version"), encoding="utf-8").read().strip()

    columns, groups, gates = {}, {}, {}
    n_veh = 0
    for ckey, branches in shop.items():
        if not ckey.startswith("country_"):
            continue
        country = ckey.replace("country_", "")
        columns[country] = {}
        for bkey, bval in branches.items():
            if bkey not in BRANCH_MAP or not isinstance(bval, dict) or "range" not in bval:
                continue
            out_cols = []
            for col in bval["range"]:
                if not isinstance(col, dict):
                    continue
                ids = []

                def walk(d, group):
                    nonlocal n_veh
                    for k, v in d.items():
                        if k == "image":
                            continue
                        if isinstance(v, dict) and "image" in v:  # 折叠组
                            walk(v, k[:-6] if k.endswith("_group") else k)
                        else:
                            ids.append(k)
                            if group:
                                groups[k] = group
                            n_veh += 1

                walk(col, None)
                out_cols.append(ids)
            columns[country][BRANCH_MAP[bkey]] = out_cols

    for vid, w in wpcost.items():
        if not isinstance(w, dict):
            continue
        gate = [w.get(f"needBuyToOpenNextInTier{i}") for i in range(1, 5)]
        if any(g is not None for g in gate):
            gates[vid] = gate

    out = {"version": version, "generated": date.today().isoformat(),
           "columns": columns, "groups": groups, "gates": gates}
    os.makedirs("data", exist_ok=True)
    with open("data/trees.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(ids) for cs in columns.values() for bs in cs.values() for ids in bs)
    print(f"version={version} countries={len(columns)} 载具槽位={total} 组={len(groups)} 门槛建={len(gates)}")
    for c in ("usa", "germany", "ussr"):
        print(c, {b: [len(col) for col in columns[c][b]] for b in columns[c]})


if __name__ == "__main__":
    main()
