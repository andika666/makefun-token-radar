// Token Radar's dashboard, model radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, early finds, the live-token set and the model itself,
// with a per-protocol detail drawer carrying the model's own inputs and the farm plan. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', scope: 'all', tab: 'board',
    sort: 'implied', dir: -1, selected: null,
    sbScale: 1, sbGrowth: DATA.model.growth_weight, sbChain: true, sbCat: true
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }

  // The category factor, the same table main.ts scores with where a category has too few live
  // tokens to price itself: a receipt token is worth less because the asset it wraps already
  // trades; a curator's token a little less because the curator earns fees on other protocols'
  // pools; a stablecoin's token less because the stable asset itself carries the value.
  // Where the category has 5+ live comps the market priced the kind and this factor is 1.
  function categoryFactor(cat) {
    var c = (cat || '').toLowerCase();
    if (c === 'bridge' || c === 'canonical bridge' || c === 'cross chain bridge' ||
        c === 'liquid staking' || c === 'liquid restaking' || c === 'restaked btc' ||
        c === 'stablecoin wrapper' || c === 'staking pool') return { factor: 0.6, label: 'receipt token' };
    if (c === 'stablecoin') return { factor: 0.7, label: 'stablecoin token' };
    if (c === 'risk curators' || c === 'onchain capital allocator') return { factor: 0.85, label: 'curator token' };
    return { factor: 1.0, label: 'core protocol token' };
  }

  // The model in one function, radar-3: the page recomputes a row from the snapshot figures and
  // the comps multiple the row carries, and checks the number board.json carries, so the page's
  // code and the board's data are visibly the same arithmetic. The sandbox scales the calibrated
  // multiple or switches the chain or category factor off. A board row carries its multiples
  // under row.model, a dashboard row carries them flat: both read the same numbers.
  function impliedOf(row, model, opts) {
    var o = opts || { chain: true, category: true };
    var scale = o.multScale === undefined || o.multScale === null ? 1 : o.multScale;
    var m = row.model || row;
    var mult = m.comps_multiple * scale;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, model.chain_max_steps));
    var chainMult = o.chain ? 1 + extra * model.chain_step : 1;
    var catMult = o.category ? m.category_multiplier : 1;
    return Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity * chainMult * catMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $5 of gas';
    if (chain === 'Solana') return 'under $0.10 of gas';
    if (chain === 'Bitcoin' || chain === 'Hyperliquid L1') return 'about $2 of gas';
    return 'under $0.50 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through its official bridge and use the chain\'s apps.';
    if (c.indexOf('otc') >= 0) return 'Fund $' + capital + ' and place one quote request on ' + name + '.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main farm on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Open and close one small trade each week so the wallet shows steady activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Make one swap or adjust one pool position each week so the wallet shows steady activity.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Adjust the position once a week, such as a top-up, a borrow or a repayment.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount each week so the wallet shows steady cross-chain activity.';
    if (c.indexOf('prediction') >= 0) return 'Place one small market position each week so the wallet shows steady activity.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about ' + gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The board's TVL rank per slug: what "why it ranks here" measures a row against.
  var tvlRank = {};
  DATA.rows.slice().sort(function (a, b) { return b.tvl_usd - a.tvl_usd; }).forEach(function (r, i) { tvlRank[r.slug] = i + 1; });
  var boardMax = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
  var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);

  // The blind check's one line, used in the lede strip and the model panel alike.
  function checkLine() {
    var v = DATA.validation;
    return 'Model check (blind): comps fitted on ' + v.fit_count + ' live tokens, tested on ' + v.test_count +
      ' held out \u2014 median error ' + v.median_abs_pct_error.toFixed(1) + '%, ' +
      Math.round(v.within_2x_share * 100) + '% of predictions within 2\u00d7 of the true market cap.';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function matches(r) {
    if (state.scope === 'watchlist' && !r.watchlist) return false;
    if (state.scope === 'early' && r.watchlist) return false;
    if (state.category !== 'all' && r.category !== state.category) return false;
    if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  // Early finds: below the floor, by momentum — fastest seven-day growth first, youngest first
  // on a tie. A different question from the board's implied value, so a different order.
  function earlyRows() {
    return DATA.rows.filter(function (r) { return !r.watchlist && matches(r); }).sort(function (a, b) {
      var ag = a.change_7d === null ? -Infinity : a.change_7d;
      var bg = b.change_7d === null ? -Infinity : b.change_7d;
      if (ag !== bg) return bg - ag;
      var aa = a.age_days === null ? Infinity : a.age_days;
      var ba = b.age_days === null ? Infinity : b.age_days;
      if (aa !== ba) return aa - ba;
      return b.tvl_usd - a.tvl_usd;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(totalImplied) }))
      )
    );
  }

  function checkStrip() {
    return el('section', { class: 'check' },
      el('p', null,
        el('b', { text: checkLine() }),
        el('span', { class: 'sub', text: ' Calibrated on ' + DATA.comps_live_count + ' live-token protocols: median market-cap / TVL ' + DATA.comps_global_median.toFixed(3) + 'x. The multiple is a market anchor for ranking, not a price prediction.' })
      )
    );
  }

  function tabButton(tab, label) {
    return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCount[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    function chip(label, scope) {
      return el('button', { type: 'button', class: 'chip', 'aria-pressed': state.scope === scope ? 'true' : 'false', text: label, onclick: function () { state.scope = scope; render(); } });
    }
    var tabs = el('div', { class: 'tabs' },
      tabButton('board', 'Board'), tabButton('early', 'Early finds'), tabButton('live', 'Live tokens'), tabButton('model', 'Model & method'));
    var countText = state.tab === 'board' ? sortedRows(DATA.rows.filter(matches)).length + ' rows shown'
      : state.tab === 'early' ? earlyRows().length + ' early protocols'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'radar-3 model';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'chips' }, chip('All', 'all'), chip('Watchlist', 'watchlist'), chip('Early', 'early'))),
      tabs,
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function badge(r) {
    return el('span', { class: 'badge ' + (r.watchlist ? 'wl' : 'early'), text: r.watchlist ? 'WATCHLIST' : 'EARLY' });
  }

  function rowCells(r, withBar) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return [
      el('td', { class: 'num', text: String(r.rank) }),
      el('td', null, el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      )),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + growthClass, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', null, el('div', { class: 'implied' },
        el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / boardMax) * 100)) + '%' })),
        el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      )),
      el('td', null, badge(r))
    ];
  }

  function boardTable(list, caption, sortable) {
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      });
      rowCells(r).forEach(function (c) { tr.appendChild(c); });
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: caption }),
          el('thead', null, el('tr', null,
            sortable ? sortHeader('implied', 'Rank') : el('th', { scope: 'col', text: 'Rank' }),
            sortable ? sortHeader('name', 'Protocol') : el('th', { scope: 'col', text: 'Protocol' }),
            sortable ? sortHeader('tvl', 'TVL') : el('th', { scope: 'col', text: 'TVL' }),
            sortable ? sortHeader('growth', '7d') : el('th', { scope: 'col', text: '7d' }),
            sortable ? sortHeader('age', 'Age') : el('th', { scope: 'col', text: 'Age' }),
            sortable ? sortHeader('implied', 'Implied value') : el('th', { scope: 'col', text: 'Implied value' }),
            el('th', { scope: 'col', text: 'Scope' })
          )),
          tbody
        )
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    var cards = top.map(function (r) {
      return el('article', { class: 'spot', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('div', { class: 'spot-rank' }, el('span', { class: 'num', text: '#' + r.rank }), badge(r)),
        el('h3', { text: r.name }),
        el('p', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }),
        el('div', { class: 'spot-value num', text: fmtUsd(r.implied_value_usd) }),
        el('p', { class: 'sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + '  ·  7d ' + fmtPct(r.change_7d) + '  ·  age ' + fmtAge(r.age_days) })
      );
    });
    return el('section', { class: 'spots', 'aria-label': 'Top three by implied value' }, cards);
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function whyText(row) {
    var agePhrase;
    if (row.age_days === null || row.age_days === undefined) agePhrase = 'an unrecorded listing age';
    else if (row.age_days < 180) agePhrase = 'only ' + row.age_days + ' days old, the youngest tier of the board';
    else agePhrase = 'running ' + fmtAge(row.age_days) + ' with no token';
    var growthPhrase;
    if (row.change_7d === null || row.change_7d === undefined) growthPhrase = 'no seven-day growth recorded';
    else if (row.change_7d >= 20) growthPhrase = 'surging ' + fmtPct(row.change_7d) + ' in the last seven days';
    else if (row.change_7d >= 0) growthPhrase = 'up ' + fmtPct(row.change_7d) + ' in the last seven days';
    else growthPhrase = 'down ' + fmtPct(row.change_7d) + ' in the last seven days';
    var multPhrase = 'Its launch is priced at the ' + row.comps_source + ' multiple of ' + fmtMult(row.comps_multiple) + '.';
    var factorPhrase;
    if (row.category_factor === 'comps-calibrated') factorPhrase = 'The market already priced its kind, so no category discount applies.';
    else if (row.category_multiplier === 0.6) factorPhrase = 'Its receipt-token factor of 0.6x discounts the value, because the asset it wraps already trades.';
    else if (row.category_multiplier === 0.7) factorPhrase = 'Its stablecoin-token factor of 0.7x discounts the value, because the stable asset itself carries the value.';
    else if (row.category_multiplier === 0.85) factorPhrase = 'Its curator-token factor of 0.85x discounts the value, because the curator earns fees on other protocols\' pools.';
    else factorPhrase = 'It would launch a core protocol token, so no category discount applies.';
    var chainPhrase = (row.chains || []).length > 1
      ? 'Live on ' + row.chains.length + ' chains, which adds a ' + row.chain_multiplier + 'x breadth multiplier.'
      : 'On one chain, so no breadth multiplier applies.';
    return 'Rank #' + row.rank + '. ' + row.name + ' holds ' + fmtUsd(row.tvl_usd) + ' of TVL, the #' + tvlRank[row.slug] + ' largest on the board, ' + agePhrase + ', with ' + growthPhrase + '. ' + multPhrase + ' ' + factorPhrase + ' ' + chainPhrase;
  }

  function modelPanel() {
    var m = DATA.model;
    var v = DATA.validation;
    var compsRows = DATA.comps_categories.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: String(c.count) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The multiple is calibrated on the snapshot\u2019s own live tokens, not set by hand. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x compsMultiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_max_steps + ')) x categoryFactor )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth rewards wider distribution at launch. The comps multiple is the median market-cap / TVL ratio of the live tokens of the protocol\u2019s category, where the category has ' + m.min_category_comps + ' or more live tokens; otherwise the global median across ' + DATA.comps_live_count + ' live tokens, ' + DATA.comps_global_median.toFixed(3) + 'x. Ratios are winsorized to [' + m.winsor_low + ', ' + m.winsor_high + '] so one outlier cannot set the price.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'cat' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Live tokens' }))),
          el('tbody', null, compsRows,
            el('tr', null, el('td', { text: 'Global median (every live token)' }), el('td', { class: 'num', text: fmtMult(DATA.comps_global_median) }), el('td', { class: 'num', text: String(DATA.comps_live_count) }))
          )
        )
      ),
      el('p', { class: 'sub', text: 'Where the global median is used instead of a category median, the category factor still applies: a receipt token 0.6x, because the asset it wraps already trades; a stablecoin token 0.7x, because the stable asset itself carries the value; a curator token 0.85x, because the curator earns fees on other protocols\u2019 pools. Every other category scores 1.0x. The factor is a category table, never a name list.' }),
      el('h3', { text: 'The blind check' }),
      el('p', { class: 'sub', text: checkLine() + ' The split is by a deterministic hash of the slug, so any run of the program gets the same fit and test sets. Across live tokens the market-cap / TVL ratio spans 0.0003 to 400, so any TVL-only multiple is a rough anchor: the check states how rough, and the board uses the multiple to rank, not to predict a price.' }),
      el('p', { class: 'sub', text: 'What the board leaves out: protocols above the watchlist floor that the watchlist rule leaves out are, in this snapshot, wrapped, staked or bridged products of a token that already trades, or products of another protocol the snapshot does not name a parent for. They are not protocols still waiting on a launch of their own. Below the floor the same receipt-like protocols stay in, discounted.' }),
      el('p', { class: 'sub', text: '\u201cNo token\u201d means the snapshot records no market cap, no CoinGecko id and no symbol for the protocol. A protocol may have a token the index does not record; that is the snapshot\u2019s limit, not this radar\u2019s.' }),
      sandbox()
    );
  }

  function sandbox() {
    var m = DATA.model;
    var scaleLabel = el('b', { class: 'num', text: state.sbScale.toFixed(2) + 'x' });
    var growthLabel = el('b', { class: 'num', text: state.sbGrowth.toFixed(2) });
    var scaleInput = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(state.sbScale), 'aria-label': 'Comps multiple scale' });
    var growthInput = el('input', { type: 'range', min: '0', max: '2', step: '0.05', value: String(state.sbGrowth), 'aria-label': 'Growth weight' });
    var chainBox = el('input', { type: 'checkbox', checked: state.sbChain ? 'checked' : null, 'aria-label': 'Chain breadth factor' });
    var catBox = el('input', { type: 'checkbox', checked: state.sbCat ? 'checked' : null, 'aria-label': 'Category factor' });
    var results = el('div', { class: 'sandbox-results' });
    function recompute() {
      var sbModel = { growth_weight: state.sbGrowth, growth_floor: m.growth_floor, growth_cap: m.growth_cap, maturity_floor: m.maturity_floor, maturity_range: m.maturity_range, maturity_days: m.maturity_days, unknown_age_days: m.unknown_age_days, chain_step: m.chain_step, chain_max_steps: m.chain_max_steps, winsor_low: m.winsor_low, winsor_high: m.winsor_high, min_category_comps: m.min_category_comps };
      var scored = DATA.rows.map(function (r) { return { r: r, v: impliedOf(r, sbModel, { chain: state.sbChain, category: state.sbCat, multScale: state.sbScale }) }; });
      scored.sort(function (a, b) { return b.v - a.v || (a.r.slug < b.r.slug ? -1 : a.r.slug > b.r.slug ? 1 : 0); });
      var changed = 0;
      scored.forEach(function (s, i) { if (s.r.rank !== i + 1) changed++; });
      results.textContent = '';
      results.appendChild(el('p', { class: 'sub', text: changed + ' of ' + DATA.board_size + ' rows change rank under these settings. The published board is unchanged.' }));
      var tbody = el('tbody');
      scored.slice(0, 10).forEach(function (s, i) {
        var move = s.r.rank - (i + 1);
        var moveText = move === 0 ? '—' : move > 0 ? 'up ' + move : 'down ' + (-move);
        tbody.appendChild(el('tr', null,
          el('td', { class: 'num', text: String(i + 1) }),
          el('td', null, el('b', { text: s.r.name })),
          el('td', { class: 'num', text: fmtUsd(s.v) }),
          el('td', { class: 'num', text: 'board #' + s.r.rank }),
          el('td', { class: 'num', text: moveText })
        ));
      });
      results.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'cat' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Sandbox value' }), el('th', { scope: 'col', text: 'Board rank' }), el('th', { scope: 'col', text: 'Move' }))),
        tbody
      )));
    }
    scaleInput.addEventListener('input', function () { state.sbScale = parseFloat(scaleInput.value); scaleLabel.textContent = state.sbScale.toFixed(2) + 'x'; recompute(); });
    growthInput.addEventListener('input', function () { state.sbGrowth = parseFloat(growthInput.value); growthLabel.textContent = state.sbGrowth.toFixed(2); recompute(); });
    chainBox.addEventListener('change', function () { state.sbChain = chainBox.checked; recompute(); });
    catBox.addEventListener('change', function () { state.sbCat = catBox.checked; recompute(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to radar-3', onclick: function () {
      state.sbScale = 1; state.sbGrowth = DATA.model.growth_weight; state.sbChain = true; state.sbCat = true;
      scaleInput.value = '1'; growthInput.value = String(state.sbGrowth);
      scaleLabel.textContent = '1.00x'; growthLabel.textContent = state.sbGrowth.toFixed(2);
      chainBox.checked = true; catBox.checked = true; recompute();
    } });
    var panel = el('section', { class: 'sandbox' },
      el('h3', { text: 'Try the model' }),
      el('p', { class: 'sub', text: 'Change the model and watch the ranking move. The sandbox never changes the published board.' }),
      el('div', { class: 'slider-row' }, el('label', { text: 'Comps multiple scale' }), scaleInput, scaleLabel),
      el('div', { class: 'slider-row' }, el('label', { text: 'Growth weight' }), growthInput, growthLabel),
      el('div', { class: 'slider-row' }, el('label', { text: 'Chain breadth factor' }), chainBox),
      el('div', { class: 'slider-row' }, el('label', { text: 'Category factor' }), catBox),
      reset,
      results
    );
    recompute();
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var budget = row.farm_budget;
    var recomputed = impliedOf(row, DATA.model, { chain: true, category: true, multScale: 1 });
    // The factor table as a waterfall: each row applies one factor to the running value, so the
    // reader sees how TVL becomes the implied value. The final row is the board's own number.
    var run = row.tvl_usd * row.comps_multiple;
    var runGrowth = run * row.growth_multiplier;
    var runMaturity = runGrowth * row.maturity_multiplier;
    var runChain = runMaturity * row.chain_multiplier;
    var runCategory = runChain * row.category_multiplier;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why it ranks here' }),
      el('p', { text: whyText(row) })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'factors' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Factor' }), el('th', { scope: 'col', text: 'Value' }), el('th', { scope: 'col', text: 'Effect' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'TVL' }), el('td', { class: 'num', text: fmtUsd(row.tvl_usd) }), el('td', { class: 'num', text: 'base' })),
            el('tr', null, el('td', { text: 'Comps multiple (' + row.comps_source + ')' }), el('td', { class: 'num', text: fmtMult(row.comps_multiple) }), el('td', { class: 'num', text: fmtUsd(run) })),
            el('tr', null, el('td', { text: 'Seven-day growth (' + fmtPct(row.change_7d) + ')' }), el('td', { class: 'num', text: String(row.growth_multiplier) + 'x' }), el('td', { class: 'num', text: fmtUsd(runGrowth) })),
            el('tr', null, el('td', { text: 'Age with no token (' + fmtAge(row.age_days) + ')' }), el('td', { class: 'num', text: String(row.maturity_multiplier) + 'x' }), el('td', { class: 'num', text: fmtUsd(runMaturity) })),
            el('tr', null, el('td', { text: 'Chain breadth (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')' }), el('td', { class: 'num', text: String(row.chain_multiplier) + 'x' }), el('td', { class: 'num', text: fmtUsd(runChain) })),
            el('tr', null, el('td', { text: 'Category factor (' + row.category_factor + ')' }), el('td', { class: 'num', text: String(row.category_multiplier) + 'x' }), el('td', { class: 'num', text: fmtUsd(runCategory) })),
            el('tr', { class: 'total' }, el('td', { text: 'Implied value' }), el('td', { class: 'num', text: fmtUsd(row.implied_value_usd) }), el('td', { class: 'num', text: 'TVL x all factors' }))
          )
        )
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'budget', text: 'Plan budget (setup): ' + fmtUsd(budget.capital_usd) + ' capital + about ' + fmtUsd(budget.gas_usd) + ' gas for 2 transactions on ' + budget.chain + ' = ' + fmtUsd(budget.total_usd) + ' to start.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(checkStrip());
    shell.appendChild(controls());
    if (state.tab === 'board') {
      shell.appendChild(spotlight());
      shell.appendChild(boardTable(sortedRows(DATA.rows.filter(matches)), 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.', true));
    } else if (state.tab === 'early') {
      shell.appendChild(el('p', { class: 'note', text: 'Early finds: the ' + DATA.early_size + ' pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor, ranked by momentum — fastest seven-day growth first, youngest first on a tie. A different question from the board\'s implied value, so a different order.' }));
      shell.appendChild(boardTable(earlyRows(), 'Early protocols by momentum, not by implied value. Select a row for its model and farm plan.', false));
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
