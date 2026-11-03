// Generates SYNTHETIC survey data for the fictional brand "Thanda Cold Brew" (monthly 8-pack subscription, INR).
// Seeded so the file is reproducible. Not real customers.
const fs = require('fs');
let s = 20261103;
const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const norm = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const segs = [{ name: 'Students', base: 520, n: 120 }, { name: 'Young professionals', base: 780, n: 180 }, { name: 'Coffee enthusiasts', base: 980, n: 100 }];
const prices = [499, 599, 699, 799, 899, 999, 1199];
const rows = ['respondent_id,segment,too_cheap,cheap,expensive,too_expensive,' + prices.map(p => 'buy_' + p).join(',')];
let id = 1;
for (const g of segs) for (let i = 0; i < g.n; i++) {
  const wtp = g.base * Math.exp(0.18 * norm());
  const r10 = x => Math.round(x / 10) * 10;
  let tc = r10(wtp * (0.45 + 0.08 * rnd())), c = r10(wtp * (0.75 + 0.08 * rnd()));
  let e = r10(wtp * (1.1 + 0.1 * rnd())), te = r10(wtp * (1.45 + 0.15 * rnd()));
  if (rnd() < 0.04) [c, e] = [e, c]; // a few illogical answers, as in real surveys
  const buys = prices.map(p => (p <= wtp * (0.95 + 0.2 * rnd()) ? 1 : 0));
  rows.push([id++, g.name, tc, c, e, te, ...buys].join(','));
}
fs.writeFileSync(__dirname + '/../data/thanda-synthetic-survey.csv', rows.join('\n') + '\n');
console.log('wrote', rows.length - 1, 'rows');
