var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

// Match the fields stored on an order without loading or writing data/db.json.
function billedOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 9001,
    date: '01/01/2022',
    customer: 'Test Customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the billed 5%, 12%, and 18% HSN rates', function () {
  var items = [
    { id: 1, sku: 'RICE', name: 'Rice', hsn: '1006', price: 100, qty: 1 },
    { id: 2, sku: 'GHEE', name: 'Ghee', hsn: '0405', price: 100, qty: 1 },
    { id: 3, sku: 'TEA', name: 'Tea', hsn: '0902', price: 100, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, '');
  var order = billedOrder(items, '');
  var printed = invoice.computeInvoiceFigures(order);
  var html = invoice.render(order);

  assert.deepEqual(billed.lines.map(function (line) { return line.gstPercent; }), [5, 12, 18]);
  assert.deepEqual(billed.lines.map(function (line) { return line.tax; }), [5, 12, 18]);
  assert.deepEqual({ tax: billed.tax, cgst: billed.cgst, sgst: billed.sgst, total: billed.total },
    { tax: 35, cgst: 17.5, sgst: 17.5, total: 335 });

  assert.deepEqual(printed.rows.map(function (line) { return line.gstPercent; }), [5, 12, 18]);
  assert.deepEqual(printed.rows.map(function (line) { return line.lineTax; }), [5, 12, 18]);
  assert.deepEqual({ tax: printed.tax, cgst: printed.cgst, sgst: printed.sgst, total: printed.total },
    { tax: 35, cgst: 17.5, sgst: 17.5, total: 335 });
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹35\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹335\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
});

test('invoice SAVE10 discount and GST match billing as well as the total', function () {
  var items = [
    { id: 3, sku: 'TEA', name: 'Tea', hsn: '0902', price: 1000, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var order = billedOrder(items, 'SAVE10');
  var printed = invoice.computeInvoiceFigures(order);
  var reconciliation = reports.getGstReconciliation({ orders: [order] });
  var html = invoice.render(order);

  assert.deepEqual({ discount: billed.discount, taxable: billed.taxable, tax: billed.tax,
    cgst: billed.cgst, sgst: billed.sgst, total: billed.total },
  { discount: 100, taxable: 900, tax: 162, cgst: 81, sgst: 81, total: 1062 });
  assert.deepEqual({ discount: printed.discount, tax: printed.tax, cgst: printed.cgst,
    sgst: printed.sgst, total: printed.total },
  { discount: 100, tax: 162, cgst: 81, sgst: 81, total: 1062 });
  assert.deepEqual({ mismatchCount: reconciliation.mismatchCount, totalDelta: reconciliation.totalDelta,
    matched: reconciliation.rows[0].matched, delta: reconciliation.rows[0].delta },
  { mismatchCount: 0, totalDelta: 0, matched: true, delta: 0 });
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹162\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
});

test('invoice SAVE10 discount respects the billing cap', function () {
  var items = [
    { id: 3, sku: 'TEA', name: 'Tea', hsn: '0902', price: 2000, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var order = billedOrder(items, 'SAVE10');
  var printed = invoice.computeInvoiceFigures(order);
  var html = invoice.render(order);

  assert.deepEqual({ discount: billed.discount, tax: billed.tax, total: billed.total },
    { discount: 150, tax: 333, total: 2183 });
  assert.deepEqual({ discount: printed.discount, tax: printed.tax, total: printed.total },
    { discount: 150, tax: 333, total: 2183 });
  assert.match(html, /Invoice Total<\/td><td class="r">₹2183\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice:/);
});

test('reconciliation still flags stored totals that disagree with the order items', function () {
  var order = billedOrder([
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ], '');
  order.total = 104;
  order.tax = 4;

  var printed = invoice.computeInvoiceFigures(order);
  var audit = reports.getGstReconciliation({ orders: [order] });
  assert.equal(printed.total, 105);
  assert.equal(printed.tax, 5);
  assert.equal(audit.mismatchCount, 1);
  assert.equal(audit.rows[0].matched, false);
  assert.equal(audit.rows[0].delta, 1);
  assert.match(invoice.render(order), /Accountant Reconciliation Notice:[\s\S]*?\+₹1\.00/);
});
