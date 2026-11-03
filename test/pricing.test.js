const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const P = require('../pricing.js');

test('parseCSV handles quotes and lowercases headers', () => {
  const { header, rows } = P.parseCSV('ID,Segment\n1,"Young, pros"\n');
  assert.deepStrictEqual(header, ['id', 'segment']);
  assert.strictEqual(rows[0].segment, 'Young, pros');
});

test('cleanPSM drops illogical and non-numeric rows', () => {
  const { valid, dropped } = P.cleanPSM([
    { too_cheap: 1, cheap: 2, expensive: 3, too_expensive: 4 },
    { too_cheap: 1, cheap: 5, expensive: 3, too_expensive: 6 },
    { too_cheap: 'x', cheap: 2, expensive: 3, too_expensive: 4 }
  ]);
  assert.strictEqual(valid.length, 1); assert.strictEqual(dropped, 2);
});

test('curves are monotonic and bounded', () => {
  const resp = [{ tooCheap: 10, cheap: 20, expensive: 30, tooExpensive: 40 }, { tooCheap: 15, cheap: 25, expensive: 35, tooExpensive: 50 }];
  const c = P.psmCurves(resp, P.priceGrid(resp, 50));
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i].tooCheap <= c[i - 1].tooCheap);
    assert.ok(c[i].tooExpensive >= c[i - 1].tooExpensive);
  }
  assert.strictEqual(c[0].tooCheap, 1); assert.strictEqual(c[c.length - 1].tooExpensive, 1);
});

test('intersect interpolates a crossing', () => {
  const curves = [{ price: 0, a: 1, b: 0 }, { price: 10, a: 0, b: 1 }];
  assert.strictEqual(P.intersect(curves, 'a', 'b'), 5);
  assert.strictEqual(P.intersect([{ price: 0, a: 0, b: 1 }], 'a', 'b'), null);
});

test('symmetric single respondent gives expected key points', () => {
  const vw = P.vanWestendorp([{ tooCheap: 100, cheap: 200, expensive: 300, tooExpensive: 400 }], 300);
  assert.ok(vw.opp >= 100 && vw.opp <= 400);
  assert.ok(vw.ipp >= 200 && vw.ipp <= 300);
});

test('key points are ordered on the synthetic dataset', () => {
  const { header, rows } = P.parseCSV(fs.readFileSync(__dirname + '/../data/thanda-synthetic-survey.csv', 'utf8'));
  assert.ok(header.includes('buy_799'));
  const { valid, dropped } = P.cleanPSM(rows);
  assert.ok(dropped > 0 && valid.length > 350);
  const vw = P.vanWestendorp(valid);
  [vw.pmc, vw.opp, vw.ipp, vw.pme].forEach(x => assert.ok(x !== null));
  assert.ok(vw.pmc < vw.pme, 'acceptable range is positive');
  assert.ok(vw.opp < vw.pme && vw.ipp < vw.pme);
});

test('gaborGranger finds revenue and profit maxima', () => {
  const header = ['buy_100', 'buy_200', 'buy_300'];
  const rows = [
    { buy_100: '1', buy_200: '1', buy_300: '0' }, { buy_100: '1', buy_200: '1', buy_300: '1' },
    { buy_100: 'yes', buy_200: 'no', buy_300: 'no' }, { buy_100: '1', buy_200: '0', buy_300: '0' }
  ];
  const gg = P.gaborGranger(header, rows, 150);
  assert.deepStrictEqual(gg.points.map(p => p.share), [1, 0.5, 0.25]);
  assert.strictEqual(gg.revenueMax.price, 100);
  assert.strictEqual(gg.profitMax.price, 300);
  assert.ok(gg.points[1].elasticity < 0);
});

test('gaborGranger returns null without buy_ columns', () => {
  assert.strictEqual(P.gaborGranger(['a'], [{ a: 1 }]), null);
});

test('readout mentions range and caveat', () => {
  const { header, rows } = P.parseCSV(fs.readFileSync(__dirname + '/../data/thanda-synthetic-survey.csv', 'utf8'));
  const vw = P.vanWestendorp(P.cleanPSM(rows).valid);
  const lines = P.readout(vw, P.gaborGranger(header, rows, 320), '₹');
  assert.ok(lines[0].includes('acceptable price range'));
  assert.ok(lines[lines.length - 1].includes('live price test'));
});

test('testCells returns well-separated charm prices', () => {
  const cells = P.testCells({ opp: 620, ipp: 710, pme: 980 }, { profitMax: { price: 699 }, revenueMax: { price: 599 } });
  assert.ok(cells.length >= 2 && cells.length <= 3);
  cells.forEach(c => assert.strictEqual(c % 10, 9));
  for (let i = 1; i < cells.length; i++) assert.ok((cells[i] - cells[i - 1]) / cells[i - 1] >= 0.08);
});
