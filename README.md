# wtrp — WT 研发点计算器

线上:https://anhappy.com/wtrp/ 。纯静态部署(零后端、零常驻内存)。

## 构成

| 部分 | 说明 |
|---|---|
| `app/` | **主体应用 = [GrindTracker](https://github.com/ItsMeRaijiN/GrindTracker-WarThunder_RP_Calculator)(ItsMeRaijiN)前端改造版**:React 19 + Vite + TS,纯静态模式(VITE_DATA_MODE=static)。已获作者许可使用(见 LICENSE-GT-NOTE);改造点=全量中文化、载具卡/详情显示官方 statcard 图、目录数据换成我们管线产的 2.59 简中版、部署于 /wtrp/ 子路径、顶栏入口链到游戏样式科技树 |
| `tree/` | **游戏样式科技树 = [WT-Tech-Tree-Maker](https://github.com/przemyslaw-zan/WT-Tech-Tree-Maker)(przemyslaw-zan,MIT)渲染核心改造**:等级横带×纵列=游戏布局、文件夹组、高级/礼包/市场/中队右侧区,官方图+简中名 |
| `gen_catalog.py` | 生成 app/public/data/catalog.json(GrindTracker schema):/wtapi/ 数据(2.59.0.13)+ names-zh + statcard 图路径 + shop.blkx 列序/文件夹 → 3342 节点/2190 前置边/44 树 |
| `gen_data.py` | 生成 tree/ttm-data/c_<国家>.json(TTM 格式) |

## 数据

运行时同源依赖姊妹服务 **/wtapi/**(statcard 图 `assets/images/<id>.png`);catalog 与树数据随 WT 大版本重新生成(流程:datamine pull → wtapi 管线 → `gen_data.py` + `gen_catalog.py` → 构建/上传,详见 `/root/docs/wtrp-deploy-plan/steps.md`)。

## 构建

```bash
# Windows,Node ≥22(本机 C:\Program Files\nvm\v24.20.0),依赖走 npmmirror(app/.npmrc 已配)
cd app && npm install && npm run build   # 产物 app/dist/(tsc 类型检查 + vite)
```

## 许可与归属

- GrindTracker 前端:© ItsMeRaijiN,**经作者许可用于本站**(2026-09 站长联系取得;上游仓库无 LICENSE 文件,见 LICENSE-GT-NOTE)
- WT-Tech-Tree-Maker 渲染核心:MIT(见 LICENSE-TTM)
- 本仓库对二者的改造与其余脚本:MIT(见 LICENSE)
- 载具名与图片 © Gaijin Localization;数据来自 gszabi99/War-Thunder-Datamine 公开采掘,仅作非商业粉丝工具用途
- Not affiliated with Gaijin Entertainment
