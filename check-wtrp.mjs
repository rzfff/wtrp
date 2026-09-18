// /wtrp/ v2 线上验证(bun check-wtrp.mjs)
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

let r = get("/wtrp/");
check("index 200 html", r.meta[0] === "200" && r.meta[1].includes("text/html"));
check("标题中文(index)+分支中文(script 渲染)", r.body.includes("研发点计算器") && get("/wtrp/script.js").body.includes("蓝水海军"));
check("基于 TTM 披露(页脚)", r.body.includes("WT-Tech-Tree-Maker") && r.body.includes("przemyslaw-zan"));
check("无外部 CDN", !r.body.includes("code.jquery.com") && !r.body.includes("cdnjs") && !r.body.includes("ckeditor") && !r.body.includes("jsdelivr"));
check("计算面板容器", r.body.includes('id="wtrpPanel"'));

let js = get("/wtrp/script.js");
check("script.js 200", js.meta[0] === "200");
try { new Function(js.body); check("script.js 语法 OK", true); } catch (e) { check("script.js 语法: " + e.message, false); }
check("TTM 渲染核心在(organizeTree/drawTree)", js.body.includes("function organizeTree") && js.body.includes("function drawTree"));
check("多目标+计算层(multi target closure)", js.body.includes("pathUnion") && js.body.includes("targets"));
check("等级中文化", js.body.includes("等级 <b>"));
check("style.css 200", get("/wtrp/style.css").meta[0] === "200");
const css = get("/wtrp/style.css").body;
check("类别色 pack/market 已加", css.includes(".type_pack") && css.includes(".type_market"));

let d = get("/wtrp/data/c_usa.json");
check("c_usa.json 200", d.meta[0] === "200");
let usa = null;
try { usa = JSON.parse(d.body); } catch {}
check("usa 五分支", usa && ["ground", "aviation", "helicopters", "naval_blue", "naval_coastal"].every(b => usa.branches[b]));
check("usa ground M2A4 开头+M1A2 前置链", usa && usa.branches.ground[0].id === "us_m2a4" &&
  usa.branches.ground.some(v => v.id === "us_m1a2_abrams" && v.required_vehicle === "us_m1a1_abrams"));
check("条目含中文文名+缩略图", usa && usa.branches.ground.some(v => /[一-鿿]/.test(v.name)) && usa.branches.ground.every(v => v.thumbnail.startsWith("/wtapi/assets/images/")));
check("高级区条目存在(type=premium/pack/market)", usa && usa.branches.ground.filter(v => ["premium", "pack", "market", "squadron"].includes(v.type)).length > 50);

const h = spawnSync("curl", ["-skI", "https://anhappy.com/wtrp/data/c_usa.json"], { encoding: "utf8" }).stdout;
check("数据 no-cache(换版即时)", /cache-control:\s*no-cache/i.test(h));
check("statcard 图依赖可达", get("/wtapi/assets/images/us_m1a2_abrams.png").meta[0] === "200");
check("404 兜底", get("/wtrp/nothing.js").meta[0] === "404");
console.log(bad === 0 ? "\n全部通过 ✅" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
