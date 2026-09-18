#!/usr/bin/env python3
"""生成 /wtrp/ 数据:data/c_<country>.json(每国一文件,含全部分支)。

条目为 WT-Tech-Tree-Maker(przemyslaw-zan,MIT)的 vehicleList 格式 + 计算扩展字段:
  { id, name(简中), rank, br, type, connection, branch, follow?, thumbnail, classIcon,
    req_exp, value, ge_cost, required_vehicle }   ← 后四项为计算层字段

类型映射(进 TTM 高级区=游戏右侧区):
  科技树→researchable / 高级·礼包→premium / 礼包→pack / 市场→market / 市场高级→market /
  中队→squadron / 活动车→event
列序保持:同一 (rank,列) 段内用 follow 链锁住 shop.blkx 顺序(TTM 按 BR 排序后 follow 重排)。
文件夹组:同段内的组成员 connection='folder'(紧随根车)。

用法: PYTHONIOENCODING=utf-8 <venv>/python gen_data.py
依赖: ../wtapi-build/datamine(shop.blkx) + ../wtapi-build/dist/api/{vehicles-full,names-zh}.json
"""
import json
import os
from datetime import date

DM = os.environ.get("DATAMINE", "E:/ah/wtapi-build/datamine")
WTAPI = os.environ.get("WTAPI_DIST", "E:/ah/wtapi-build/dist/api")

BRANCH_MAP = {"army": "ground", "aviation": "aviation", "helicopters": "helicopters",
              "ships": "naval_blue", "boats": "naval_coastal"}
ICON_MAP = {
    "light_tank": "lt", "medium_tank": "mt", "heavy_tank": "ht", "tank_destroyer": "td",
    "spaa": "spaa", "tank": "mt", "lbv": "lt", "mbv": "mt", "hbv": "ht", "exoskeleton": "none",
    "fighter": "fighter", "assault": "attacker", "bomber": "bomber",
    "attack_helicopter": "ahel", "utility_helicopter": "uhel",
    "ship": "dd", "destroyer": "dd", "frigate": "dd", "light_cruiser": "cl",
    "heavy_cruiser": "ca", "battlecruiser": "cc", "battleship": "bb",
    "submarine": "tboat", "boat": "tboat", "heavy_boat": "gboat", "barge": "barge",
    "naval_ferry_barge": "barge", "submarine_chaser": "gboat", "gun_boat": "gboat",
    "torpedo_boat": "tboat", "torpedo_gun_boat": "gboat",
}


def cat_map(v):
    if v is None:
        return "event"
    if v["squadron_vehicle"]:
        return "squadron"
    if v["is_pack"]:
        return "pack"
    if v["on_marketplace"]:
        return "market"
    if v["is_premium"]:
        return "premium"
    return "researchable"


def main():
    shop = json.load(open(os.path.join(DM, "char.vromfs.bin_u/config/shop.blkx"), encoding="utf-8"))
    veh = {v["identifier"]: v for v in json.load(open(os.path.join(WTAPI, "vehicles-full.json"), encoding="utf-8"))}
    names = json.load(open(os.path.join(WTAPI, "names-zh.json"), encoding="utf-8"))
    version = open(os.path.join(DM, "version"), encoding="utf-8").read().strip()

    os.makedirs("data", exist_ok=True)
    out = {"version": version, "generated": date.today().isoformat(), "countries": {}}
    total = 0
    for ckey, branches in shop.items():
        if not ckey.startswith("country_"):
            continue
        country = ckey.replace("country_", "")
        cdata = {}
        for bkey, bval in branches.items():
            if bkey not in BRANCH_MAP or not isinstance(bval, dict) or "range" not in bval:
                continue
            entries = []
            for ci, col in enumerate(bval["range"]):
                if not isinstance(col, dict):
                    continue
                branch_id = f"c{ci + 1}"
                # 展平折叠组:成员标记 folder(同段内紧随前一辆)
                flat = []

                def walk(d, group):
                    for k, v in d.items():
                        if k == "image":
                            continue
                        if isinstance(v, dict) and "image" in v:
                            walk(v, k[:-6] if k.endswith("_group") else k)
                        else:
                            flat.append((k, group))

                walk(col, None)
                prev_in_rank = {}  # rank -> 上一个条目 id(锁顺序用)
                last_group = last_rank = last_ttype = None
                for vid, group in flat:
                    v = veh.get(vid)
                    rank = v["era"] if v else 1
                    ttype = cat_map(v)
                    # 文件夹链:与前一辆同组、同段(rank)、双方都是科技树车 → folder(紧随组根)
                    in_folder = (group is not None and group == last_group and rank == last_rank
                                 and ttype == "researchable" and last_ttype == "researchable")
                    e = {
                        "id": vid,
                        "name": names.get(vid.lower()) or vid.replace("_", " "),
                        "rank": rank,
                        "br": round(v["realistic_br"] or 1.0, 1) if v else 1.0,
                        "type": ttype,
                        "connection": "folder" if in_folder else ("yes" if ttype == "researchable" else "no"),
                        "branch": branch_id,
                        "thumbnail": f"/wtapi/assets/images/{vid.lower()}.png",
                        "classIcon": ICON_MAP.get(v["vehicle_type"], "none") if v else "none",
                    }
                    if v:
                        e.update({"req_exp": v.get("req_exp", 0), "value": v.get("value", 0),
                                  "ge_cost": v.get("ge_cost", 0), "required_vehicle": v.get("required_vehicle")})
                    # follow 链:同 (rank, branch) 段内锁 shop 顺序(仅科技树车参与连线区)
                    if ttype == "researchable":
                        prev = prev_in_rank.get(rank)
                        if prev:
                            e["follow"] = prev
                        prev_in_rank[rank] = vid
                    entries.append(e)
                    total += 1
                    last_group, last_rank, last_ttype = group, rank, ttype
            cdata[BRANCH_MAP[bkey]] = entries
        out["countries"][country] = cdata

    # 每国一文件(页面按需取一国)
    for country, cdata in out["countries"].items():
        with open(f"data/c_{country}.json", "w", encoding="utf-8", newline="\n") as f:
            json.dump({"version": out["version"], "country": country, "branches": cdata},
                      f, ensure_ascii=False, separators=(",", ":"))
    sizes = sum(os.path.getsize(f"data/{f}") for f in os.listdir("data") if f.startswith("c_"))
    print(f"version={version} 条目={total} 10 国文件共 {sizes/1024:.0f} KB")


if __name__ == "__main__":
    main()
