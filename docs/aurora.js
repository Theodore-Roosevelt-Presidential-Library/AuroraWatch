/*! TRPL Aurora Watch | Theodore Roosevelt Presidential Library | aurora.labs.trlibrary.com
 *
 * Northern lights outlook for Medora, North Dakota: tonight and the next two nights from live
 * NOAA space weather and cloud forecasts, plus what the record since 1932 says about when to come.
 *
 * Embed:
 *   <div id="trpl-aurora"></div>
 *   <script src="https://aurora.labs.trlibrary.com/aurora.js" defer></script>
 *
 * Optional attributes on the script tag:
 *   data-view="compact"      only the outlook (tonight and the next two nights), for a sidebar or homepage
 *   data-history="off"       full view without the history section
 *   data-heading="off"       hide the built-in heading (when the page has its own)
 *   data-more="https://..."  in the compact view, where "See the full outlook" goes
 *   data-cta="off"           hide the lodging link (or give a different address)
 *   data-target="#some-id"   mount somewhere other than #trpl-aurora
 *   data-fonts="off"         do not load the brand fonts (they are loaded from trlibrary.com on any other site)
 *
 * Live data is read in the browser from NOAA SWPC and Open-Meteo, both of which allow it.
 * The history comes from data/history.json in this repository, rebuilt weekly.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var BASE = script && script.src ? new URL('.', script.src).href : './';
  var opts = (script && script.dataset) || {};
  var host = (opts.target && document.querySelector(opts.target)) || document.getElementById('trpl-aurora');
  if (!host) {
    host = document.createElement('div');
    host.id = 'trpl-aurora';
    if (script && script.parentNode) script.parentNode.insertBefore(host, script);
    else document.body.appendChild(host);
  }
  if (host.shadowRoot) return;
  var root = host.attachShadow({ mode: 'open' });

  var COMPACT = opts.view === 'compact';
  var PLANNER_ONLY = opts.view === 'planner';
  var SHOW_HISTORY = !COMPACT && opts.history !== 'off';
  var LAT = 46.9139, LON = -103.5244;
  var TZ = 'America/Denver';
  var DARK = -12;                       // sun altitude for "dark enough"
  var CTA = opts.cta === 'off' ? null : (opts.cta || 'https://www.trlibrary.com/visit/lodging/availability');
  var MORE = opts.more || 'https://aurora.labs.trlibrary.com/';

  var URLS = {
    kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    kpNow: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    ovation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
    clouds: 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
      '&hourly=cloud_cover&forecast_days=4&past_days=1&timezone=GMT',
    ap45: 'https://services.swpc.noaa.gov/json/45-day-forecast.json',
    history: BASE + 'data/history.json'
  };
  var PLAN_NIGHTS = 365;
  var TIERS = [
    { key: 'low', word: 'Low', color: '#EEECE5', ink: '#25282A' },      // Sand, light tint
    { key: 'fair', word: 'Fair', color: '#C9E4CC', ink: '#25282A' },     // Bright Forest, light tint
    { key: 'good', word: 'Good', color: '#8FC895', ink: '#25282A' },     // Bright Forest
    { key: 'best', word: 'Best', color: '#1B4532', ink: '#fff' }         // Dark Forest
  ];

  // What each Kp level means from Medora. Medora sits near 55 degrees magnetic latitude, so these are
  // rules of thumb, not promises: storms vary, and a camera picks up more than the eye.
  var LEVELS = [
    { word: 'Unlikely', line: 'Space weather is quiet.' },
    { word: 'Low', line: 'A faint glow may show on camera, low in the north.' },
    { word: 'Possible', line: 'The lights may show low on the northern horizon.' },
    { word: 'Good', line: 'A good chance of a display to the north.' },
    { word: 'Strong', line: 'A strong storm. The lights could climb high into the sky.' }
  ];
  function kpLevel(kp) { return kp >= 7 ? 4 : kp >= 6 ? 3 : kp >= 5 ? 2 : kp >= 4 ? 1 : 0; }

  // ---------- brand fonts (same files trlibrary.com uses) ----------
  var FONT_BASE = 'https://www.trlibrary.com/themes/custom/trpl/css/';
  var FONTS = [
    ['Dharma Gothic E', 700, 'dharma_type-dharmagothice-bold.woff2'],
    ['Clearface', 400, 'clearfacestd-regular.woff2'],
    ['Clearface', 700, 'clearfacestd-heavy.woff2'],
    ['Frutiger', 400, 'frutigerltstd-regular.woff2'],
    ['Frutiger', 700, 'frutigerltstd-bold.woff2']
  ];
  (function loadFonts() {
    var onMainSite = /^(www\.)?trlibrary\.com$/.test(location.hostname);
    if (opts.fonts === 'off' || onMainSite || document.getElementById('trpl-brand-fonts')) return;
    var style = document.createElement('style');
    style.id = 'trpl-brand-fonts';
    style.textContent = FONTS.map(function (f) {
      return '@font-face{font-family:"' + f[0] + '";font-weight:' + f[1] + ';font-style:normal;font-display:swap;src:url("' + FONT_BASE + f[2] + '") format("woff2")}';
    }).join('');
    document.head.appendChild(style);
  })();
  var SANS = 'Frutiger,"Frutiger Next","Helvetica Neue",Arial,sans-serif';
  var SERIF = 'Clearface,Georgia,"Times New Roman",serif';
  var DISPLAY = '"Dharma Gothic E","Oswald","Arial Narrow",sans-serif';

  // Colors and type follow the TRPL Brand Identity System & Guidelines:
  //   primary (backgrounds): Dark Gray #25282A, White, Dark Forest #1B4532, Night Sky #092A4D
  //   grounding: Sand #D1CCBD, Deep Orange #E7805D, Bright Forest #8FC895, Gray Sky #99ADC5
  //   accents (headline text only): Sunset Yellow #F9D635, Spring Green #87BB41, Sunset Orange #FC924E, Sunset Pink #F36079
  //   Dharma Gothic E: display and calls to action, all caps only. ITC Clearface: body copy.
  //   Frutiger Next: captions, labels and small text only.
  var CSS = [
    ':host{display:block;container-type:inline-size;font-family:' + SERIF + ';color:#25282A;line-height:1.45;' +
      '--forest:#1B4532;--night:#092A4D;--ink:#25282A;--sand:#D1CCBD;--orange:#E7805D;--bright:#8FC895;--sky:#99ADC5;--yellow:#F9D635;' +
      '--line:#D1CCBD;--muted:#5A5F61;--wash:#F4F2EC}',
    '*{box-sizing:border-box}',
    'a{color:var(--forest)}',
    'h2{font-family:' + DISPLAY + ';font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:clamp(2.2rem,6vw,3.4rem);line-height:.95;margin:0 0 .3em;color:var(--forest)}',
    'h3{font-family:' + DISPLAY + ';font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:clamp(1.7rem,4vw,2.2rem);line-height:1;margin:1.6em 0 .5em;color:var(--forest)}',
    '.intro{font-size:1.12rem;margin:0 0 1.1em;max-width:46em}',
    // tonight panel: Night Sky, with a glow in Bright Forest and the sunset accents
    '.sky{position:relative;overflow:hidden;border-radius:2px;color:#fff;background:var(--night);padding:26px 26px 22px}',
    '.sky::before{content:"";position:absolute;inset:-40% -10% auto -10%;height:120%;pointer-events:none;opacity:var(--aura,.15);' +
      'background:radial-gradient(60% 45% at 30% 0%,rgba(143,200,149,.95),transparent 70%),radial-gradient(45% 35% at 75% 5%,rgba(143,200,149,.5),transparent 70%),radial-gradient(40% 30% at 55% 0%,rgba(153,173,197,.45),transparent 70%)}',
    '.sky>*{position:relative}',
    '.eyebrow{font-family:' + SANS + ';font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--sky);margin:0}',
    '.word{font-family:' + DISPLAY + ';font-weight:700;text-transform:uppercase;letter-spacing:.02em;font-size:clamp(3.4rem,11vw,5.2rem);line-height:.9;margin:8px 0 6px;color:#fff}',
    '.word.l2,.word.l3{color:var(--bright)}',
    '.word.l4{color:var(--yellow)}',
    '.line{font-size:1.18rem;margin:0 0 14px;max-width:34em}',
    '.meter{display:flex;gap:4px;margin:0 0 18px;max-width:320px}',
    '.meter span{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.16)}',
    '.meter span.on{background:var(--bright)}',
    '.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
    '.fact{background:rgba(255,255,255,.06);border:1px solid rgba(153,173,197,.35);border-radius:2px;padding:12px 14px}',
    '.fact b{display:block;font-family:' + SANS + ';font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--sky);margin-bottom:3px}',
    '.fact span{display:block;font-size:1.06rem;font-weight:700}',
    '.fact small{display:block;font-family:' + SANS + ';font-size:.82rem;color:#D6DEE8;margin-top:2px}',
    '.now{margin:0 0 16px;padding:10px 14px;border-radius:2px;background:rgba(143,200,149,.16);border:1px solid var(--bright);font-weight:700}',
    '.next{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}',
    '.night{border:1px solid var(--line);border-radius:2px;padding:12px 14px;background:#fff}',
    '.night b{display:block;font-family:' + SANS + ';font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}',
    '.night .w{font-family:' + DISPLAY + ';font-size:2rem;line-height:1;text-transform:uppercase;color:var(--forest);margin:4px 0 2px}',
    '.night small{display:block;font-size:.9rem;color:var(--muted)}',
    '.night .flag{color:var(--ink);font-weight:700}',
    '.dots{display:inline-flex;gap:3px;vertical-align:middle;margin-left:8px}',
    '.dots i{width:7px;height:7px;border-radius:50%;background:var(--line)}',
    '.dots i.on{background:var(--forest)}',
    '.stamp{font-family:' + SANS + ';font-size:.78rem;color:var(--muted);margin:10px 0 0}',
    '.row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin-top:16px}',
    // calls to action: Dharma Gothic, all caps, on Deep Orange
    '.btn{display:inline-flex;align-items:center;min-height:46px;padding:8px 22px 6px;border-radius:2px;font-family:' + DISPLAY + ';font-weight:700;font-size:1.45rem;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;border:1px solid var(--orange);background:var(--orange);color:var(--ink)}',
    '.btn:hover{background:#D07556;border-color:#D07556}',
    '.quiet{font-size:1rem}',
    // history
    '.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 24px}',
    '.stat{border-top:3px solid var(--forest);padding:10px 2px 0}',
    '.stat .n{font-family:' + DISPLAY + ';font-weight:700;text-transform:uppercase;font-size:3.2rem;line-height:1;color:var(--forest)}',
    '.stat p{margin:4px 0 0;font-size:1rem}',
    '.chart{margin-top:22px}',
    '.chart-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:8px 16px;margin-bottom:6px}',
    '.chart-head p{margin:0;font-size:1.05rem;font-weight:700;max-width:36em}',
    '.chips{display:flex;gap:6px}',
    '.chip{font-family:' + SANS + ';font-size:.86rem;font-weight:700;height:36px;padding:0 12px;border-radius:2px;border:1px solid #9A9C9A;background:#fff;color:var(--ink);cursor:pointer}',
    '.chip[aria-pressed="true"]{background:var(--forest);border-color:var(--forest);color:#fff}',
    'svg{display:block;width:100%;height:auto;overflow:visible}',
    'svg text{font-family:' + SANS + ';fill:#5A5F61;font-size:12px}',
    'svg .val{fill:#25282A;font-weight:700}',
    'svg .grid{stroke:#E7E4DB;stroke-width:1}',
    'svg .bar{fill:var(--forest)}',
    'svg .bar.best{fill:var(--orange)}',
    'svg .bar.part{fill:var(--bright)}',
    'svg .hit{fill:transparent;cursor:default}',
    'svg .hit:focus{outline:none}',
    'svg g.on .bar{opacity:.75}',
    'svg .hit:focus-visible{stroke:#25282A;stroke-width:2}',
    '.cap{font-family:' + SANS + ';font-size:.82rem;color:var(--muted);margin:6px 0 0}',
    '.tip{position:absolute;z-index:10;pointer-events:none;background:var(--ink);color:#fff;font-family:' + SANS + ';font-size:.84rem;line-height:1.35;padding:7px 10px;border-radius:2px;max-width:240px;opacity:0;transition:opacity .1s}',
    '.tip.show{opacity:1}',
    'details{margin-top:8px;font-family:' + SANS + ';font-size:.88rem}',
    'summary{cursor:pointer;color:var(--forest);font-weight:700}',
    'table{border-collapse:collapse;margin-top:8px;font-size:.86rem}',
    'th,td{text-align:right;padding:3px 10px;border-bottom:1px solid var(--line)}',
    'th:first-child,td:first-child{text-align:left}',
    '.tablewrap{max-height:320px;overflow:auto}',
    '.recent{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}',
    '.recent li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:1rem}',
    '.recent em{font-style:normal;font-family:' + SANS + ';color:var(--muted);font-size:.82rem}',
    '.tips{margin:0;padding-left:1.2em;font-size:1.05rem;max-width:46em}',
    '.tips li{margin:0 0 6px}',
    '.note{font-family:' + SANS + ';font-size:.78rem;color:var(--muted);margin:2em 0 0;max-width:62em}',
    // planner
    '.sub{font-family:' + SANS + ';font-size:.76rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 6px}',
    '.wins{list-style:none;margin:0 0 18px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}',
    '.wins li{border:1px solid var(--line);border-top:4px solid var(--forest);border-radius:2px;padding:10px 12px;cursor:pointer;background:#fff}',
    '.wins li:hover{background:var(--wash)}',
    '.wins b{display:block;font-family:' + DISPLAY + ';font-weight:700;font-size:1.9rem;line-height:1;text-transform:uppercase;color:var(--forest)}',
    '.wins span{display:block;font-weight:700;font-size:.98rem;margin:4px 0 2px}',
    '.wins small{display:block;font-family:' + SANS + ';font-size:.8rem;color:var(--muted)}',
    '.legend{display:flex;gap:14px;font-family:' + SANS + ';font-size:.84rem;margin:0 0 8px}',
    '.legend span{display:inline-flex;align-items:center;gap:6px}',
    '.legend i{width:14px;height:14px;border-radius:2px;border:1px solid rgba(0,0,0,.08)}',
    '.cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px 22px}',
    '.month b{display:block;font-weight:700;font-size:1rem;margin-bottom:6px}',
    '.days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}',
    '.dow{font-family:' + SANS + ';font-size:.68rem;color:var(--muted);text-align:center}',
    '.d{position:relative;font-family:' + SANS + ';font-size:.8rem;aspect-ratio:1;min-height:28px;border:0;border-radius:2px;cursor:pointer;padding:0}',
    '.d.mark::after{content:"";position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:var(--orange)}',
    '.d.sel,.d:focus-visible{outline:2px solid var(--ink);outline-offset:1px}',
    '.detail{display:none;margin-top:14px;padding:14px 16px;border:1px solid var(--line);border-radius:2px;background:var(--wash)}',
    '.detail.show{display:block}',
    '.detail b{font-size:1.1rem}',
    '.detail p{margin:6px 0;font-size:1rem}',
    '.detail .btn{margin-top:6px}',
    '.err{padding:14px;border:1px solid var(--line);border-radius:2px;background:var(--wash)}',
    '.wrap{position:relative}',
    '@container (max-width:640px){.sky{padding:20px 16px 16px}.facts{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.recent{grid-template-columns:1fr}}',
    '@container (max-width:420px){.next{grid-template-columns:1fr}}'
  ].join('\n');

  // ---------- small helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function utc(s) { return new Date(/Z$/.test(s) ? s : s + 'Z'); }
  function fmt(d, o) { return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: TZ }, o)).format(d); }
  function clock(d) {
    var s = fmt(d, { hour: 'numeric', minute: '2-digit' });
    s = s.replace(' AM', ' a.m.').replace(' PM', ' p.m.').replace(':00 ', ' ');
    return s === '12 a.m.' ? 'midnight' : s === '12 p.m.' ? 'noon' : s;
  }
  function dayName(d) { return fmt(d, { weekday: 'long' }); }
  function longDate(iso) {
    var p = iso.split('-');
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])));
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function kpText(kp) { return 'Kp ' + (Math.round(kp * 10) / 10).toFixed(1).replace(/\.0$/, ''); }

  // ---------- sun and moon (after the suncalc formulas by Vladimir Agafonkin, BSD) ----------
  var rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, OBL = rad * 23.4397;
  function toDays(t) { return t / dayMs - 0.5 + J1970 - J2000; }
  function ra(l, b) { return Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)); }
  function dec(l, b) { return Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l)); }
  function alt(H, phi, d) { return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)); }
  function sidereal(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function sunCoords(d) {
    var M = rad * (357.5291 + 0.98560028 * d);
    var C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + rad * 102.9372 + Math.PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    var l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  var LW = rad * -LON, PHI = rad * LAT;
  function sunAlt(t) { var d = toDays(t), c = sunCoords(d); return alt(sidereal(d, LW) - c.ra, PHI, c.dec) / rad; }
  function moonAlt(t) { var d = toDays(t), c = moonCoords(d); return alt(sidereal(d, LW) - c.ra, PHI, c.dec) / rad; }
  function moonLit(t) {
    var d = toDays(t), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    var phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    var inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    return (1 + Math.cos(inc)) / 2;
  }

  // The dark stretches (sun below -12 degrees) from the current or next one onward.
  function darkNights(from, count, stepMin) {
    var step = (stepMin || 5) * 60000, t = from - 20 * 3600000, nights = [], cur = null;
    var end = from + (count + 1) * dayMs + 12 * 3600000;
    for (; t < end && nights.length < count; t += step) {
      var dark = sunAlt(t) < DARK;
      if (dark && !cur) cur = { start: t };
      if (!dark && cur) {
        cur.end = t;
        if (cur.end > from) nights.push(cur);
        cur = null;
      }
    }
    return nights;
  }

  // ---------- one night's outlook ----------
  function assess(n, kp, clouds) {
    // Kp: every 3-hour interval that overlaps the dark hours
    var blocks = kp.filter(function (b) { return b.t + 3 * 3600000 > n.start && b.t < n.end; });
    n.kp = blocks.length ? Math.max.apply(null, blocks.map(function (b) { return b.kp; })) : null;
    n.kpCovered = blocks.length && blocks[blocks.length - 1].t + 3 * 3600000 >= n.end;
    n.peak = null;
    blocks.forEach(function (b) { if (b.kp === n.kp && !n.peak) n.peak = b; });

    // Clouds: the hourly forecast through the dark hours, and the clearest three-hour stretch
    var hrs = clouds.filter(function (c) { return c.t >= n.start - 1800000 && c.t <= n.end; });
    if (hrs.length >= 3) {
      n.cloud = Math.round(hrs.reduce(function (a, c) { return a + c.v; }, 0) / hrs.length);
      var best = null;
      for (var i = 0; i + 2 < hrs.length; i++) {
        var v = (hrs[i].v + hrs[i + 1].v + hrs[i + 2].v) / 3;
        if (best === null || v < best.v) best = { v: Math.round(v), t: hrs[i].t };
      }
      n.clearest = best;
    }

    // Moon: how much of it is lit, and when it is up while it is dark
    var ups = [], step = 10 * 60000;
    for (var t = n.start; t <= n.end; t += step) ups.push({ t: t, up: moonAlt(t) > 0 });
    n.moonLit = Math.round(moonLit((n.start + n.end) / 2) * 100);
    n.moonUpShare = ups.filter(function (u) { return u.up; }).length / ups.length;
    n.moonText = moonText(ups);

    // Rating: the space-weather level, held back when clouds look likely to hide it
    n.level = n.kp === null ? null : kpLevel(n.kp);
    n.cloudy = false;
    if (n.level && n.clearest) {
      // Cloud forecasts more than a day out are rough, so clouds cost at most one step.
      if (n.clearest.v >= 70) { n.level = Math.max(0, n.level - 1); n.cloudy = true; }
    }
    return n;
  }
  function moonText(ups) {
    var first = ups[0].up, last = ups[ups.length - 1].up, change = null;
    for (var i = 1; i < ups.length; i++) if (ups[i].up !== ups[i - 1].up) { change = ups[i]; break; }
    if (!change) return first ? 'Up all night' : 'Below the horizon all night';
    if (first && !last) return 'Sets ' + clock(new Date(change.t));
    if (!first && last) return 'Rises ' + clock(new Date(change.t));
    return first ? 'Down for part of the night' : 'Up for part of the night';
  }
  function cloudWords(v) {
    return v < 20 ? 'Clear' : v < 45 ? 'Mostly clear' : v < 70 ? 'Partly cloudy' : v < 90 ? 'Mostly cloudy' : 'Overcast';
  }
  function nightLabel(n, i) {
    if (i === 0) return n.start <= Date.now() ? 'Tonight (now dark)' : 'Tonight';
    return dayName(new Date(n.start)) + ' night';
  }

  // ---------- OVATION nowcast near Medora ----------
  // The model gives the chance of aurora overhead on a 1-degree grid. From Medora a display can be
  // seen low in the north when it is overhead a few hundred miles away, so the band to the north counts.
  function ovationNear(data) {
    var north = 0, over = 0;
    (data.coordinates || []).forEach(function (c) {
      var lon = c[0], lat = c[1], p = c[2];
      if (lon >= 251 && lon <= 262 && lat >= 48 && lat <= 53) north = Math.max(north, p);
      if (lon >= 255 && lon <= 258 && lat >= 46 && lat <= 48) over = Math.max(over, p);
    });
    return { north: north, over: over, time: data['Forecast Time'] };
  }

  // ---------- render ----------
  var tip;
  function render(state) {
    root.innerHTML = '';
    root.appendChild(el('style', { text: CSS }));
    var wrap = el('div', { class: 'wrap' });
    root.appendChild(wrap);
    tip = el('div', { class: 'tip', role: 'tooltip' });
    wrap.appendChild(tip);

    if (opts.heading !== 'off' && !COMPACT) {
      wrap.appendChild(el('h2', { text: PLANNER_ONLY ? 'Plan a Northern Lights Trip' : 'Northern Lights Watch' }));
      if (!PLANNER_ONLY) wrap.appendChild(el('p', { class: 'intro', text: 'The Badlands sit far enough north, and far enough from city lights, for the aurora borealis to show over Medora several times a year. Here is the outlook for the next three nights, the best nights to plan a trip around, and what nearly a century of records says about when to come.' }));
    }

    if (PLANNER_ONLY) {
      if (!state.plan) wrap.appendChild(el('p', { class: 'err', text: state.done ? 'The trip planner could not be loaded just now.' : 'Loading the trip planner…' }));
    } else if (state.error && !state.nights) {
      wrap.appendChild(el('p', { class: 'err', text: 'The live forecast could not be loaded just now. Try again in a few minutes, or see NOAA’s aurora dashboard at swpc.noaa.gov.' }));
    } else if (state.nights) {
      renderOutlook(wrap, state);
    } else {
      wrap.appendChild(el('p', { class: 'err', text: 'Loading the northern lights outlook…' }));
    }

    if (COMPACT) {
      var r = el('div', { class: 'row' });
      r.appendChild(el('a', { class: 'quiet', href: MORE, text: 'See the full outlook and the best months to come' }));
      wrap.appendChild(r);
      return;
    }
    if (SHOW_HISTORY && state.history) renderPlanner(wrap, state);
    if (SHOW_HISTORY && state.history && !PLANNER_ONLY) renderHistory(wrap, state.history);
    if (!COMPACT) renderNote(wrap, state);
  }

  function renderOutlook(wrap, state) {
    var t = state.nights[0];
    var lvl = t.level === null ? 0 : t.level;
    var sky = el('section', { class: 'sky', 'aria-label': 'Tonight in Medora' });
    sky.style.setProperty('--aura', String([0.12, 0.3, 0.5, 0.75, 1][lvl]));
    sky.appendChild(el('p', { class: 'eyebrow', text: nightLabel(t, 0) + ' in Medora · ' + fmt(new Date(t.start), { weekday: 'short', month: 'short', day: 'numeric' }) }));

    if (state.active) sky.appendChild(el('p', { class: 'now', text: state.active }));

    sky.appendChild(el('p', { class: 'word l' + lvl, text: t.level === null ? 'No forecast' : LEVELS[lvl].word }));
    var line = t.level === null ? 'NOAA’s forecast does not reach this night yet.' : LEVELS[kpLevel(t.kp)].line;
    if (t.cloudy) line += ' Clouds may hide it.';
    sky.appendChild(el('p', { class: 'line', text: line }));
    var meter = el('div', { class: 'meter', role: 'img', 'aria-label': 'Level ' + lvl + ' of 4' });
    for (var i = 1; i <= 4; i++) meter.appendChild(el('span', { class: i <= lvl ? 'on' : '' }));
    sky.appendChild(meter);

    var facts = el('div', { class: 'facts' });
    facts.appendChild(fact('Space weather',
      t.kp === null ? 'Not forecast yet' : 'Up to ' + kpText(t.kp) + (t.kp >= 5 ? ' (storm)' : ''),
      t.peak ? 'Strongest around ' + clock(new Date(t.peak.t)) + '–' + clock(new Date(t.peak.t + 3 * 3600000)) : 'NOAA 3-day forecast'));
    facts.appendChild(fact('Sky',
      t.cloud === undefined ? 'Forecast not available' : cloudWords(t.cloud) + ' (' + t.cloud + '% cloud)',
      t.clearest && t.clearest.v + 10 < t.cloud ? 'Clearest from about ' + clock(new Date(t.clearest.t)) : 'Average after dark'));
    facts.appendChild(fact('Darkness',
      clock(new Date(t.start)) + ' to ' + clock(new Date(t.end)),
      'Moon ' + t.moonLit + '% lit · ' + t.moonText));
    sky.appendChild(facts);
    wrap.appendChild(sky);

    var next = el('div', { class: 'next' });
    state.nights.slice(1).forEach(function (n, k) {
      var c = el('div', { class: 'night' });
      var lv = n.level === null ? null : n.level;
      var b = el('b', { text: nightLabel(n, k + 1) });
      if (lv !== null) {
        var dots = el('span', { class: 'dots', 'aria-hidden': 'true' });
        for (var j = 1; j <= 4; j++) dots.appendChild(el('i', { class: j <= lv ? 'on' : '' }));
        b.appendChild(dots);
      }
      c.appendChild(b);
      c.appendChild(el('div', { class: 'w', text: lv === null ? 'Too early' : LEVELS[lv].word }));
      if (n.cloudy && n.kp >= 5) c.appendChild(el('small', { class: 'flag', text: 'Storm forecast, but clouds may hide it' }));
      var bits = [];
      bits.push(n.kp === null ? 'Space weather not forecast yet' : 'Up to ' + kpText(n.kp));
      if (n.cloud !== undefined) bits.push(cloudWords(n.cloud).toLowerCase() + ' (' + n.cloud + '% cloud)');
      c.appendChild(el('small', { text: bits.join(', ') }));
      c.appendChild(el('small', { text: 'Dark ' + clock(new Date(n.start)) + ' to ' + clock(new Date(n.end)) + ' · moon ' + n.moonLit + '% lit' }));
      next.appendChild(c);
    });
    wrap.appendChild(next);

    var stamp = 'Mountain Time. Updated ' + clock(new Date(state.loaded)) + ' from NOAA Space Weather Prediction Center and Open-Meteo forecasts.';
    if (state.error) stamp += ' Some data could not be loaded.';
    wrap.appendChild(el('p', { class: 'stamp', text: stamp }));

    if (CTA && !COMPACT) {
      var row = el('div', { class: 'row' });
      row.appendChild(el('a', { class: 'btn', href: CTA, text: 'Find a place to stay in Medora' }));
      wrap.appendChild(row);
    }
  }
  function fact(label, value, sub) {
    var f = el('div', { class: 'fact' });
    f.appendChild(el('b', { text: label }));
    f.appendChild(el('span', { text: value }));
    if (sub) f.appendChild(el('small', { text: sub }));
    return f;
  }

  // ---------- trip planner ----------
  // Every night for the next year gets a planning score:
  //   the share of nights around that date (since 1940) with Kp 5+ after dark under a mostly clear sky
  //   x how active the sun has been at the same point in past solar cycles
  //   x a moonlight discount (a bright moon washes out fainter displays)
  //   x NOAA's 45-day geomagnetic outlook, where it reaches
  // Nights are then ranked against each other: the top tenth are "Best", and so on.
  function isoLocal(t) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function doyOf(iso) {
    var p = iso.split('-');
    return Math.min(365, Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(+p[0], 0, 0)) / dayMs));
  }
  function buildPlan(h, ap, live) {
    var nights = darkNights(Date.now(), PLAN_NIGHTS, 10);
    var maxYears = h.cycle.max_years, lastMax = maxYears[maxYears.length - 1];
    var factors = h.cycle.factor_by_years_after_max;
    var apByDay = {};
    (ap || []).forEach(function (a) { apByDay[a.day] = a.ap; });
    nights.forEach(function (n, i) {
      n.date = isoLocal(n.start);
      var doy = doyOf(n.date);
      n.p5 = h.season.p['5'][doy - 1];
      n.p7 = h.season.p['7'][doy - 1];
      var yrs = +n.date.slice(0, 4) - lastMax;
      n.cycle = factors[String(Math.max(0, Math.min(11, yrs)))] || 1;
      var ups = 0, samples = 0;
      for (var t = n.start; t <= n.end; t += 20 * 60000) { samples++; if (moonAlt(t) > 0) ups++; }
      n.moonLit = Math.round(moonLit((n.start + n.end) / 2) * 100);
      n.moonUp = ups / samples;
      n.moonFactor = 1 - 0.5 * (n.moonLit / 100) * n.moonUp;
      n.ap = apByDay[new Date((n.start + n.end) / 2).toISOString().slice(0, 10)];
      n.apFactor = n.ap >= 30 ? 2 : n.ap >= 16 ? 1.5 : 1;
      n.odds = n.p5 * n.cycle * n.moonFactor;
      n.score = n.odds * n.apFactor;
      if (live && live[i] && live[i].level !== null && isoLocal(live[i].start) === n.date) n.live = live[i];
    });
    var sorted = nights.map(function (n) { return n.score; }).sort(function (a, b) { return b - a; });
    var cut = function (q) { return sorted[Math.floor(q * (sorted.length - 1))]; };
    var c1 = cut(0.10), c2 = cut(0.35), c3 = cut(0.70);
    nights.forEach(function (n) {
      n.tier = n.score >= c1 ? 3 : n.score >= c2 ? 2 : n.score >= c3 ? 1 : 0;
      if (n.live) {
        // The 3-day forecast outranks the long-range odds, for the rating and the best stretches alike.
        n.tier = [0, 1, 2, 3, 3][n.live.level];
        n.score = [0, c3, c2, c1, c1 * 1.5][n.live.level];
      }
    });
    return nights;
  }
  function oneIn(p) {
    if (p <= 0) return 'rare';
    var n = Math.round(1 / p);
    return n <= 1 ? 'most nights' : 'about 1 night in ' + n;
  }
  function bestWindows(plan, count) {
    // Three-night stretches with the highest combined score, at least a week apart.
    var wins = [];
    for (var i = 1; i + 2 < plan.length; i++) {
      wins.push({ i: i, s: plan[i].score + plan[i + 1].score + plan[i + 2].score });
    }
    wins.sort(function (a, b) { return b.s - a.s; });
    var out = [];
    wins.forEach(function (w) {
      if (out.length >= count) return;
      if (out.some(function (o) { return Math.abs(o.i - w.i) < 10; })) return;
      out.push(w);
    });
    return out.sort(function (a, b) { return a.i - b.i; }).map(function (w) { return plan.slice(w.i, w.i + 3); });
  }
  function windowReason(ns) {
    var r = [];
    var lit = Math.max.apply(null, ns.map(function (n) { return n.moonLit * n.moonUp; }));
    if (lit < 15) r.push('moonless nights');
    else if (lit < 40) r.push('little moonlight');
    var m = +ns[1].date.slice(5, 7);
    if (m === 9 || m === 10) r.push('fall storm season');
    else if (m === 3 || m === 4) r.push('spring storm season');
    else if (m >= 11 || m <= 2) r.push('long winter nights');
    if (ns.some(function (n) { return n.ap >= 16; })) r.push('NOAA expects active conditions');
    var s = r.join(', ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Good seasonal odds';
  }
  function shortDate(iso, withDay) {
    var p = iso.split('-');
    return new Intl.DateTimeFormat('en-US', Object.assign({ month: 'short', day: 'numeric', timeZone: 'UTC' }, withDay ? { weekday: 'short' } : {}))
      .format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])));
  }
  function rangeText(ns) {
    var a = ns[0].date, b = ns[ns.length - 1].date;
    var ap = a.split('-'), bp = b.split('-');
    var sa = shortDate(a);
    return ap[1] === bp[1] ? sa + '–' + (+bp[2]) : sa + '–' + shortDate(b);
  }

  function renderPlanner(wrap, state) {
    if (!state.plan) return;
    var plan = state.plan;
    if (!PLANNER_ONLY) wrap.appendChild(el('h3', { text: 'Plan a trip' }));
    wrap.appendChild(el('p', { class: 'intro', text: 'No one can forecast the northern lights more than a few days out, but the odds can be stacked. The best nights to plan around fall in the right season, during the sun’s active years, away from a bright moon. Every night for the next year is rated below; the best nights rise to the top as NOAA’s longer outlook comes into range.' }));

    // Best upcoming stretches
    var wins = bestWindows(plan, 5);
    var list = el('ol', { class: 'wins' });
    wins.forEach(function (ns) {
      var odds = ns.reduce(function (a, n) { return a + n.odds; }, 0);
      var li = el('li', {});
      li.appendChild(el('b', { text: rangeText(ns) }));
      li.appendChild(el('span', { text: windowReason(ns) }));
      li.appendChild(el('small', { text: 'In past years, about a ' + Math.round(100 * (1 - ns.reduce(function (a, n) { return a * (1 - n.odds); }, 1))) + '% chance of aurora-strength activity under a clear sky on at least one of the three nights' }));
      li.addEventListener('click', function () { select(ns[0]); });
      list.appendChild(li);
    });
    wrap.appendChild(el('p', { class: 'sub', text: 'Best three-night stretches in the next year' }));
    wrap.appendChild(list);

    // Calendar
    var legend = el('div', { class: 'legend', 'aria-hidden': 'true' });
    TIERS.forEach(function (t) {
      legend.appendChild(el('span', {}, [el('i', { style: 'background:' + t.color }), t.word]));
    });
    wrap.appendChild(legend);

    var months = [];
    plan.forEach(function (n) {
      var key = n.date.slice(0, 7);
      if (!months.length || months[months.length - 1].key !== key) months.push({ key: key, nights: [] });
      months[months.length - 1].nights.push(n);
    });
    var cal = el('div', { class: 'cal' });
    var detail = el('div', { class: 'detail', 'aria-live': 'polite' });
    var showAll = false;
    var buttons = {};
    function drawCal() {
      cal.innerHTML = '';
      months.slice(0, showAll ? 13 : (chartWidth() < 500 ? 3 : 6)).forEach(function (m) {
        var p = m.key.split('-');
        var box = el('div', { class: 'month' });
        box.appendChild(el('b', { text: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+p[0], +p[1] - 1, 1))) }));
        var grid = el('div', { class: 'days', role: 'group', 'aria-label': 'Nights in this month' });
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) { grid.appendChild(el('span', { class: 'dow', text: d, 'aria-hidden': 'true' })); });
        var first = new Date(Date.UTC(+p[0], +p[1] - 1, 1)).getUTCDay();
        var startDay = +m.nights[0].date.slice(8, 10);
        for (var k = 0; k < first + startDay - 1; k++) grid.appendChild(el('span', {}));
        m.nights.forEach(function (n) {
          var t = TIERS[n.tier];
          var b = el('button', { type: 'button', class: 'd', style: 'background:' + t.color + ';color:' + t.ink,
            'aria-label': shortDate(n.date, true) + ': ' + t.word + (n.ap >= 16 ? ', NOAA outlook active' : ''), text: String(+n.date.slice(8, 10)) });
          if (n.ap >= 16 || n.live) b.classList.add('mark');
          b.addEventListener('click', function () { select(n); });
          buttons[n.date] = b;
          grid.appendChild(b);
        });
        box.appendChild(grid);
        cal.appendChild(box);
      });
    }
    drawCal();
    wrap.appendChild(cal);
    var more = el('button', { type: 'button', class: 'chip', text: 'Show the full year' });
    more.addEventListener('click', function () { showAll = !showAll; more.textContent = showAll ? 'Show fewer months' : 'Show the full year'; drawCal(); });
    wrap.appendChild(el('div', { class: 'row' }, [more, el('span', { class: 'cap', text: 'Tap a night for details. A dot marks nights in NOAA’s 3-day forecast or 45-day outlook.' })]));
    wrap.appendChild(detail);

    function select(n) {
      Object.keys(buttons).forEach(function (k) { buttons[k].classList.toggle('sel', k === n.date); });
      detail.innerHTML = '';
      var t = TIERS[n.tier];
      detail.appendChild(el('b', { text: shortDate(n.date, true) + ' night: ' + t.word }));
      var lines = [];
      if (n.live) lines.push('NOAA’s 3-day forecast: ' + LEVELS[n.live.level].word.toLowerCase() + ', up to ' + kpText(n.live.kp) + '. See the outlook above.');
      if (n.ap !== undefined) lines.push('NOAA’s 45-day outlook: ' + (n.ap >= 50 ? 'major storm' : n.ap >= 30 ? 'storm' : n.ap >= 16 ? 'active' : n.ap >= 8 ? 'unsettled' : 'quiet') + ' conditions (planetary A index ' + n.ap + ').');
      lines.push('In past years, ' + oneIn(n.p5) + ' around this date brought aurora-strength activity (Kp 5+) after dark under a mostly clear sky' +
        (n.cycle > 1.05 ? '. The sun is in the active years after its peak, which have run about ' + Math.round((n.cycle - 1) * 100) + '% above average.' : n.cycle < 0.95 ? '. The sun will be in its quieter years, which have run about ' + Math.round((1 - n.cycle) * 100) + '% below average.' : '.'));
      lines.push('Dark from ' + clock(new Date(n.start)) + ' to ' + clock(new Date(n.end)) + (/\.$/.test(clock(new Date(n.end))) ? ' ' : '. ') + 'Moon ' + n.moonLit + '% lit' + (n.moonUp < 0.05 ? ', below the horizon all night.' : n.moonUp > 0.95 ? ', up all night.' : ', up for ' + Math.round(n.moonUp * 100) + '% of the dark hours.'));
      lines.forEach(function (l) { detail.appendChild(el('p', { text: l })); });
      if (CTA) detail.appendChild(el('a', { class: 'btn', href: CTA + (/\?/.test(CTA) ? '&' : '?') + 'checkin=' + n.date + '&nights=2', text: 'Check lodging for this night' }));
      detail.classList.add('show');
    }
  }

  // ---------- history ----------
  function renderHistory(wrap, h) {
    wrap.appendChild(el('h3', { text: 'When to come' }));

    var months = h.monthly.slice().sort(function (a, b) { return b.clear['5'] - a.clear['5']; });
    var best = months.slice(0, 2).map(function (m) { return m.month; }).sort(function (a, b) { return a - b; });

    var stats = el('div', { class: 'stats' });
    stats.appendChild(stat(Math.round(h.per_year_clear['5']), 'nights a year, on average, bring aurora-strength activity after dark under a mostly clear Medora sky.'));
    stats.appendChild(stat(MONTHS[best[0] - 1].slice(0, 3) + ' & ' + MONTHS[best[1] - 1].slice(0, 3), 'are the best months: storms peak near the fall equinox, the nights lengthen, and the skies stay clearer than in spring.'));
    var big = h.last['7'];
    stats.appendChild(stat(big ? longDate(big) : '—', big ? 'brought the most recent strong storm (Kp 7 or higher) after dark.' : 'No strong storms on record.'));
    wrap.appendChild(stats);

    monthChart(wrap, h, best);
    yearChart(wrap, h);

    if (h.recent && h.recent.length) {
      wrap.appendChild(el('h3', { text: 'Recent big nights' }));
      var ul = el('ul', { class: 'recent' });
      h.recent.slice(0, 10).forEach(function (r) {
        ul.appendChild(el('li', {}, [
          el('span', { text: longDate(r.night) }),
          el('span', {}, [kpText(r.kp) + ' ', el('em', { text: r.clear ? 'clear in Medora' : 'clouds in Medora' })])
        ]));
      });
      wrap.appendChild(ul);
    }

    wrap.appendChild(el('h3', { text: 'How to see them' }));
    var tips = el('ul', { class: 'tips' });
    [
      'Face north, away from town lights. A wide view of the northern horizon matters more than height.',
      'Give your eyes 20 minutes to adjust, and keep your phone screen dim.',
      'Try your phone’s night mode. Cameras often pick up color the eye sees only as a pale glow.',
      'Displays come and go. A storm night can be quiet for an hour, then light up. Check back here, or NOAA’s 30-minute forecast.'
    ].forEach(function (t) { tips.appendChild(el('li', { text: t })); });
    wrap.appendChild(tips);
  }
  function stat(n, text) {
    var s = el('div', { class: 'stat' });
    s.appendChild(el('div', { class: 'n', text: String(n) }));
    s.appendChild(el('p', { text: text }));
    return s;
  }

  function showTip(evt, text) {
    var box = root.querySelector('.wrap').getBoundingClientRect();
    var r = evt.target.getBoundingClientRect();
    tip.textContent = text;
    tip.classList.add('show');
    var x = r.left + r.width / 2 - box.left - tip.offsetWidth / 2;
    x = Math.max(0, Math.min(x, box.width - tip.offsetWidth));
    tip.style.left = x + 'px';
    tip.style.top = (r.top - box.top - tip.offsetHeight - 8) + 'px';
  }
  function hideTip() { tip.classList.remove('show'); }

  function monthChart(wrap, h, best) {
    var box = el('div', { class: 'chart' });
    var head = el('div', { class: 'chart-head' });
    var cap = el('p', {});
    head.appendChild(cap);
    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Storm strength' });
    var LV = [['5', 'Kp 5+'], ['6', 'Kp 6+'], ['7', 'Kp 7+']];
    var cur = '5';
    LV.forEach(function (l) {
      var b = el('button', { class: 'chip', type: 'button', 'aria-pressed': l[0] === cur ? 'true' : 'false', text: l[1] });
      b.addEventListener('click', function () { cur = l[0]; draw(); });
      chips.appendChild(b);
    });
    head.appendChild(chips);
    box.appendChild(head);
    var holder = el('div', {});
    box.appendChild(holder);
    box.appendChild(el('p', { class: 'cap', text: 'Average nights a year with Kp ' + '5, 6 or 7 or higher during darkness and under half cloud cover, ' + h.method.cloud_years[0] + '–' + h.method.cloud_years[1] + '. Kp 5 usually brings the lights to the northern horizon at Medora; Kp 7 can bring them overhead.' }));

    var table = el('table', {});
    table.appendChild(el('tr', {}, [el('th', { text: 'Month' }), el('th', { text: 'Kp 5+' }), el('th', { text: 'Kp 6+' }), el('th', { text: 'Kp 7+' }), el('th', { text: 'Kp 5+, any sky' })]));
    h.monthly.forEach(function (m) {
      table.appendChild(el('tr', {}, [el('td', { text: MONTHS[m.month - 1] }), el('td', { text: m.clear['5'].toFixed(1) }), el('td', { text: m.clear['6'].toFixed(1) }), el('td', { text: m.clear['7'].toFixed(1) }), el('td', { text: m.nights['5'].toFixed(1) })]));
    });
    box.appendChild(el('details', {}, [el('summary', { text: 'Show the numbers' }), table]));
    wrap.appendChild(box);

    function draw() {
      chips.querySelectorAll('.chip').forEach(function (b, i) { b.setAttribute('aria-pressed', LV[i][0] === cur ? 'true' : 'false'); });
      cap.textContent = 'Clear nights a year with Kp ' + cur + ' or higher after dark, by month';
      var vals = h.monthly.map(function (m) { return m.clear[cur]; });
      var max = Math.max.apply(null, vals);
      var nice = max <= 0.5 ? 0.5 : max <= 1 ? 1 : max <= 2 ? 2 : max <= 3 ? 3 : Math.ceil(max);
      var W = chartWidth(), H = W < 500 ? 200 : 240, L = 34, B = 26, T = 18, bw = (W - L) / 12;
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cap.textContent });
      var ticks = nice <= 1 ? [0, nice / 2, nice] : [0, nice / 2, nice];
      ticks.forEach(function (v) {
        var y = H - B - (v / nice) * (H - B - T);
        s.appendChild(svg('line', { class: 'grid', x1: L, x2: W, y1: y, y2: y }));
        var tx = svg('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }); tx.textContent = (v % 1 ? v.toFixed(1) : v); s.appendChild(tx);
      });
      h.monthly.forEach(function (m, i) {
        var v = m.clear[cur], x = L + i * bw + bw * 0.18, w = bw * 0.64;
        var bh = (v / nice) * (H - B - T), y = H - B - bh;
        var g = svg('g', {});
        var isBest = best.indexOf(m.month) >= 0;
        var text = MONTHS[m.month - 1] + ': ' + v.toFixed(1) + ' clear nights a year at Kp ' + cur + '+ (' + m.nights[cur].toFixed(1) + ' counting cloudy nights)';
        var hit = svg('rect', { class: 'hit', x: L + i * bw, y: T - 10, width: bw, height: H - B - T + 10, tabindex: '0', 'aria-label': text });
        var path = svg('path', { class: 'bar' + (isBest ? ' best' : ''), d: roundTop(x, y, w, bh, 4) });
        g.appendChild(hit); g.appendChild(path);
        var lab = svg('text', { x: x + w / 2, y: H - 8, 'text-anchor': 'middle' }); lab.textContent = W < 500 ? MONTHS[m.month - 1].charAt(0) : MONTHS[m.month - 1].slice(0, 3); g.appendChild(lab);
        if (isBest) { var vl = svg('text', { class: 'val', x: x + w / 2, y: y - 6, 'text-anchor': 'middle' }); vl.textContent = v.toFixed(1); g.appendChild(vl); }
        ['mouseenter', 'focus'].forEach(function (e) { hit.addEventListener(e, function (ev) { g.classList.add('on'); showTip(ev, text); }); });
        ['mouseleave', 'blur'].forEach(function (e) { hit.addEventListener(e, function () { g.classList.remove('on'); hideTip(); }); });
        s.appendChild(g);
      });
      holder.innerHTML = '';
      holder.appendChild(s);
    }
    draw();
  }

  function yearChart(wrap, h) {
    var box = el('div', { class: 'chart' });
    var head = el('div', { class: 'chart-head' });
    head.appendChild(el('p', { text: 'Nights a year with Kp 5 or higher after dark, ' + h.yearly[0].year + ' to today' }));
    box.appendChild(head);
    var ys = h.yearly;
    var max = Math.max.apply(null, ys.map(function (y) { return y.n5; }));
    var nice = Math.ceil(max / 20) * 20;
    var W = chartWidth(), H = 200, L = 34, B = 24, T = 10, bw = (W - L) / ys.length;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Nights a year with Kp 5 or higher after dark at Medora, by year' });
    [0, nice / 2, nice].forEach(function (v) {
      var y = H - B - (v / nice) * (H - B - T);
      s.appendChild(svg('line', { class: 'grid', x1: L, x2: W, y1: y, y2: y }));
      var tx = svg('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }); tx.textContent = v; s.appendChild(tx);
    });
    ys.forEach(function (y, i) {
      var bh = (y.n5 / nice) * (H - B - T), x = L + i * bw;
      var g = svg('g', {});
      var text = y.year + ': ' + y.n5 + ' nights at Kp 5+' + (y.partial ? ' so far' : '') + (y.sunspots !== null ? ' · average sunspot number ' + y.sunspots : '');
      var hit = svg('rect', { class: 'hit', x: x, y: T, width: bw, height: H - B - T });
      var bar = svg('path', { class: 'bar' + (y.partial ? ' part' : ''), d: roundTop(x + bw * 0.12, H - B - bh, bw * 0.76, bh, Math.min(2, bw * 0.3)) });
      g.appendChild(hit); g.appendChild(bar);
      if (y.year % (W < 500 ? 20 : 10) === 0) { var lab = svg('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }); lab.textContent = y.year; g.appendChild(lab); }
      hit.addEventListener('mouseenter', function (ev) { g.classList.add('on'); showTip(ev, text); });
      hit.addEventListener('mouseleave', function () { g.classList.remove('on'); hideTip(); });
      s.appendChild(g);
    });
    box.appendChild(s);
    var sn = h.sunspots || {};
    var cf = h.cycle.factor_by_years_after_max, after = Math.round(((cf['2'] + cf['3'] + cf['4']) / 3 - 1) * 100);
    box.appendChild(el('p', { class: 'cap', text: 'The peaks follow the sun\u2019s 11-year cycle. The latest cycle peaked around late 2024. In past cycles, the second through fourth years after a peak brought about ' + after + '% more aurora nights than average, as the sun\u2019s storms shift to steadier streams that return every 27 days. Over the past year the sunspot number has averaged ' + sn.last_12_months + ', against a long-run average of ' + sn.long_run + '.' }));
    var table = el('table', {});
    table.appendChild(el('tr', {}, [el('th', { text: 'Year' }), el('th', { text: 'Nights at Kp 5+' }), el('th', { text: 'Kp 6+' }), el('th', { text: 'Kp 7+' }), el('th', { text: 'Sunspot number' })]));
    ys.slice().reverse().forEach(function (y) {
      table.appendChild(el('tr', {}, [el('td', { text: y.year + (y.partial ? ' (so far)' : '') }), el('td', { text: String(y.n5) }), el('td', { text: String(y.n6) }), el('td', { text: String(y.n7) }), el('td', { text: y.sunspots === null ? '' : String(y.sunspots) })]));
    });
    box.appendChild(el('details', {}, [el('summary', { text: 'Show the numbers' }), el('div', { class: 'tablewrap' }, [table])]));
    wrap.appendChild(box);
  }
  // Charts are drawn at the width they will show at, so their text stays at its real size.
  function chartWidth() { return Math.max(300, Math.min(1100, Math.round(host.getBoundingClientRect().width || 720))); }
  function roundTop(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, h, w / 2);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  function renderNote(wrap, state) {
    var h = state.history;
    var txt = 'Forecasts of space weather are uncertain, especially more than a day out, and a forecast storm can arrive early, late or not at all. ' +
      'Live data: NOAA Space Weather Prediction Center (Kp forecast and 30-minute OVATION aurora model) and Open-Meteo cloud forecasts. ';
    if (h) txt += 'History: Kp index since ' + h.method.kp_years[0] + ' from GFZ Potsdam (CC BY 4.0); cloud cover since ' + h.method.cloud_years[0] +
      ' from the ERA5 reanalysis via Open-Meteo (CC BY 4.0). A night counts when the Kp level is reached while the sun is at least 12 degrees below the horizon at Medora; "mostly clear" means under half cloud cover for that stretch. Rebuilt ' +
      fmt(new Date(h.generated), { month: 'short', day: 'numeric', year: 'numeric' }) + '.';
    wrap.appendChild(el('p', { class: 'note', text: txt }));
  }

  // ---------- load ----------
  var state = { loaded: Date.now() };
  render(state);

  function load() {
    state.loaded = Date.now();
    state.error = false;
    var now = Date.now();
    var kpP = getJSON(URLS.kp).then(function (rows) {
      // Older files had a header row of strings; current files are objects.
      return rows.filter(function (r) { return r && !Array.isArray(r) || (Array.isArray(r) && !isNaN(parseFloat(r[1]))); })
        .map(function (r) { return Array.isArray(r) ? { t: utc(r[0]).getTime(), kp: parseFloat(r[1]), kind: r[2] } : { t: utc(r.time_tag).getTime(), kp: +r.kp, kind: r.observed }; });
    }).catch(function () { state.error = true; return []; });
    var cloudP = getJSON(URLS.clouds).then(function (d) {
      return d.hourly.time.map(function (t, i) { return { t: utc(t).getTime(), v: d.hourly.cloud_cover[i] }; })
        .filter(function (c) { return c.v !== null; });
    }).catch(function () { state.error = true; return []; });
    var nowP = getJSON(URLS.kpNow).then(function (rows) {
      var last = rows[rows.length - 1];
      return last ? { kp: +last.estimated_kp, t: utc(last.time_tag).getTime() } : null;
    }).catch(function () { return null; });
    var histP = SHOW_HISTORY ? getJSON(URLS.history).catch(function () { return null; }) : Promise.resolve(null);
    var apP = SHOW_HISTORY ? getJSON(URLS.ap45).then(function (d) {
      return (d.data || []).filter(function (x) { return x.metric === 'ap'; })
        .map(function (x) { return { day: x.time.slice(0, 10), ap: +x.value }; });
    }).catch(function () { return []; }) : Promise.resolve([]);

    Promise.all([kpP, cloudP, nowP, histP, apP]).then(function (res) {
      var kp = res[0], clouds = res[1], kpNow = res[2];
      state.history = res[3];
      state.done = true;
      if (!kp.length && !clouds.length) {
        state.error = true;
        if (state.history) state.plan = buildPlan(state.history, res[4], null);
        render(state);
        return;
      }
      state.nights = darkNights(now, 3).map(function (n) { return assess(n, kp, clouds); });
      if (state.history) state.plan = buildPlan(state.history, res[4], state.nights);

      // Dark right now, with activity building? Check NOAA's 30-minute model for the sky north of Medora.
      state.active = null;
      var t0 = state.nights[0];
      var darkNow = t0.start <= now && now < t0.end;
      if (darkNow && kpNow && kpNow.kp >= 4) {
        getJSON(URLS.ovation).then(function (o) {
          var near = ovationNear(o);
          if (kpNow.kp >= 5 || near.north >= 10) {
            state.active = 'Active now: ' + kpText(kpNow.kp) + ', with NOAA’s model showing a ' + near.north + '% chance of aurora in the sky to the north. Head outside and look north.';
          } else if (near.north >= 3) {
            state.active = 'Building now: ' + kpText(kpNow.kp) + '. Worth a look north, especially with a camera.';
          }
          render(state);
        }).catch(function () {
          if (kpNow.kp >= 5) state.active = 'Active now: ' + kpText(kpNow.kp) + '. Head outside and look north.';
          render(state);
        });
      }
      render(state);
    });
  }
  load();
  // Redraw when the space it sits in changes size (phone rotation, window resize).
  var lastW = chartWidth(), rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = chartWidth();
      if (Math.abs(w - lastW) > 40 && state.done) { lastW = w; render(state); }
    }, 250);
  });
  // Keep a page left open current: refresh every 15 minutes while it is visible.
  setInterval(function () { if (!document.hidden) load(); }, 15 * 60000);
})();
