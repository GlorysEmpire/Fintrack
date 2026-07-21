// ─── CONSTANTS ───────────────────────────────────────────────────────
const SYM   = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
const FX    = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const CATS  = {
  food: '🍽️ Food', transport: '🚗 Transport', bills: '⚡ Bills',
  outings: '🍻 Going out', shopping: '🛍️ Shopping', health: '❤️ Health',
  data: '📱 Data/Airtime', clothing: '👟 Clothing/Footwear',
  tithe_payment: '✝️ Tithe', investment_deposit: '📈 Investment dep.',
  savings_deposit: '💰 Savings dep.', giving: '🎁 Giving',
  other: '📌 Other', spend: '💸 Spend'
};
const BUCKET_NAMES = {
  spend: '💸 Spend', save: '💰 Save', invest: '📈 Invest',
  give: '🎁 Give', emergency: '🆘 Emergency', tithe: '✝️ Tithe'
};

// What each bucket is ALLOWED to be spent on
const BUCKET_RULES = {
  spend: {
    label: '💸 Daily Spend',
    desc: 'Personal daily expenses & shopping for yourself',
    cats: ['food', 'transport', 'outings', 'shopping', 'health', 'data', 'clothing', 'personal', 'other']
  },
  save: {
    label: '💰 Save',
    desc: 'Recurring bills, debts, projects, subscriptions, household supplies',
    cats: ['bills', 'subscriptions', 'debt_payment', 'household', 'project', 'other_save']
  },
  give: {
    label: '🎁 Give',
    desc: 'Church offering, helping others, family support',
    cats: ['church', 'helping_others', 'family_support', 'charity', 'other_give']
  },
  invest: {
    label: '📈 Invest',
    desc: 'Business expenses & investments that generate income',
    cats: ['business', 'investment_deposit', 'asset_purchase', 'other_invest']
  },
  emergency: {
    label: '🆘 Emergency',
    desc: 'Long-term safe haven assets only (Real estate, Gold, etc.) — NO regular spending',
    cats: ['real_estate', 'gold', 'safe_haven']
  },
  tithe: {
    label: '✝️ Tithe',
    desc: 'Tithe payments only',
    cats: ['tithe_payment']
  },
};

const BUCKET_NORMAL = {};
Object.keys(BUCKET_RULES).forEach(k => BUCKET_NORMAL[k] = BUCKET_RULES[k].cats);

// All category labels
const ALL_CATS = {
  food: '🍽️ Food & Dining', transport: '🚗 Transport', outings: '🍻 Going out',
  shopping: '🛍️ Personal shopping', health: '❤️ Health & Personal care',
  data: '📱 Data / Airtime', clothing: '👟 Clothing & Footwear', personal: '🪥 Personal items',
  bills: '⚡ Recurring bills', subscriptions: '🎬 Subscriptions',
  household: '🧴 Household supplies', debt_payment: '💳 Debt repayment', project: '🏗️ Project expense',
  church: '⛪ Church offering', helping_others: '🤝 Helping others',
  family_support: '👨‍👩‍👧 Family support', charity: '💝 Charity / Donation',
  business: '💼 Business expense', investment_deposit: '📈 Investment deposit',
  asset_purchase: '🏢 Asset / Capital purchase', real_estate: '🏠 Real estate',
  gold: '🥇 Gold / Precious metals', safe_haven: '🛡️ Safe haven asset',
  tithe_payment: '✝️ Tithe payment',
  other: '📌 Other', other_save: '📌 Other savings', other_give: '📌 Other giving', other_invest: '📌 Other investment',
};

const WFC  = { tithe: '#9b7fe8', emergency: '#4a9eff', invest: '#22c98a', give: '#e8609a', save: '#7ed4b0', spend: '#f5c842' };
const TC   = { main: '#4a9eff', business: '#22c98a', investment: '#9b7fe8', gift: '#e8609a', other: '#888' };
const SPEND_CATS = ['spend', 'food', 'transport', 'bills', 'outings', 'shopping', 'health', 'data', 'other'];

const DEFAULT_SOURCES = [
  { id: 'sw', name: 'Software Development', type: 'main',       emoji: '💻', ccy: 'NGN', amount: 0 },
  { id: 'tr', name: 'Trading',              type: 'business',   emoji: '📈', ccy: 'NGN', amount: 0 },
  { id: 'ts', name: 'Teaching & Signals',   type: 'business',   emoji: '📡', ccy: 'NGN', amount: 0 },
  { id: 'cr', name: 'Crypto',               type: 'investment', emoji: '₿',  ccy: 'USD', amount: 0 },
  { id: 're', name: 'Real Estate',          type: 'investment', emoji: '🏠', ccy: 'NGN', amount: 0 },
  { id: 'go', name: 'Gold',                 type: 'investment', emoji: '🥇', ccy: 'USD', amount: 0 },
  { id: 'st', name: 'Stocks',               type: 'investment', emoji: '📊', ccy: 'USD', amount: 0 },
  { id: 'gi', name: 'Gift',                 type: 'gift',       emoji: '🎁', ccy: 'NGN', amount: 0 },
];

// All expense categories shown in the modal
const ALL_EXPENSE_CATS = [
  { v: 'food',              l: '🍽️ Food & Dining' },
  { v: 'transport',         l: '🚗 Transport' },
  { v: 'bills',             l: '⚡ Recurring bills (electricity, water, rent)' },
  { v: 'subscriptions',     l: '🎬 Subscriptions (Netflix, DSTV etc.)' },
  { v: 'household',         l: '🧴 Household supplies (soap, cream etc.)' },
  { v: 'outings',           l: '🍻 Going out / Entertainment' },
  { v: 'shopping',          l: '🛍️ Personal shopping' },
  { v: 'clothing',          l: '👟 Clothing & Footwear' },
  { v: 'health',            l: '❤️ Health & Personal care' },
  { v: 'data',              l: '📱 Data / Airtime' },
  { v: 'personal',          l: '🪥 Personal items' },
  { v: 'debt_payment',      l: '💳 Debt repayment' },
  { v: 'project',           l: '🏗️ Project expense' },
  { v: 'church',            l: '⛪ Church offering' },
  { v: 'helping_others',    l: '🤝 Helping others' },
  { v: 'family_support',    l: '👨‍👩‍👧 Family support (parents salary etc.)' },
  { v: 'charity',           l: '💝 Charity / Donation' },
  { v: 'business',          l: '💼 Business expense' },
  { v: 'investment_deposit',l: '📈 Investment deposit' },
  { v: 'asset_purchase',    l: '🏢 Asset / Capital purchase' },
  { v: 'real_estate',       l: '🏠 Real estate' },
  { v: 'gold',              l: '🥇 Gold / Precious metals' },
  { v: 'safe_haven',        l: '🛡️ Safe haven asset' },
  { v: 'tithe_payment',     l: '✝️ Tithe payment' },
  { v: 'other',             l: '📌 Other' },
];

// ─── STATE ───────────────────────────────────────────────────────────
let plan = { ccy: 'NGN', sources: JSON.parse(JSON.stringify(DEFAULT_SOURCES)) };
let txs  = [];
let txType = 'e';
let aiH  = [];
let donutChart = null, flowChart = null;

// ─── UTILS ───────────────────────────────────────────────────────────
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt  = (n, c) => (SYM[c || plan.ccy] || '') + Math.round(Math.abs(n)).toLocaleString();
const toB  = (n, c) => n * (FX[c] || 1) / (FX[plan.ccy] || 1);
const pct  = (a, b) => b > 0 ? Math.min(100, a / b * 100) : 0;

// THE KEY FUNCTION — waterfall calculation
function wfall(gross) {
  const tithe     = gross * 0.10;
  const afterT    = gross - tithe;
  const emergency = afterT * 0.10;
  const remainder = afterT - emergency;
  return {
    gross, tithe, emergency, remainder,
    invest: remainder * 0.40,
    give:   remainder * 0.10,
    save:   remainder * 0.40,
    spend:  remainder * 0.10,
  };
}

function persist() {
  try {
    localStorage.setItem('ft2:plan', JSON.stringify(plan));
    localStorage.setItem('ft2:txs',  JSON.stringify(txs));
  } catch (e) {}
}

// ─── DATA AGGREGATION ────────────────────────────────────────────────
function monthTxs() {
  const s = new Date(); s.setDate(1); s.setHours(0, 0, 0, 0);
  return txs.filter(t => new Date(t.date) >= s);
}

function actualIncome() {
  return monthTxs()
    .filter(t => t.type === 'i')
    .reduce((s, t) => s + toB(t.amt, t.ccy), 0);
}

function projectedIncome() {
  return plan.sources.reduce((s, src) => s + toB(src.amount, src.ccy), 0);
}

function srcById(id) { return plan.sources.find(s => s.id === id); }

// ─── SETUP ───────────────────────────────────────────────────────────
function buildSetup() {
  const el = document.getElementById('setup-srcs');
  el.innerHTML = '';
  DEFAULT_SOURCES.forEach(s => {
    el.innerHTML += `
      <div class="src-row">
        <div class="src-icon">${s.emoji}</div>
        <div class="src-meta">
          <div class="src-name">${s.name}</div>
          <div class="src-type">${s.type}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="number" id="sa-${s.id}" value="0" placeholder="0"
            style="width:100px;padding:7px 9px;background:var(--bg3);border:1px solid var(--bd);border-radius:7px;font-size:13px;color:var(--tx);text-align:right;outline:none">
          <select id="sc-${s.id}" style="padding:7px;background:var(--bg3);border:1px solid var(--bd);border-radius:7px;font-size:12px;color:var(--tx);outline:none;cursor:pointer">
            ${['NGN', 'USD', 'GBP', 'EUR'].map(c => `<option value="${c}"${c === s.ccy ? ' selected' : ''}>${SYM[c]} ${c}</option>`).join('')}
          </select>
        </div>
      </div>`;
  });
}

function finishSetup() {
  plan.ccy = document.getElementById('g-ccy').value;
  plan.sources = DEFAULT_SOURCES.map(s => ({
    ...s,
    amount: parseFloat(document.getElementById('sa-' + s.id)?.value) || 0,
    ccy:    document.getElementById('sc-' + s.id)?.value || s.ccy,
  }));
  persist();
  boot();
}

// ─── BOOT ────────────────────────────────────────────────────────────
function loadApp() {
  try {
    const p = localStorage.getItem('ft2:plan');
    const t = localStorage.getItem('ft2:txs');
    if (p) {
      plan = JSON.parse(p);
      txs  = t ? JSON.parse(t) : [];
      boot();
    } else {
      buildSetup();
    }
  } catch (e) { buildSetup(); }
}

function boot() {
  document.getElementById('s-setup').style.display = 'none';
  const main = document.getElementById('s-main');
  main.classList.add('on');
  document.getElementById('tb-ccy').value = plan.ccy;
  document.getElementById('tb-date').textContent =
    new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('m-src').innerHTML =
    plan.sources.map(s => `<option value="${s.id}">${s.emoji} ${s.name}</option>`).join('');
  renderOverview();
}

function switchBase(c) {
  plan.ccy = c;
  persist();
  renderOverview();
}

function go(t) {
  const tabs = ['overview', 'income', 'expenses', 'plan', 'ai'];
  document.querySelectorAll('.nav-btn').forEach((b, i) => b.classList.toggle('on', tabs[i] === t));
  document.querySelectorAll('.page').forEach((p, i) => p.classList.toggle('on', tabs[i] === t));
  if (t === 'overview') renderOverview();
  if (t === 'income')   renderIncome();
  if (t === 'expenses') renderExpenses();
  if (t === 'plan')     renderPlan();
}

// ─── BUCKET BALANCES ─────────────────────────────────────────────────
function renderBucketBalances() {
  const actual = actualIncome();
  const w      = wfall(actual);
  const mt     = monthTxs();
  const keys   = ['tithe', 'emergency', 'invest', 'give', 'save', 'spend'];
  let html = '';
  keys.forEach(function (k) {
    var alloc     = w[k];
    var spentTxs  = mt.filter(function (t) { return t.type === 'e' && t.bucket === k; });
    var spent     = spentTxs.reduce(function (s, t) { return s + toB(t.amt, t.ccy); }, 0);
    var remaining = alloc - spent;
    var over      = remaining < 0;
    var pctUsed   = alloc > 0 ? Math.min(100, spent / alloc * 100) : (spent > 0 ? 100 : 0);
    var barColor  = over ? 'var(--r)' : pctUsed > 85 ? 'var(--y)' : 'var(--g)';
    var remColor  = over ? 'var(--r)' : remaining < alloc * 0.2 ? 'var(--y)' : 'var(--tx)';

    var txRows = '';
    spentTxs.forEach(function (t) {
      var label  = ALL_CATS[t.cat] || t.cat || t.note || 'Expense';
      var cross  = t.cross ? '<span class="bucket-tx-cross">cross-bucket</span>' : '';
      var reason = t.note ? '<div class="bucket-tx-reason">"' + t.note + '"</div>' : '';
      txRows += '<div class="bucket-tx">'
              + '<div class="bucket-tx-label">' + label + cross + reason + '</div>'
              + '<div class="bucket-tx-amt">−' + fmt(t.amt, t.ccy) + '</div>'
              + '</div>';
    });

    html += '<div class="bucket-card">'
          + '<div class="bucket-row">'
          + '<div class="bucket-dot" style="background:' + WFC[k] + '"></div>'
          + '<div class="bucket-name">' + BUCKET_NAMES[k] + '</div>'
          + '<div class="bucket-alloc">Allocated: ' + fmt(alloc) + '</div>'
          + '<div class="bucket-remaining" style="color:' + remColor + '">'
          + (over ? '−' : '+') + fmt(Math.abs(remaining))
          + (over ? ' <span style="font-size:9px;font-weight:700;color:var(--r);margin-left:4px">OVER</span>' : '')
          + '</div></div>'
          + '<div class="bucket-prog"><div class="bucket-prog-fill" style="width:' + pctUsed + '%;background:' + barColor + '"></div></div>'
          + '<div style="font-size:10px;color:var(--tx3);margin-top:3px">Spent: ' + fmt(spent) + ' of ' + fmt(alloc) + '</div>'
          + (txRows ? '<div class="bucket-txs">' + txRows + '</div>' : '')
          + '</div>';
  });
  var el = document.getElementById('bucket-balances-card');
  if (el) el.innerHTML = html;
}

// ─── OVERVIEW ────────────────────────────────────────────────────────
function renderOverview() {
  var actual    = actualIncome();
  var w         = wfall(actual);
  var mt        = monthTxs();

  function bucketSpent(k) {
    return mt.filter(function (t) { return t.type === 'e' && t.bucket === k; })
             .reduce(function (s, t) { return s + toB(t.amt, t.ccy); }, 0);
  }
  function bucketLeft(k) { return w[k] - bucketSpent(k); }

  var totalExpenses = mt.filter(function (t) { return t.type === 'e'; })
                        .reduce(function (s, t) { return s + toB(t.amt, t.ccy); }, 0);
  var netBalance = actual - totalExpenses;
  var dLeft      = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();

  var wfRows = [
    ['tithe',     '✝️ Tithe',     '10% of gross'],
    ['emergency', '🆘 Emergency', '10% of post-tithe'],
    ['invest',    '📈 Invest',    '40% of remainder'],
    ['give',      '🎁 Give',      '10% of remainder'],
    ['save',      '💰 Save',      '40% of remainder'],
    ['spend',     '💸 Spend',     '10% of remainder'],
  ].map(function (row) {
    var k = row[0], n = row[1], r = row[2];
    var alloc = w[k];
    var spent = bucketSpent(k);
    var left  = alloc - spent;
    var over  = left < 0;
    var p     = alloc > 0 ? Math.min(100, spent / alloc * 100) : 0;
    var col   = over ? 'var(--r)' : p > 85 ? 'var(--y)' : WFC[k];
    return '<div class="wf-row">'
      + '<div class="wf-dot" style="background:' + WFC[k] + '"></div>'
      + '<div style="flex:1"><div class="wf-name">' + n + '</div><div class="wf-rule">' + r + '</div></div>'
      + '<div class="wf-right" style="min-width:160px">'
      + '  <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">'
      + '    <div style="flex:1;max-width:80px"><div style="height:4px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + p + '%;background:' + col + ';border-radius:2px"></div></div></div>'
      + '    <div style="text-align:right">'
      + '      <div class="wf-amt" style="color:' + col + '">' + fmt(Math.max(0, left)) + (over ? ' <span style="font-size:9px;color:var(--r);font-weight:700">OVER</span>' : '') + '</div>'
      + '      <div class="wf-pct">of ' + fmt(alloc) + ' · ' + (actual > 0 ? (alloc / actual * 100).toFixed(0) : 0) + '%</div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }).join('');

  var recentRows = mt.slice(0, 8).map(function (t) {
    var src   = srcById(t.src);
    var label = t.type === 'i'
      ? (src ? src.emoji + ' ' + src.name : '💵 Income')
      : (ALL_CATS[t.cat] || t.cat);
    var note  = t.note ? ' <span class="tx-note">· ' + t.note + '</span>' : '';
    var bname = t.bucket ? ' <span style="font-size:9px;background:var(--bg3);padding:1px 5px;border-radius:4px;color:var(--tx3)">' + BUCKET_NAMES[t.bucket] + '</span>' : '';
    return '<div class="tx-item">'
      + '<div><div class="tx-name">' + label + note + bname + '</div>'
      + '<div class="tx-meta">' + new Date(t.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</div></div>'
      + '<div class="' + (t.type === 'i' ? 'amt-pos' : 'amt-neg') + '">' + (t.type === 'i' ? '+' : '−') + fmt(t.amt, t.ccy) + '</div>'
      + '</div>';
  }).join('') || '<div class="empty"><div class="ei">+</div><p>No transactions yet.<br>Click <strong>+</strong> to log income or an expense.</p></div>';

  document.getElementById('p-overview').innerHTML =
    '<div class="m-grid">'
    + '<div class="metric"><div class="m-lbl">Income logged</div><div class="m-val">' + fmt(actual) + '</div><div class="m-sub">actual this month</div></div>'
    + '<div class="metric"><div class="m-lbl">Total expenses</div><div class="m-val" style="color:var(--r)">' + fmt(totalExpenses) + '</div><div class="m-sub">all buckets combined</div></div>'
    + '<div class="metric"><div class="m-lbl">Net remaining</div><div class="m-val" style="color:' + (netBalance >= 0 ? 'var(--g)' : 'var(--r)') + '">' + fmt(Math.abs(netBalance)) + '</div><div class="m-sub">' + (netBalance >= 0 ? 'available' : 'over budget') + '</div></div>'
    + '<div class="metric"><div class="m-lbl">Days left</div><div class="m-val">' + dLeft + '</div><div class="m-sub">in this month</div></div>'
    + '</div>'
    + '<div class="two-col">'
    + '<div class="card"><div class="card-t">📊 Income allocation</div><div class="chart-wrap"><canvas id="donut-c"></canvas></div><div class="legend" id="donut-legend"></div></div>'
    + '<div class="card"><div class="card-t">📈 Monthly cash flow</div><div class="chart-wrap"><canvas id="flow-c"></canvas></div></div>'
    + '</div>'
    + '<div class="card">'
    + '<div class="card-t">💧 Bucket balances <span style="font-size:10px;font-weight:400;color:var(--tx3)">— allocated vs remaining after expenses</span></div>'
    + '<div style="display:grid;grid-template-columns:1fr;gap:0">' + wfRows + '</div>'
    + '</div>'
    + '<div class="sec">Bucket spending detail</div>'
    + '<div id="bucket-balances-card"></div>'
    + '<div class="sec">Recent transactions</div>'
    + '<div class="card">' + recentRows + '</div>';

  requestAnimationFrame(function () { drawCharts(w, actual); renderBucketBalances(); });
}

function drawCharts(w, gross) {
  const dc = document.getElementById('donut-c');
  const fc = document.getElementById('flow-c');
  if (!dc || !fc) return;
  if (donutChart) donutChart.destroy();
  if (flowChart)  flowChart.destroy();

  const labels = ['✝️ Tithe', '🆘 Emergency', '📈 Invest', '🎁 Give', '💰 Save', '💸 Spend'];
  const vals   = [w.tithe, w.emergency, w.invest, w.give, w.save, w.spend].map(v => Math.round(v));
  const cols   = Object.values(WFC);

  donutChart = new Chart(dc, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: cols, borderWidth: 2, borderColor: '#1a1a1a' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)} (${gross > 0 ? (ctx.raw / gross * 100).toFixed(1) : 0}%)` } }
      }
    }
  });

  const leg = document.getElementById('donut-legend');
  if (leg) leg.innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><div class="legend-dot" style="background:${cols[i]}"></div>${l}</div>`).join('');

  flowChart = new Chart(fc, {
    type: 'bar',
    data: {
      labels: ['Gross', 'Tithe', 'Emergency', 'Invest', 'Give', 'Save', 'Spend'],
      datasets: [{
        data: [gross, w.tithe, w.emergency, w.invest, w.give, w.save, w.spend].map(v => Math.round(v)),
        backgroundColor: ['#4a9eff', ...Object.values(WFC)],
        borderWidth: 0, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
      scales: {
        x: { ticks: { color: '#555', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#555', font: { size: 10 }, callback: v => (SYM[plan.ccy] || '') + Math.round(v / 1000) + 'k' }, grid: { color: '#222' } }
      }
    }
  });
}

// ─── INCOME TAB ──────────────────────────────────────────────────────
function renderIncome() {
  const actual    = actualIncome();
  const projected = projectedIncome();
  const w         = wfall(actual);
  const mt        = monthTxs();

  document.getElementById('p-income').innerHTML = `
    <div class="m-grid">
      <div class="metric">
        <div class="m-lbl">Logged this month</div>
        <div class="m-val" style="color:var(--g)">${fmt(actual)}</div>
        <div class="m-sub">actual income received</div>
      </div>
      <div class="metric">
        <div class="m-lbl">Monthly projection</div>
        <div class="m-val">${fmt(projected)}</div>
        <div class="m-sub">from plan settings</div>
      </div>
    </div>

    <div class="sec" style="margin-top:4px">Waterfall on logged income</div>
    <div class="card">
      ${[['tithe', '✝️ Tithe', w.tithe, '10% of gross'],
         ['emergency', '🆘 Emergency', w.emergency, '10% of post-tithe'],
         ['invest', '📈 Invest', w.invest, '40% of remainder'],
         ['give', '🎁 Give', w.give, '10% of remainder'],
         ['save', '💰 Save', w.save, '40% of remainder'],
         ['spend', '💸 Spend', w.spend, '10% of remainder']]
        .map(([k, n, a, r]) => `
          <div class="wf-row">
            <div class="wf-dot" style="background:${WFC[k]}"></div>
            <div style="flex:1"><div class="wf-name">${n}</div><div class="wf-rule">${r}</div></div>
            <div class="wf-right">
              <div class="wf-amt" style="color:${WFC[k]}">${fmt(a)}</div>
              <div class="wf-pct">${actual > 0 ? (a / actual * 100).toFixed(1) : 0}%</div>
            </div>
          </div>`).join('')}
    </div>

    <div class="sec">Source breakdown</div>
    ${plan.sources.map(src => {
      const srcLogged = mt.filter(t => t.type === 'i' && t.src === src.id)
                          .reduce((s, t) => s + toB(t.amt, t.ccy), 0);
      const monthly   = toB(src.amount, src.ccy);
      const srcW      = wfall(srcLogged > 0 ? srcLogged : monthly);
      const contrib   = actual > 0 ? srcLogged / actual * 100 : 0;
      const col       = TC[src.type] || '#888';
      return `<div class="src-card">
        <div class="src-head">
          <div class="src-icon-wrap">${src.emoji}</div>
          <div style="flex:1">
            <div><span class="src-name-big">${src.name}</span>
            <span class="src-badge" style="background:${col}18;color:${col}">${src.type}</span></div>
            <div style="font-size:11px;color:var(--tx3);margin-top:3px">
              ${srcLogged > 0 ? `Logged: <strong style="color:var(--g)">${fmt(srcLogged)}</strong>` : 'Nothing logged yet this month'}
              ${monthly > 0 ? ` · Projected: ${fmt(monthly)}` : ''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:14px;font-weight:700;color:var(--g)">${fmt(srcLogged)}</div>
            <div style="font-size:10px;color:var(--tx3)">${contrib.toFixed(1)}% of total</div>
          </div>
        </div>
        ${srcLogged > 0 ? `
          <div class="prog" style="margin-bottom:10px">
            <div class="prog-fill" style="width:${contrib}%;background:${col}"></div>
          </div>
          <div class="src-wf-grid">
            ${[['✝️', srcW.tithe, 'tithe'], ['🆘', srcW.emergency, 'emergency'],
               ['📈', srcW.invest, 'invest'], ['🎁', srcW.give, 'give'],
               ['💰', srcW.save, 'save'], ['💸', srcW.spend, 'spend']]
              .map(([e, a, k]) => `<div class="swi"><div class="swi-l">${e}</div><div class="swi-v" style="color:${WFC[k]}">${fmt(a)}</div></div>`).join('')}
          </div>` : ''}
      </div>`;
    }).join('')}`;
}

// ─── EXPENSES TAB ────────────────────────────────────────────────────
function renderExpenses() {
  document.getElementById('p-expenses').innerHTML = `
    <div class="sec" style="margin-top:0">All transactions</div>
    <div class="card">
      ${txs.length
        ? txs.map(t => {
            const src   = srcById(t.src);
            const label = t.type === 'i'
              ? (src ? src.emoji + ' ' + src.name : '💵 Income')
              : (ALL_CATS[t.cat] || t.cat);
            return `<div class="tx-item">
              <div>
                <div class="tx-name">${label}${t.note ? ` <span class="tx-note">· ${t.note}</span>` : ''}</div>
                <div class="tx-meta">${new Date(t.date).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${t.ccy}</div>
              </div>
              <div class="${t.type === 'i' ? 'amt-pos' : 'amt-neg'}">${t.type === 'i' ? '+' : '−'}${fmt(t.amt, t.ccy)}</div>
            </div>`;
          }).join('')
        : `<div class="empty"><div class="ei">📭</div><p>Nothing logged yet.<br>Click <strong>+</strong> to start.</p></div>`}
    </div>`;
}

// ─── PLAN TAB ────────────────────────────────────────────────────────
function renderPlan() {
  const projected = projectedIncome();
  const w         = wfall(projected);
  document.getElementById('p-plan').innerHTML = `
    <div style="font-size:12px;color:var(--tx3);margin-bottom:16px;line-height:1.7">
      Set expected monthly amounts for each source — these are used for projections and reference only.
      The dashboard always calculates from <strong style="color:var(--tx)">actual logged income</strong>.
    </div>

    <div class="m-grid" style="margin-bottom:20px">
      ${[['✝️ Tithe', w.tithe, 'tithe'], ['🆘 Emergency', w.emergency, 'emergency'],
         ['📈 Invest', w.invest, 'invest'], ['🎁 Give', w.give, 'give'],
         ['💰 Save', w.save, 'save'], ['💸 Spend', w.spend, 'spend']]
        .map(([n, a, k]) => `<div class="metric"><div class="m-lbl">${n}</div>
          <div class="m-val" style="font-size:17px;color:${WFC[k]}">${fmt(a)}</div>
          <div class="m-sub">projected</div></div>`).join('')}
    </div>

    <div class="sec">Income sources</div>
    <button class="add-btn" onclick="openAddSrc()">+ Add income source</button>
    ${plan.sources.map((src, i) => `
      <div class="plan-src">
        <div style="font-size:18px;flex-shrink:0">${src.emoji}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:600">${src.name}</div>
        <div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.05em">${src.type}</div></div>
        <input type="number" value="${src.amount}"
          onchange="plan.sources[${i}].amount=parseFloat(this.value)||0;persist();renderOverview()">
        <select onchange="plan.sources[${i}].ccy=this.value;persist()">
          ${['NGN', 'USD', 'GBP', 'EUR'].map(c => `<option value="${c}"${c === src.ccy ? ' selected' : ''}>${SYM[c]} ${c}</option>`).join('')}
        </select>
        <button class="del-btn" onclick="removeSrc(${i})">×</button>
      </div>`).join('')}

    <div class="sec" style="margin-top:24px">FX rates (to NGN)</div>
    <div class="card">
      ${['USD', 'GBP', 'EUR'].map(c => `
        <div class="fx-row">
          <label>1 ${c} =</label>
          <input type="number" value="${FX[c]}" onchange="FX['${c}']=parseFloat(this.value)||FX['${c}'];renderOverview()">
          <span>NGN</span>
        </div>`).join('')}
    </div>

    <div class="sec">Sharing</div>
    <div class="card" style="font-size:12px;color:var(--tx2);line-height:1.8">
      Find <strong style="color:var(--tx)">FinTrack</strong> in your project folder — zip it and send to anyone via email, WhatsApp, or AirDrop.
      Each person gets their own private copy with their own data.
    </div>

    <button class="btn-ghost" onclick="if(confirm('Reset ALL data? Cannot be undone.')){localStorage.removeItem('ft2:plan');localStorage.removeItem('ft2:txs');location.reload()}">
      Reset everything
    </button>`;
}

function removeSrc(i) {
  if (plan.sources.length <= 1) { alert('Need at least one source.'); return; }
  if (!confirm(`Remove "${plan.sources[i].name}"?`)) return;
  plan.sources.splice(i, 1);
  persist();
  document.getElementById('m-src').innerHTML =
    plan.sources.map(s => `<option value="${s.id}">${s.emoji} ${s.name}</option>`).join('');
  renderPlan();
}

function openAddSrc()  { document.getElementById('as-modal').classList.add('on'); }
function closeAddSrc() { document.getElementById('as-modal').classList.remove('on'); }
function saveNewSrc() {
  const name = document.getElementById('as-name').value.trim();
  if (!name) { alert('Enter a name'); return; }
  const src = {
    id:     uid(), name,
    type:   document.getElementById('as-type').value,
    emoji:  document.getElementById('as-emoji').value.trim() || '💡',
    amount: parseFloat(document.getElementById('as-amt').value) || 0,
    ccy:    document.getElementById('as-ccy').value,
  };
  plan.sources.push(src);
  persist();
  document.getElementById('m-src').innerHTML =
    plan.sources.map(s => `<option value="${s.id}">${s.emoji} ${s.name}</option>`).join('');
  closeAddSrc();
  renderPlan();
}

// ─── LOG MODAL ───────────────────────────────────────────────────────
function refreshBucketInfo(showCrossWarning) {
  var bucket = document.getElementById('m-bucket') ? document.getElementById('m-bucket').value : null;
  var cat    = document.getElementById('m-cat')    ? document.getElementById('m-cat').value    : null;
  var warn   = document.getElementById('bucket-warning');
  if (!bucket || !warn) return;
  var rule = BUCKET_RULES[bucket];
  if (!rule) return;
  var actual    = actualIncome();
  var w         = wfall(actual);
  var spent     = monthTxs().filter(function (t) { return t.type === 'e' && t.bucket === bucket; })
                             .reduce(function (s, t) { return s + toB(t.amt, t.ccy); }, 0);
  var remaining = (w[bucket] || 0) - spent;
  var isCross   = cat ? !rule.cats.includes(cat) : false;

  warn.style.display = 'block';
  if (isCross && showCrossWarning) {
    warn.style.background  = 'var(--rdim)';
    warn.style.borderColor = '#e8405a44';
    warn.style.color       = 'var(--r)';
    warn.innerHTML = '⚠️ <strong>' + (ALL_CATS[cat] || cat) + '</strong> doesn\'t normally come from <strong>'
      + rule.label + '</strong>.<br>'
      + 'This bucket is for: ' + rule.desc + '.<br>'
      + 'Remaining in bucket: <strong>' + fmt(Math.max(0, remaining)) + '</strong>'
      + (remaining < 0 ? ' <span style="font-weight:700">(OVER by ' + fmt(Math.abs(remaining)) + ')</span>' : '')
      + '. <em>Add a reason below to explain the cross-bucket spend.</em>';
  } else {
    warn.style.background  = 'var(--gdim)';
    warn.style.borderColor = 'var(--g)';
    warn.style.color       = 'var(--g)';
    warn.innerHTML = '<strong>' + rule.label + '</strong> — ' + rule.desc
      + '<br>Remaining this month: <strong style="color:' + (remaining < 0 ? 'var(--r)' : 'var(--g)') + '">'
      + (remaining < 0 ? 'OVER by ' + fmt(Math.abs(remaining)) : fmt(remaining))
      + '</strong>';
  }
}

function onBucketChange() {
  var catEl = document.getElementById('m-cat');
  if (catEl) {
    catEl.innerHTML = ALL_EXPENSE_CATS.map(function (c) {
      return '<option value="' + c.v + '">' + c.l + '</option>';
    }).join('');
  }
  refreshBucketInfo(false);
}

function onCatChange() { refreshBucketInfo(true); }

function openModal() {
  document.getElementById('modal').classList.add('on');
  document.getElementById('m-amt').value  = '';
  document.getElementById('m-note').value = '';
  document.getElementById('modal-split').style.display = 'none';
  const bw = document.getElementById('bucket-warning');
  if (bw) bw.style.display = 'none';
  if (document.getElementById('m-bucket')) { document.getElementById('m-bucket').value = 'spend'; onBucketChange(); }
  setTimeout(() => document.getElementById('m-amt').focus(), 100);
}
function closeModal() { document.getElementById('modal').classList.remove('on'); }

function setType(t) {
  txType = t;
  document.getElementById('btn-exp').className = 'mtbtn' + (t === 'e' ? ' exp' : '');
  document.getElementById('btn-inc').className = 'mtbtn' + (t === 'i' ? ' inc' : '');
  document.getElementById('exp-fields').style.display = t === 'e' ? 'block' : 'none';
  document.getElementById('inc-fields').style.display = t === 'i' ? 'block' : 'none';
  onAmtChange();
}

function onAmtChange() {
  const a = parseFloat(document.getElementById('m-amt').value) || 0;
  const c = document.getElementById('m-ccy').value;
  document.getElementById('m-conv').textContent =
    (c && c !== plan.ccy && a) ? `≈ ${fmt(toB(a, c))} in ${plan.ccy}` : '';
  const splitBox = document.getElementById('modal-split');
  if (txType === 'i' && a > 0) {
    const base = toB(a, c);
    const w    = wfall(base);
    document.getElementById('modal-split-grid').innerHTML =
      [['✝️ Tithe', w.tithe, 'tithe'], ['🆘 Emergency', w.emergency, 'emergency'],
       ['📈 Invest', w.invest, 'invest'], ['🎁 Give', w.give, 'give'],
       ['💰 Save', w.save, 'save'], ['💸 Spend', w.spend, 'spend']]
      .map(([n, v, k]) => `<div class="ms-item">
        <div class="ms-lbl">${n}</div>
        <div class="ms-val" style="color:${WFC[k]}">${fmt(v)}</div>
      </div>`).join('');
    splitBox.style.display = 'block';
  } else {
    splitBox.style.display = 'none';
  }
}

function saveTx() {
  const a = parseFloat(document.getElementById('m-amt').value);
  if (!a || a <= 0) { alert('Enter a valid amount'); return; }
  const bucket = txType === 'e' ? document.getElementById('m-bucket').value : null;
  const cat    = txType === 'e' ? document.getElementById('m-cat').value : null;
  const rule   = bucket ? BUCKET_RULES[bucket] : null;
  const normal = rule ? rule.cats.includes(cat) : true;

  // ── Reject if bucket is empty or amount exceeds what's left ──
  if (bucket) {
    var wNow         = wfall(actualIncome());
    var alreadySpent = monthTxs()
      .filter(function (t) { return t.type === 'e' && t.bucket === bucket; })
      .reduce(function (s, t) { return s + toB(t.amt, t.ccy); }, 0);
    var bucketAlloc = wNow[bucket] || 0;
    var bucketLeft  = bucketAlloc - alreadySpent;
    var amtInBase   = toB(a, document.getElementById('m-ccy').value);
    if (bucketLeft <= 0) {
      alert('❌ ' + BUCKET_NAMES[bucket] + ' bucket is empty.\n\nYou have ' + fmt(Math.max(0, bucketLeft)) + ' left in this bucket this month.\n\nChoose a different bucket or log income first.');
      return;
    }
    if (amtInBase > bucketLeft) {
      alert('❌ Not enough in ' + BUCKET_NAMES[bucket] + ' bucket.\n\nYou need ' + fmt(amtInBase) + ' but only ' + fmt(bucketLeft) + ' remains.\n\nReduce the amount, choose a different bucket, or log income first.');
      return;
    }
  }

  txs.unshift({
    id:     uid(),
    type:   txType,
    amt:    a,
    ccy:    document.getElementById('m-ccy').value,
    bucket: bucket,
    cat:    cat,
    src:    txType === 'i' ? document.getElementById('m-src').value : null,
    cross:  !normal,
    note:   document.getElementById('m-note').value.trim(),
    date:   new Date().toISOString(),
  });
  persist();
  closeModal();
  renderOverview();
}

// ─── AI ──────────────────────────────────────────────────────────────
async function sendAI() {
  const inp = document.getElementById('ai-in'), msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  const actual    = actualIncome();
  const projected = projectedIncome();
  const w         = wfall(actual);
  const mt        = monthTxs();
  const daySpent  = mt.filter(t => t.type === 'e' && SPEND_CATS.includes(t.cat))
                      .reduce((s, t) => s + toB(t.amt, t.ccy), 0);
  const ctx = `User financial plan:
Base currency: ${plan.ccy}
Income logged this month: ${fmt(actual)} (projected: ${fmt(projected)})
Waterfall on actual income:
  Tithe: ${fmt(w.tithe)} | Emergency: ${fmt(w.emergency)} | Invest: ${fmt(w.invest)} | Give: ${fmt(w.give)} | Save: ${fmt(w.save)} | Spend budget: ${fmt(w.spend)}
Spent (day-to-day) this month: ${fmt(daySpent)} of ${fmt(w.spend)} budget
Income sources:
${plan.sources.map(s => `  ${s.emoji} ${s.name} (${s.type}): projected ${fmt(s.amount, s.ccy)}/mo`).join('\n')}
Source breakdown this month:
${plan.sources.map(s => {
  const logged = mt.filter(t => t.type === 'i' && t.src === s.id).reduce((sum, t) => sum + toB(t.amt, t.ccy), 0);
  return `  ${s.name}: ${fmt(logged)} logged`;
}).join('\n')}`;

  const msgs = [...aiH, { role: 'user', content: msg }];
  aiH = msgs;
  const el = document.getElementById('ai-msgs');
  el.innerHTML += `<div class="msg u">${msg}</div><div class="msg a" id="ai-thinking">Thinking...</div>`;
  el.scrollTop = el.scrollHeight;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system: `You are a personal finance advisor. User context:\n${ctx}\nWaterfall system: all income → tithe 10% → emergency 10% of post-tithe → then invest 40%, give 10%, save 40%, spend 10% of remainder. Be concise, practical, specific with numbers. Max 150 words.`,
        messages: msgs,
      })
    });
    const d   = await r.json();
    const rep = d.content?.[0]?.text || 'Error getting response';
    aiH = [...msgs, { role: 'assistant', content: rep }];
    document.getElementById('ai-thinking').textContent = rep;
  } catch (e) {
    document.getElementById('ai-thinking').textContent = 'Connection error. Try again.';
  }
  el.scrollTop = el.scrollHeight;
}
function ask(q) { document.getElementById('ai-in').value = q; sendAI(); }

// ─── INIT ────────────────────────────────────────────────────────────
buildSetup();
loadApp();
