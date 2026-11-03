/* Price Pulse Lab: pure pricing-research maths (Van Westendorp PSM + Gabor-Granger).
   Works in the browser (window.Pricing) and in Node (module.exports). */
(function (root) {
  'use strict';

  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row.');
    const split = line => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === ',' && !q) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const header = split(lines[0]).map(h => h.toLowerCase());
    const rows = lines.slice(1).map(l => {
      const cells = split(l); const r = {};
      header.forEach((h, i) => { r[h] = cells[i] === undefined ? '' : cells[i]; });
      return r;
    });
    return { header, rows };
  }

  const PSM_COLS = ['too_cheap', 'cheap', 'expensive', 'too_expensive'];

  /* Keep respondents whose four answers are numeric and logically ordered. */
  function cleanPSM(rows) {
    const valid = []; let dropped = 0;
    rows.forEach(r => {
      const v = PSM_COLS.map(c => Number(r[c]));
      const ok = v.every(x => Number.isFinite(x) && x > 0) && v[0] <= v[1] && v[1] <= v[2] && v[2] <= v[3];
      if (ok) valid.push({ tooCheap: v[0], cheap: v[1], expensive: v[2], tooExpensive: v[3], segment: r.segment || 'All' });
      else dropped++;
    });
    return { valid, dropped };
  }

  function priceGrid(resp, steps) {
    steps = steps || 400;
    let lo = Infinity, hi = -Infinity;
    resp.forEach(r => { lo = Math.min(lo, r.tooCheap); hi = Math.max(hi, r.tooExpensive); });
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(lo + (hi - lo) * i / steps);
    return out;
  }

  /* Cumulative curves at each price (shares 0..1). */
  function psmCurves(resp, grid) {
    const n = resp.length;
    return grid.map(p => {
      let tc = 0, c = 0, e = 0, te = 0;
      for (const r of resp) {
        if (r.tooCheap >= p) tc++;
        if (r.cheap >= p) c++;
        if (r.expensive <= p) e++;
        if (r.tooExpensive <= p) te++;
      }
      return { price: p, tooCheap: tc / n, cheap: c / n, notCheap: 1 - c / n, expensive: e / n, notExpensive: 1 - e / n, tooExpensive: te / n };
    });
  }

  /* First crossing of curve a (falling) and b (rising), linearly interpolated. */
  function intersect(curves, a, b) {
    for (let i = 1; i < curves.length; i++) {
      const d0 = curves[i - 1][a] - curves[i - 1][b];
      const d1 = curves[i][a] - curves[i][b];
      if (d0 === 0) return curves[i - 1].price;
      if (d0 > 0 && d1 <= 0) {
        const t = d0 / (d0 - d1);
        return curves[i - 1].price + t * (curves[i].price - curves[i - 1].price);
      }
    }
    return null;
  }

  function vanWestendorp(resp, steps) {
    if (!resp.length) throw new Error('No valid Van Westendorp responses.');
    const grid = priceGrid(resp, steps);
    const curves = psmCurves(resp, grid);
    return {
      n: resp.length,
      curves,
      pmc: intersect(curves, 'tooCheap', 'notCheap'),       // point of marginal cheapness
      opp: intersect(curves, 'tooCheap', 'tooExpensive'),   // optimal price point
      ipp: intersect(curves, 'cheap', 'expensive'),         // indifference price point
      pme: intersect(curves, 'notExpensive', 'tooExpensive') // point of marginal expensiveness
    };
  }

  /* Gabor-Granger: columns named buy_<price> holding 1/0 or yes/no. */
  function gaborGranger(header, rows, unitCost) {
    const cols = header.filter(h => /^buy_\d+(\.\d+)?$/.test(h))
      .map(h => ({ col: h, price: Number(h.slice(4)) }))
      .sort((x, y) => x.price - y.price);
    if (!cols.length) return null;
    const truthy = v => ['1', 'yes', 'y', 'true'].includes(String(v).toLowerCase());
    const cost = Number(unitCost) || 0;
    const points = cols.map(({ col, price }) => {
      const answered = rows.filter(r => r[col] !== '' && r[col] !== undefined);
      const share = answered.length ? answered.filter(r => truthy(r[col])).length / answered.length : 0;
      return { price, share, n: answered.length, revenueIndex: price * share, profitIndex: (price - cost) * share };
    });
    points.forEach((p, i) => {
      if (i === 0) { p.elasticity = null; return; }
      const a = points[i - 1];
      const dq = (p.share - a.share) / ((p.share + a.share) / 2 || 1);
      const dp = (p.price - a.price) / ((p.price + a.price) / 2);
      p.elasticity = dp ? dq / dp : null; // arc elasticity
    });
    const best = key => points.reduce((m, p) => (p[key] > m[key] ? p : m), points[0]);
    return { points, revenueMax: best('revenueIndex'), profitMax: best('profitIndex'), unitCost: cost };
  }

  function fmt(x, cur) { return x === null || x === undefined ? 'n/a' : (cur || '') + Math.round(x).toLocaleString('en-IN'); }

  function readout(vw, gg, cur) {
    const lines = [];
    if (vw) {
      lines.push(`Based on ${vw.n} valid answers, buyers see roughly ${fmt(vw.pmc, cur)} to ${fmt(vw.pme, cur)} as an acceptable price range.`);
      lines.push(`The optimal price point (fewest people rejecting it as too cheap or too expensive) is about ${fmt(vw.opp, cur)}, and the indifference point, where as many call it cheap as expensive, is about ${fmt(vw.ipp, cur)}.`);
      if (vw.opp !== null && vw.ipp !== null) {
        lines.push(vw.ipp > vw.opp
          ? 'Because the indifference point sits above the optimal point, there is room to price toward the upper part of the range if the brand story supports it.'
          : 'Because the indifference point sits at or below the optimal point, buyers are price-sensitive here, so lean on value messaging before raising price.');
      }
    }
    if (gg) {
      const r = gg.revenueMax, p = gg.profitMax;
      lines.push(`In the purchase-intent test, revenue per 100 respondents peaks at ${fmt(r.price, cur)} (${Math.round(r.share * 100)}% would buy).`);
      if (gg.unitCost) lines.push(`With a unit cost of ${fmt(gg.unitCost, cur)}, contribution peaks at ${fmt(p.price, cur)}.`);
      if (vw && vw.pme !== null && r.price > vw.pme) lines.push('Note that the revenue-maximising price is above the marginal expensiveness point, so test it carefully: many buyers already call it too expensive.');
    }
    lines.push('Stated intent overstates real buying, so treat these as a starting range for a live price test, not a final answer.');
    return lines;
  }

  /* Pick up to 3 well-separated price cells (charm-priced, at least 8% apart) for a live test. */
  function testCells(vw, gg) {
    const raw = [vw && vw.opp, vw && vw.ipp, gg && gg.profitMax.price, gg && gg.revenueMax.price,
      vw && vw.ipp !== null && vw.pme !== null ? (vw.ipp + vw.pme) / 2 : null].filter(v => v);
    const charm = v => Math.max(1, Math.round(v / 10) * 10 - 1);
    const cells = [];
    raw.forEach(v => { const c = charm(v); if (cells.length < 3 && cells.every(x => Math.abs(x - c) / x >= 0.08)) cells.push(c); });
    return cells.sort((a, b) => a - b);
  }

  const api = { testCells, parseCSV, cleanPSM, priceGrid, psmCurves, intersect, vanWestendorp, gaborGranger, readout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pricing = api;
})(typeof window !== 'undefined' ? window : this);
