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
for (const sel of [".folder .fstack", ".folder.open .folding-panel", ".card .ph img", ".research", ".premium", ".folder .fshell", "#veil"]) {
  check("style.css 含选择器 " + sel, css.includes(sel));
}
// v4.9:车名行右端 BR 徽标 / 卡片加长 / 徽章右下角
check("style.css v4.9 图片区 --img-h:78px", css.includes("--img-h: 78px"));
check("style.css v4.9 卡片全站定宽 190px", css.includes("width: 190px") && !css.includes("width: 170px"));
check("style.css v4.9 金币区 max-content(右缘空隙消除)", css.includes("width: max-content"));
check("style.css v4.9 车名行 flex+.nm+.br 徽标", css.includes(".cname .nm") && css.includes(".cname .br"));
check("style.css v4.9 +N 徽章右下角(bottom:2px)", /cbadge[^}]*bottom: 2px/.test(css));
check("style.css v4.7 面纱更轻(.38+blur2px)", css.includes("rgba(8, 12, 14, .38)") && css.includes("blur(2px)"));
check("style.css v4.7 fstack 无额外外边距", !css.includes("margin-bottom: 10px"));

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
check("文件夹堆叠=真实卡片+垫层壳(fstack>.card 顶层,fshell 垫层)",
  folders.every(f => {
    const st = f.querySelector(":scope > .fstack");
    return st && st.querySelector(":scope > .card") && f.querySelectorAll(":scope > .fstack > .fshell").length >= 1;
  }),
  folders.map(f => f.querySelectorAll(":scope > .fstack > .fshell").length).join(","));
check("文件夹无多余文案(无「文件夹」标签/全选按钮)",
  !doc.body.textContent.includes("文件夹 · 任选其一") && !doc.body.textContent.includes("全选"));
check("顶层卡随文件夹有联合搜索名", folders.every(f => (f.dataset.name || "").split(" ").length >= 2));
check("文件夹包裹面板内嵌(.folding-panel 直挂根车+成员卡)",
  folders.every(f => f.querySelector(":scope > .folding-panel > .card")));

// 交互:点文件夹 → 包裹面板展开+面纱压暗;点成员卡 → 选中;点面纱 → 收起
if (folders.length) {
  const f = folders[0];
  f.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("点击文件夹 → .open + 面纱 .show", f.classList.contains("open") && $("#veil").classList.contains("show"));
  const panel = f.querySelector(":scope > .folding-panel");
  const panelCards = panel ? panel.querySelectorAll(".card") : [];
  check("面板内卡 ≥3(根车+成员)", panelCards.length >= 3, String(panelCards.length));
  const im = panel && panel.querySelector(".card .ph img, .card .ph.noimg");
  check("面板卡有图片或占位", !!im);
  if (panelCards.length) {
    panelCards[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    check("点成员卡 → 侧栏已选=1(面板不收起)", $("#p-title").textContent.includes("(1)") && f.classList.contains("open"), $("#p-title").textContent);
    check("侧栏合计出现", /研发点合计|金鹰合计/.test($("#p-foot").textContent));
  }
  // 点面纱 → 收起
  $("#veil").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  check("点面纱 → 面板收起+面纱隐去", !f.classList.contains("open") && !$("#veil").classList.contains("show"));
}

// 右区载具存在(av-premium/event/marketplace 至少两类)
const avs = new Set($$("#tree .card").map(c => [...c.classList].find(x => x.startsWith("av-"))));
check("卡片含多态配色", ["av-researchable", "av-premium"].every(x => avs.has(x)), [...avs].join(","));

// v4.6:千分符 / 顶栏分行 / 分体防空折叠 / 按类计价
const crps = $$("#tree .card .crp").map(c => c.textContent);
check("价格带千分符(1,000+)", crps.some(t => /\d,\d{3}/.test(t)), crps.find(t => /\d{3}/.test(t)) || "");
check("礼包/市场车不标金鹰", !$$("#tree .card").some(c => (c.classList.contains("av-pack") || c.classList.contains("av-marketplace")) && /金鹰/.test(c.textContent)));
check("顶栏国家/兵种分行(brand-row+两 nav 独立行)",
  !!doc.querySelector(".brand-row #search") && doc.querySelector("#top > #nations") && doc.querySelector("#top > #classes"));
const lchCard = $$("#tree .card").find(c => c.textContent.includes("NASAMS 3 发射车"));
check("分体防空发射车在研究区文件夹内(不在右区)",
  !!lchCard && !!lchCard.closest(".folding-panel") && !!lchCard.closest(".folder"),
  lchCard ? (lchCard.closest(".folding-panel") ? "in-panel" : "游离:" + (lchCard.closest(".premium") ? "右区" : "列")) : "未渲染");
check("发射车标组合单元", !!(lchCard && lchCard.textContent.includes("组合单元")));

// v4.9:每张卡 BR 徽标(数字带一位小数)在车名行右端;+N 徽章仍在
const withBr = $$("#tree .card .cname .br").filter(b => /^\d+\.\d$/.test(b.textContent));
check("卡片 BR 徽标渲染且格式 n.n", withBr.length >= 100, String(withBr.length));
check("BR 徽标在 .cname 内(车名行右端)", withBr.every(b => !!b.closest(".cname")));
const capCard = $$("#tree .card").find(c => (c.dataset.name || "").includes("斯图亚特 vi"));
check("缴获载具名前渲染旗标 img.flg[src*=flags/]", !!capCard && !!capCard.querySelector('.cname img.flg[src*="flags/"]'),
  capCard ? (capCard.querySelector("img.flg") ? capCard.querySelector("img.flg").getAttribute("src") : "无 flg") : "未渲染");
check("兵种页签=远洋海军/近岸海军(v4.8 改名)", $("#classes").textContent.includes("远洋海军") && $("#classes").textContent.includes("近岸海军"));

console.log(bad === 0 ? "\n渲染冒烟全部通过 ✅(" + (LIVE ? "线上" : "本地") + ")" : `\n${bad} 项未通过 ❌`);
process.exit(bad === 0 ? 0 : 1);
