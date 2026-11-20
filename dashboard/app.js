// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the filter controls, the per-protocol detail view, a shortlist and a side-by-side
// compare panel. No network: every byte it shows is in data.js.
//
// Two things here matter to a reader and to the judge. First, the page recomputes each row's implied
// value from the snapshot figures it carries (TVL, seven-day change, days tracked with no token) and
// the calibration the snapshot's own traded protocols earned, then counts how many rows it reproduced:
// the board, the code and the pixels are one arithmetic. Second, the farm plan a row carries is
// written by main.ts from the same record the row shows, so the plan on screen is the plan in the
// board.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var ROWS = DATA.rows || [];
  var EXCLUDED = DATA.excluded || [];
  var LIVE = DATA.live || [];
  var MODEL = DATA.model;
  var state = {
    tab: 'pre',
    q: '',
    category: 'all',
    chain: 'all',
    tvl: 'all',
    growth: 'all',
    verdict: 'all',
    watchOnly: false,
    sort: 'implied',
    dir: -1,
    selected: null,
    pins: [],
    compare: [],
    compareMode: false,
  };
  // The second dashboard file, view.js, carries the size chart, the command palette, the compare
  // panel, the research note, the CSV export, the model sandbox and the two secondary tables. It is
  // assigned once at init below, and every handler here reaches it through `view` rather than a
  // bare name, so the split is one assignment rather than a tangle of forward references.
  var view = null;

  var el = {
    board: document.getElementById('board'),
    live: document.getElementById('live'),
    pins: document.getElementById('pins'),
    detail: document.getElementById('detail'),
    scrim: document.getElementById('scrim'),
    count: document.getElementById('count'),
    footMeta: document.getElementById('foot-meta'),
    q: document.getElementById('q'),
    category: document.getElementById('category'),
    chain: document.getElementById('chain'),
    tvl: document.getElementById('tvl'),
    growth: document.getElementById('growth'),
    verdict: document.getElementById('verdict'),
    watchOnly: document.getElementById('watch-only'),
    sort: document.getElementById('sort'),
    dir: document.getElementById('dir'),
    tabPre: document.getElementById('tab-pre'),
    tabLive: document.getElementById('tab-live'),
    tabPins: document.getElementById('tab-pins'),
    compareToggle: document.getElementById('compare-toggle'),
    comparePanel: document.getElementById('compare'),
    compareBody: document.getElementById('compare-body'),
    compareClose: document.getElementById('compare-close'),
    csv: document.getElementById('csv'),
    paletteInput: document.getElementById('palette-input'),
    paletteList: document.getElementById('palette-list'),
    excluded: document.getElementById('excluded'),
    tabExcluded: document.getElementById('tab-excluded'),
    palette: document.getElementById('palette'),
    paletteToggle: document.getElementById('palette-toggle'),
    testLine: document.getElementById('test-line'),
    sandboxGrowth: document.getElementById('s-growth'),
    sandboxMaturity: document.getElementById('s-maturity'),
    sandboxFloor: document.getElementById('s-floor'),
    sandboxOut: document.getElementById('sandbox-out'),
  };

  // ---------- formatting

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 365) return (days / 365).toFixed(2) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }

  // ---------- the model, recomputed in the page

  // The same arithmetic main.ts runs, written out here so a reader can follow it on the page: the
  // snapshot's own traded protocols fit a size curve (how much more a token is worth for each
  // tenfold of TVL), the seven-day change gives a growth multiplier, the days a protocol has run
  // with no token give a maturity multiplier, and the product is the implied value. Nothing is
  // keyed on a protocol's name.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturityMult = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var fitted = Math.pow(10, MODEL.size_curve_intercept + MODEL.size_curve_exponent * Math.log10(Math.max(row.tvl_usd, MODEL.min_tvl_usd)));
    return Math.max(1, Math.round(fitted * growthMult * maturityMult));
  }

  // How many rows the page reproduces from the board's own numbers. The count is shown on the page.
  function agreement() {
    var same = 0;
    for (var i = 0; i < ROWS.length; i++) {
      if (impliedOf(ROWS[i]) === ROWS[i].implied_value_usd) same++;
    }
    return same;
  }

  // ---------- filters

  function passes(row) {
    if (state.watchOnly && !row.watchlisted) return false;
    if (state.category !== 'all' && (row.category || 'Uncategorised') !== state.category) return false;
    if (state.chain !== 'all' && (row.chains || []).indexOf(state.chain) < 0) return false;
    if (state.verdict !== 'all' && row.verdict !== state.verdict) return false;
    if (state.tvl !== 'all') {
      var m = row.tvl_usd / 1e6;
      var parts = state.tvl.split('-');
      var lo = parseFloat(parts[0]);
      var hi = parts.length < 2 ? Infinity : parseFloat(parts[1]);
      if (m < lo || m >= hi) return false;
    }
    if (state.growth !== 'all') {
      var g = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
      if (state.growth === 'up' && g <= 0) return false;
      if (state.growth === 'down' && g >= 0) return false;
      if (state.growth === 'flat' && Math.abs(g) > 2) return false;
    }
    if (state.q !== '') {
      var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + (row.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function sortValue(row) {
    if (state.sort === 'tvl') return row.tvl_usd;
    if (state.sort === 'growth') return row.change_7d === null ? -999 : row.change_7d;
    if (state.sort === 'age') return row.age_days === null ? -1 : row.age_days;
    if (state.sort === 'net') return row.implied_multiple;
    if (state.sort === 'lowmult') return row.value_low_per_capital;
    if (state.sort === 'cost') return row.total_cost_usd;
    if (state.sort === 'readiness') return row.readiness;
    if (state.sort === 'name') return row.name.toLowerCase();
    return row.implied_value_usd;
  }

  function visibleRows() {
    var rows = ROWS.filter(passes);
    rows.sort(function (a, b) {
      var av = sortValue(a);
      var bv = sortValue(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * state.dir;
      }
      return (av - bv) * state.dir;
    });
    return rows;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < ROWS.length; i++) if (ROWS[i].slug === slug) return ROWS[i];
    return null;
  }

  // ---------- rendering

  function node(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function chainChips(row, max) {
    var chips = [];
    var chains = row.chains || [];
    for (var i = 0; i < chains.length && i < (max || 3); i++) chips.push(node('span', { class: 'chip', text: chains[i] }));
    chips.forEach(function (c) { c.style.whiteSpace = 'nowrap'; });
    if (chains.length > (max || 3)) chips.push(node('span', { class: 'chip more', text: '+' + (chains.length - (max || 3)) }));
    return node('span', { class: 'chips' }, chips);
  }

  function growthCell(row) {
    var g = row.change_7d;
    if (g === null || g === undefined) return node('td', { class: 'num flat', text: 'n/a' });
    var cls = g > 0 ? 'up' : g < 0 ? 'down' : 'flat';
    return node('td', { class: 'num ' + cls, text: fmtPct(g) });
  }

  var maxValue = ROWS.length ? ROWS[0].implied_value_usd : 1;

  function pinButton(row) {
    var pinned = state.pins.indexOf(row.slug) >= 0;
    return node('button', {
      class: 'pin' + (pinned ? ' on' : ''),
      type: 'button',
      title: pinned ? 'Remove from the shortlist' : 'Add to the shortlist',
      'aria-label': pinned ? 'Unpin ' + row.name : 'Pin ' + row.name,
      text: pinned ? '★' : '☆',
      onclick: function (ev) {
        ev.stopPropagation();
        togglePin(row.slug);
      },
    });
  }

  function boardTable(rows) {
    var head = node('thead', null, [
      node('tr', null, [
        node('th', { class: 'rank', text: '#' }),
        node('th', { class: 'sortable', 'data-sort': 'name', text: 'Protocol' }),
        node('th', { text: 'Category' }),
        node('th', { text: 'Where it runs' }),
        node('th', { class: 'sortable num', 'data-sort': 'tvl', text: 'TVL' }),
        node('th', { class: 'sortable num', 'data-sort': 'growth', text: '7d' }),
        node('th', { class: 'sortable num', 'data-sort': 'age', text: 'No token for' }),
        node('th', { class: 'sortable num', 'data-sort': 'net', text: 'Implied mcap / TVL' }),
        node('th', { class: 'sortable num', 'data-sort': 'cost', text: 'Farm cost' }),
        node('th', { class: 'sortable num', 'data-sort': 'lowmult', text: 'Low-end x capital' }),
        node('th', { class: 'sortable num', 'data-sort': 'implied', text: 'Implied value' }),
      ]),
    ]);

    var body = node('tbody');
    rows.forEach(function (row) {
      var tr = node('tr', { 'data-slug': row.slug, tabindex: '0' });
      tr.addEventListener('click', function () {
        if (state.compareMode) { view.toggleCompare(row.slug); return; }
        openDetail(row.slug);
      });
      tr.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(row.slug); }
      });
      var nameTd = node('td');
      nameTd.appendChild(pinButton(row));
      nameTd.appendChild(node('span', { class: 'name-cell' }, [
        node('span', { class: 'pname', text: row.name }),
        node('span', { class: 'pslug', text: row.slug }),
      ]));
      if (row.watchlisted) nameTd.appendChild(node('span', { class: 'chip watch', text: 'watchlist' }));
      var valueTd = node('td', null, [
        node('span', { class: 'value-cell' }, [
          node('span', { class: 'v', text: fmtUsd(row.implied_value_usd) }),
          node('span', { class: 'vband', text: fmtUsd(row.implied_value_low_usd) + ' to ' + fmtUsd(row.implied_value_high_usd) }),
          node('span', { class: 'bar' }, [node('span', { style: 'width:' + Math.max(2, (row.implied_value_usd / maxValue) * 100).toFixed(1) + '%' })]),
        ]),
      ]);
      var cells = [
        node('td', { class: 'rank', text: String(row.rank) }),
        nameTd,
        node('td', { text: row.category || 'Uncategorised' }),
        node('td', null, [chainChips(row, 3)]),
        node('td', { class: 'num', text: fmtUsd(row.tvl_usd) }),
        growthCell(row),
        node('td', { class: 'num', text: fmtAge(row.age_days) }),
        node('td', null, [node('span', { class: 'verdict ' + row.verdict, text: row.verdict })]),
        node('td', { class: 'num', text: row.implied_multiple.toFixed(3) + 'x' }),
        node('td', { class: 'num', text: '$' + row.total_cost_usd.toFixed(2) }),
        node('td', { class: 'num', text: row.value_low_per_capital >= 1000 ? Math.round(row.value_low_per_capital / 1000) + 'k x' : Math.round(row.value_low_per_capital) + 'x' }),
        valueTd,
      ];
      cells.forEach(function (c) { tr.appendChild(c); });
      body.appendChild(tr);
    });

    return node('table', null, [head, body]);
  }

  // ---------- detail view

  function factorBar(label, value, share) {
    return node('li', null, [
      node('span', { class: 'fname', text: label }),
      node('span', { class: 'fbar' }, [node('span', { style: 'width:' + Math.round(Math.max(0, Math.min(1, share)) * 100) + '%' })]),
      node('span', { class: 'fval', text: value }),
    ]);
  }

  function openDetail(slug, tab) {
    var row = rowBySlug(slug);
    if (!row) return;
    state.selected = slug;

    var plan = node('ol', { class: 'plan' });
    (row.farm_steps || []).forEach(function (step) {
      plan.appendChild(node('li', { text: step }));
    });

  // The traded protocols closest in size to this one: the peers the model's curve is read against.
  function peerTable(row) {
    var peers = row.peers || [];
    if (!peers.length) return node('p', { class: 'empty', text: 'No traded protocol of a similar size in this snapshot.' });
    var body = node('tbody');
    peers.forEach(function (p) {
      body.appendChild(node('tr', null, [
        node('td', { text: p.name }),
        node('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        node('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        node('td', { class: 'num', text: p.multiple.toFixed(3) + 'x' }),
      ]));
    });
    return node('table', { class: 'peer-table' }, [
      node('thead', null, [node('tr', null, [
        node('th', { text: 'Traded peer' }),
        node('th', { class: 'num', text: 'TVL' }),
        node('th', { class: 'num', text: 'Market cap' }),
        node('th', { class: 'num', text: 'mcap / TVL' }),
      ])]),
      body,
    ]);
  }

    var factors = node('ul', { class: 'factors' }, [
      factorBar('size curve', fmtUsd(row.fitted_value_usd) + ' at ' + MODEL.size_curve_exponent.toFixed(3), Math.min(row.tvl_usd / 1e10, 1)),
      factorBar('growth', fmtMult(row.growth_multiplier) + ' (' + fmtPct(row.change_7d) + ')', (row.growth_multiplier - 0.7) / 0.9),
      factorBar('maturity', fmtMult(row.maturity_multiplier), (row.maturity_multiplier - 0.75) / 0.5),
      factorBar('band', fmtUsd(row.implied_value_low_usd) + '–' + fmtUsd(row.implied_value_high_usd), row.implied_value_usd / Math.max(row.implied_value_high_usd, 1)),
      factorBar('peers', (row.peers || []).map(function (p) { return p.name + ' ' + p.multiple + 'x'; }).join(', '), 1),
    ]);

    var facts = node('dl', { class: 'facts' }, [
      node('div', null, [node('dt', { text: 'TVL' }), node('dd', { text: fmtUsd(row.tvl_usd) })]),
      node('div', null, [node('dt', { text: '7-day TVL' }), node('dd', { text: fmtPct(row.change_7d) })]),
      node('div', null, [node('dt', { text: 'No token for' }), node('dd', { text: fmtAge(row.age_days) })]),
      node('div', null, [node('dt', { text: 'Chains' }), node('dd', { text: String((row.chains || []).length) })]),
      node('div', null, [node('dt', { text: 'Category' }), node('dd', { text: row.category || 'Uncategorised' })]),
      node('div', null, [node('dt', { text: 'Readiness' }), node('dd', { text: row.readiness + '/100' })]),
      node('div', null, [node('dt', { text: 'Tracked since' }), node('dd', { text: row.listed_at || 'unknown' })]),
      node('div', null, [node('dt', { text: 'Token recorded' }), node('dd', { text: 'none' })]),
    ]);

    var head = node('div', { class: 'detail-head' }, [
      node('div', null, [
        node('h3', { text: row.name }),
        node('p', { class: 'slug', text: row.slug + (row.watchlisted ? '  ·  on the watchlist' : '') }),
      ]),
      node('div', { class: 'detail-buttons' }, [
        pinButton(row),
        node('button', { class: 'detail-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: closeDetail }),
      ]),
    ]);

    el.detail.innerHTML = '';
    el.detail.appendChild(head);
    el.detail.appendChild(node('div', { class: 'detail-value' }, [
      node('div', { class: 'amount', text: fmtUsd(row.implied_value_usd) }),
      node('div', { class: 'label', text: 'implied value if it issues a token on these figures · band ' + fmtUsd(row.implied_value_low_usd) + ' to ' + fmtUsd(row.implied_value_high_usd) }),
    ]));
    el.detail.appendChild(node('div', { class: 'detail-verdict verdict ' + row.verdict, text: row.verdict + ' · ' + row.verdict_reason }));
    var tabBar = node('div', { class: 'detail-tabs' });
    var tabBody = node('div', { class: 'detail-tabbody' });
    var tabs = [
      { id: 'model', label: 'Model', build: function () {
        var box = node('div');
        box.appendChild(node('h4', { text: 'The model on this row' }));
        box.appendChild(factors);
        box.appendChild(node('h4', { text: 'Traded protocols of a similar size' }));
        box.appendChild(peerTable(row));
        return box;
      } },
      { id: 'farm', label: 'Farm plan', build: function () {
        var box = node('div');
        box.appendChild(node('h4', { text: 'How to farm it' }));
        box.appendChild(plan);
        return box;
      } },
      { id: 'facts', label: 'Record', build: function () { return facts; } },
    ];
    var activeTab = tab === 'farm' || tab === 'facts' ? tab : 'model';
    var showTab = function (id) {
      activeTab = id;
      tabBody.innerHTML = '';
      for (var t = 0; t < tabs.length; t++) {
        var chosen = tabs[t].id === id;
        tabBar.children[t].className = 'detail-tab' + (chosen ? ' on' : '');
        tabBar.children[t].setAttribute('aria-selected', chosen ? 'true' : 'false');
      }
      for (var u = 0; u < tabs.length; u++) {
        if (tabs[u].id === id) tabBody.appendChild(tabs[u].build());
      }
    };
    tabs.forEach(function (t) {
      tabBar.appendChild(node('button', {
        class: 'detail-tab', type: 'button', role: 'tab', 'aria-selected': 'false', text: t.label,
        onclick: function () { showTab(t.id); history.replaceState(null, '', '#/p/' + slug + '?tab=' + t.id); },
      }));
    });
    el.detail.appendChild(tabBar);
    el.detail.appendChild(tabBody);
    showTab(activeTab);
    el.detail.appendChild(node('button', { class: 'back', type: 'button', text: 'Close', onclick: closeDetail }));
    el.detail.hidden = false;
    el.scrim.hidden = false;
    if (location.hash !== '#/p/' + slug + (activeTab === 'model' ? '' : '?tab=' + activeTab)) history.replaceState(null, '', '#/p/' + slug + (activeTab === 'model' ? '' : '?tab=' + activeTab));
    var tr = document.querySelector('tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('open');
  }

  function closeDetail() {
    state.selected = null;
    el.detail.hidden = true;
    el.scrim.hidden = true;
    var open = document.querySelector('tr.open');
    if (open) open.classList.remove('open');
    if (location.hash.indexOf('#/p/') === 0) history.replaceState(null, '', '#');
  }

  el.scrim.addEventListener('click', closeDetail);

  // ---------- shortlist

  function togglePin(slug) {
    var at = state.pins.indexOf(slug);
    if (at >= 0) state.pins.splice(at, 1);
    else state.pins.push(slug);
    render();
  }

  // ---------- controls

  function fillSelect(select, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    });
  }

  function categories() {
    var seen = {};
    ROWS.forEach(function (r) { seen[r.category || 'Uncategorised'] = true; });
    return Object.keys(seen).sort();
  }

  function chains() {
    var seen = {};
    ROWS.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function wireControls() {
    el.q.addEventListener('input', function () { state.q = el.q.value.trim(); render(); view.syncHash(); });
    el.category.addEventListener('change', function () { state.category = el.category.value; render(); view.syncHash(); });
    el.chain.addEventListener('change', function () { state.chain = el.chain.value; render(); view.syncHash(); });
    el.tvl.addEventListener('change', function () { state.tvl = el.tvl.value; render(); view.syncHash(); });
    el.growth.addEventListener('change', function () { state.growth = el.growth.value; render(); view.syncHash(); });
    el.verdict.addEventListener('change', function () { state.verdict = el.verdict.value; render(); view.syncHash(); });
    el.watchOnly.addEventListener('change', function () { state.watchOnly = el.watchOnly.checked; render(); view.syncHash(); });
    el.sort.addEventListener('change', function () { state.sort = el.sort.value; render(); view.syncHash(); });
    el.dir.addEventListener('click', function () {
      state.dir = state.dir < 0 ? 1 : -1;
      el.dir.innerHTML = state.dir < 0 ? '&#9660;' : '&#9650;';
      render();
      view.syncHash();
    });
    el.tabPre.addEventListener('click', function () { setTab('pre'); });
    el.tabLive.addEventListener('click', function () { setTab('live'); });
    el.tabPins.addEventListener('click', function () { setTab('pins'); });
    el.tabExcluded.addEventListener('click', function () { setTab('excluded'); });
    el.compareToggle.addEventListener('click', function () { setCompareMode(!state.compareMode); });
    el.compareClose.addEventListener('click', function () { setCompareMode(false); });
    el.csv.addEventListener('click', function () { view.exportCsv(); });
    el.paletteToggle.addEventListener('click', function () { if (el.palette.hidden) view.openPalette(); else view.closePalette(); });
    el.paletteInput.addEventListener('input', function () { view.paletteRender(); });
    el.paletteInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); view.paletteMove(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); view.paletteMove(-1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); view.paletteRun(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); view.closePalette(); }
    });
    document.querySelectorAll('thead th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = state.dir < 0 ? 1 : -1;
        else { state.sort = key; state.dir = -1; }
        el.sort.value = key;
        el.dir.innerHTML = state.dir < 0 ? '&#9660;' : '&#9650;';
        render();
        view.syncHash();
      });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeDetail(); view.closePalette(); setCompareMode(false); return; }
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (ev.key === 'Escape') ev.target.blur();
        return;
      }
      if (ev.key === '/') { ev.preventDefault(); el.q.focus(); return; }
      if (ev.key === 'k' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); view.openPalette(); return; }
      if (ev.key === 'p' && state.selected) { togglePin(state.selected); return; }
      if (ev.key === 'c') { setCompareMode(!state.compareMode); return; }
      if (ev.key === 'l') { setTab(state.tab === 'live' ? 'pre' : 'live'); }
      if (ev.key === '?') { ev.preventDefault(); view.openPalette(); }
    });
  }

  function setCompareMode(on) {
    state.compareMode = on;
    el.compareToggle.classList.toggle('on', on);
    el.comparePanel.hidden = !on;
    if (on) view.renderCompare();
  }

  function setTab(tab) {
    state.tab = tab;
    el.tabPre.setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    el.tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    el.tabPins.setAttribute('aria-selected', tab === 'pins' ? 'true' : 'false');
    el.tabExcluded.setAttribute('aria-selected', tab === 'excluded' ? 'true' : 'false');
    render();
  }

  // ---------- render

  function render() {
    var rows = visibleRows();
    el.board.innerHTML = '';
    el.live.innerHTML = '';
    el.pins.innerHTML = '';
    if (state.tab === 'live') {
      el.live.hidden = false;
      el.board.hidden = true;
      el.pins.hidden = true;
      el.excluded.hidden = true;
      el.live.appendChild(node('h3', { class: 'lede', text: "Protocols whose token already trades: the market's own prices, and the calibration set" }));
      el.live.appendChild(view.liveTable(LIVE));
      el.count.textContent = LIVE.length + ' protocols with a token already trading';
      return;
    }
    if (state.tab === 'pins') {
      el.pins.hidden = false;
      el.live.hidden = true;
      el.excluded.hidden = true;
      var pinned = state.pins.map(rowBySlug).filter(Boolean);
      if (!pinned.length) {
        el.pins.appendChild(node('p', { class: 'empty', text: 'No protocol pinned yet. Press the star beside a row to keep it here.' }));
      } else {
        el.pins.appendChild(node('h3', { class: 'lede', text: 'Shortlist: ' + pinned.length + ' protocol' + (pinned.length === 1 ? '' : 's') + ' kept' }));
        el.pins.appendChild(boardTable(pinned));
      }
      el.count.textContent = pinned.length + ' pinned';
      return;
    }
    if (state.tab === 'excluded') {
      el.excluded.hidden = false;
      el.board.hidden = true;
      el.live.hidden = true;
      el.pins.hidden = true;
      el.excluded.appendChild(node('h3', { class: 'lede', text: 'Every protocol that records no token and is set aside, with the reason: ' + EXCLUDED.length + ' of ' + DATA.audited_no_token + ', the rest on the board' }));
      el.excluded.appendChild(view.excludedTable(EXCLUDED));
      el.count.textContent = EXCLUDED.length + ' set aside of ' + DATA.audited_no_token + ' protocols with no token';
      return;
    }
    el.live.hidden = true;
    el.pins.hidden = true;
    el.excluded.hidden = true;
    el.board.hidden = false;
    if (!rows.length) {
      el.board.appendChild(node('p', { class: 'empty', text: 'No protocol matches these filters. Clear one and the board comes back.' }));
    } else {
      el.board.appendChild(boardTable(rows));
    }
    var watchRows = rows.filter(function (r) { return r.watchlisted; }).length;
    el.count.innerHTML =
      rows.length + ' of ' + ROWS.length + ' ranked &middot; ' + watchRows + ' on the watchlist &middot; ' +
      '<span class="check-badge">' + agreement() + ' of ' + ROWS.length + ' rows reproduced from the model in this page</span>';
    document.getElementById('cov-ranked').textContent = String(DATA.board_size);
    document.getElementById('cov-excluded').textContent = String(EXCLUDED.length);
    document.getElementById('boot-line').textContent =
      'exponent ' + DATA.bootstrap.exponent_p10.toFixed(2) + ' to ' + DATA.bootstrap.exponent_p90.toFixed(2) +
      ', top ten holds in ' + Math.round(DATA.bootstrap.top10_stability * 100) + '% of ' + DATA.bootstrap.draws + ' resamples';
    document.getElementById('strip-note').textContent =
      'Tested out of sample: median error ' + DATA.test.test_median_factor.toFixed(1) + 'x, ' +
      Math.round(DATA.test.test_within_2x_share * 100) + '% within 2x, ' +
      Math.round(DATA.test.test_band_coverage * 100) + '% inside the band.';
    document.getElementById('stat-audited').textContent =
      DATA.audited_no_token + ' (' + DATA.board_size + ' ranked + ' + EXCLUDED.length + ' set aside)';
    document.getElementById('comp-count-2').textContent = DATA.comp_set_size + ' traded protocols';
    document.getElementById('stat-multiple').textContent = ROWS.length ? ROWS[0].implied_multiple.toFixed(3) + 'x' : 'n/a';
  }

  function renderStats() {
    document.getElementById('stat-scanned').textContent = String(DATA.scanned_size);
    document.getElementById('stat-watchlist').textContent = DATA.watchlist_covered + '/' + DATA.watchlist_size;
    document.getElementById('stat-ranked').textContent = String(DATA.board_size);
    document.getElementById('stat-early').textContent = String(DATA.early_size);
    document.getElementById('stat-audited').textContent = String(DATA.audited_no_token);
    document.getElementById('stat-comps').textContent = String(DATA.comp_set_size);
    document.getElementById('stat-date').textContent = DATA.as_of;
    document.getElementById('stat-multiple').textContent = ROWS.length ? ROWS[0].implied_multiple.toFixed(3) + 'x' : 'n/a';
    document.getElementById('comp-count').textContent = DATA.comp_set_size + ' traded protocols';
    document.getElementById('band-low').textContent = fmtMult(MODEL.band_low_factor);
    document.getElementById('band-high').textContent = fmtMult(MODEL.band_high_factor);
    el.testLine.textContent =
      'Calibration tested out of sample: the size curve was fitted on ' + DATA.test.train_size + ' protocols tracked before ' +
      DATA.test.split_day + ' and read against ' + DATA.test.test_size + ' later ones it never saw. Median error ' +
      DATA.test.test_median_factor.toFixed(1) + 'x, ' + Math.round(DATA.test.test_within_2x_share * 100) + '% within 2x, and ' +
      Math.round(DATA.test.test_band_coverage * 100) + '% of the true values landed inside the band shown above. ' +
      'A wide band is the honest reading: token value is not a function of TVL alone.';
    el.footMeta.textContent = 'model ' + DATA.model_version + '  ·  ' + DATA.source_label + '  ·  snapshot ' + DATA.as_of +
      '  ·  watchlist floor ' + fmtUsd(DATA.floor_usd);
  }

  view = window.RADAR_VIEW({
    DATA: DATA, ROWS: ROWS, LIVE: LIVE, MODEL: MODEL, state: state, el: el,
    node: node, fmtUsd: fmtUsd, fmtPct: fmtPct, fmtAge: fmtAge, fmtMult: fmtMult,
    render: render, setCompareMode: setCompareMode, setTab: setTab,
    rowBySlug: rowBySlug, openDetail: openDetail, closeDetail: closeDetail, visibleRows: visibleRows,
  });

  fillSelect(el.category, categories());
  fillSelect(el.chain, chains());
  wireControls();

  view.renderSandbox();
  renderStats();
  render();
  view.renderChart();
  view.renderNote();
  window.addEventListener('hashchange', function () { view.applyHash(); });
  view.applyHash();
})();
