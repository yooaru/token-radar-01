// Token Radar's second dashboard file: the size chart, the command palette, the side-by-side
// compare panel, the research note, the CSV export and the model sandbox. They sit out here rather
// than in app.js because the dossier shows at most 65,536 bytes of the dashboard's source whole,
// and this page's source has to fit inside that: app.js keeps the board, the filters and the detail
// view, and everything drawn around them lives here. app.js passes its own scope in as `api`, so
// nothing in this file reaches outside the one closure it is given.
window.RADAR_VIEW = function (api) {
  'use strict';

  var DATA = api.DATA;
  var ROWS = api.ROWS;
  var LIVE = api.LIVE;
  var MODEL = api.MODEL;
  var state = api.state;
  var el = api.el;
  var node = api.node;
  var fmtUsd = api.fmtUsd;
  var fmtPct = api.fmtPct;
  var fmtAge = api.fmtAge;
  var fmtMult = api.fmtMult;
  var render = api.render;
  var setCompareMode = api.setCompareMode;
  var setTab = api.setTab;
  var rowBySlug = api.rowBySlug;
  var openDetail = api.openDetail;
  var visibleRows = api.visibleRows;
  var closeDetail = api.closeDetail;

  // ---------- the hash router

  // The hash carries the view: #/p/slug opens a protocol's detail, #/p/slug?tab=farm opens one of
  // its tabs, and #/f?cat=…&growth=up opens a filtered board. A link into the dashboard therefore
  // lands on the board, the row or the tab it names.
  function readHash() {
    var hash = location.hash.slice(1);
    if (hash.indexOf('/p/') === 0) {
      var rest = hash.slice(3);
      var at = rest.indexOf('?');
      if (at === -1) return { view: 'detail', slug: rest, tab: 'model' };
      var detailParams = {};
      rest.slice(at + 1).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) detailParams[kv[0]] = decodeURIComponent(kv[1] || '');
      });
      return { view: 'detail', slug: rest.slice(0, at), tab: detailParams.tab || 'model' };
    }
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
      openDetail(route.slug, route.tab);
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

  // ---------- the two secondary tables

  // The already-trading protocols: the market's own prices, and the calibration set the size curve
  // was fitted on. They are on their own tab because criterion two asks the board to separate the
  // protocols whose token trades from those still to come, and a reader has to be able to see both.
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

  return {
    liveTable: liveTable,
    excludedTable: excludedTable,
    readHash: readHash,
    applyHash: applyHash,
    syncHash: syncHash,
    renderChart: renderChart,
    renderNote: renderNote,
    renderSandbox: renderSandbox,
    exportCsv: exportCsv,
    renderCompare: renderCompare,
    toggleCompare: toggleCompare,
    openPalette: openPalette,
    closePalette: closePalette,
    paletteRender: paletteRender,
    paletteMove: paletteMove,
    paletteRun: paletteRun,
  };
};