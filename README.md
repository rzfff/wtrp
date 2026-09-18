# wtrp — War Thunder 研发点计算器

anhappy.com/wtrp 的源码(线上 https://anhappy.com/wtrp/ )。纯静态原创实现(MIT):零后端、零构建、零常驻内存。

## 功能

- 10 国 × 5 分支(陆战/空战/直升机/蓝水海军/海岸海军)科技树,布局=游戏内列序(shop.blkx)
- 载具卡:官方 statcard 图 + 简体中文名 + 类别配色(科技树/高级·金币/礼包/市场/中队)
- 点击载具 → 标记已拥有(localStorage 持久)/ 设为目标
- 最短合法研发路径(前置闭包:required_vehicle + 列内顺序),绿色「直达」标注(AB 130%/RB·SB 110% 且覆盖等级惩罚)
- 总账:剩余研发点 / 购买银狮 / 礼包金鹰 + 换算(场次/时长按"有效RP/场"净值输入;金鹰全转换按官方 1 GE = 45 RP)

## 数据依赖(运行时)

| 数据 | 来源 |
|---|---|
| 载具经济/前置/类别旗 | `https://anhappy.com/wtapi/api/vehicles-full.json`(姊妹服务 /wtapi/) |
| 简体中文名 | `/wtapi/api/names-zh.json`(datamine units.csv 官方简中) |
| statcard 图 | `/wtapi/assets/images/<id>.png` |
| 科技树布局 | 本仓 `data/trees.json`(`gen_tree.py` 从 gszabi99/War-Thunder-Datamine 的 shop.blkx 生成) |

## 更新数据(WT 大版本)

```
# datamine 在本机 E:\ah\wtapi-build\datamine(先 git pull 到新版本)
PYTHONIOENCODING=utf-8 python gen_tree.py     # 重产 data/trees.json
# 上传 index.html/app.js/style.css/data/trees.json 到服务器 /opt/services/wtrp/
```

## 许可

- 代码:MIT(见 LICENSE)
- 数据与载具名/图片:© Gaijin Entertainment(游戏文件公开 datamine 提取,仅作非商业粉丝工具用途;Not affiliated with Gaijin Entertainment)
- 科技树布局数据同上(game data,事实性提取)
