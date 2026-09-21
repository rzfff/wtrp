# WT 研发点计算器(/wtrp/)

单页静态应用:游戏布局的科技树 + 研发点计算。数据来自本站 `/wtapi/` 管线(war-thunder-datamine 2.59.0.19)。

在线:https://anhappy.com/wtrp/

## 功能

- **科技树与游戏一致**:等级横带 × 分支纵列;文件夹堆叠(+N,点开选组内成员);金币/活动/市场/联队/礼包载具统一在右侧区(白线分隔),按种类着色。
- **多选合计**:点选任意载具,右侧列出每辆花费与研发点合计(仅所选载具自身,不含前置);单选一辆可展开完整研发链(逐前置列出 RP,取"文件夹任选其一"的最便宜路径)。
- 全中文(界面 + 载具名);官方 statcard 图;搜索过滤;选择结果 localStorage 保存;`#国家/兵种` URL 锚点。
- 零构建、零外部依赖、零跟踪:纯 HTML/CSS/JS,图片走 `/wtapi/assets/images/`。

## 目录

| 文件 | 说明 |
|---|---|
| `index.html` `style.css` `app.js` | 前端三件套 |
| `calc.js` | 研发链计算核心(浏览器 `window.WTCalc` / Node `require` 双兼容) |
| `data/catalog.json` | 唯一运行时数据(3288 节点 / 2710 边 / 44 树,schema_version 1) |
| `flags/*.svg` | 缴获/外国载具名前的国家旗标(游戏 datamine 原生 SVG) |
| `data/ttm/c_*.json` | 中间产物(gen_data.py 输出,shop.blkx 列序/文件夹) |
| `gen_data.py` | datamine `shop.blkx` → 每国列序数据(含 `showOnlyWhenBought` 右区标记) |
| `gen_catalog.py` | 合并 vehicles-full + 简中名 + 图清单 → catalog.json(清块字符/缺图置空/文件夹任选连边) |
| `validate-data.mjs` | 离线数据+计算断言(29 项,`node validate-data.mjs`) |
| `check-wtrp.mjs` | 线上端到端验收(49 项,`node check-wtrp.mjs`) |
| `smoke-render.mjs` | 渲染级冒烟(43 项,jsdom 真跑页面;`node smoke-render.mjs [--live]`,需 devDependency jsdom@22) |
| `test-folder.html` | 截图验证工具:自动点开第一个文件夹(上传服务器同目录→无头 Chrome 截图→删) |

## 更新流程(WT 大版本)

1. wtapi 管线换版(`E:\ah\wtapi-build\`,datamine pull → 提取 → 导出)。
2. `PYTHONIOENCODING=utf-8 python gen_data.py && python gen_catalog.py`
3. `node validate-data.mjs` 全绿。
4. 打包 `index.html style.css app.js calc.js data/catalog.json` 上服务器 `/opt/services/wtrp/`。
5. 前端有改动先 bump index.html 里三件套引用的 `?v=` 版本号(防浏览器 30 天缓存毒化;nginx /wtrp/ 已固定 no-cache 双保险),`node check-wtrp.mjs` + `node smoke-render.mjs --live` 全绿。

## 数据要点(踩坑记录)

- **右区判定**:datamine 的 premium 标志不全(一战车/杯赛车/promo 全漏),权威信号是 `shop.blkx` 条目的 `showOnlyWhenBought`;有 `ge_cost` 归金币、否则归活动。
- **文件夹语义**:组成员的前置 = 组根的前置(游戏"任选其一"),后继车向组内每辆连边,计算取 min。
- **名字清洗**:names-zh 含游戏"缴获"标记(▀▅▄▃▂ U+2580-259F),生成时剥除。
- **shop.blkx 脏键**:`reqAir`/`rank`/`slaveUnit` 等配置键混在载具列里,按 vehicles-full 名单过滤。
- **锚点按列隔离**:跨列不连边(每列顶部是各等级 I 级起点,无前置)。

## 鸣谢

感谢 [blind-thunder.wiki](https://blind-thunder.wiki/)、[GrindTracker](https://github.com/ItsMeRaijiN/GrindTracker-WarThunder_RP_Calculator) 与 [WT-Tech-Tree-Maker](https://github.com/przemyslaw-zan/WT-Tech-Tree-Maker) 带来的灵感与参考。数据源于 Gaijin 官方 datamine 与社区简中翻译。

## 许可

MIT(见 LICENSE)。载具图片版权归 Gaijin Entertainment 所有。
