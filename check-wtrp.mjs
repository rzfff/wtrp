// /wtrp/ v4 线上验证(node check-wtrp.mjs)
// 覆盖:单页资源 / 数据完整性 / 计算端到端 / 旧树页已退役 / 无外部 CDN
import { spawnSync } from "child_process";
import { createRequire } from "module";
const require2 = createRequire(import.meta.url);
const WTCalc = require2("E:/ah/wtrp/calc.js");

const HOST = "https://anhappy.com";
function get(path) {
  const r = spawnSync("curl", ["-sk", "--compressed", "-o", "-", "-w", "\n%{http_code} %{content_type}", HOST + path],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("curl exit " + r.status + " " + path);
  const i = r.stdout.lastIndexOf("\n");
  return { body: r.stdout.slice(0, i), meta: r.stdout.slice(i + 1).trim().split(" ") };
}
let bad = 0;
const check = (name, ok, extra = "") => {
  if (!ok) bad++;
  console.log((ok ? "OK  " : "FAIL ") + name + (ok ? "" : (extra ? "  >> " + extra : "")));
};

// 1) 页面资源
const idx = get("/wtrp/");
check("index 200 html", idx.meta[0] === "200" && idx.meta[1].includes("text/html"));
check("标题=WT 研发点计算器", idx.body.includes("WT 研发点计算器"));
for (const f of ["style.css", "app.js", "calc.js"]) {
  const r = get("/wtrp/" + f);
  check(f + " 200", r.meta[0] === "200", r.meta[0]);
}
const appjs = get("/wtrp/app.js").body;
try { new Function(appjs); check("app.js 语法 OK", true); } catch (e) { check("app.js 语法: " + e.message, false); }
check("app.js 关键文案", appjs.includes("研发点合计") && appjs.includes("已选载具"));
check("index 搜索框/占位", idx.body.includes("搜索载具名称"));
check("CSP 放行内联样式(图/弹层定位)", idx.body.includes("style-src 'self' 'unsafe-inline'"));
check("app.js 用 img 标签且无内联 onerror", appjs.includes("<img") && !appjs.includes("onerror=") && !appjs.includes("background-image:url"));
check("app.js blind-thunder 折叠移植(v4.5)", appjs.includes("folding-panel") && appjs.includes("toggleFolder") && appjs.includes("veil") && !appjs.includes("fold-body"));
check("app.js 文件夹=真实卡+垫层壳(v4.3)", appjs.includes('"fshell"') && appjs.includes("cardEl(unit.root)"));
check("app.js 无「文件夹/全选」标签回归(v4.3 挤压竖排根除)", !appjs.includes("任选其一") && !appjs.includes("全选"));
const csslive = get("/wtrp/style.css").body;
check("style.css 包裹面板+面纱(v4.5)", csslive.includes(".folder.open .folding-panel") && csslive.includes("#veil") && !csslive.includes("fold-body"));
check("style.css v5.2:卡宽130(1680零横滚解)+图区62+图上间隔5px", csslive.includes("width: 130px") && csslive.includes("--img-h: 62px") && csslive.includes("padding-top: 5px") && csslive.includes(".cname .br"));
check("style.css v4.7:面纱更轻可辨字+图片contain", csslive.includes("blur(2px)") && csslive.includes("rgba(8, 12, 14, .38)") && csslive.includes("object-fit: contain"));
check("style.css v4.7:fstack 无额外外边距(文件夹下列卡与邻列对齐)", !csslive.includes("margin-bottom: 10px"));
check("app.js v4.6:千分符+按类计价+组合单元", appjs.includes("组合单元") && appjs.includes('case "pack": return "礼包"') && appjs.includes('case "marketplace": return "市场"') && !appjs.includes('" 亿"'));
check("app.js v5.3:无旗标 img(图标=WTSymbols 字体)+海军名正确", !appjs.includes("flgImg") && !appjs.includes('class="flg"') && appjs.includes("远洋海军") && appjs.includes("近岸海军") && !appjs.includes("蓝水"));
check("index 引用带 ?v= 版本号(破 30 天缓存毒化)", idx.body.includes("app.js?v=") && idx.body.includes("style.css?v="));
check("style.css 卡片定宽(换页不变)", get("/wtrp/style.css").body.includes("width: 130px"));
check("app.js v5.3:BR 徽标+银狮行(slText/银狮)", appjs.includes("brChip") && appjs.includes('toFixed(1)') && appjs.includes("slText") && appjs.includes("银狮"));
check("app.js v5.0:合计文案=仅所选不含前置", appjs.includes("仅所选载具,不含前置") && !appjs.includes("共享前置已去重"));
check("app.js v5.3:金鹰合计仅金币车+银狮合计", appjs.includes("金鹰合计(仅金币载具)") && appjs.includes("银狮合计(购买价)"));
check("wtrp 符号字体在役(WTSymbols 自托管)", get("/wtrp/fonts/symbols_skyquake.ttf").meta[0] === "200");
check("wtrp favicon 在役", get("/wtrp/favicon.ico").meta[0] === "200" && idx.body.includes('rel="icon"'));
check("app.js 无旧树页链接", !appjs.includes("tree.html"));
const calcjs = get("/wtrp/calc.js").body;
try { new Function(calcjs); check("calc.js 语法 OK", true); } catch (e) { check("calc.js 语法: " + e.message, false); }
check("index 无外部 CDN", !/fonts\.googleapis|cdnjs\.cloudflare|cdn\.jsdelivr/.test(idx.body));

// 2) 数据完整性(线上 catalog)
const c = get("/wtrp/data/catalog.json");
check("catalog 200 json", c.meta[0] === "200" && c.meta[1].includes("application/json"), c.meta.join(" "));
check("catalog 缴获标记 captured(515,图标=名字原样字符)", c.body.includes('"captured":true'));
check("catalog 名字保留图标前缀字符(v5.3,字体渲染)", /\u2580|\u2417|\u25D4/.test(c.body) && c.body.includes('"sl_cost"'));
check("catalog 含分区标记", c.body.includes('"zone":"research"') && c.body.includes('"zone":"premium"'));
const cat = JSON.parse(c.body);
check("版本 2.59.0.19", cat.source.version === "2.59.0.19");
check("规模 节点≥3250/边≥2650/树44", cat.nodes.length >= 3250 && cat.edges.length >= 2650 && cat.trees.length === 44,
  `${cat.nodes.length}/${cat.edges.length}/${cat.trees.length}`);
check("节点 zone⟺availability", cat.nodes.every(n => (n.zone === "research") === (n.availability === "researchable")));
check("图片引用全部 /wtapi/ 或 null", cat.nodes.every(n => n.image === null || n.image.startsWith("/wtapi/assets/images/")));

// 3) 计算端到端(线上数据 × 本地 calc.js)
const ix = WTCalc.buildIndex(cat);
const byIdent = Object.fromEntries(cat.nodes.map(n => [n.identifier, n]));
const identOf = id => cat.nodes.find(n => n.id === id)?.identifier;
const need = t => WTCalc.need(ix, byIdent[t].id);
const parentsOf = t => (ix.preds.get(byIdent[t].id) || []).map(identOf);
check("M1A2 前置=M1 文件夹组", JSON.stringify(parentsOf("us_m1a2_abrams").sort()) === JSON.stringify(["us_m1a1_abrams", "us_m1_ip_abrams"].sort()),
  JSON.stringify(parentsOf("us_m1a2_abrams")));
check("M1A2 链=350000+min(M1A1,M1IP)", need("us_m1a2_abrams").rp === 350000 + Math.min(need("us_m1a1_abrams").rp, need("us_m1_ip_abrams").rp),
  String(need("us_m1a2_abrams").rp));
check("文件夹成员前置=组根前置", JSON.stringify(parentsOf("us_m4_sherman")) === JSON.stringify(["us_m3_lee"]), JSON.stringify(parentsOf("us_m4_sherman")));
const t2 = WTCalc.total(ix, [byIdent["us_m4_sherman"].id, byIdent["us_m4a2_sherman"].id]);
check("多选合计=仅所选自身(不含前置,v5.0 口径)", t2.rp === byIdent["us_m4_sherman"].rp_cost + byIdent["us_m4a2_sherman"].rp_cost, `${t2.rp} vs 应=${byIdent["us_m4_sherman"].rp_cost + byIdent["us_m4a2_sherman"].rp_cost}`);
check("一战活动车在右区(去重后有图基础条目)", byIdent["germ_a7v"].zone === "premium" && byIdent["germ_a7v"].availability === "event");
check("历年活动重复车已下线(germ_a7v_event 等 6 辆)", !byIdent["germ_a7v_event"] && !byIdent["germ_garford_putilov_event"]
  && !byIdent["germ_beutepanzer_mk_iv_event"] && !byIdent["uk_mark_v_event"] && !byIdent["ah_1f_event"] && !byIdent["mig-21_bis_event"]);
check("_event 图回退基础名(f_4e_event→f-4e.png)", byIdent["f_4e_event"] && byIdent["f_4e_event"].image === "/wtapi/assets/images/f-4e.png",
  byIdent["f_4e_event"] && byIdent["f_4e_event"].image);
check("掉宝/Twitch 车归右区", byIdent["germ_sdkfz_234_2_td"].zone === "premium", byIdent["germ_sdkfz_234_2_td"].availability);
check("Dickermax=科技树车(datamine+shop 双证)", byIdent["germ_pzsfl_IVa_dickermax"].zone === "research");
check("杯赛/PROMO 车归右区", byIdent["us_m1a1_abrams_yt_cup_2019"].zone === "premium" && byIdent["us_m551_football"].zone === "premium");
// v4.6:分体防空配对 + 千分符 + 按类计价 + 轻面纱 + 图片 contain
check("分体防空发射车折叠随雷达车(线上数据)", byIdent["us_nasams_launcher"].zone === "research" && byIdent["us_nasams_launcher"].folder_of === byIdent["us_nasams_fcs"].id,
  byIdent["us_nasams_launcher"].zone + "/" + byIdent["us_nasams_launcher"].folder_of);
check("发射车链价=雷达车链价", need("us_nasams_launcher").rp === need("us_nasams_fcs").rp, String(need("us_nasams_launcher").rp));
{ const pk = cat.nodes.find(n => n.availability === "pack" && n.ge_cost);
  check("礼包车名义 ge_cost 不计金鹰合计(v5.3 线上端到端)", pk && WTCalc.total(ix, [pk.id]).ge === 0, pk && pk.identifier); }
{ const nf2 = byIdent["us_nasams_fcs"], nl2 = byIdent["us_nasams_launcher"];
  check("组合单元银狮去重(主从同选=一次,v5.4 线上端到端)", WTCalc.total(ix, [nf2.id, nl2.id]).sl === nf2.sl_cost, `${WTCalc.total(ix, [nf2.id, nl2.id]).sl} vs ${nf2.sl_cost}`); }
{ const smp = cat.nodes.filter(n => n.availability === "researchable" && n.sl_cost);
  check("研究车带银狮购买价(v5.3)", smp.length > 2000, String(smp.length)); }

// 4) 旧树页退役 + 图床
check("旧 /wtrp/tree/tree.html 已退役(404)", get("/wtrp/tree/tree.html").meta[0] === "404");
check("statcard 图床在役", get("/wtapi/assets/images/us_m1a2_abrams.png").meta[0] === "200");

console.log(bad === 0 ? "\n全部通过 ✅" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
