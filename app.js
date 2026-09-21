/* /wtrp/ v5.10 —— 单页研发点计算器前端逻辑(CSP 安全:无内联脚本/样式,事件全委托)
 * 依赖 calc.js 的 WTCalc。设计语言参照 blind-thunder.wiki wt-tree。
 * v5.3:名字图标=游戏符号字体 WTSymbols 自托管(名字保留原样前缀字符,无色文字级,与游戏一致;
 *       弃彩色旗标 SVG);卡片/合计显示银狮花费;金鹰合计仅金币车(礼包/市场/联队不可金鹰购)。
 * v5.2:卡片 130px=1680 视口零横滚;v5.1:图上间隔;v5.0:合计口径=仅所选不含前置;
 * v4.9:BR 分房徽标;v4.8:金币区 grid;海军=远洋海军/近岸海军。
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
    treeNodes: [],
    connectorObserver: null,
    connectorRefresh: 0,
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
    el.search.addEventListener("input", () => {
      state.search = el.search.value.trim().toLowerCase();
      applySearch();
      renderTreeConnectors(state.treeNodes);
    });
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
    // Keep an opened stack readable after a viewport/rotation change.  The
    // folder's panel is flipped upward when its natural bottom would be
    // clipped by the tree viewport (or the phone viewport).
    window.addEventListener("resize", () => {
      if (state.openFolder == null) return;
      const folder = el.tree.querySelector('.folder[data-root="' + state.openFolder + '"]');
      if (folder) fitFolderPanel(folder);
    });
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
  // 战斗权重(分房)徽标:RB 分房,catalog br 全量在册(3288/3288);无值不渲染(防御)
  function brChip(n) {
    return n.br ? `<span class="br" title="战斗权重(分房)">${Number(n.br).toFixed(1)}</span>` : "";
  }
  // 银狮购买价(vehicles-full value;研究车/联队车/部分市场·活动车有,金币·礼包车无);
  // 组合单元从属件(分体防空发射车)银狮随主件,不单列(v5.4)
  function slText(n) {
    // 活动车没有银狮购买价，即使旧目录残留 value 也不应渲染。
    if (n.availability === "event") return "";
    if (n.availability === "researchable" && !n.rp_cost && n.folder_of) return "银狮随主件";
    return n.sl_cost ? fmt(n.sl_cost) + " 银狮" : "";
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
    state.treeNodes = nodes;
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
        col.dataset.column = String(c);
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
    renderTreeConnectors(nodes);
  }

  // 研发顺序提示：独立 SVG 叠层负责连线，卡片位于其上方。
  // 线从父卡底部开始，在子卡顶部前留下箭头间隙，因此不会穿过卡片。
  function renderTreeConnectors(nodes) {
    const ids = new Set(nodes.map(n => n.id));
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const visibleId = id => {
      const n = nodeById.get(id);
      return n && n.folder_of && n.folder_of !== n.id ? n.folder_of : id;
    };
    const parents = new Map();
    const addParent = (child, parent) => {
      if (!ids.has(child) || !ids.has(parent)) return;
      const childRoot = visibleId(child), parentRoot = visibleId(parent);
      if (childRoot === parentRoot) return;
      if (!parents.has(childRoot)) parents.set(childRoot, new Set());
      parents.get(childRoot).add(parentRoot);
    };
    for (const edge of state.catalog.edges || []) addParent(edge.child, edge.parent);
    // 组合单元的成员与根车共用研发位置，根车是可见的连接锚点。
    for (const n of nodes) if (n.folder_of && n.folder_of !== n.id) addParent(n.id, n.folder_of);

    const old = el.tree.querySelector(":scope > .tree-connectors");
    if (old) old.remove();
    if (state.connectorObserver) {
      state.connectorObserver.disconnect();
      state.connectorObserver = null;
    }
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("tree-connectors");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    el.tree.prepend(svg);

    const visibleCards = new Map();
    el.tree.querySelectorAll(":scope > .band .card[data-id]").forEach(card => {
      if (!card.closest(".folding-panel") && !card.closest(".hide")) {
        visibleCards.set(Number(card.dataset.id), card);
      }
    });
    const edges = [];
    const seen = new Set();
    for (const [child, parentSet] of parents) {
      const target = visibleCards.get(child);
      if (!target) continue;
      for (const parent of parentSet) {
        const source = visibleCards.get(parent);
        if (!source || source === target) continue;
        const key = parent + ":" + child;
        if (!seen.has(key)) { seen.add(key); edges.push({ source, target, key }); }
      }
    }
    if (!edges.length) return;

    const treeRect = el.tree.getBoundingClientRect();
    // 不直接使用 tree.scrollWidth：SVG 自身会参与 scrollWidth 计算，手机从桌面
    // 视口切换时会把旧的宽度再次带回来，形成一层看不见的横向溢出。
    // 以实际等级带的边界计算内容尺寸，避免连线层反过来撑大科技树。
    const bandRects = [...el.tree.querySelectorAll(":scope > .band")].map(b => b.getBoundingClientRect());
    const width = Math.max(
      Math.ceil(treeRect.width),
      ...bandRects.map(r => Math.ceil(r.right - treeRect.left)),
      1,
    );
    const height = Math.max(
      Math.ceil(treeRect.height),
      ...bandRects.map(r => Math.ceil(r.bottom - treeRect.top)),
      1,
    );
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));

    const sourceCount = new Map();
    const edgeOffset = new Map();
    for (const edge of edges) {
      sourceCount.set(edge.target, (sourceCount.get(edge.target) || 0) + 1);
    }
    const sourceSeen = new Map();
    for (const edge of edges) {
      const index = sourceSeen.get(edge.target) || 0;
      sourceSeen.set(edge.target, index + 1);
      const count = sourceCount.get(edge.target) || 1;
      edgeOffset.set(edge.key, (index - (count - 1) / 2) * 12);
    }

    const lineColor = "#6e8f91";
    const arrowHeight = 7;
    const arrowGap = 8;
    const startGap = 3;
    const rectOf = node => node.getBoundingClientRect();
    // 每条研究列先画一根贯穿科技树的主干。卡片层级更高，会自然把主干在卡片处遮断。
    const lanes = new Map();
    el.tree.querySelectorAll(":scope > .band .col").forEach(col => {
      const cards = [...col.querySelectorAll(":scope > .card, :scope > .folder > .fstack > .card")]
        .filter(card => !card.closest(".hide"));
      if (!cards.length) return;
      // 用布局后的实际中心点分组，而不是只看原始 tree_column。
      // 手机端列数会减少，超出的研究列会换到下一行；此时它们应继续
      // 接到屏幕上同一条主干线上，而不能沿用桌面列号画出错位长线。
      const firstRect = rectOf(cards[0]);
      const key = Math.round((firstRect.left - treeRect.left + firstRect.width / 2) * 2) / 2;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(...cards);
    });
    for (const cards of lanes.values()) {
      const rects = cards.map(rectOf);
      const x = rects.reduce((sum, r) => sum + r.left + r.width / 2, 0) / rects.length - treeRect.left;
      // Start the spine inside the first card.  The connector SVG sits below
      // the cards, but a stroke still extends half its width beyond the path;
      // starting above the card therefore leaves a stray line at the very top
      // of every lane (most visible on the first card in the tree).
      const top = Math.min(...rects.map(r => r.top - treeRect.top)) + 4;
      // Stop the spine just inside the final card's lower edge.  The 3px
      // stroke is centered on the path, so ending at the card boundary (or
      // beyond it) leaves a tiny tail visible below the last card.
      const bottom = Math.max(...rects.map(r => r.bottom - treeRect.top)) - 2;
      const spine = document.createElementNS(svgNS, "path");
      spine.setAttribute("d", `M ${x} ${top} V ${bottom}`);
      spine.setAttribute("fill", "none");
      spine.setAttribute("stroke", lineColor);
      spine.setAttribute("stroke-width", "3");
      spine.setAttribute("stroke-linecap", "butt");
      spine.classList.add("tree-spine");
      svg.appendChild(spine);
    }
    for (const edge of edges) {
      const sourceRect = rectOf(edge.source), targetRect = rectOf(edge.target);
      const sx = sourceRect.left - treeRect.left + sourceRect.width / 2;
      const tx = targetRect.left - treeRect.left + targetRect.width / 2;
      const sy = sourceRect.bottom - treeRect.top + startGap;
      const ty = targetRect.top - treeRect.top - arrowGap;
      const offset = edgeOffset.get(edge.key) || 0;
      const sourceColumn = edge.source.closest(".col");
      const targetColumn = edge.target.closest(".col");
      const path = document.createElementNS(svgNS, "path");
      const sameLane = sourceColumn && sourceColumn === targetColumn;
      let d;
      if (sameLane && Math.abs(sx - tx) < 1 && ty >= sy) {
        // 同列主干已经覆盖这段线，只保留目标卡片前的箭头。
        d = "";
      } else {
        const routeY = ty >= sy ? sy + (ty - sy) / 2 : Math.max(sy, ty) + 10 + Math.abs(offset);
        d = `M ${sx + offset} ${sy} V ${routeY} H ${tx + offset} V ${ty}`;
      }
      if (d) {
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", lineColor);
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linecap", "butt");
        path.setAttribute("stroke-linejoin", "miter");
        path.dataset.edge = edge.key;
        svg.appendChild(path);
      }

      const arrow = document.createElementNS(svgNS, "path");
      arrow.setAttribute("d", `M ${tx + offset - 6} ${ty} H ${tx + offset + 6} L ${tx + offset} ${ty + arrowHeight} Z`);
      arrow.setAttribute("fill", lineColor);
      arrow.dataset.edge = edge.key;
      arrow.classList.add("tree-arrow");
      svg.appendChild(arrow);
    }
    if (window.ResizeObserver) {
      state.connectorObserver = new ResizeObserver(() => {
        window.clearTimeout(state.connectorRefresh);
        state.connectorRefresh = window.setTimeout(() => renderTreeConnectors(nodes), 30);
      });
      state.connectorObserver.observe(el.tree);
    }
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
    d.innerHTML = `${tag}${imgPh(n)}<div class="cname"><span class="nm" title="${esc(n.name)}">${esc(n.name)}</span>${brChip(n)}</div><div class="crp">${costText(n)}</div><div class="csl">${slText(n)}</div><div class="selmark">✓</div>`;
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
    if (prev) {
      prev.classList.remove("open");
      // .band is a stacking context (z-index:1) so the open panel must lift
      // the whole band above the full-screen veil, not just the folder itself.
      const band = prev.closest(".band");
      if (band) band.classList.remove("folder-open");
    }
    state.openFolder = null;
    el.veil.classList.remove("show");
  }

  function toggleFolder(folderEl_) {
    const rootId = Number(folderEl_.dataset.root);
    if (state.openFolder === rootId) { closeAllFolders(); return; }
    closeAllFolders();
    folderEl_.classList.add("open");
    const band = folderEl_.closest(".band");
    if (band) band.classList.add("folder-open");
    state.openFolder = rootId;
    el.veil.classList.add("show");
    fitFolderPanel(folderEl_);
  }

  function fitFolderPanel(folder) {
    const panel = folder && folder.querySelector(".folding-panel");
    if (!panel || !folder.classList.contains("open")) return;
    // Measure the default downward panel first.  On desktop the scrollable
    // tree is the clipping viewport; on phones the page viewport is the
    // useful boundary because the tree itself intentionally allows vertical
    // flow while its contents scroll horizontally.
    folder.classList.remove("fold-up");
    const panelRect = panel.getBoundingClientRect();
    const treeRect = el.treeWrap.getBoundingClientRect();
    const isPhone = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
    const clipTop = isPhone ? 0 : treeRect.top;
    const clipBottom = isPhone ? window.innerHeight : treeRect.bottom;
    const margin = 8;
    if (panelRect.bottom > clipBottom - margin && panelRect.top > clipTop + margin) {
      folder.classList.add("fold-up");
    }
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
          ${tag}<span class="pname" title="${esc(n.name)}">${esc(n.name)}</span>
          <span class="pcost">${costText(n)}</span>
          <span class="pbtns">
            <button type="button" class="iconbtn" data-act="chain">${exp ? "▾ 链" : "▸ 链"}</button>
            <button type="button" class="iconbtn" data-act="rm">✕</button>
          </span>
        </div>
        ${slText(n) ? `<div class="psl">${slText(n)}</div>` : ""}`;
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
      <div class="row"><span>研发点合计(仅所选载具,不含前置)</span><span class="big">${fmt(t.rp)}</span></div>
      ${t.ge ? `<div class="row"><span>金鹰合计(仅金币载具)</span><span class="big">${fmt(t.ge)}</span></div>` : ""}
      ${t.sl ? `<div class="row"><span>银狮合计(购买价)</span><span class="big slv">${fmt(t.sl)}</span></div>` : ""}
      <div class="note">共 ${ids.length} 辆;单辆的完整研发链(含前置)点「链」查看</div>`;
  }

  function chainEl(id) {
    const n = byId(id);
    const c = needOf(id);
    const box = document.createElement("div");
    box.className = "chain";
    if (n.availability !== "researchable") {
      const buy = n.availability === "premium" && n.ge_cost
        ? `,需 ${fmt(n.ge_cost)} 金鹰` : "";
      box.innerHTML = `<div class="cnode">高级/活动载具:不可用研发点研发${buy}</div>`;
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
