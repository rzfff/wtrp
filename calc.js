/* WTCalc —— /wtrp/ 研发链计算核心(浏览器 window.WTCalc / Node module.exports 共用)
 *
 * 图语义(data/catalog.json 的 edges):
 *   科技树车的前置 = 其父节点;文件夹组内每辆都向"后继车"连边(游戏"任选其一"),
 *   故单车取 min 路径即等价于"文件夹内挑最便宜的研发"。
 *   非 researchable(金币/活动/市场/联队/礼包)不参与研发链,只计金鹰。
 * v5.0:total() 口径改为仅所选载具自身(不含前置);need() 链路保持含前置(单车"研发链"展示用)。
 */
(function (root, factory) {
  const M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  root.WTCalc = M;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function buildIndex(catalog) {
    const byId = new Map();
    for (const n of catalog.nodes) byId.set(n.id, n);
    const preds = new Map();
    for (const e of catalog.edges) {
      if (!byId.has(e.parent) || !byId.has(e.child)) continue;
      let a = preds.get(e.child);
      if (!a) preds.set(e.child, (a = []));
      a.push(e.parent);
    }
    return { catalog, byId, preds };
  }

  /* 单车:研发到 id 所需 {rp, ge, path(id 自顶向下含自身,min-cost 路径)} */
  function need(ix, id) {
    const memo = new Map();
    const visiting = new Set();
    function cost(vid) {
      if (memo.has(vid)) return memo.get(vid);
      if (visiting.has(vid)) return { rp: 0, ge: 0, path: [] }; // 环保护
      visiting.add(vid);
      const n = ix.byId.get(vid);
      let res;
      if (!n) {
        res = { rp: 0, ge: 0, path: [] };
      } else if (n.availability !== "researchable") {
        res = { rp: 0, ge: n.ge_cost || 0, path: [vid] };
      } else {
        const ps = ix.preds.get(vid) || [];
        let best = null;
        for (const p of ps) {
          const c = cost(p);
          if (!best || c.rp < best.rp) best = c;
        }
        const own = n.rp_cost || 0;
        res = best
          ? { rp: own + best.rp, ge: best.ge, path: best.path.concat(vid) }
          : { rp: own, ge: 0, path: [vid] };
      }
      visiting.delete(vid);
      memo.set(vid, res);
      return res;
    }
    return cost(id);
  }

  /* 多选合计(v5.0 口径:仅所选载具自身的研发点/金鹰,不含前置——用户验收:
     "选了哪几个载具就算哪几个的合计")。返回 {rp, ge, counted, per:[{id, added, addedGe}]} */
  function total(ix, ids) {
    let rp = 0, ge = 0;
    const per = [], counted = [];
    for (const id of ids) {
      const n = ix.byId.get(id);
      if (!n) continue;
      const added = n.availability === "researchable" ? (n.rp_cost || 0) : 0;
      const addedGe = n.availability !== "researchable" ? (n.ge_cost || 0) : 0;
      rp += added; ge += addedGe;
      counted.push(id);
      per.push({ id, added, addedGe });
    }
    return { rp, ge, counted, per };
  }

  return { buildIndex, need, total };
});
