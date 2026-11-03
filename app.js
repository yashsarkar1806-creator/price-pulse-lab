(function () {
  const $ = id => document.getElementById(id);
  let parsed = null;

  function load(text) {
    try {
      parsed = Pricing.parseCSV(text);
      const segs = [...new Set(parsed.rows.map(r => r.segment).filter(Boolean))];
      $('segment').innerHTML = ['All', ...segs].map(s => `<option>${s}</option>`).join('');
      $('status').textContent = `Loaded ${parsed.rows.length} rows.`;
      return true;
    } catch (e) { $('status').textContent = e.message; return false; }
  }

  function axes(ctx, W, H, pad, xmin, xmax, ymax, cur, yfmt) {
    ctx.clearRect(0, 0, W, H); ctx.strokeStyle = '#ccc'; ctx.fillStyle = '#666'; ctx.font = '12px system-ui'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = H - pad - (H - 2 * pad) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
      ctx.fillText(yfmt(ymax * i / 4), 4, y + 4);
    }
    for (let i = 0; i <= 6; i++) {
      const v = xmin + (xmax - xmin) * i / 6; const x = pad + (W - 2 * pad) * i / 6;
      ctx.fillText(cur + Math.round(v), x - 14, H - pad + 18);
    }
  }

  function drawPSM(vw, cur) {
    const c = $('psm'), ctx = c.getContext('2d'), W = c.width, H = c.height, pad = 44;
    const xs = vw.curves.map(p => p.price), xmin = xs[0], xmax = xs[xs.length - 1];
    const X = v => pad + (W - 2 * pad) * (v - xmin) / (xmax - xmin), Y = v => H - pad - (H - 2 * pad) * v;
    axes(ctx, W, H, pad, xmin, xmax, 1, cur, v => Math.round(v * 100) + '%');
    const lines = [['tooCheap', '#2b8a3e', 1], ['notCheap', '#2b8a3e', .55], ['notExpensive', '#c92a2a', .55], ['tooExpensive', '#c92a2a', 1], ['cheap', '#1971c2', 1], ['expensive', '#e67700', 1]];
    lines.forEach(([k, col, a]) => {
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath();
      vw.curves.forEach((p, i) => (i ? ctx.lineTo(X(p.price), Y(p[k])) : ctx.moveTo(X(p.price), Y(p[k])))); ctx.stroke();
    });
    ctx.globalAlpha = .12; ctx.fillStyle = '#d9480f';
    if (vw.pmc !== null && vw.pme !== null) ctx.fillRect(X(vw.pmc), pad, X(vw.pme) - X(vw.pmc), H - 2 * pad);
    ctx.globalAlpha = 1; ctx.fillStyle = '#1d1b2f'; ctx.font = 'bold 12px system-ui';
    [['PMC', vw.pmc], ['OPP', vw.opp], ['IPP', vw.ipp], ['PME', vw.pme]].forEach(([l, v], i) => {
      if (v === null) return; ctx.fillRect(X(v) - 1, pad, 2, H - 2 * pad); ctx.fillText(l, X(v) + 4, pad + 14 + i * 14);
    });
  }

  function drawGG(gg, cur) {
    const c = $('gg'), ctx = c.getContext('2d'), W = c.width, H = c.height, pad = 44;
    const pts = gg.points, xmin = pts[0].price, xmax = pts[pts.length - 1].price;
    const maxRev = Math.max(...pts.map(p => p.revenueIndex));
    const X = v => pad + (W - 2 * pad) * (v - xmin) / ((xmax - xmin) || 1), Y = v => H - pad - (H - 2 * pad) * v;
    axes(ctx, W, H, pad, xmin, xmax, 1, cur, v => Math.round(v * 100) + '%');
    const plot = (f, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.price), Y(f(p))) : ctx.moveTo(X(p.price), Y(f(p))))); ctx.stroke(); pts.forEach(p => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(p.price), Y(f(p)), 4, 0, 7); ctx.fill(); }); };
    plot(p => p.share, '#1971c2'); plot(p => p.revenueIndex / maxRev, '#d9480f');
    ctx.fillStyle = '#1971c2'; ctx.fillText('Would buy (%)', W - 200, pad + 4); ctx.fillStyle = '#d9480f'; ctx.fillText('Revenue (indexed to peak)', W - 200, pad + 20);
  }

  function run() {
    if (!parsed && !load($('csv').value)) return;
    const seg = $('segment').value, cur = $('cur').value || '';
    const rows = seg === 'All' ? parsed.rows : parsed.rows.filter(r => r.segment === seg);
    const { valid, dropped } = Pricing.cleanPSM(rows);
    let vw = null;
    try { vw = Pricing.vanWestendorp(valid); } catch (e) { $('status').textContent = e.message; }
    const gg = Pricing.gaborGranger(parsed.header, rows, $('cost').value);
    if (!vw && !gg) return;
    $('results').classList.remove('hidden');
    const f = v => v === null ? 'n/a' : cur + Math.round(v).toLocaleString('en-IN');
    $('kpis').innerHTML = vw ? [
      ['Acceptable range', `${f(vw.pmc)} to ${f(vw.pme)}`], ['Optimal price point', f(vw.opp)], ['Indifference point', f(vw.ipp)],
      ['Valid responses', `${vw.n} <small>(${dropped} illogical dropped)</small>`]
    ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('') : '<p>No Van Westendorp columns found.</p>';
    if (vw) drawPSM(vw, cur);
    $('ggwrap').style.display = gg ? '' : 'none';
    if (gg) {
      drawGG(gg, cur);
      $('ggtable').innerHTML = '<tr><th>Price</th><th>Would buy</th><th>Revenue / 100 resp.</th><th>Contribution / 100 resp.</th><th>Arc elasticity</th></tr>' +
        gg.points.map(p => `<tr class="${p === gg.revenueMax ? 'best' : ''}"><td>${f(p.price)}</td><td>${Math.round(p.share * 100)}%</td><td>${f(p.revenueIndex * 100)}</td><td>${f(p.profitIndex * 100)}</td><td>${p.elasticity === null ? '' : p.elasticity.toFixed(2)}</td></tr>`).join('');
    }
    const lines = Pricing.readout(vw, gg, cur);
    $('readout').innerHTML = lines.map(l => `<li>${l}</li>`).join('');
    const uniq = Pricing.testCells(vw, gg);
    $('testplan').textContent = uniq.length
      ? `Run a randomised landing-page price test with ${uniq.length} cells at ${uniq.map(v => f(v)).join(', ')}${seg !== 'All' ? ' for ' + seg : ''}. Split traffic evenly, track checkout conversion and revenue per visitor, and pick the winner on revenue per visitor rather than conversion alone.`
      : 'Not enough data for a test plan.';
    $('status').textContent = `Analysed ${rows.length} rows${seg !== 'All' ? ' in ' + seg : ''}.`;
  }

  $('sample').onclick = () => fetch('data/thanda-synthetic-survey.csv').then(r => r.text()).then(t => { $('csv').value = t; load(t); run(); });
  $('file').onchange = e => { const fl = e.target.files[0]; if (!fl) return; fl.text().then(t => { $('csv').value = t; load(t); run(); }); };
  $('csv').oninput = () => { parsed = null; };
  $('run').onclick = () => { if (!parsed) load($('csv').value); run(); };
  $('segment').onchange = run;
  $('copy').onclick = () => navigator.clipboard.writeText([...document.querySelectorAll('#readout li')].map(l => '- ' + l.textContent).join('\n') + '\n\n' + $('testplan').textContent).then(() => { $('copy').textContent = 'Copied'; });
})();
if (/[?&]demo=1/.test(location.search)) document.getElementById('sample').click();
