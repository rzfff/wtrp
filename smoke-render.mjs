// /wtrp/ 渲染级冒烟测试 —— 用 jsdom 真跑 app.js(教训:curl 全绿 ≠ 浏览器渲染正常)
// 用法: node smoke-render.mjs          # 测本地 E:\ah\wtrp\
//       node smoke-render.mjs --live   # 测线上 https://anhappy.com/wtrp/(下载五件套后渲染)
import { readFileSync, existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes("--live");
const ROOT = join(__dirname); // wtrp 仓根

function curl(url) {
  const r = spawnSync("curl", ["-sk", "--compressed", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("curl 失败 " + url);
  return r.stdout;
}

// 取五件套(本地读盘 / 线上下载)
const files = {};
for (const f of ["index.html", "style.css", "app.js", "calc.js"]) {
  files[f] = LIVE ? curl("https://anhappy.com/wtrp/" + f) : readFileSync(join(ROOT, f), "utf8");
}
const catalog = LIVE
  ? JSON.parse(curl("https://anhappy.com/wtrp/data/catalog.json"))
  : JSON.parse(readFileSync(join(ROOT, "data", "catalog.json"), "utf8"));

// css 校验:花括号配平 + 关键选择器存在
let bad = 0;
const check = (name, ok, extra = "") => {
  if (!ok) bad++;
  console.log((ok ? "OK  " : "FAIL ") + name + (ok ? "" : "  >> " + extra));
};
const css = files["style.css"];
const openB = (css.match(/{/g) || []).length, closeB = (css.match(/}/g) || []).length;
check("style.css 花括号配平", openB === closeB, `${openB}/${closeB}`);
for (const sel of [".folder .fstack", ".fold-panel.open", ".card .ph img", ".research", ".premium"]) {
  check("style.css 含选择器 " + sel, css.includes(sel));
}

const { JSDOM } = await import("jsdom");
const html = files["index.html"];
const dom = new JSDOM(html, {
  url: "https://anhappy.com/wtrp/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;

// 桩:fetch 喂 catalog;localStorage 已有实现
window.fetch = async (url) => ({
  ok: true, status: 200,
  json: async () => catalog,
  text: async () => JSON.stringify(catalog),
});

// 按 index.html 里的顺序注入 calc.js / app.js
const errors = [];
window.addEventListener("error", e => errors.push(String(e.message || e.error)));
try {
  window.eval(files["calc.js"]);
  window.eval(files["app.js"]);
} catch (e) {
  errors.push("eval: " + e.message);
}
// 触发 DOMContentLoaded
const ev = window.document.createEvent("Event");
ev.initEvent("DOMContentLoaded", true, true);
window.document.dispatchEvent(ev);
await new Promise(r => setTimeout(r, 300)); // 等 init() 的 async fetch

const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];

check("无 JS 运行时错误", errors.length === 0, errors.join(" | "));
check("顶栏渲染国家页签", $$("#nations button").length >= 8, String($$("#nations button").length));
check("顶栏渲染兵种页签", $$("#classes button").length >= 2);

const cards = $$("#tree .card");
const folders = $$("#tree .folder");
check("科技树渲染载具卡 ≥150(usa/army)", cards.length >= 150, String(cards.length));
check("科技树渲染文件夹 ≥2(usa/army 含谢尔曼/M1 组)", folders.length >= 2, String(folders.length));

const imgs = $$("#tree .card .ph img");
check("载具卡图片为 <img> 标签 ≥100", imgs.length >= 100, String(imgs.length));
check("图片地址全部 /wtapi/ 开头", imgs.every(i => (i.getAttribute("src") || "").startsWith("/wtapi/")));
check("文件夹堆叠有 .fstack 包装且每层 ≥1 图层",
  folders.every(f => f.querySelector(":scope > .fstack") && f.querySelectorAll(":scope > .fstack > .stk").length >= 1),
  folders.map(f => f.querySelectorAll(":scope > .fstack > .stk").length).join(","));
check("文件夹面板就地内嵌(.fold-panel)",
  folders.every(f => f.querySelector(":scope > .fold-panel") && f.querySelectorAll(":scope > .fold-panel .card").length >= 2));

// 交互:点开第一个文件夹 → 面板展开出成员卡
if (folders.length) {
  const f = folders[0];
  f.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const panel = f.querySelector(":scope > .fold-panel");
  const opened = panel && panel.classList.contains("open");
  check("点击文件夹 → 面板展开", !!opened);
  const panelCards = panel ? panel.querySelectorAll(".card") : [];
  check("面板内成员卡 ≥2", panelCards.length >= 2, String(panelCards.length));
  const im = panel && panel.querySelector(".card .ph img, .card .ph.noimg");
  check("成员卡有图片或占位", !!im);
  // 点成员卡 → 侧栏选中
  if (panelCards.length) {
    panelCards[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    check("点成员卡 → 侧栏已选=1", $("#p-title").textContent.includes("(1)"), $("#p-title").textContent);
    check("侧栏合计出现", /研发点合计|金鹰合计/.test($("#p-foot").textContent));
  }
}

// 右区载具存在(av-premium/event/marketplace 至少两类)
const avs = new Set($$("#tree .card").map(c => [...c.classList].find(x => x.startsWith("av-"))));
check("卡片含多态配色", ["av-researchable", "av-premium"].every(x => avs.has(x)), [...avs].join(","));

console.log(bad === 0 ? "\n渲染冒烟全部通过 ✅(" + (LIVE ? "线上" : "本地") + ")" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
