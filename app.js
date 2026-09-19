/* /wtrp/ v4.9 —— 单页研发点计算器前端逻辑(CSP 安全:无内联脚本/样式,事件全委托)
 * 依赖 calc.js 的 WTCalc。设计语言参照 blind-thunder.wiki wt-tree。
 * v4.9:车名行右端=战斗权重 BR(分房;catalog br 字段,源自 vehicles-full realistic_br);
 *       文件夹 +N 徽章样式位置调整(右下角,CSS 侧)。
 * v4.8:缴获/外国载具名前=游戏原生国家旗标(flags/<nation>.svg,取自 datamine gameuiskin,
 *       与 blind-thunder 同款);兵种页签改名 远洋海军/近岸海军。
 */
(function () {
  "use strict";

  const CLS_ZH = { army: "陆战", aviation: "空战", helicopter: "直升机", bluewater: "远洋海军", coastal: "近岸海军" };
  const CLS_ORDER = ["army", "aviation", "helicopter", "bluewater", "coastal"];
  const AVAIL_ZH = { premium: "金币", pack: "礼包", marketplace: "市场", squadron: "联队", event: "活动", special: "特殊" };
  const CLS_ICON = { army: "陆", aviation: "空", helicopter: "直", bluewater: "舰", coastal: "艇" };
  const SEL_KEY = "wtrp4.selected";

  const state = {
    catalog: null, ix: null,
    nation: "usa", cls: "army",
    selected: new Map(),
    expanded: new Set(),
    search: "",
    needCache: new Map(),
    openFolder: null, // 当前展开的文件夹根 id(一次一个,blind-thunder 同款)
  };

  const el = {};
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    ["nations", "classes", "search", "tree", "tree-wrap", "p-title", "p-list", "p-foot", "p-clear", "ver", "foot-ver", "veil"]
      .forEach(id => (el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id)));
    const res = await fetch("data/catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("catalog 加载失败: " + res.status);
    state.catalog = await res.json();
    state.ix = WTCalc.buildIndex(state.catalog);
    el.ver.textContent = "v" + state.catalog.source.version;
    el.footVer.textContent = "数据 " + state.catalog.source.version;
    loadHash();
    loadSelected();
    buildNationTabs();
    buildClassTabs();
    el.search.addEventListener("input", () => { state.search = el.search.value.trim().toLowerCase(); applySearch(); });
    el.pClear.addEventListener("click", clearAll);
    el.tree.addEventListener("click", onTreeClick);
    // 图片加载失败 → 占位符(捕获阶段,替代被 CSP 禁用的内联 onerror)
    // v4.8:只处理卡片图区(.ph)内的 img——国旗等小图失败不得毁车名
    document.addEventListener("error", e => {
      const t = e.target;
      const ph = t && t.tagName === "IMG" && t.parentNode;
      if (ph && ph.classList && ph.classList.contains("ph")) {
        t.remove();
        ph.classList.add("noimg");
        ph.textContent = CLS_ICON[state.cls] || "?";
      }
    }, true);
    // 面纱(blind-thunder public_mask 同款):开文件夹时压暗整树,点面纱收起
    el.veil.addEventListener("click", closeAllFolders);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeAllFolders(); });
    window.addEventListener("hashchange", () => { loadHash(); buildClassTabs(); renderTree(); });
    renderTree();
    renderPanel();
  }

  /* ---------- 工具 ---------- */
  const byId = id => state.ix.byId.get(id);
  function fmt(n) {
    return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function needOf(id) {
    if (!state.needCache.has(id)) state.needCache.set(id, WTCalc.need(state.ix, id));
    return state.needCache.get(id);
  }
  function costText(n) {
    switch (n.availability) {
      case "researchable": return n.rp_cost === 0 ? "组合单元" : (n.is_reserve ? "初始载具" : fmt(n.rp_cost) + " RP");
      case "premium": return fmt(n.ge_cost || 0) + " 金鹰";
      case "pack": return "礼包";
      case "marketplace": return "市场";
      case "squadron": return "联队";
      default: return "活动/绝版";
    }
  }
  // 缴获/外国载具:名前挂游戏原生国家旗标(与 blind-thunder 同款;catalog captured 标记)
  function flgImg(n) {
    return n.captured ? `<img class="flg" src="flags/${n.nation}.svg" alt="">` : "";
  }
  // 战斗权重(分房)徽标:RB 分房,catalog br 全量在册(3288/3288);无值不渲染(防御)
  function brChip(n) {
    return n.br ? `<span class="br" title="战斗权重(分房)">${Number(n.br).toFixed(1)}</span>` : "";
  }
  function imgPh(n) {
    if (!n.image) return `<div class="ph noimg">${CLS_ICON[n.class] || "?"}</div>`;
    return `<div class="ph"><img src="${n.image}" alt="" loading="lazy"></div>`;
  }

  /* ---------- 持久化 ---------- */
  function loadSelected() {
    try {
      const arr = JSON.parse(localStorage.getItem(SEL_KEY) || "[]");
      arr.forEach(id => { if (byId(id)) state.selected.set(id, true); });
    } catch (e) {}
  }
  function saveSelected() {
    try { localStorage.setItem(SEL_KEY, JSON.stringify([...state.selected.keys()])); } catch (e) {}
  }
  function loadHash() {
    const m = /^#?([a-z]+)\/([a-z_]+)$/.exec(location.hash || "");
    if (m && state.catalog.nations.some(n => n.slug === m[1])) {
      state.nation = m[1];
      if (state.catalog.trees.some(t => t.nation === m[1] && t.class === m[2])) state.cls = m[2];
    }
  }
  function setHash() {
    const h = "#" + state.nation + "/" + state.cls;
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  /* ---------- 顶栏 ---------- */
  function buildNationTabs() {
    el.nations.innerHTML = "";
    for (const n of state.catalog.nations) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = n.name;
      b.className = n.slug === state.nation ? "on" : "";
      b.addEventListener("click", () => {
        if (state.nation === n.slug) return;
        state.nation = n.slug;
        state.cls = CLS_ORDER.find(c => state.catalog.trees.some(t => t.nation === n.slug && t.class === c)) || "army";
        buildNationTabs(); buildClassTabs(); renderTree(); setHash();
      });
      el.nations.appendChild(b);
    }
  }
  function buildClassTabs() {
    el.classes.innerHTML = "";
    for (const c of CLS_ORDER) {
      if (!state.catalog.trees.some(t => t.nation === state.nation && t.class === c)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = CLS_ZH[c];
      b.className = c === state.cls ? "on" : "";
      b.addEventListener("click", () => {
        if (state.cls === c) return;
        state.cls = c;
        buildClassTabs(); renderTree(); setHash();
      });
      el.classes.appendChild(b);
    }
  }

  /* ---------- 科技树 ---------- */
  function renderTree() {
    closeAllFolders();
    const nodes = state.catalog.nodes.filter(n => n.nation === state.nation && n.class === state.cls);
    const tree = state.catalog.trees.find(t => t.nation === state.nation && t.class === state.cls);
    const colCount = tree ? tree.research_column_count : 1;
    const ranks = [...new Set(nodes.map(n => n.rank))].sort((a, b) => a - b);
    const roman = r => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][r] || r;

    const cellMap = new Map(), premMap = new Map();
    for (const n of nodes) {
      if (n.zone === "research") {
        const k = n.rank + ":" + n.tree_column;
        if (!cellMap.has(k)) cellMap.set(k, []);
        cellMap.get(k).push(n);
      } else {
        if (!premMap.has(n.rank)) premMap.set(n.rank, []);
        premMap.get(n.rank).push(n);
      }
    }
    for (const arr of cellMap.values()) arr.sort((a, b) => a.tree_order - b.tree_order);
    // 右区排序:金币/礼包/市场/联队在前,绝版活动车垫底(数量少,免得占着分界处显空)
    const ZONE_ORD = { premium: 0, pack: 1, marketplace: 2, squadron: 3, event: 4 };
    for (const arr of premMap.values()) arr.sort((a, b) =>
      (ZONE_ORD[a.availability] ?? 5) - (ZONE_ORD[b.availability] ?? 5) || a.tree_column - b.tree_column || a.tree_order - b.tree_order);

    const frag = document.createDocumentFragment();
    for (const r of ranks) {
      const band = document.createElement("div");
      band.className = "band";
      const label = document.createElement("div");
      label.className = "rank-label";
      label.textContent = roman(r);
      band.appendChild(label);

      const research = document.createElement("div");
      research.className = "research";
      for (let c = 1; c <= colCount; c++) {
        const col = document.createElement("div");
        col.className = "col";
        const cell = cellMap.get(r + ":" + c);
        if (cell) for (const unit of clusterFolder(cell)) {
          col.appendChild(unit.members.length ? folderEl(unit) : cardEl(unit.root));
        }
        research.appendChild(col);
      }
      band.appendChild(research);

      const prem = document.createElement("div");
      prem.className = "premium";
      const plist = premMap.get(r);
      if (plist) for (const n of plist) prem.appendChild(cardEl(n));
      band.appendChild(prem);
      frag.appendChild(band);
    }
    // 恢复展开状态无意义(面纱交互一次一个),渲染前先收干净
    el.tree.innerHTML = "";
    el.tree.appendChild(frag);
    applySearch();
  }

  function clusterFolder(cellNodes) {
    const units = [], byRoot = new Map();
    for (const n of cellNodes) {
      if (n.folder_of && n.folder_of !== n.id && byRoot.has(n.folder_of)) {
        byRoot.get(n.folder_of).members.push(n);
      } else {
        const u = { root: n, members: [] };
        units.push(u);
        byRoot.set(n.id, u);
      }
    }
    return units;
  }

  function cardEl(n) {
    const d = document.createElement("div");
    d.className = "card av-" + n.availability + (state.selected.has(n.id) ? " sel" : "");
    d.dataset.id = n.id;
    d.dataset.name = n.name.toLowerCase();
    const tag = n.availability !== "researchable" ? `<span class="tag">${AVAIL_ZH[n.availability] || "特殊"}</span>` : "";
    d.innerHTML = `${tag}${imgPh(n)}<div class="cname">${flgImg(n)}<span class="nm">${esc(n.name)}</span>${brChip(n)}</div><div class="crp">${costText(n)}</div><div class="selmark">✓</div>`;
    return d;
  }

  function folderEl(unit) {
    const all = [unit.root, ...unit.members];
    const d = document.createElement("div");
    d.className = "folder";
    d.dataset.root = unit.root.id;
    d.dataset.name = all.map(m => m.name.toLowerCase()).join(" ");
    // 堆叠 = 真实完整卡片(顶层) + 同款空卡壳垫层错位(游戏样式)
    const stack = document.createElement("div");
    stack.className = "fstack";
    const shells = Math.min(all.length - 1, 2);
    for (let i = shells; i >= 1; i--) {
      const shell = document.createElement("div");
      shell.className = "fshell" + (i >= 2 ? " s2" : " s1");
      stack.appendChild(shell);
    }
    stack.appendChild(cardEl(unit.root)); // 顶层就是普通载具卡(图+名+价+选中态)
    d.appendChild(stack);
    const badge = document.createElement("div");
    badge.className = "cbadge";
    badge.title = "展开/收起";
    badge.textContent = "+" + unit.members.length;
    d.appendChild(badge);
    // blind-thunder folding-vehicle 同款:面板=原卡位置上的深色衬里浮层,
    // 根车打头(与被盖住的原卡逐像素重合),成员竖排普通流,bt 无动画无翻转
    const panel = document.createElement("div");
    panel.className = "folding-panel";
    for (const n of all) panel.appendChild(cardEl(n));
    d.appendChild(panel);
    return d;
  }

  function closeAllFolders() {
    if (state.openFolder == null) return;
    const prev = el.tree.querySelector('.folder[data-root="' + state.openFolder + '"]');
    if (prev) prev.classList.remove("open");
    state.openFolder = null;
    el.veil.classList.remove("show");
  }

  function toggleFolder(folderEl_) {
    const rootId = Number(folderEl_.dataset.root);
    if (state.openFolder === rootId) { closeAllFolders(); return; }
    closeAllFolders();
    folderEl_.classList.add("open");
    state.openFolder = rootId;
    el.veil.classList.add("show");
  }

  /* ---------- 交互 ---------- */
  function onTreeClick(e) {
    // 展开面板内的卡(根车/成员):直接切换选中
    const panelCard = e.target.closest(".folding-panel .card");
    if (panelCard) { toggleSelect(Number(panelCard.dataset.id)); return; }
    const folder = e.target.closest(".folder");
    if (folder) { toggleFolder(folder); return; }
    const card = e.target.closest(".card");
    if (card) toggleSelect(Number(card.dataset.id));
  }

  function toggleSelect(id) {
    if (state.selected.has(id)) {
      state.selected.delete(id);
      state.expanded.delete(id);
    } else {
      state.selected.set(id, true);
      if (state.selected.size === 1) state.expanded.add(id);
    }
    afterSelectionChange();
  }

  function afterSelectionChange() {
    saveSelected();
    el.tree.querySelectorAll(".card").forEach(c => c.classList.toggle("sel", state.selected.has(Number(c.dataset.id))));
    renderPanel();
  }

  function clearAll() {
    state.selected.clear();
    state.expanded.clear();
    afterSelectionChange();
  }

  function applySearch() {
    const q = state.search;
    if (!q) { el.tree.querySelectorAll(".hide").forEach(x => x.classList.remove("hide")); return; }
    el.tree.querySelectorAll(".card,.folder").forEach(x => {
      // 文件夹顶层卡与面板成员卡随文件夹整体显隐,不单独匹配
      if (x.classList.contains("card") && x.closest(".folder")) return;
      const name = (x.dataset.name || "").toLowerCase();
      x.classList.toggle("hide", !name.includes(q));
    });
  }

  /* ---------- 面板 ---------- */
  function renderPanel() {
    const ids = [...state.selected.keys()];
    el.pTitle.textContent = `已选载具 (${ids.length})`;
    if (!ids.length) {
      el.pList.innerHTML = `<div class="p-empty">点击科技树中的载具加入计算;<br>点击文件夹就地展开、选组内成员;<br>单选一辆自动展开完整研发链。</div>`;
      el.pFoot.innerHTML = "";
      return;
    }
    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const n = byId(id);
      const row = document.createElement("div");
      row.className = "prow";
      const isRes = n.availability === "researchable";
      const tag = isRes ? "" : `<span class="tag">${AVAIL_ZH[n.availability] || "特殊"}</span>`;
      const exp = state.expanded.has(id);
      row.innerHTML = `
        <div class="top">
          ${tag}<span class="pname" title="${esc(n.name)}">${flgImg(n)}${esc(n.name)}</span>
          <span class="pcost">${costText(n)}</span>
          <span class="pbtns">
            <button type="button" class="iconbtn" data-act="chain">${exp ? "▾ 链" : "▸ 链"}</button>
            <button type="button" class="iconbtn" data-act="rm">✕</button>
          </span>
        </div>`;
      row.querySelector('[data-act="rm"]').addEventListener("click", () => {
        state.selected.delete(id); state.expanded.delete(id); afterSelectionChange();
      });
      row.querySelector('[data-act="chain"]').addEventListener("click", () => {
        state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
        renderPanel();
      });
      if (exp) row.appendChild(chainEl(id));
      frag.appendChild(row);
    }
    el.pList.innerHTML = "";
    el.pList.appendChild(frag);

    const t = WTCalc.total(state.ix, ids);
    el.pFoot.innerHTML = `
      <div class="row"><span>研发点合计(共享前置已去重)</span><span class="big">${fmt(t.rp)}</span></div>
      ${t.ge ? `<div class="row"><span>金鹰合计(高级载具)</span><span class="big">${fmt(t.ge)}</span></div>` : ""}
      <div class="note">共 ${ids.length} 辆,研发链涉及 ${t.counted.length} 辆(含前置)</div>`;
  }

  function chainEl(id) {
    const n = byId(id);
    const c = needOf(id);
    const box = document.createElement("div");
    box.className = "chain";
    if (n.availability !== "researchable") {
      box.innerHTML = `<div class="cnode">高级/活动载具:不可用研发点研发${n.ge_cost ? ",需 " + fmt(n.ge_cost) + " 金鹰" : ""}</div>`;
      return box;
    }
    if (c.path.length <= 1) {
      box.innerHTML = `<div class="cnode">无前置,可直接研发</div>`;
      return box;
    }
    const rows = c.path.map((vid, i) => {
      const vn = byId(vid);
      const arrow = i ? `<span class="arrow">└ ${i === c.path.length - 1 ? "目标: " : ""}</span>` : "";
      return `<div class="cnode">${arrow}<b>${esc(vn.name)}</b> · ${costText(vn)}</div>`;
    }).join("");
    box.innerHTML = `${rows}<div class="subtotal">研发链合计 ${fmt(c.rp)} RP${c.ge ? " + " + fmt(c.ge) + " 金鹰" : ""}</div>`;
    return box;
  }
})();
