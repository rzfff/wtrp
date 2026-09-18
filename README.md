# wtrp — WT 研发点计算器

线上:https://anhappy.com/wtrp/ 。纯静态(零后端、零构建、零常驻内存)。

**科技树渲染核心基于 [WT-Tech-Tree-Maker](https://github.com/przemyslaw-zan/WT-Tech-Tree-Maker)(przemyslaw-zan,MIT)修改**(上游许可见 LICENSE-TTM):保留了它的等级横带 × 纵列布局、文件夹组、连线箭头与右侧高级区机制;移除了编辑器(CKEditor/galleria/jQuery/select2),改为数据管线加载,并叠加计算层。本仓库其余代码以 MIT 提供(见 LICENSE)。

## 功能

- 10 国 × 5 分支(陆战/空战/直升机/蓝水海军/海岸海军)科技树,**布局=游戏内列序**(shop.blkx),等级 I-VII 横带、纵列、文件夹组(+N)、科技树连线箭头、高级/礼包/市场/中队车在右侧独立区(白线分隔),卡片背景色按类别区分
- 每张卡片:官方 statcard 图 + 简体中文名 + BR + NATO 风格类别图标
- 点击载具:详情弹窗(图/等级/BR/研发开销/前置)+ **已拥有**(✓,localStorage 持久)+ **加入目标(可多选!)**
- 计算面板(多目标):前置闭包并集 → 待研发台数 / 剩余研发点 / 购买银狮 / 高级直购金鹰 / 约合场次 / 约合时长 / 金鹰全转换(1 GE=45 RP);每目标单独列出
- 路径高亮:目标金色框、路径前置蓝色虚线框、已拥有灰绿 ✓
- 输入"有效RP/场"(F2P/高账/高+符 预设)与"每场分钟",localStorage 记忆

## 数据

| 数据 | 来源 |
|---|---|
| 科技树布局+类别+经济字段 | `gen_data.py` 生成 → `data/c_<country>.json`(10 国,共 ~890KB;shop.blkx 列序 + follow 链锁序 + 文件夹组展开) |
| statcard 图 / 中文名 | 运行时取姊妹服务 `/wtapi/`(assets/images、names-zh、vehicles-full 的 required_vehicle 前置链) |

## 更新数据(WT 大版本)

```bash
# 前置:本机 E:\ah\wtapi-build\datamine 已 git pull 到新版本,/wtapi/ 已换版
PYTHONIOENCODING=utf-8 python gen_data.py    # 重产 data/c_*.json
# 上传 index.html style.css script.js data/ → 服务器 /opt/services/wtrp/(data/ 是 no-cache,即时生效)
```

## 许可与归属

- 本仓库代码:MIT(LICENSE);内含 WT-Tech-Tree-Maker 上游 MIT 许可副本(LICENSE-TTM)
- 载具名与图片 © Gaijin Localization;数据来自公开 datamine(gszabi99),仅作非商业粉丝工具用途
- Not affiliated with Gaijin Entertainment
