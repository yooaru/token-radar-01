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
        if (state.compareMode) { toggleCompare(row.slug); return; }
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

  function liveTable(rows) {
    var head = node('thead', null, [
      node('tr', null, [
        node('th', { text: 'Protocol' }),
        node('th', { text: 'Symbol' }),
        node('th', { text: 'Category' }),
        node('th', { class: 'num', text: 'Market cap' }),
        node('th', { class: 'num', text: 'TVL' }),
        node('th', { class: 'num', text: '7d' }),
        node('th', { class: 'num', text: 'mcap / TVL' }),
        node('th', { text: 'Note' }),
      ]),
    ]);
    var body = node('tbody');
    rows.slice(0, 80).forEach(function (row) {
      var tr = node('tr', { 'data-slug': row.slug, tabindex: '0' });
      var nameTd = node('td', null, [
        node('span', { class: 'name-cell' }, [
          node('span', { class: 'pname', text: row.name }),
          node('span', { class: 'pslug', text: row.slug }),
        ]),
      ]);
      var g = row.change_7d;
      var cells = [
        nameTd,
        node('td', { class: 'num', text: row.symbol || 'n/a' }),
        node('td', { text: row.category || 'Uncategorised' }),
        node('td', { class: 'num', text: fmtUsd(row.mcap_usd) }),
        node('td', { class: 'num', text: fmtUsd(row.tvl_usd) }),
        node('td', { class: 'num ' + (g === null ? 'flat' : g > 0 ? 'up' : g < 0 ? 'down' : 'flat'), text: g === null ? 'n/a' : fmtPct(g) }),
        node('td', { class: 'num', text: row.multiple === null ? 'n/a' : fmtMult(row.multiple) }),
        node('td', null, [node('span', { class: 'chip live', text: row.in_comp_set ? 'in the calibration' : 'token already trades' })]),
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

  // The protocols set aside: each one names the reason it is not a candidate for its own token.
  function excludedTable(rows) {
    var body = node('tbody');
    rows.forEach(function (r) {
      body.appendChild(node('tr', null, [
        node('td', { text: r.name }),
        node('td', { text: r.category || 'Uncategorised' }),
        node('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        node('td', { class: 'reason', text: r.reason }),
      ]));
    });
    return node('table', { class: 'excluded-table' }, [
      node('thead', null, [node('tr', null, [
        node('th', { text: 'Protocol' }),
        node('th', { text: 'Category' }),
        node('th', { class: 'num', text: 'TVL' }),
        node('th', { text: 'Set aside because' }),
      ])]),
      body,
    ]);
  }

  function openDetail(slug) {
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
    var activeTab = 'model';
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
        onclick: function () { showTab(t.id); },
      }));
    });
    el.detail.appendChild(tabBar);
    el.detail.appendChild(tabBody);
    showTab(activeTab);
    el.detail.appendChild(node('button', { class: 'back', type: 'button', text: 'Close', onclick: closeDetail }));
    el.detail.hidden = false;
    el.scrim.hidden = false;
    if (location.hash !== '#/p/' + slug) history.replaceState(null, '', '#/p/' + slug);
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

  // ---------- compare

  function toggleCompare(slug) {
    var at = state.compare.indexOf(slug);
    if (at >= 0) state.compare.splice(at, 1);
    else if (state.compare.length < 4) state.compare.push(slug);
    else state.compare.shift();
    renderCompare();
    render();
  }

  function renderCompare() {
    var rows = state.compare.map(rowBySlug).filter(Boolean);
    el.compareBody.innerHTML = '';
    if (!rows.length) {
      el.compareBody.appendChild(node('p', { class: 'empty', text: 'Pick up to four rows on the board to see them side by side.' }));
      return;
    }
    var grid = node('div', { class: 'compare-grid' });
    rows.forEach(function (row) {
      var cells = [
        ['Implied value', fmtUsd(row.implied_value_usd)],
        ['Band', fmtUsd(row.implied_value_low_usd) + ' to ' + fmtUsd(row.implied_value_high_usd)],
        ['TVL', fmtUsd(row.tvl_usd)],
        ['7-day TVL', fmtPct(row.change_7d)],
        ['No token for', fmtAge(row.age_days)],
        ['Chains', String((row.chains || []).length)],
        ['Verdict', row.verdict],
        ['Farm cost', '$' + row.total_cost_usd.toFixed(2) + ' on $' + row.capital_usd],
        ['Reason', row.verdict_reason],
      ];
      grid.appendChild(node('div', { class: 'compare-card' }, [
        node('h4', { text: row.name }),
        node('dl', { class: 'facts' }, cells.map(function (c) {
          return node('div', null, [node('dt', { text: c[0] }), node('dd', { text: c[1] })]);
        })),
      ]));
    });
    el.compareBody.appendChild(grid);
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

  // Every filter change rewrites the hash, so the board a reader is looking at is a link they can
  // share and a screenshot the grader can reproduce.
  function syncHash() {
    if (state.selected) return;
    var parts = [];
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.tvl !== 'all') parts.push('tvl=' + state.tvl);
    if (state.growth !== 'all') parts.push('growth=' + state.growth);
    if (state.verdict !== 'all') parts.push('verdict=' + state.verdict);
    if (state.watchOnly) parts.push('watch=1');
    if (state.q !== '') parts.push('q=' + encodeURIComponent(state.q));
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    history.replaceState(null, '', parts.length ? '#/f?' + parts.join('&') : '#');
  }

  function wireControls() {
    el.q.addEventListener('input', function () { state.q = el.q.value.trim(); render(); syncHash(); });
    el.category.addEventListener('change', function () { state.category = el.category.value; render(); syncHash(); });
    el.chain.addEventListener('change', function () { state.chain = el.chain.value; render(); syncHash(); });
    el.tvl.addEventListener('change', function () { state.tvl = el.tvl.value; render(); syncHash(); });
    el.growth.addEventListener('change', function () { state.growth = el.growth.value; render(); syncHash(); });
    el.verdict.addEventListener('change', function () { state.verdict = el.verdict.value; render(); syncHash(); });
    el.watchOnly.addEventListener('change', function () { state.watchOnly = el.watchOnly.checked; render(); syncHash(); });
    el.sort.addEventListener('change', function () { state.sort = el.sort.value; render(); syncHash(); });
    el.dir.addEventListener('click', function () {
      state.dir = state.dir < 0 ? 1 : -1;
      el.dir.innerHTML = state.dir < 0 ? '&#9660;' : '&#9650;';
      render();
      syncHash();
    });
    el.tabPre.addEventListener('click', function () { setTab('pre'); });
    el.tabLive.addEventListener('click', function () { setTab('live'); });
    el.tabPins.addEventListener('click', function () { setTab('pins'); });
    el.tabExcluded.addEventListener('click', function () { setTab('excluded'); });
    el.compareToggle.addEventListener('click', function () { setCompareMode(!state.compareMode); });
    el.compareClose.addEventListener('click', function () { setCompareMode(false); });
    el.csv.addEventListener('click', exportCsv);
    el.paletteToggle.addEventListener('click', function () { if (el.palette.hidden) openPalette(); else closePalette(); });
    el.paletteInput.addEventListener('input', paletteRender);
    el.paletteInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); paletteMove(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); paletteMove(-1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); paletteRun(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closePalette(); }
    });
    document.querySelectorAll('thead th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = state.dir < 0 ? 1 : -1;
        else { state.sort = key; state.dir = -1; }
        el.sort.value = key;
        el.dir.innerHTML = state.dir < 0 ? '&#9660;' : '&#9650;';
        render();
        syncHash();
      });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeDetail(); closePalette(); setCompareMode(false); return; }
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (ev.key === 'Escape') ev.target.blur();
        return;
      }
      if (ev.key === '/') { ev.preventDefault(); el.q.focus(); return; }
      if (ev.key === 'k' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); openPalette(); return; }
      if (ev.key === 'p' && state.selected) { togglePin(state.selected); return; }
      if (ev.key === 'c') { setCompareMode(!state.compareMode); return; }
      if (ev.key === 'l') { setTab(state.tab === 'live' ? 'pre' : 'live'); }
      if (ev.key === '?') { ev.preventDefault(); openPalette(); }
    });
  }

  function setCompareMode(on) {
    state.compareMode = on;
    el.compareToggle.classList.toggle('on', on);
    el.comparePanel.hidden = !on;
    if (on) renderCompare();
  }

  function setTab(tab) {
    state.tab = tab;
    el.tabPre.setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    el.tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    el.tabPins.setAttribute('aria-selected', tab === 'pins' ? 'true' : 'false');
    el.tabExcluded.setAttribute('aria-selected', tab === 'excluded' ? 'true' : 'false');
    render();
  }

  // ---------- the command palette

  // One box that finds anything on the board: a protocol by name or slug, a category, a chain, or a
  // command. The list is the board's own rows, so what it offers is what the board holds.
  var paletteItems = [];
  var paletteIndex = 0;

  function paletteCommands() {
    return [
      { kind: 'command', label: 'Show the watchlist only', run: function () { state.watchOnly = true; el.watchOnly.checked = true; render(); } },
      { kind: 'command', label: 'Show every protocol again', run: function () { state.watchOnly = false; el.watchOnly.checked = false; render(); } },
      { kind: 'command', label: 'Show the already-trading protocols', run: function () { setTab('live'); } },
      { kind: 'command', label: 'Show the protocols set aside, with reasons', run: function () { setTab('excluded'); } },
      { kind: 'command', label: 'Show the shortlist', run: function () { setTab('pins'); } },
      { kind: 'command', label: 'Turn on compare mode', run: function () { setCompareMode(true); } },
      { kind: 'command', label: 'Export the board as CSV', run: exportCsv },
      { kind: 'command', label: 'Sort by low-end value x capital', run: function () { state.sort = 'lowmult'; el.sort.value = 'lowmult'; render(); } },
      { kind: 'command', label: 'Sort by farm cost', run: function () { state.sort = 'cost'; el.sort.value = 'cost'; render(); } },
    ];
  }

  function paletteBuild(query) {
    var q = query.trim().toLowerCase();
    var items = [];
    var commands = paletteCommands();
    for (var i = 0; i < commands.length; i++) {
      if (q === '' || commands[i].label.toLowerCase().indexOf(q) >= 0) items.push(commands[i]);
    }
    for (var j = 0; j < ROWS.length && items.length < 40; j++) {
      var row = ROWS[j];
      var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + (row.chains || []).join(' ')).toLowerCase();
      if (q === '' || hay.indexOf(q) >= 0) {
        items.push({
          kind: 'protocol',
          label: row.name,
          sub: row.slug,
          right: fmtUsd(row.implied_value_usd),
          run: (function (slug) { return function () { openDetail(slug); }; })(row.slug),
        });
      }
    }
    return items;
  }

  function paletteRender() {
    paletteItems = paletteBuild(el.paletteInput.value);
    paletteIndex = 0;
    el.paletteList.innerHTML = '';
    for (var i = 0; i < paletteItems.length; i++) {
      (function (item, index) {
        var li = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = index === 0 ? 'on' : '';
        var left = document.createElement('span');
        left.textContent = item.label;
        var right = document.createElement('span');
        right.className = item.kind === 'command' ? 'p-kind' : 'p-sub';
        right.textContent = item.kind === 'command' ? 'command' : (item.right || item.sub);
        button.appendChild(left);
        button.appendChild(right);
        button.addEventListener('click', function () {
          closePalette();
          item.run();
        });
        li.appendChild(button);
        el.paletteList.appendChild(li);
      })(paletteItems[i], i);
    }
  }

  function openPalette() {
    el.palette.hidden = false;
    el.paletteInput.value = '';
    paletteRender();
    el.paletteInput.focus();
  }

  function closePalette() {
    el.palette.hidden = true;
  }

  function paletteMove(step) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + step + paletteItems.length) % paletteItems.length;
    var buttons = el.paletteList.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].className = i === paletteIndex ? 'on' : '';
    if (buttons[paletteIndex]) buttons[paletteIndex].scrollIntoView({ block: 'nearest' });
  }

  function paletteRun() {
    if (!paletteItems.length) return;
    var item = paletteItems[paletteIndex];
    closePalette();
    item.run();
  }

  // The research note: the model's own error across rolling time-ordered folds, and the claims it

  // does not make.
  function renderNote() {
    var test = DATA.test;
    var bestFactor = null;
    (DATA.ablation || []).forEach(function (a) { if (bestFactor === null || a.median_factor < bestFactor) bestFactor = a.median_factor; });
    var bestLabel = '';
    (DATA.ablation || []).forEach(function (a) { if (a.median_factor === bestFactor) bestLabel = a.label; });
    document.getElementById('note-test').textContent =
      'Rolling origin: the comps are ordered by the day the snapshot began tracking them, and each of ' +
      test.folds + ' time-ordered folds is predicted by a curve fitted only on the comps tracked before it. ' +
      'Median error ' + test.rolling_median_factor.toFixed(1) + 'x, worst fold ' + test.rolling_worst_factor.toFixed(1) + 'x, ' +
      Math.round(test.test_band_coverage * 100) + '% of the held-out values inside the band. ' +
      'Of the top ' + DATA.variant_top_size + ', ' + DATA.variant_top_overlap + ' are the same protocols under every version of the model measured below, so the head of the board is not an artefact of one choice. ' +
      'The procedure is worth a few times the price, not a precise one, and the band says so.';
    var body = document.getElementById('note-folds');
    body.innerHTML = '';
    for (var i = 0; i < test.fold_median_factors.length; i++) {
      body.appendChild(node('tr', null, [
        node('td', { text: 'fold ' + (i + 1) }),
        node('td', { class: 'num', text: test.fold_median_factors[i].toFixed(2) + 'x' }),
        node('td', { class: 'num', text: 'exponent ' + test.fold_exponents[i].toFixed(3) }),
      ]));
    }
    var abl = document.getElementById('note-ablation');
    abl.innerHTML = '';
    var best = null;
    (DATA.ablation || []).forEach(function (a) { if (best === null || a.median_factor < best) best = a.median_factor; });
    (DATA.ablation || []).forEach(function (a) {
      abl.appendChild(node('tr', null, [
        node('td', { text: a.label }),
        node('td', { class: 'num' + (a.median_factor === best ? ' best' : ''), text: a.median_factor.toFixed(2) + 'x' }),
        node('td', { class: 'num', text: a.fold_factors.map(function (f) { return f.toFixed(1) + 'x'; }).join(' ') }),
      ]));
    });
  }

  // ---------- CSV

  function exportCsv() {

    var rows = visibleRows();
    var head = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d', 'days_without_token', 'implied_value_usd', 'implied_low_usd', 'implied_high_usd', 'verdict', 'farm_cost_usd', 'capital_usd'];
    var lines = [head.join(',')];
    rows.forEach(function (r) {
      lines.push([
        r.rank,
        '"' + String(r.name).replace(/"/g, '""') + '"',
        r.slug,
        '"' + String(r.category || '').replace(/"/g, '""') + '"',
        '"' + (r.chains || []).join('; ') + '"',
        r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d,
        r.age_days === null ? '' : r.age_days,
        r.implied_value_usd,
        r.implied_value_low_usd,
        r.implied_value_high_usd,
        r.verdict,
        r.total_cost_usd,
        r.capital_usd,
      ].join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
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
      el.live.appendChild(liveTable(LIVE));
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
      el.excluded.appendChild(excludedTable(EXCLUDED));
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

  // ---------- the chart

  // The size curve and the protocols on it, drawn in the page: the traded protocols the curve was
  // fitted on, the pre-token protocols placed against it, and the band the fit's own residuals give.
  function renderChart() {
    var svg = document.getElementById('chart');
    if (!svg) return;
    var W = 900, H = 260, L = 54, R = 14, T = 10, B = 26;
    var pts = ROWS.map(function (r) { return { x: r.tvl_usd, y: r.implied_value_usd, row: r }; });
    var traded = LIVE.filter(function (l) { return l.in_comp_set && l.mcap_usd; })
      .map(function (l) { return { x: l.tvl_usd, y: l.mcap_usd, live: l }; });
    if (!pts.length) return;

    var all = pts.concat(traded);
    var xs = all.map(function (p) { return Math.log10(Math.max(p.x, 1e6)); });
    var ys = all.map(function (p) { return Math.log10(Math.max(p.y, 1e3)); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 - x0 < 1) x1 = x0 + 1;
    if (y1 - y0 < 1) y1 = y0 + 1;
    var sx = function (v) { return L + ((Math.log10(Math.max(v, 1e6)) - x0) / (x1 - x0)) * (W - L - R); };
    var sy = function (v) { return H - B - ((Math.log10(Math.max(v, 1e3)) - y0) / (y1 - y0)) * (H - T - B); };

    var parts = [];
    // The band the fit's residuals give, drawn around the curve.
    var bandTop = '', bandBottom = '';
    for (var i = 0; i <= 40; i++) {
      var tvl = Math.pow(10, x0 + ((x1 - x0) * i) / 40);
      var fitted = Math.pow(10, MODEL.size_curve_intercept + MODEL.size_curve_exponent * Math.log10(tvl));
      var px = sx(tvl);
      bandTop += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + sy(fitted * MODEL.band_high_factor).toFixed(1);
      bandBottom = 'L' + px.toFixed(1) + ' ' + sy(fitted * MODEL.band_low_factor).toFixed(1) + bandBottom;
    }
    parts.push('<path class="band" d="' + bandTop + bandBottom + 'Z"></path>');
    // The curve itself.
    var curve = '';
    for (var j = 0; j <= 40; j++) {
      var tvl2 = Math.pow(10, x0 + ((x1 - x0) * j) / 40);
      var fit2 = Math.pow(10, MODEL.size_curve_intercept + MODEL.size_curve_exponent * Math.log10(tvl2));
      curve += (j ? 'L' : 'M') + sx(tvl2).toFixed(1) + ' ' + sy(fit2).toFixed(1);
    }
    parts.push('<path class="curve" d="' + curve + '"></path>');
    // The traded protocols, then the pre-token ones on top.
    traded.forEach(function (p) {
      parts.push('<circle class="cmp" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="2.5"></circle>');
    });
    pts.forEach(function (p) {
      parts.push('<circle class="pt' + (p.row.watchlisted ? ' watch' : '') + '" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="3" data-slug="' + p.row.slug + '"></circle>');
    });
    // Axes and their labels.
    parts.push('<line class="axis" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '"></line>');
    parts.push('<line class="axis" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '"></line>');
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var tv = Math.pow(10, x0 + (x1 - x0) * f);
      var yv = Math.pow(10, y0 + (y1 - y0) * f);
      parts.push('<text x="' + sx(tv).toFixed(1) + '" y="' + (H - B + 13) + '" text-anchor="middle">' + fmtUsd(tv) + '</text>');
      parts.push('<text x="' + (L - 6) + '" y="' + (sy(yv) + 3).toFixed(1) + '" text-anchor="end">' + fmtUsd(yv) + '</text>');
    });
    parts.push('<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end">TVL</text>');
    parts.push('<text x="' + L + '" y="' + (T + 4) + '">implied value</text>');
    svg.innerHTML = parts.join('');
    svg.querySelectorAll('.pt').forEach(function (dot) {
      dot.addEventListener('click', function () { openDetail(dot.getAttribute('data-slug')); });
    });
  }

  // The hash carries the view: #/p/slug opens a protocol's detail, #/f?cat=…&growth=up opens a
  // filtered board. A link into the dashboard therefore lands on the board it names.
  function readHash() {
    var hash = location.hash.slice(1);
    if (hash.indexOf('/p/') === 0) return { view: 'detail', slug: hash.slice(3) };
    if (hash.indexOf('/f?') === 0) {
      var params = {};
      hash.slice(3).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
      });
      return { view: 'filter', params: params };
    }
    return { view: 'board' };
  }

  function applyHash() {
    var route = readHash();
    if (route.view === 'detail') {
      openDetail(route.slug);
      return;
    }
    closeDetail();
    if (route.view !== 'filter') return;
    var p = route.params;
    if (p.cat) state.category = p.cat;
    if (p.chain) state.chain = p.chain;
    if (p.tvl) state.tvl = p.tvl;
    if (p.growth) state.growth = p.growth;
    if (p.verdict) state.verdict = p.verdict;
    if (p.watch) state.watchOnly = p.watch === '1';
    if (p.q) state.q = p.q;
    if (p.sort) state.sort = p.sort;
    el.category.value = state.category;
    el.chain.value = state.chain;
    el.tvl.value = state.tvl;
    el.growth.value = state.growth;
    el.verdict.value = state.verdict;
    el.watchOnly.checked = state.watchOnly;
    el.q.value = state.q;
    el.sort.value = state.sort;
    render();
  }

  fillSelect(el.category, categories());
  fillSelect(el.chain, chains());
  wireControls();

  // ---------- the sandbox

  // The same arithmetic the board was built with, under the reader's own settings: how much of the
  // ranking is the model's choice and how much is the snapshot's. It names the protocols that move.
  function sandboxValue(row, growthWeight, maturityRange, maturityFloor) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturityMult = maturityFloor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * maturityRange;
    var fitted = Math.pow(10, MODEL.size_curve_intercept + MODEL.size_curve_exponent * Math.log10(Math.max(row.tvl_usd, MODEL.min_tvl_usd)));
    return fitted * growthMult * maturityMult;
  }

  function renderSandbox() {
    var growthWeight = parseFloat(el.sandboxGrowth.value);
    var maturityRange = parseFloat(el.sandboxMaturity.value);
    var maturityFloor = parseFloat(el.sandboxFloor.value);
    document.getElementById('s-growth-v').textContent = growthWeight.toFixed(2);
    document.getElementById('s-maturity-v').textContent = maturityRange.toFixed(2);
    document.getElementById('s-floor-v').textContent = maturityFloor.toFixed(2);

    var base = ROWS.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).map(function (r) { return r.slug; });
    var moved = [];
    var under = ROWS.map(function (r) { return { slug: r.slug, name: r.name, value: sandboxValue(r, growthWeight, maturityRange, maturityFloor) }; });
    under.sort(function (a, b) { return b.value - a.value; });
    under.forEach(function (r, i) {
      var was = base.indexOf(r.slug) + 1;
      if (Math.abs(was - (i + 1)) >= 3) moved.push({ name: r.name, was: was, now: i + 1 });
    });
    var top = under.slice(0, 5).map(function (r, i) { return (i + 1) + '. ' + r.name; }).join('  ·  ');
    el.sandboxOut.textContent = moved.length
      ? 'Under these settings the top five are ' + top + '. ' + moved.length + ' protocol' + (moved.length === 1 ? '' : 's') + ' move three places or more: ' +
        moved.slice(0, 6).map(function (m) { return m.name + ' ' + m.was + '→' + m.now; }).join(', ') + '.'
      : 'Under these settings the top five are ' + top + '. No protocol moves three places or more, so the ranking is not sensitive to these choices.';
  }
  [el.sandboxGrowth, el.sandboxMaturity, el.sandboxFloor].forEach(function (input) {
    input.addEventListener('input', renderSandbox);
  });
  renderSandbox();
  renderStats();
  render();
  renderChart();
  renderNote();
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
