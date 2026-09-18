'use strict';
/* WT 研发点计算器 — 原创实现(MIT)
   数据:/wtapi/ 静态接口(vehicles-full.json 含 required_vehicle 前置链 + names-zh.json 中文名 + statcard 图)
        + 本站 data/trees.json(shop.blkx 科技树布局,列序=游戏内布局)
   公式:剩余RP÷有效RP/场=场次;÷45=金鹰;×每场分钟=时长;前置闭包=最短合法研发路径 */

const NATIONS = [
  ['usa', '美国'], ['germany', '德国'], ['ussr', '苏联'], ['britain', '英国'], ['japan', '日本'],
  ['china', '中国'], ['france', '法国'], ['italy', '意大利'], ['sweden', '瑞典'], ['israel', '以色列'],
];
const BRANCHES = [['ground', '陆战'], ['aviation', '空战'], ['helicopters', '直升机'],
                  ['naval_blue', '蓝水海军'], ['naval_coastal', '海岸海军']];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const CAT_LABEL = { 'prem': '高级', 'pack': '礼包', 'mp': '市场', 'mp-prem': '市场·高级', 'sq': '中队' };

const S = {
  country: localStorage.getItem('wtrp.country') || 'usa',
  branch: localStorage.getItem('wtrp.branch') || 'ground',
  V: {}, names: {}, trees: null, cols: [], pos: {},
  owned: new Set(JSON.parse(localStorage.getItem('wtrp.owned') || '[]')),
  target: localStorage.getItem('wtrp.target') || null,
  sel: null,
};
const $ = id => document.getElementById(id);
const fmt = n => n >= 1e8 ? (n / 1e8).toFixed(2) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(n % 1e4 ? 1 : 0) + ' 万' : String(n || 0);

function nameOf(id) { return S.names[String(id).toLowerCase()] || id.replace(/_/g, ' '); }
function catOf(v) {
  if (!v) return 'tt';
  if (v.squadron_vehicle) return 'sq';
  if (v.is_pack) return 'pack';
  if (v.on_marketplace && v.is_premium) return 'mp-prem';
  if (v.on_marketplace) return 'mp';
  if (v.is_premium) return 'prem';
  return 'tt';
}

/* ---------- 数据加载 ---------- */
async function load() {
  const [vehicles, names, trees] = await Promise.all([
    fetch('/wtapi/api/vehicles-full.json').then(r => r.json()),
    fetch('/wtapi/api/names-zh.json').then(r => r.json()),
    fetch('data/trees.json').then(r => r.json()),
  ]);
  vehicles.forEach(v => { S.V[v.identifier] = v; });
  S.names = names; S.trees = trees;
  $('verBadge').textContent = '数据版本 ' + trees.version;
  if (!S.trees.columns[S.country]) { S.country = 'usa'; }
  initUI(); renderAll();
}

/* ---------- UI 骨架 ---------- */
function initUI() {
  $('countryTabs').innerHTML = NATIONS.map(([k, n]) =>
    `<button class="tab${k === S.country ? ' active' : ''}" data-c="${k}">${n}</button>`).join('');
  $('branchTabs').innerHTML = BRANCHES.map(([k, n]) =>
    `<button class="tab${k === S.branch ? ' active' : ''}" data-b="${k}">${n}</button>`).join('');
  $('countryTabs').onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    S.country = b.dataset.c; S.sel = null; persist();
    document.querySelectorAll('#countryTabs .tab').forEach(t => t.classList.toggle('active', t === b));
    renderAll();
  };
  $('branchTabs').onclick = e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    S.branch = b.dataset.b; S.sel = null; persist();
    document.querySelectorAll('#branchTabs .tab').forEach(t => t.classList.toggle('active', t === b));
    renderAll();
  };
  const eff = $('effRP'), mins = $('mins');
  eff.value = localStorage.getItem('wtrp.effRP') || 8000;
  mins.value = localStorage.getItem('wtrp.mins') || 8;
  eff.oninput = () => { localStorage.setItem('wtrp.effRP', eff.value); renderPanel(); };
  mins.oninput = () => { localStorage.setItem('wtrp.mins', mins.value); renderPanel(); };
  document.querySelectorAll('.presets button').forEach(b => b.onclick = () => { eff.value = b.dataset.v; eff.dispatchEvent(new Event('input')); });
}

function persist() {
  localStorage.setItem('wtrp.owned', JSON.stringify([...S.owned]));
  localStorage.setItem('wtrp.target', S.target || '');
  localStorage.setItem('wtrp.country', S.country);
  localStorage.setItem('wtrp.branch', S.branch);
}

/* ---------- 科技树渲染 ---------- */
function currentColumns() {
  const c = (S.trees.columns[S.country] || {});
  return c[S.branch] || [];
}
function buildPos() {
  S.pos = {};
  currentColumns().forEach((col, ci) => col.forEach((id, idx) => { S.pos[id] = { ci, idx }; }));
}

function renderTree() {
  buildPos();
  const cols = currentColumns();
  const html = cols.map(col => {
    let out = '<div class="col">', lastRank = null;
    for (const id of col) {
      const v = S.V[id];
      const rank = v ? v.era : null;
      if (rank !== null && rank !== lastRank && rank >= 1) {
        out += `<div class="rankdiv">等级 ${ROMAN[rank] || rank}</div>`;
        lastRank = rank;
      }
      const cat = catOf(v);
      const cost = v ? (v.ge_cost > 0 && v.is_premium ? `${fmt(v.ge_cost)} 金鹰`
        : `${fmt(v.req_exp)} RP${v.value > 0 ? ' / ' + fmt(v.value) + ' 银狮' : ''}`) : '活动载具';
      const chip = CAT_LABEL[cat] ? `<span class="chip">${CAT_LABEL[cat]}</span>` : '';
      const br = v ? (v.realistic_br || 0).toFixed(1) : '?';
      out += `<div class="vcard cat-${cat}" data-id="${id}" title="${id}">
        <img loading="lazy" src="/wtapi/assets/images/${id.toLowerCase()}.png" onerror="this.style.visibility='hidden'" alt="">
        <div class="main"><div class="nm">${nameOf(id)}${chip}</div>
        <div class="cost">BR ${br} · ${cost}</div></div></div>`;
    }
    return out + '</div>';
  }).join('');
  $('treeCols').innerHTML = html;
  $('treeBox').onclick = e => {
    const card = e.target.closest('.vcard'); if (!card) return;
    select(card.dataset.id);
  };
  updateStates();
}

function updateStates() {
  const path = new Set(S.target ? pathFor(S.target).ids : []);
  document.querySelectorAll('.vcard').forEach(el => {
    const id = el.dataset.id;
    el.classList.toggle('owned', S.owned.has(id));
    el.classList.toggle('target', id === S.target);
    el.classList.toggle('onpath', path.has(id) && id !== S.target);
  });
  const total = currentColumns().flat().length;
  const have = currentColumns().flat().filter(id => S.owned.has(id)).length;
  document.title = `WT 研发点计算器 · ${nameOf(S.country) || ''} ${have}/${total}`;
}

/* ---------- 研发路径 ---------- */
function pathFor(targetId) {
  const ids = [], meta = {};
  let id = targetId; const seen = new Set();
  while (id && !S.owned.has(id)) {
    if (seen.has(id)) break; seen.add(id);
    const v = S.V[id]; if (!v) break;
    ids.push(id);
    let req = v.required_vehicle || null;
    if (!req) { const p = S.pos[id]; if (p && p.idx > 0) req = currentColumns()[p.ci][p.idx - 1]; }
    meta[id] = { req };
    id = req;
  }
  ids.reverse();
  return { ids, meta };
}

/* ---------- 侧栏 ---------- */
function select(id) { S.sel = id; renderPanel(); }

function renderPanel() {
  const p = $('panel');
  const id = S.sel;
  if (!id || !currentColumns().flat().includes(id)) {
    p.innerHTML = S.target ? targetBlock() : `<h3>使用说明</h3>
      <div class="hint">点击科技树中的载具卡查看详情;<br>
      「已拥有」标记现有载具(自动保存),<br>「设为目标」选择要研发的终点,<br>
      右侧将给出最短研发路径与总账。<br><br>
      路径 = 前置载具链(required_vehicle + 列内顺序);<br>
      绿色「直达」表示连续研发下一辆,享有研发加速(AB 130% / RB·SB 110%,且覆盖等级惩罚)。<br><br>
      场次/时长按你输入的「有效RP/场」估算(已含高账/护身符等加成的净值,防重复计账);金鹰换算按官方 1 金鹰 = 45 研发点。</div>`;
    return;
  }
  const v = S.V[id];
  const t = targetBlock();
  if (!v) { p.innerHTML = `<h3>${nameOf(id)}</h3><div class="sub">${id}(活动/未收录,不计入路径)</div>${t}`; return; }
  const cat = catOf(v);
  const req = v.required_vehicle || (S.pos[id] && S.pos[id].idx > 0 ? currentColumns()[S.pos[id].ci][S.pos[id].idx - 1] : null);
  p.innerHTML = `
    <h3>${nameOf(id)}${CAT_LABEL[cat] ? ` <span class="chip">${CAT_LABEL[cat]}</span>` : ''}</h3>
    <div class="sub">${id} · ${ROMAN[v.era] || v.era} 级 · BR ${(v.realistic_br || 0).toFixed(1)} · ${v.vehicle_type.replace(/_/g, ' ')}</div>
    <img class="big" src="/wtapi/assets/images/${id.toLowerCase()}.png" onerror="this.style.display='none'" alt="">
    <div class="trow"><span>研发</span><b>${fmt(v.req_exp)} RP</b></div>
    <div class="trow"><span>购价</span><b>${v.ge_cost > 0 && v.is_premium ? fmt(v.ge_cost) + ' 金鹰' : fmt(v.value) + ' 银狮'}</b></div>
    ${req ? `<div class="trow"><span>前置</span><span>${nameOf(req)}${isDirect(id, req) ? ' <span class="direct">直达</span>' : ''}</span></div>` : '<div class="trow"><span>前置</span><span>无(起点)</span></div>'}
    <div class="btnrow">
      <button class="btn${S.owned.has(id) ? ' on' : ''}" id="btnOwn">已拥有${S.owned.has(id) ? ' ✓' : ''}</button>
      <button class="btn${S.target === id ? ' tgt' : ''}" id="btnTgt">${S.target === id ? '✓ 目标' : '设为目标'}</button>
    </div>
    ${t}`;
  $('btnOwn').onclick = () => {
    S.owned.has(id) ? S.owned.delete(id) : S.owned.add(id);
    persist(); updateStates(); renderPanel();
  };
  $('btnTgt').onclick = () => {
    S.target = (S.target === id) ? null : id;
    persist(); updateStates(); renderPanel();
  };
}

function isDirect(id, req) {
  const p = S.pos[id], q = S.pos[req];
  return !!(p && q && p.ci === q.ci && p.idx === q.idx + 1);
}

function targetBlock() {
  if (!S.target) return '';
  const { ids, meta } = pathFor(S.target);
  let rp = 0, sl = 0, ge = 0;
  ids.forEach(i => {
    const v = S.V[i]; if (!v) return;
    const cat = catOf(v);
    rp += (cat === 'tt' || cat === 'sq') ? (v.req_exp || 0) : 0;
    sl += cat === 'tt' ? (v.value || 0) : 0;
    ge += (cat === 'prem' || cat === 'mp-prem' || cat === 'pack') ? (v.ge_cost || 0) : 0;
  });
  const eff = Math.max(1, +$('effRP').value || 1);
  const mins = Math.max(1, +$('mins').value || 1);
  const battles = Math.ceil(rp / eff);
  const hours = (battles * mins / 60);
  const rows = ids.map(i => {
    const v = S.V[i] || {};
    const d = meta[i] && meta[i].req && isDirect(i, meta[i].req) ? '<span class="direct">直达</span>' : '';
    return `<div class="prow"><span class="pn">${S.owned.has(i) ? '' : ''}${nameOf(i)}</span>
      <span>${fmt(v.req_exp || v.ge_cost || 0)}${v.ge_cost > 0 && catOf(v) !== 'tt' ? 'GE' : 'RP'} ${d}</span></div>`;
  }).join('');
  return `<div class="totals">
    <h3 style="margin:4px 0">目标:${nameOf(S.target)}</h3>
    <div class="trow"><span>待研发载具</span><b>${ids.length} 台</b></div>
    <div class="trow"><span>剩余研发点</span><b>${fmt(rp)} RP</b></div>
    <div class="trow"><span>购买银狮</span><b>${fmt(sl)}</b></div>
    ${ge > 0 ? `<div class="trow"><span>礼包/高级直购</span><b>${fmt(ge)} 金鹰</b></div>` : ''}
    <div class="trow"><span>约合场次</span><b>${fmt(battles)} 场</b></div>
    <div class="trow"><span>约合时长</span><b>${hours >= 100 ? fmt(Math.round(hours)) : hours.toFixed(1)} 小时</b></div>
    <div class="trow"><span>金鹰全转换</span><b>${fmt(Math.ceil(rp / 45))} 金鹰</b></div>
    <div class="plist">${rows || '<div class="hint">目标已拥有,或路径为空</div>'}</div>
    <button class="btn" id="btnClrTgt" style="margin-top:8px">清除目标</button>
  </div>`;
}

function renderAll() { renderTree(); renderPanel(); }

document.addEventListener('click', e => {
  if (e.target.id === 'btnClrTgt') { S.target = null; persist(); updateStates(); renderPanel(); }
});

load().catch(e => {
  $('panel').innerHTML = `<h3>加载失败</h3><div class="hint">${e.message}<br>请确认 /wtapi/ 与 data/trees.json 可达后刷新。</div>`;
});
