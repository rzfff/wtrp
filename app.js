/* /wtrp/ v4.1 —— 单页研发点计算器前端逻辑(CSP 安全:无内联脚本/样式,事件全委托)
 * 依赖 calc.js 的 WTCalc。设计语言参照 blind-thunder.wiki wt-tree。
 */
(function () {
  "use strict";

  const CLS_ZH = { army: "陆战", aviation: "空战", helicopter: "直升机", bluewater: "蓝水", coastal: "海岸" };
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
    openFolder: null, // 当前展开的文件夹根 id
  };

  const el = {};
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    ["nations", "classes", "search", "tree", "tree-wrap", "p-title", "p-list", "p-foot", "p-clear", "ver", "foot-ver"]
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
    document.addEventListener("error", e => {
      const t = e.target;
      if (t && t.tagName === "IMG") {
        const ph = t.parentNode;
        t.remove();
        if (ph) { ph.classList.add("noimg"); ph.textContent = CLS_ICON[state.cls] || "?"; }
      }
    }, true);
    document.addEventListener("click", e => {
      if (!e.target.closest(".folder")) closeFolder();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeFolder(); });
    el.treeWrap.addEventListener("scroll", closeFolder);
    window.addEventListener("hashchange", () => { loadHash(); buildClassTabs(); renderTree(); });
    renderTree();
    renderPanel();
  }

  /* ---------- 工具 ---------- */
  const byId = id => state.ix.byId.get(id);
  function fmt(n) {
    n = Math.round(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + " 亿";
    if (n >= 1e4) { const w = n / 1e4; return (w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, "")) + " 万"; }
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function needOf(id) {
    if (!state.needCache.has(id)) state.needCache.set(id, WTCalc.need(state.ix, id));
    return state.needCache.get(id);
  }
  function costText(n) {
    if (n.availability === "researchable") return n.is_reserve ? "初始载具" : fmt(n.rp_cost) + " RP";
    if (n.ge_cost) return fmt(n.ge_cost) + " 金鹰";
    return "活动/礼品";
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
    closeFolder();
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
    for (const arr of premMap.values()) arr.sort((a, b) => a.tree_column - b.tree_column || a.tree_order - b.tree_order);

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
    d.innerHTML = `${tag}${imgPh(n)}<div class="cname">${esc(n.name)}</div><div class="crp">${costText(n)}</div><div class="selmark">✓</div>`;
    return d;
  }

  function folderEl(unit) {
    const all = [unit.root, ...unit.members];
    const d = document.createElement("div");
    d.className = "folder";
    d.dataset.root = unit.root.id;
    d.dataset.name = all.map(m => m.name.toLowerCase()).join(" ");
    const layers = all.filter(m => m.image).slice(0, 3);
    let stacks;
    if (layers.length) {
      stacks = layers.map(m => `<div class="stk"><img src="${m.image}" alt="" loading="lazy"></div>`).join("");
    } else {
      stacks = `<div class="stk noimg">${CLS_ICON[unit.root.class] || "?"}</div>`;
    }
    d.innerHTML = `<div class="fstack">${stacks}</div><div class="cbadge">+${unit.members.length}</div><div class="cname">${esc(unit.root.name)}</div>`;
    // 就地展开面板
    const panel = document.createElement("div");
    panel.className = "fold-panel";
    const head = document.createElement("div");
    head.className = "fp-head";
    head.innerHTML = `<span class="fp-title">文件夹 · 任选其一</span>`;
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "btn";
    allBtn.textContent = "全选";
    allBtn.addEventListener("click", ev => {
      ev.stopPropagation();
      all.forEach(n => state.selected.set(n.id, true));
      afterSelectionChange();
    });
    head.appendChild(allBtn);
    const items = document.createElement("div");
    items.className = "fp-items";
    for (const n of all) items.appendChild(cardEl(n));
    panel.appendChild(head);
    panel.appendChild(items);
    d.appendChild(panel);
    return d;
  }

  function closeFolder() {
    if (state.openFolder == null) return;
    const prev = el.tree.querySelector('.folder[data-root="' + state.openFolder + '"] .fold-panel');
    if (prev) prev.classList.remove("open", "flip");
    state.openFolder = null;
  }

  function toggleFolder(folderEl_) {
    const rootId = Number(folderEl_.dataset.root);
    if (state.openFolder === rootId) { closeFolder(); return; }
    closeFolder();
    const panel = folderEl_.querySelector(".fold-panel");
    if (!panel) return;
    // 右缘防溢出:向左翻开
    const wrapRight = el.treeWrap.getBoundingClientRect().right;
    const r = folderEl_.getBoundingClientRect();
    if (r.left + 400 > wrapRight) panel.classList.add("flip");
    panel.classList.add("open");
    state.openFolder = rootId;
  }

  /* ---------- 交互 ---------- */
  function onTreeClick(e) {
    // 文件夹面板内的卡片:只切换选中,不关面板
    const panelCard = e.target.closest(".fold-panel .card");
    if (panelCard) {
      toggleSelect(Number(panelCard.dataset.id));
      return;
    }
    // 面板背景(非卡片区域)点击:只关面板,不视为切换文件夹
    if (e.target.closest(".fold-panel")) { closeFolder(); return; }
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
          ${tag}<span class="pname" title="${esc(n.name)}">${esc(n.name)}</span>
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
      const cost = vn.availability === "researchable" ? fmt(vn.rp_cost || 0) + " RP" : (vn.ge_cost ? fmt(vn.ge_cost) + " 金鹰" : "高级");
      return `<div class="cnode">${arrow}<b>${esc(vn.name)}</b> · ${cost}</div>`;
    }).join("");
    box.innerHTML = `${rows}<div class="subtotal">研发链合计 ${fmt(c.rp)} RP${c.ge ? " + " + fmt(c.ge) + " 金鹰" : ""}</div>`;
    return box;
  }
})();
