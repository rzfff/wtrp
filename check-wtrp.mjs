// /wtrp/ v3 线上验证(bun check-wtrp.mjs)—— GT 底子 + TTM 树
import { spawnSync } from "child_process";
function mark(ok) { return ok ? "OK ✅" : "MISS ❌"; }
function get(path) {
  const r = spawnSync("curl", ["-sk", "--compressed", "-o", "-", "-w", "\n%{http_code} %{content_type}", `https://anhappy.com${path}`], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("curl exit " + r.status);
  const i = r.stdout.lastIndexOf("\n");
  return { body: r.stdout.slice(0, i), meta: r.stdout.slice(i + 1).trim().split(" ") };
}
let bad = 0;
function check(name, ok) { if (!ok) bad++; console.log(mark(ok) + " " + name); }

// 主应用(GrindTracker 底子)
let r = get("/wtrp/");
check("index 200 html", r.meta[0] === "200" && r.meta[1].includes("text/html"));
check("中文标题", r.body.includes("WT 研发规划器"));
check("游戏树入口链接(运行时渲染,查 JS 包)", r.body.includes("/wtrp/tree/tree.html") || get(r.body.match(/src="([^"]+\.js)"/)?.[1] || "/x").body.includes("/wtrp/tree/tree.html"));
const js = get(r.body.match(/src="([^"]+\.js)"/)?.[1] || "/wtrp/assets/x.js");
check("app js 200", js.meta[0] === "200");
try { new Function(js.body); check("app js 语法 OK", true); } catch (e) { check("app js 语法: " + e.message, false); }
check("app js 含中文字符串(已汉化)", js.body.includes("计算开线计划") && js.body.includes("研发用车"));

let c = get("/wtrp/data/catalog.json");
let cat = null;
try { cat = JSON.parse(c.body); } catch {}
check("catalog 200", c.meta[0] === "200");
check("catalog 版本 2.59.0.13", cat && cat.source.version === "2.59.0.13");
check("节点 3300+ / 边 2000+ / 树 44", cat && cat.nodes.length > 3300 && cat.edges.length > 2000 && cat.trees.length === 44);
check("节点含中文名+图", cat && cat.nodes.some(n => /[一-鿿]/.test(n.name)) && cat.nodes.every(n => !n.image || n.image.startsWith("/wtapi/assets/images/")));
const m1a2 = cat && cat.nodes.find(n => n.identifier === "us_m1a2_abrams");
check("M1A2 中文+350k+前置边", m1a2 && m1a2.name === "M1A2" && m1a2.rp_cost === 350000 && cat.edges.some(e => e.child === m1a2.id));
check("研发效率规则在(计算引擎)", cat && cat.trees[0].research_efficiency && cat.trees[0].research_efficiency.target_above);

// 游戏样式树(TTM)
let t = get("/wtrp/tree/tree.html");
check("tree.html 200", t.meta[0] === "200");
check("树页中文+返回链接", t.body.includes("科技树") && t.body.includes("/wtrp/"));
let tj = get("/wtrp/tree/script.js");
try { new Function(tj.body); check("tree js 语法 OK", true); } catch (e) { check("tree js 语法: " + e.message, false); }
check("TTM 核心在", tj.body.includes("function drawTree") && tj.body.includes("function organizeTree"));
check("树数据可达", get("/wtrp/tree/ttm-data/c_usa.json").meta[0] === "200");

// 依赖与杂项
check("statcard 图依赖", get("/wtapi/assets/images/us_m1a2_abrams.png").meta[0] === "200");
check("404 兜底", get("/wtrp/nothing.js").meta[0] === "404");
console.log(bad === 0 ? "\n全部通过 ✅" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
