var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

// Self-contained ticket fixtures: no store module, filesystem access, or live data.
function item(id, name, hsn, price, qty) {
  return { id: id, name: name, hsn: hsn, price: price, qty: qty };
}

var examples = [
  {
    id: 1001, coupon: '', description: 'mixed HSN rates without a coupon match billing',
    items: [item(8, 'Tea', '0902', 140, 2), item(2, 'Dal', '0713', 165, 2)],
    billed: { subtotal: 610, discount: 0, tax: 66.9, total: 676.9 },
    lineTaxes: [50.4, 16.5], gstRates: [18, 5], splitGst: [33.45, 33.45]
  },
  {
    id: 1002, coupon: 'SAVE10', description: 'invoice matches the billed 963.90 and 45.90 GST',
    items: [item(1, 'Rice', '1006', 640, 1), item(4, 'Sunflower oil', '1512', 190, 2)],
    billed: { subtotal: 1020, discount: 102, tax: 45.9, total: 963.9 },
    lineTaxes: [28.8, 17.1], gstRates: [5, 5], splitGst: [22.95, 22.95]
  },
  {
    id: 1003, coupon: 'FLAT50', description: 'flat discount reduces invoice taxable amounts',
    items: [item(7, 'Butter', '0405', 260, 1), item(8, 'Tea', '0902', 140, 1)],
    billed: { subtotal: 400, discount: 50, tax: 49.35, total: 399.35 },
    lineTaxes: [27.3, 22.05], gstRates: [12, 18], splitGst: [24.68, 24.67]
  },
  {
    id: 1004, coupon: 'SAVE10', description: 'invoice respects the discount cap and 5% HSN rate',
    items: [item(5, 'Groundnut oil', '1508', 1120, 2)],
    billed: { subtotal: 2240, discount: 150, tax: 104.5, total: 2194.5 },
    lineTaxes: [104.5], gstRates: [5], splitGst: [52.25, 52.25]
  },
  {
    id: 1005, coupon: 'FLAT50', description: 'mixed-rate flat-discount invoice matches billing',
    items: [item(1, 'Rice', '1006', 640, 1), item(12, 'Sherbet', '2106', 180, 2)],
    billed: { subtotal: 1000, discount: 50, tax: 91.96, total: 1041.96 },
    lineTaxes: [30.4, 61.56], gstRates: [5, 18], splitGst: [45.98, 45.98]
  },
  {
    id: 1006, coupon: 'WELCOME', description: 'invoice calculates the welcome discount before GST',
    items: [item(6, 'Ghee', '0405', 450, 2), item(9, 'Coffee', '0901', 310, 1)],
    billed: { subtotal: 1210, discount: 60.5, tax: 155.61, total: 1305.11 },
    lineTaxes: [102.6, 53.01], gstRates: [12, 18], splitGst: [77.81, 77.8]
  },
  {
    id: 1007, coupon: '', status: 'pending', description: 'pending order retains its 5% and 12% HSN rates',
    items: [item(6, 'Ghee', '0405', 450, 2), item(4, 'Sunflower oil', '1512', 190, 2)],
    billed: { subtotal: 1280, discount: 0, tax: 127, total: 1407 },
    lineTaxes: [108, 19], gstRates: [12, 5], splitGst: [63.5, 63.5]
  },
  {
    id: 1008, coupon: '', description: 'all 18% items without a coupon match billing',
    items: [item(8, 'Tea', '0902', 140, 1), item(12, 'Sherbet', '2106', 180, 2)],
    billed: { subtotal: 500, discount: 0, tax: 90, total: 590 },
    lineTaxes: [25.2, 64.8], gstRates: [18, 18], splitGst: [45, 45]
  }
];

function orderFrom(example) {
  return Object.assign({
    id: example.id,
    date: '01/01/2022',
    customer: 'Ticket example',
    status: example.status || 'completed',
    coupon: example.coupon,
    items: example.items.map(function (line) { return Object.assign({}, line); })
  }, example.billed);
}

function totalsOf(figures) {
  return {
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    total: figures.total
  };
}

examples.forEach(function (example) {
  test('ticket #1: order #' + example.id + ' ' + example.description, function () {
    var order = orderFrom(example);
    var original = JSON.stringify(order);
    var billed = pricing.computeTotals(order.items, order.coupon);
    var printed = invoice.computeInvoiceFigures(order);
    assert.deepEqual(totalsOf(billed), example.billed);
    assert.deepEqual(totalsOf(printed), example.billed);
    assert.deepEqual(printed.rows.map(function (row) { return row.lineTax; }), example.lineTaxes);
    assert.deepEqual(printed.rows.map(function (row) { return row.gstPercent; }), example.gstRates);
    assert.deepEqual([printed.cgst, printed.sgst], example.splitGst);

    var html = invoice.render(order);
    assert.ok(html.includes('Invoice Total</td><td class="r">₹' + example.billed.total.toFixed(2)));
    assert.ok(html.includes('CGST + SGST (Total GST)</td><td class="r">₹' + example.billed.tax.toFixed(2)));
    assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
    assert.equal(JSON.stringify(order), original, 'rendering must not alter the billed order');
  });
});

test('ticket #1: GST audit matches all eight billed orders', function () {
  var db = { orders: examples.map(orderFrom) };
  var original = JSON.stringify(db);
  var audit = reports.getGstReconciliation(db);
  assert.equal(audit.totalChecked, 8);
  assert.equal(audit.mismatchCount, 0);
  assert.equal(audit.totalDelta, 0);
  assert.deepEqual(audit.rows.map(function (row) { return [row.orderId, row.matched, row.delta]; }), [
    [1001, true, 0], [1002, true, 0], [1003, true, 0], [1004, true, 0],
    [1005, true, 0], [1006, true, 0], [1007, true, 0], [1008, true, 0]
  ]);
  assert.equal(JSON.stringify(db), original, 'audit must not alter billed data');
});
