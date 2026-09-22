'use strict';

const NS = 'http://www.w3.org/2000/svg';

const DOMAIN_COLORS = {
  'Unknown':               '#8892a4',
  'Language':              '#00c8d4',
  'Multimodal':            '#f0a500',
  'Vision':                '#a78bfa',
  'Audio':                 '#34d399',
  'Reinforcement Learning':'#fb923c',
  'Code':                  '#38bdf8',
  'Biology':               '#f472b6',
  'Robotics':              '#fbbf24',
  'Other':                 '#4b5568',
};

const HW_COLORS = {
  'NVIDIA':      '#76b900',
  'Google':      '#f0a500',
  'AMD':         '#ef4444',
  'Meta':        '#4895ef',
  'Amazon AWS':  '#fb923c',
  'Apple':       '#94a3b8',
  'Intel':       '#14b8a6',
  'Huawei':      '#ffd60a',
  'Microsoft':   '#38bdf8',
  'Other':       '#4b5568',
};

const COUNTRY_COLORS = {
  'Unknown':                 '#8892a4',
  'Multiple countries':      '#94a3b8',
  'United States of America': '#00c8d4',
  'China':                    '#f0a500',
  'United Kingdom':           '#a78bfa',
  'France':                   '#818cf8',
  'Canada':                   '#34d399',
  'Germany':                  '#e879f9',
  'Israel':                   '#38bdf8',
  'UAE':                      '#fbbf24',
  'Japan':                    '#fb923c',
  'South Korea':              '#f472b6',
  'Switzerland':              '#4ade80',
  'Russia':                   '#f87171',
  'India':                    '#c084fc',
  'Australia':                '#67e8f9',
  'Netherlands':              '#86efac',
  'Other':                    '#4b5568',
};

const COUNTRY_ALIASES = {
  'Hong Kong':               'China',
  'Hong Kong SAR':           'China',
  'Macau':                   'China',
  'United States':           'United States of America',
  'USA':                     'United States of America',
  'US':                      'United States of America',
  'UK':                      'United Kingdom',
  'Great Britain':           'United Kingdom',
  'Korea':                   'South Korea',
  'Republic of Korea':       'South Korea',
  'United Arab Emirates':    'UAE',
  'Emirates':                'UAE',
};

function normalizeCountry(country) {
  if (!country || !String(country).trim()) return 'Unknown';
  const countries = [...new Set(String(country).split(',').map(t => t.trim()).filter(Boolean).map(t => COUNTRY_ALIASES[t] || (t === 'United Kingdom of Great Britain and Northern Ireland' ? 'United Kingdom' : t)))];
  return countries.length > 1 ? 'Multiple countries' : countries[0] || 'Unknown';
}

const ORG_PALETTE = [
  '#00c8d4','#f0a500','#a78bfa','#34d399','#fb923c',
  '#f472b6','#38bdf8','#fbbf24','#e879f9','#818cf8','#4b5568'
];

const YEAR_BUCKET_COLORS = {
  '2012–2017': '#818cf8',
  '2018–2020': '#38bdf8',
  '2021–2022': '#34d399',
  '2023':      '#f0a500',
  '2024':      '#fb923c',
  '2025+':     '#ff5f5f',
};

const LANDMARKS = [
  { name:'GPT-3',        label:'GPT-3\n2020' },
  { name:'AlphaFold 2',  label:'AlphaFold 2\n2020' },
  { name:'PaLM',         label:'PaLM\n2022' },
  { name:'GPT-4',        label:'GPT-4\n2023' },
  { name:'Gemini Ultra', label:'Gemini Ultra\n2023' },
  { name:'Claude 3 Opus',label:'Claude 3\n2024' },
];

const CONF_COLORS = {
  'Confident':   '#34d399',
  'Likely':      '#f0a500',
  'Speculative': '#ff5f5f',
  'Unknown':     '#8892a4',
};
function normalizeConfidence(level) {
  return CONF_COLORS[level] ? level : 'Unknown';
}
function confColor(level) {
  return CONF_COLORS[normalizeConfidence(level)];
}
function confClass(level) {

  return 'conf-' + normalizeConfidence(level).toLowerCase();
}
function confTTDot(level) {

  return `<span class="conf-tt-dot ${confClass(level)}"></span>`;
}

const AppState = {
  dateRange: [new Date('2012-01-01'), new Date('2026-12-31')],
  activeTab: 'overview',
  filters: {
    domain: null,
    frontierOnly: false,
    hwTypes: new Set(['GPU','TPU','Other']),
    selectedOrg: null,
    showTrend: true,

    costConfidenceMode: 'all',
  },
  data: { models: [], hardware: [] },
  orgColors: {},
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function emptyChart(container, message = 'No data in selected range') {
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted);font-size:.75rem">${escapeHTML(message)}</div>`;
}
function annualMax(rows, dateKey, valueKey) {
  const years = new Map();
  rows.forEach(row => {
    if (!row[dateKey] || !(row[valueKey] > 0)) return;
    const year = row[dateKey].getFullYear();
    if (!years.has(year) || row[valueKey] > years.get(year).value)
      years.set(year, {year, value:row[valueKey], row});
  });
  return [...years.values()].sort((a,b) => a.year-b.year);
}
function indexedGrowth(models, hardware) {
  const modelMax = annualMax(models.filter(m => m.frontier), 'date', 'flop');
  const chipMax = annualMax(hardware, 'releaseDate', 'fp16');
  const common = modelMax.map(p => p.year).filter(y => chipMax.some(p => p.year === y));
  const baseYear = common.includes(2016) ? 2016 : common[0];
  if (baseYear === undefined) return null;
  const normalize = series => {
    const base = series.find(p => p.year === baseYear).value;
    return series.filter(p => p.year >= baseYear).map(p => ({...p, rawValue:p.value, value:p.value/base}));
  };
  return {baseYear, models:normalize(modelMax), hardware:normalize(chipMax)};
}
function acceleratorObservations(models) {
  return models.filter(m => m.frontier && m.date && m.quantity > 0 && Number.isInteger(m.quantity) &&
    (/NVIDIA|Google TPU|Huawei Ascend/i.test(m.trainingHardware) || /\bGPU\b/i.test(m.dataCenter)));
}
function bindPoint(point, tooltip) {
  point.addEventListener('mouseenter', ev => showTT(ev, tooltip));
  point.addEventListener('mousemove', moveTT);
  point.addEventListener('mouseleave', hideTT);
}

function drawAnnualChart(container, series, {log=true, label='', tickFormat=null}={}) {
  const points = series.flatMap(s => s.points);
  if (!points.length) { emptyChart(container); return; }
  const {g,iW,iH} = makeSVG(container,{l:78,r:22,t:26,b:48});
  const loYear = Math.min(...points.map(p=>p.year)), hiYear = Math.max(...points.map(p=>p.year));
  const x = linScale(loYear-.5,hiYear+.5,0,iW);
  const values=points.map(p=>p.value);
  const low=log?Math.min(...values)*.65:0, high=Math.max(...values)*1.4 || 1;
  const y=log?logScale(low,high,iH,0):linScale(0,high,iH,0);
  if(log) drawYAxisLog(g,[low,high],y,null,tickFormat || (e=>'10^'+e), Math.max(1,Math.ceil((Math.log10(high)-Math.log10(low))/6)));
  else drawYAxisLin(g,[0,...[.25,.5,.75,1].map(f=>Math.ceil(high*f))],y,v=>v);
  const tickStep=Math.max(1,Math.ceil((hiYear-loYear+1)/Math.max(3,Math.floor(iW/48))));
  for(let year=loYear;year<=hiYear;year+=tickStep) {
    const t=el('text',{x:x(year),y:iH+18,'text-anchor':'middle',class:'axis-tick'});
    t.textContent=year; g.appendChild(t);
  }
  const axis=el('text',{x:iW/2,y:iH+38,'text-anchor':'middle',class:'axis-label'});
  axis.textContent=label; g.appendChild(axis);
  series.forEach(s=>{
    let previous=null;
    s.points.forEach(p=>{
      if(previous && p.year === previous.year+1) g.appendChild(el('line',{x1:x(previous.year),y1:y(previous.value),x2:x(p.year),y2:y(p.value),stroke:s.color,'stroke-width':2}));
      const dot=el('circle',{cx:x(p.year),cy:y(p.value),r:5,fill:p.color||s.color,stroke:'var(--bg)','stroke-width':1});
      bindPoint(dot,p.tooltip);g.appendChild(dot);previous=p;
    });
  });
}

function parseDate(s) {
  const match = String(s || '').trim().match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!match) return null;
  const y = +match[1], m = +(match[2] || 1), day = +(match[3] || 1);
  const d = new Date(y, m - 1, day);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day ? d : null;
}

function parseNum(v) {
  if (v === null || v === undefined) return null;
  const text = String(v).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function formatFLOP(v) {
  if (!v || v <= 0) return 'Unknown';
  const e = Math.floor(Math.log10(v));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(1)}×10^${e}`;
}

function formatShort(v) {
  if (!v) return 'Unknown';
  if (v >= 1e15) return (v/1e15).toFixed(1)+'P';
  if (v >= 1e12) return (v/1e12).toFixed(1)+'T';
  if (v >= 1e9)  return (v/1e9).toFixed(1)+'G';
  if (v >= 1e6)  return (v/1e6).toFixed(1)+'M';
  return v.toFixed(0);
}

function formatCost(v) {
  if (!v) return 'Unknown';
  if (v >= 1e9) return '$'+(v/1e9).toFixed(1)+'B';
  if (v >= 1e6) return '$'+(v/1e6).toFixed(1)+'M';
  if (v >= 1e3) return '$'+(v/1e3).toFixed(0)+'K';
  return '$'+v.toFixed(0);
}

function getPrimaryDomain(domainStr) {
  if (!domainStr) return 'Unknown';

  const tokens = String(domainStr).split(',').map(t => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    if (tok !== 'Unknown' && DOMAIN_COLORS[tok]) return tok;
  }
  return 'Unknown';
}

function isFrontier(row) {
  const v = String(row['Frontier model'] || '').trim().toUpperCase();
  return v === 'TRUE' ? true : v === 'FALSE' ? false : null;
}

function isOpenWeights(row) {
  const v = String(row['Open model weights?'] ?? '').trim().toLowerCase();
  if (v === 'yes') return 'open';
  if (v === 'partially' || v === 'partial') return 'partial';
  if (v === 'no') return 'closed';
  return 'unknown';
}

function applyDateFilter(arr, dateKey) {
  const [lo, hi] = AppState.dateRange;
  return arr.filter(d => d[dateKey] && d[dateKey] >= lo && d[dateKey] <= hi);
}

function buildOrgColors(models) {
  const counts = {};
  models.forEach(m => { const o = m.org; counts[o] = (counts[o]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  const map = {};
  sorted.forEach((org, i) => {
    map[org] = i < ORG_PALETTE.length-1 ? ORG_PALETTE[i] : ORG_PALETTE[ORG_PALETTE.length-1];
  });
  return map;
}

function getYearBucket(date) {
  if (!date) return '2025+';
  const y = date.getFullYear();
  if (y <= 2017) return '2012–2017';
  if (y <= 2020) return '2018–2020';
  if (y <= 2022) return '2021–2022';
  if (y === 2023) return '2023';
  if (y === 2024) return '2024';
  return '2025+';
}

function el(tag, attrs={}, ns=NS) {
  const e = document.createElementNS(ns, tag);
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function makeSVG(container, pad={}) {
  const ml = pad.l||50, mr = pad.r||20, mt = pad.t||20, mb = pad.b||40;
  const W = container.clientWidth || container.offsetWidth || 600;
  const H = container.clientHeight || container.offsetHeight || 300;
  container.innerHTML = '';
  const svg = el('svg',{width:W,height:H,viewBox:`0 0 ${W} ${H}`});
  const g = el('g',{transform:`translate(${ml},${mt})`});
  svg.appendChild(g);
  container.appendChild(svg);
  addChartNavigation(container, svg, W, H);
  return { svg, g, W, H, iW: W-ml-mr, iH: H-mt-mb, ml, mt, mr, mb };
}

// Fit first. Optional inspection magnifies the existing SVG without altering data.
function addChartNavigation(container, svg, W, H) {
  const controls = document.createElement('div');
  controls.className = 'chart-navigation';
  controls.innerHTML = '<span class="chart-drag-hint" hidden>Drag to pan</span><button type="button" aria-label="Zoom into chart">+</button><button type="button" aria-label="Zoom out of chart" disabled>−</button><button type="button" disabled>Reset</button>';
  container.appendChild(controls);
  const [plus, minus, reset] = controls.querySelectorAll('button');
  const hint = controls.querySelector('span');
  let zoom = 1, x = 0, y = 0, drag = null;
  const update = () => {
    x = Math.max(0, Math.min(W - W / zoom, x));
    y = Math.max(0, Math.min(H - H / zoom, y));
    svg.setAttribute('viewBox', `${x} ${y} ${W / zoom} ${H / zoom}`);
    svg.classList.toggle('can-pan', zoom > 1);
    svg.setAttribute('aria-label', zoom > 1 ? 'Zoomed chart. Drag or use arrow keys to pan.' : 'Chart fitted to card.');
    minus.disabled = reset.disabled = zoom === 1;
    plus.disabled = zoom === 4;
    hint.hidden = zoom === 1;
  };
  const setZoom = next => {
    const centerX = x + W / zoom / 2, centerY = y + H / zoom / 2;
    zoom = next; x = centerX - W / zoom / 2; y = centerY - H / zoom / 2;
    hideTT(); update();
  };
  plus.onclick = () => setZoom(Math.min(4, zoom * 2));
  minus.onclick = () => setZoom(Math.max(1, zoom / 2));
  reset.onclick = () => setZoom(1);
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('pointerdown', ev => {
    if (zoom === 1 || ev.button !== 0) return;
    drag = {id:ev.pointerId, px:ev.clientX, py:ev.clientY, x, y};
    svg.setPointerCapture(ev.pointerId);
    svg.classList.add('is-dragging'); hideTT(); ev.preventDefault();
  });
  svg.addEventListener('pointermove', ev => {
    if (!drag || drag.id !== ev.pointerId) return;
    const bounds = svg.getBoundingClientRect();
    x = drag.x - (ev.clientX - drag.px) * W / bounds.width / zoom;
    y = drag.y - (ev.clientY - drag.py) * H / bounds.height / zoom;
    update();
  });
  const endDrag = () => {drag = null; svg.classList.remove('is-dragging');};
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('lostpointercapture', endDrag);
  svg.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {setZoom(1); return;}
    if (zoom === 1 || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    x += (ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0) * W / zoom * .1;
    y += (ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0) * H / zoom * .1;
    update();
  });
  update();
}

function linScale(d0,d1,r0,r1) {
  if (d0===d1) return ()=>(r0+r1)/2;
  return v => r0 + (v-d0)/(d1-d0)*(r1-r0);
}

function logScale(d0,d1,r0,r1) {
  if (d0<=0||d1<=0) return ()=>r0;
  if (d0 === d1) return () => (r0 + r1) / 2;
  const l0=Math.log10(d0), l1=Math.log10(d1);
  return v => { if(!v||v<=0) return r1; return r0+(Math.log10(v)-l0)/(l1-l0)*(r1-r0); };
}

function timeScale(d0,d1,r0,r1) {
  const t0=d0.getTime(), t1=d1.getTime();
  if(t0===t1) return ()=>(r0+r1)/2;
  return d => r0+(d.getTime()-t0)/(t1-t0)*(r1-r0);
}

function drawGrid(g, xTicks, yTicks, xFn, yFn, iH, iW) {
  xTicks.forEach(t => {
    const x = xFn(t);
    g.appendChild(el('line',{x1:x,y1:0,x2:x,y2:iH,stroke:'rgba(255,255,255,0.04)',
      'stroke-width':'0.5','shape-rendering':'crispEdges'}));
  });
  yTicks.forEach(t => {
    const y = yFn(t);
    g.appendChild(el('line',{x1:0,y1:y,x2:iW,y2:y,stroke:'rgba(255,255,255,0.04)',
      'stroke-width':'0.5','shape-rendering':'crispEdges'}));
  });
}

function drawXAxisDates(g, ticks, xFn, iH, fmt) {
  if (!ticks.length) return;
  g.appendChild(el('line',{x1:0,y1:iH,x2:xFn(ticks[ticks.length-1])+20,y2:iH,
    stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));
  ticks.forEach(t => {
    const x = xFn(t);
    const tx = el('text',{x,y:iH+14,'text-anchor':'middle',class:'axis-tick'});
    tx.textContent = fmt ? fmt(t) : t.getFullYear();
    g.appendChild(tx);
  });
}

function flopLabel(e) {
  const m={
    6:'1 MegaFLOP',7:'10 MegaFLOP',8:'100 MegaFLOP',
    9:'1 GigaFLOP',10:'10 GigaFLOP',11:'100 GigaFLOP',
    12:'1 TeraFLOP',13:'10 TeraFLOP',14:'100 TeraFLOP',
    15:'1 PetaFLOP',16:'10 PetaFLOP',17:'100 PetaFLOP',
    18:'1 ExaFLOP',19:'10 ExaFLOP',20:'100 ExaFLOP',
    21:'1 ZettaFLOP',22:'10 ZettaFLOP',23:'100 ZettaFLOP',
    24:'1 YottaFLOP',25:'10 YottaFLOP',26:'100 YottaFLOP'
  };
  return m[e]||'';
}
function fp16Label(e) {
  const m={
    12:'1 TFLOP/s',13:'10 TFLOP/s',14:'100 TFLOP/s',
    15:'1 PFLOP/s',16:'10 PFLOP/s',17:'100 PFLOP/s',
    18:'1 EFLOP/s',19:'10 EFLOP/s',20:'100 EFLOP/s'
  };
  return m[e]||'';
}
function costLabel(e) {
  const m={3:'$1K',4:'$10K',5:'$100K',6:'$1M',7:'$10M',8:'$100M',9:'$1B',10:'$10B',11:'$100B'};
  if(m[e]) return m[e];
  if(e>=9) return '$'+Math.pow(10,e-9).toFixed(0)+'B';
  if(e>=6) return '$'+Math.pow(10,e-6).toFixed(0)+'M';
  if(e>=3) return '$'+Math.pow(10,e-3).toFixed(0)+'K';
  return '$'+Math.pow(10,e).toFixed(0);
}
function fmtDate(d) {
  if(!d) return 'Unknown';
  return d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
}
function fmtFLOPTooltip(v) {
  if(!v||v<=0) return 'Unknown';
  if(v>=1e24) return (v/1e24).toFixed(1)+' YottaFLOP';
  if(v>=1e21) return (v/1e21).toFixed(1)+' ZettaFLOP';
  if(v>=1e18) return (v/1e18).toFixed(1)+' ExaFLOP';
  if(v>=1e15) return (v/1e15).toFixed(1)+' PetaFLOP';
  if(v>=1e12) return (v/1e12).toFixed(1)+' TeraFLOP';
  if(v>=1e9)  return (v/1e9).toFixed(1)+' GigaFLOP';
  return formatFLOP(v);
}
function fmtFP16Tooltip(v) {
  if(!v||v<=0) return 'Unknown';
  if(v>=1e18) return (v/1e18).toFixed(1)+' EFLOP/s';
  if(v>=1e15) return (v/1e15).toFixed(0)+' PFLOP/s';
  if(v>=1e12) return (v/1e12).toFixed(0)+' TFLOP/s';
  return formatShort(v)+' FLOP/s';
}
function formatDollars(v) {
  if(!v) return null;
  if(v>=1e9) return '$'+(v/1e9).toFixed(0)+' billion';
  if(v>=1e6) return '$'+Math.round(v/1e6)+' million';
  if(v>=1e3) return '$'+Math.round(v/1000)+'K';
  return '$'+Math.round(v);
}

function drawYAxisLog(g, domain, yFn, label, tickFmt, step) {
  const st = step || 2;
  g.appendChild(el('line',{x1:0,y1:0,x2:0,y2:yFn(domain[0]),
    stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));
  const lo = Math.ceil(Math.log10(domain[0]));
  const hi = Math.floor(Math.log10(domain[1]));
  for(let e=lo; e<=hi; e+=st) {
    const v = Math.pow(10,e);
    const y = yFn(v);
    const lbl = tickFmt ? tickFmt(e) : `10^${e}`;
    if(!lbl) continue;
    const tx = el('text',{x:-6,y:y+3,'text-anchor':'end',class:'axis-tick'});
    tx.textContent = lbl;
    g.appendChild(tx);
    g.appendChild(el('line',{x1:-3,y1:y,x2:0,y2:y,stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));
  }
  if(label) {
    const midY = (yFn(domain[0]) + yFn(domain[1])) / 2;
    const lb = el('text',{x:-74,y:midY,'text-anchor':'middle',
      class:'axis-label',transform:`rotate(-90,-74,${midY})`});
    lb.textContent = label;
    g.appendChild(lb);
  }
}

function drawYAxisLin(g, ticks, yFn, fmt) {
  g.appendChild(el('line',{x1:0,y1:0,x2:0,y2:yFn(ticks[0]),
    stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));
  ticks.forEach(t => {
    const y = yFn(t);
    const tx = el('text',{x:-6,y:y+3,'text-anchor':'end',class:'axis-tick'});
    tx.textContent = fmt ? fmt(t) : t;
    g.appendChild(tx);
    g.appendChild(el('line',{x1:-3,y1:y,x2:0,y2:y,stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));
  });
}

const TT = document.getElementById('tooltip');

function showTT(ev, html) {
  if (document.querySelector('.is-dragging')) return;
  TT.innerHTML = html;
  TT.classList.add('visible');
  moveTT(ev);
}

function moveTT(ev) {
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = ev.clientX+14, y = ev.clientY-10;
  const tw = TT.offsetWidth||240, th = TT.offsetHeight||120;
  if (x+tw>vw-10) x = ev.clientX-tw-14;
  if (y+th>vh-10) y = vh-th-10;
  TT.style.left = x+'px';
  TT.style.top  = y+'px';
}

function hideTT() { TT.classList.remove('visible'); }

function ttRow(k,v) { return `<div class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${v}</span></div>`; }

function renderOverview() {
  const { models, hardware } = AppState.data;

  const fm = applyDateFilter(models, 'date');
  const fh = applyDateFilter(hardware, 'releaseDate');

  const allDates = [...fm.map(m=>m.date), ...fh.map(h=>h.releaseDate)].filter(Boolean);
  const minY = allDates.length ? Math.min(...allDates.map(d=>d.getFullYear())) : 2012;
  const maxY = allDates.length ? Math.max(...allDates.map(d=>d.getFullYear())) : 2025;
  const frontierCount = fm.filter(isFrontierModel).length;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Total Models</span>
      <span class="kpi-value">${fm.length}</span>
      <span class="kpi-sub">in selected window</span></div>
    <div class="kpi-card"><span class="kpi-label">Frontier Models</span>
      <span class="kpi-value">${frontierCount}</span>
      <span class="kpi-sub">TRUE in dataset</span></div>
    <div class="kpi-card cyan"><span class="kpi-label">Hardware Chips</span>
      <span class="kpi-value">${fh.length}</span>
      <span class="kpi-sub">accelerators tracked</span></div>
    <div class="kpi-card cyan"><span class="kpi-label">Year Range</span>
      <span class="kpi-value" style="font-size:1.4rem">${allDates.length ? minY+' to '+maxY : 'No data'}</span>
      <span class="kpi-sub">model publication / hardware release</span></div>`;

  const recent = [...fm].filter(m=>m.date).sort((a,b)=>b.date-a.date).slice(0,5);
  const tbody = document.querySelector('#recent-table tbody');
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--font-mono);font-size:0.72rem;padding:18px 12px">No models in selected date range</td></tr>`;
  } else {
    tbody.innerHTML = recent.map(m=>{
      const conf = normalizeConfidence(m.confidence);
      return `<tr>
        <td>${m.name}</td>
        <td><span class="badge org">${m.org}</span></td>
        <td style="font-family:var(--font-mono);font-size:0.7rem">${m.date ? fmtDate(m.date) : 'Unknown'}</td>
        <td>${m.domain}</td>
        <td style="font-family:var(--font-mono);font-size:0.68rem">${m.flop?fmtFLOPTooltip(m.flop):'Unknown'}</td>
        <td><span class="badge ${confClass(conf)}">${conf}</span></td>
        <td>${m.frontier === null ? '<span class="badge org">Unknown</span>' : m.frontier ? '<span class="badge frontier">Yes</span>' : '<span class="badge closed">No</span>'}</td>
      </tr>`;
    }).join('');
  }
}

function isFrontierModel(m) { return m.frontier; }

function initScrubber() {
  const {models,hardware}=AppState.data;
  const dates=[...models.map(m=>m.date),...hardware.map(h=>h.releaseDate)].filter(Boolean);
  if(!dates.length)return;
  const minY=Math.min(...dates.map(d=>d.getFullYear())),maxY=Math.max(...dates.map(d=>d.getFullYear()));
  const rMin=document.getElementById('range-min'),rMax=document.getElementById('range-max');
  [rMin,rMax].forEach(r=>{r.min=minY;r.max=maxY;});
  rMin.value=Math.max(minY,Math.min(2012,maxY));rMax.value=maxY;
  const ticks=document.getElementById('scrubber-ticks');ticks.innerHTML='';
  [minY,Math.round((minY+maxY)/2),maxY].forEach(y=>{const t=document.createElement('span');t.className='scrubber-tick';t.textContent=y;ticks.appendChild(t);});
  function update() {
    let lo=+rMin.value,hi=+rMax.value;
    if(lo>hi){if(this===rMin)lo=hi;else hi=lo;}
    rMin.value=lo;rMax.value=hi;
    AppState.dateRange=[new Date(lo,0,1),new Date(hi,11,31,23,59,59,999)];
    document.getElementById('scrubber-display').textContent=`${lo} to ${hi}`;
    const span=maxY-minY||1;
    document.getElementById('range-fill').style.left=100*(lo-minY)/span+'%';
    document.getElementById('range-fill').style.right=100*(maxY-hi)/span+'%';
    renderCurrentTab();updateAboutBannerMeta();
  }
  rMin.addEventListener('input',update);rMax.addEventListener('input',update);update();
}

function renderComputeViolin() {
  const container = document.getElementById('compute-violin');
  if (!container) return;

  const models = applyDateFilter(AppState.data.models, 'date').filter(m => m.flop > 0 && m.domain);
  if (models.length < 5) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-family:var(--font-mono);font-size:0.7rem">Not enough compute data</div>';
    return;
  }

  const domainMap = {};
  models.forEach(m => {
    const d = m.domain || 'Other';
    if (!domainMap[d]) domainMap[d] = [];
    domainMap[d].push(Math.log10(m.flop));
  });

  function gauss(u) { return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI); }
  function silverman(vals) {
    const n = vals.length;
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1));
    return Math.max(1.06 * std * Math.pow(n, -0.2), 0.15);
  }
  function quantile(sorted, q) {
    const pos = q * (sorted.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  const domains = Object.entries(domainMap)
    .filter(([, v]) => v.length >= 4)
    .map(([domain, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      return { domain, vals, sorted, med: quantile(sorted, 0.5) };
    })
    .sort((a, b) => b.med - a.med);

  if (!domains.length) { emptyChart(container, 'No domains with at least four observations'); return; }

  const PAD = { l: 118, r: 24, t: 18, b: 44 };
  const { g, iW, iH } = makeSVG(container, PAD);

  const allVals = domains.flatMap(d => d.vals);
  const xMin = Math.floor(Math.min(...allVals));
  const xMax = Math.ceil(Math.max(...allVals));
  const xFn = linScale(xMin, xMax, 0, iW);

  const rowH = iH / domains.length;
  const maxHalfW = rowH * 0.44;
  const KDE_N = 90;

  for (let e = xMin; e <= xMax; e++) {
    const px = xFn(e);
    g.appendChild(el('line', { x1: px, y1: 0, x2: px, y2: iH,
      stroke: 'rgba(255,255,255,0.04)', 'stroke-width': '0.5' }));
    if ((e - xMin) % 2 === 0) {
      const tx = el('text', { x: px, y: iH + 14, 'text-anchor': 'middle', class: 'axis-tick' });
      tx.textContent = `10^${e}`;
      g.appendChild(tx);
    }
  }
  g.appendChild(el('line', { x1: 0, y1: iH, x2: iW, y2: iH,
    stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '0.5' }));

  const xl = el('text', { x: iW / 2, y: iH + 34, 'text-anchor': 'middle', class: 'axis-label' });
  xl.textContent = 'Training Compute (FLOP, log scale)';
  g.appendChild(xl);

  domains.forEach(({ domain, vals, sorted }, i) => {
    const cy = (i + 0.5) * rowH;
    const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS['Other'];
    const bw = silverman(vals);
    const q1 = quantile(sorted, 0.25), med = quantile(sorted, 0.5), q3 = quantile(sorted, 0.75);

    const evalXs = Array.from({ length: KDE_N }, (_, k) => xMin + (xMax - xMin) * k / (KDE_N - 1));
    const dens = evalXs.map(x => vals.reduce((s, v) => s + gauss((x - v) / bw), 0) / (vals.length * bw));
    const maxD = Math.max(...dens, 1e-9);

    const pts = evalXs.map((x, k) => [xFn(x), dens[k] / maxD * maxHalfW]);
    const pathD =
      pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${(cy - p[1]).toFixed(1)}`).join(' ') + ' ' +
      [...pts].reverse().map((p, k) => `${k === 0 ? 'L' : 'L'}${p[0].toFixed(1)},${(cy + p[1]).toFixed(1)}`).join(' ') + ' Z';

    g.appendChild(el('path', { d: pathD,
      fill: color + '33', stroke: color, 'stroke-width': '1.5', 'stroke-linejoin': 'round' }));

    const boxH = Math.max(rowH * 0.14, 4);
    const boxX = xFn(q1), boxW = Math.max(xFn(q3) - xFn(q1), 3);
    g.appendChild(el('rect', { x: boxX, y: cy - boxH / 2, width: boxW, height: boxH,
      fill: color + 'aa', stroke: color, 'stroke-width': '1', rx: '1' }));

    const mx = xFn(med);
    g.appendChild(el('line', { x1: mx, y1: cy - boxH / 2 - 1, x2: mx, y2: cy + boxH / 2 + 1,
      stroke: '#fff', 'stroke-width': '2', 'stroke-linecap': 'round' }));

    const lbl = el('text', { x: -10, y: cy - 4, 'text-anchor': 'end', class: 'axis-tick' });
    lbl.style.fill = color;
    lbl.style.fontWeight = '600';
    lbl.textContent = domain;
    g.appendChild(lbl);

    const nlbl = el('text', { x: -10, y: cy + 9, 'text-anchor': 'end', class: 'axis-tick' });
    nlbl.style.fontSize = '8px';
    nlbl.style.fill = 'rgba(255,255,255,0.4)';
    nlbl.textContent = `n=${vals.length}`;
    g.appendChild(nlbl);

    const overlay = el('rect', { x: 0, y: cy - rowH / 2, width: iW, height: rowH, fill: 'transparent', cursor: 'crosshair' });
    overlay.addEventListener('mouseenter', ev => showTT(ev,
      `<div class="tt-title">${domain}</div>
       ${ttRow('Models with compute data', vals.length)}
       ${ttRow('Median', `10^${med.toFixed(1)} FLOP`)}
       ${ttRow('IQR (Q1–Q3)', `10^${q1.toFixed(1)} – 10^${q3.toFixed(1)}`)}
       ${ttRow('Range', `10^${sorted[0].toFixed(1)} – 10^${sorted[sorted.length - 1].toFixed(1)} FLOP`)}`));
    overlay.addEventListener('mousemove', moveTT);
    overlay.addEventListener('mouseleave', hideTT);
    g.appendChild(overlay);
  });
}

function renderComputeRace() {
  renderDomainFilters();
  renderComputeScatter();
  renderDomainBar();
  renderComputeViolin();
  renderCostChart();
}

function renderCostChart() {
  const container=document.getElementById('cost-chart');
  let models=applyDateFilter(AppState.data.models,'date');
  if(AppState.filters.costConfidenceMode === 'confident') models=models.filter(m=>m.confidence==='Confident');
  const points=annualMax(models,'date','cost').map(p=>({...p,color:confColor(p.row.confidence),
    tooltip:`<div class="tt-title">${escapeHTML(p.row.name)}</div>${ttRow('Year',p.year)}${ttRow('Estimated cost (2023 USD)',formatCost(p.value))}${ttRow('Confidence',p.row.confidence)}${ttRow('Source','Epoch cost field')}`}));
  drawAnnualChart(container,[{points,color:'#f0a500'}],{label:'Publication year; estimated cost in 2023 USD',tickFormat:costLabel});
}

function renderDomainFilters() {

  const domainsWithData = new Set(
    AppState.data.models.filter(m=>m.flop>0&&m.date).map(m=>m.domain)
  );
  const domains = Object.keys(DOMAIN_COLORS).filter(d=>domainsWithData.has(d));

  const container = document.getElementById('domain-filters');
  container.innerHTML = '';

  if (AppState.filters.domain === null) AppState.filters.domain = [...domains];
  domains.forEach(d => {
    const btn = document.createElement('button');
    btn.className = 'domain-chip' + (AppState.filters.domain.includes(d)?' active':'');
    btn.textContent = d;
    btn.style.color = DOMAIN_COLORS[d];
    btn.style.borderColor = DOMAIN_COLORS[d]+'66';
    btn.addEventListener('click', () => {
      const idx = AppState.filters.domain.indexOf(d);
      if(idx>=0) AppState.filters.domain.splice(idx,1);
      else AppState.filters.domain.push(d);
      btn.classList.toggle('active');
      renderComputeScatter();
    });
    container.appendChild(btn);
  });
}

function renderComputeScatter() {
  const container = document.getElementById('compute-scatter');
  const allModels = applyDateFilter(AppState.data.models,'date');
  let data = allModels.filter(m => m.flop > 0 && m.date);
  if (AppState.filters.domain !== null) data = data.filter(m=>AppState.filters.domain.includes(m.domain));

  if (!data.length) { document.getElementById('compute-legend').innerHTML=''; container.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-family:var(--font-mono);font-size:0.7rem">No data in selected range</div>'; return; }

  const { g, iW, iH } = makeSVG(container, {l:96,r:20,t:20,b:36});

  data.sort((a,b) => a.date - b.date);

  const flops = data.map(m=>m.flop).filter(f => f > 0);
  const dateMin = data[0].date, dateMax = data[data.length-1].date;
  const xFn = timeScale(dateMin, dateMax, 0, iW);
  const minF=Math.min(...flops), maxF=Math.max(...flops);
  const yFn = logScale(minF*0.3,maxF*3,iH,0);

  const minY=dateMin.getFullYear(), maxY=dateMax.getFullYear();
  const yearTicks=[];
  for(let y=minY; y<=maxY; y+=2) yearTicks.push(new Date(y,0,1));
  drawGrid(g, yearTicks, [], xFn, yFn, iH, iW);
  drawXAxisDates(g, yearTicks, xFn, iH);
  drawYAxisLog(g, [minF*0.3,maxF*3], yFn, 'Training Compute', flopLabel, 3);

  if (AppState.filters.showTrend) {
    const pts = data.filter(m=>m.flop>0&&m.date).map(m=>({
      t:(m.date.getTime()-new Date('2012-01-01').getTime())/(1000*86400*365),
      l:Math.log10(m.flop)
    }));
    if(pts.length>2) {
      const n=pts.length;
      const mx=pts.reduce((s,p)=>s+p.t,0)/n;
      const my=pts.reduce((s,p)=>s+p.l,0)/n;
      const num=pts.reduce((s,p)=>s+(p.t-mx)*(p.l-my),0);
      const den=pts.reduce((s,p)=>s+(p.t-mx)*(p.t-mx),0);
      if(den>0) {
        const slope=num/den, intercept=my-slope*mx;
        const dateTimes=data.map(m=>m.date.getTime());
        const tMin=(Math.min(...dateTimes)-new Date('2012-01-01').getTime())/(1000*86400*365);
        const tMax=(Math.max(...dateTimes)-new Date('2012-01-01').getTime())/(1000*86400*365);
        const x1=xFn(new Date(Math.min(...dateTimes))), x2=xFn(new Date(Math.max(...dateTimes)));
        const y1=yFn(Math.pow(10,slope*tMin+intercept)), y2=yFn(Math.pow(10,slope*tMax+intercept));
        const trendPath=el('path',{d:`M${x1},${y1} L${x2},${y2}`,
          stroke:'rgba(240,165,0,0.5)','stroke-width':'1.5',
          fill:'none','stroke-dasharray':'6 4'});
        g.appendChild(trendPath);
      }
    }
  }

  const orgMap = AppState.orgColors;
  data.forEach((m, i) => {
    const x = xFn(m.date), y = yFn(m.flop);
    if(!isFinite(x)||!isFinite(y)) return;
    const baseR = m.frontier ? 5 : 3.5;
    const conf = normalizeConfidence(m.confidence);

    if(conf !== 'Confident') {
      const ringR = baseR + 2.2;
      const ringStroke = confColor(conf);
      const ring = el('circle', {
        cx:x, cy:y, r: ringR,
        fill: 'none',
        stroke: ringStroke,
        'stroke-width': '1.4',
        opacity: '0.75',
        'pointer-events': 'none',
      });
      if(conf === 'Unknown') ring.setAttribute('stroke-dasharray','2 2');
      g.appendChild(ring);
    }

    const c = el('circle',{
      cx:x, cy:y, r: baseR,
      fill: m.frontier ? (orgMap[m.org]||'#4b5568') : 'none',
      stroke: orgMap[m.org]||'#4b5568',
      'stroke-width': m.frontier?0:1.5,
      opacity: '0.85',
      class:'chart-point'
    });
    c.addEventListener('mouseenter', ev => {
      c.setAttribute('r', m.frontier?7:5);
      showTT(ev, `<div class="tt-title">${m.name}</div>
        ${ttRow('Org',m.org)}
        ${ttRow('Date',fmtDate(m.date))}
        ${ttRow('Compute',fmtFLOPTooltip(m.flop))}
        ${ttRow('Domain',m.domain)}
        ${ttRow('Confidence', confTTDot(conf) + conf)}`);
    });
    c.addEventListener('mousemove', moveTT);
    c.addEventListener('mouseleave', ev => { c.setAttribute('r',baseR); hideTT(); });
    g.appendChild(c);
  });

  const orgCounts={};
  data.forEach(m=>{ orgCounts[m.org]=(orgCounts[m.org]||0)+1; });
  const top10=Object.entries(orgCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(e=>e[0]);
  const leg = document.getElementById('compute-legend');
  leg.innerHTML = top10.map(o=>`<div class="legend-item"><div class="legend-swatch" style="background:${orgMap[o]||'#4b5568'}"></div>${o}</div>`).join('');
  leg.innerHTML += '<div class="legend-item" style="margin-left:16px"><div style="width:10px;height:10px;border-radius:50%;border:1.5px solid var(--muted2);margin-right:5px;flex-shrink:0"></div>Frontier flag not TRUE</div>';
  leg.innerHTML += '<div class="legend-item"><div style="width:10px;height:10px;border-radius:50%;background:var(--muted2);margin-right:5px;flex-shrink:0"></div>Frontier</div>';

  leg.innerHTML += '<div class="legend-item" style="margin-left:16px;color:var(--muted2);font-style:italic"><span class="scatter-ring-sample"></span>Ringed dots = estimated compute (Likely / Speculative / Unknown)</div>';
}

function renderDomainBar() {
  const container = document.getElementById('domain-bar');
  const models = applyDateFilter(AppState.data.models,'date').filter(m=>m.date);

  const yearMap={};
  models.forEach(m=>{
    const y=m.date.getFullYear();
    if(!yearMap[y]) yearMap[y]={};
    const d=m.domain;
    yearMap[y][d]=(yearMap[y][d]||0)+1;
  });

  const years=Object.keys(yearMap).map(Number).sort();
  if(!years.length) { document.getElementById('domain-legend').innerHTML=''; emptyChart(container); return; }
  const domains=Object.keys(DOMAIN_COLORS);

  const { g, iW, iH } = makeSVG(container,{l:44,r:16,t:16,b:36});

  const maxVal=Math.max(...years.map(y=>Object.values(yearMap[y]).reduce((s,v)=>s+v,0)));
  const xFn=linScale(0,years.length,0,iW);
  const yFn=linScale(0,maxVal*1.1,iH,0);
  const barW=Math.max(4,(iW/years.length)*0.7);

  const yTicks=[0,Math.round(maxVal/4),Math.round(maxVal/2),Math.round(maxVal*3/4),maxVal];
  drawYAxisLin(g, yTicks.reverse(), yFn, v=>v);
  yTicks.slice(0,-1).forEach(t=>{
    const y=yFn(t);
    g.appendChild(el('line',{x1:0,y1:y,x2:iW,y2:y,stroke:'rgba(255,255,255,0.04)','stroke-width':'0.5'}));
  });

  years.forEach((yr,i)=>{
    const xCenter=xFn(i+0.5);
    const x=xCenter-barW/2;
    let yBase=iH;
    domains.forEach(d=>{
      const count=yearMap[yr][d]||0;
      if(!count) return;
      const barH=(count/maxVal/1.1)*iH;
      if(barH<1) return;
      const rect=el('rect',{
        x:x,y:yBase-barH,width:barW,height:barH,
        fill:DOMAIN_COLORS[d],opacity:'0.8',rx:'1'
      });
      rect.addEventListener('mouseenter',ev=>showTT(ev,`<div class="tt-title">${yr} ; ${d}</div>${ttRow('Count',count)}`));
      rect.addEventListener('mousemove',moveTT);
      rect.addEventListener('mouseleave',hideTT);
      g.appendChild(rect);
      yBase-=barH;
    });
    const tx=el('text',{x:xCenter,y:iH+14,'text-anchor':'middle',class:'axis-tick'});
    tx.textContent=yr;
    g.appendChild(tx);
  });

  const idx2022=years.indexOf(2022);
  if(idx2022>=0) {
    const ax=xFn(idx2022 + 0.5);
    g.appendChild(el('line',{x1:ax,y1:0,x2:ax,y2:iH,
      stroke:'rgba(240,165,0,0.35)','stroke-width':'1','stroke-dasharray':'4 3'}));
    const at=el('text',{x:ax+4,y:14,'text-anchor':'start',
      style:'font-family:DM Mono,monospace;font-size:9px;fill:rgba(240,165,0,0.7)'});
    at.textContent='ChatGPT launches (Nov 2022)';
    g.appendChild(at);
  }

  const leg=document.getElementById('domain-legend');
  leg.innerHTML=domains.map(d=>`<div class="legend-item"><div class="legend-swatch" style="background:${DOMAIN_COLORS[d]}"></div>${d}</div>`).join('');
}

let hwFilter = 'all';

function renderHardwareEvolution() {
  renderHWLine();
  renderHWPriceBar();
}

function getFilteredHW() {
  const hw = applyDateFilter(AppState.data.hardware,'releaseDate');
  if(hwFilter === 'all') return hw;
  return hw.filter(h => hwFilter === 'Other' ? !['GPU','TPU'].includes(h.type) : h.type === hwFilter);
}

function renderHWLine() {
  const container = document.getElementById('hw-line');
  const allHW = getFilteredHW().filter(h=>h.releaseDate&&h.fp16>0);
  if(!allHW.length) { container.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted);font-family:var(--font-mono);font-size:0.7rem">No data</div>'; return; }

  const nvData=allHW.filter(h=>h.mfr==='NVIDIA');
  const gData =allHW.filter(h=>h.mfr==='Google');
  const otData=allHW.filter(h=>h.mfr!=='NVIDIA'&&h.mfr!=='Google');

  function rollingMilestones(pts) {
    if(!pts.length) return [];
    const sorted=[...pts].sort((a,b)=>a.releaseDate-b.releaseDate);
    let maxVal=0, result=[];
    sorted.forEach(p=>{ if(p.fp16>maxVal){ maxVal=p.fp16; result.push({date:p.releaseDate,val:maxVal,chip:p}); } });
    return result;
  }

  const nvSeries=rollingMilestones(nvData);
  const gSeries =rollingMilestones(gData);
  const otSeries=rollingMilestones(otData);

  const allPts=[...nvSeries,...gSeries,...otSeries];
  if(!allPts.length) return;

  const allDates=[...allHW.map(h=>h.releaseDate)];
  const minDate=new Date(Math.min(...allDates));
  const maxDate=new Date(Math.max(...allDates));
  const allVals=allPts.map(p=>p.val).filter(v=>v>0);
  const minVal=Math.min(...allVals), maxVal=Math.max(...allVals);

  const {g,iW,iH}=makeSVG(container,{l:75,r:160,t:20,b:36});
  const xFn=timeScale(minDate,maxDate,0,iW);
  const yFn=logScale(minVal*0.3,maxVal*3,iH,0);

  const minY=minDate.getFullYear(), maxY=maxDate.getFullYear();
  const yearTicks=[];
  for(let y=minY;y<=maxY;y+=2) yearTicks.push(new Date(y,0,1));
  drawGrid(g,yearTicks,[],xFn,yFn,iH,iW);
  drawXAxisDates(g,yearTicks,xFn,iH);
  drawYAxisLog(g,[minVal*0.3,maxVal*3],yFn,null,fp16Label,1);

  function drawRollingLine(series,color,opacity,label,labelOffsetY) {
    if(!series.length) return;

    let d=`M${xFn(series[0].date).toFixed(1)},${yFn(series[0].val).toFixed(1)}`;
    for(let i=1;i<series.length;i++){
      d+=` L${xFn(series[i].date).toFixed(1)},${yFn(series[i-1].val).toFixed(1)}`;
      d+=` L${xFn(series[i].date).toFixed(1)},${yFn(series[i].val).toFixed(1)}`;
    }

    d+=` L${xFn(maxDate).toFixed(1)},${yFn(series[series.length-1].val).toFixed(1)}`;
    const path=el('path',{d,stroke:color,'stroke-width':'2.5',fill:'none',opacity:String(opacity)});
    g.appendChild(path);

    series.forEach(p=>{
      const x=xFn(p.date),y=yFn(p.val);
      if(!isFinite(x)||!isFinite(y)) return;
      const c=el('circle',{cx:x,cy:y,r:4,fill:color,opacity:String(opacity)});
      c.addEventListener('mouseenter',ev=>{
        c.setAttribute('r',6);
        showTT(ev,`<div class="tt-title">${p.chip.name}</div>
          ${ttRow('Maker',p.chip.mfr)}
          ${ttRow('Released',fmtDate(p.chip.releaseDate))}
          ${ttRow('FP16 Speed',fmtFP16Tooltip(p.chip.fp16))}
          ${ttRow('Process',p.chip.process?p.chip.process+'nm':'Unknown')}`);
      });
      c.addEventListener('mousemove',moveTT);
      c.addEventListener('mouseleave',()=>{ c.setAttribute('r',4); hideTT(); });
      g.appendChild(c);
    });

    const last=series[series.length-1];
    const lx=xFn(maxDate)+8;
    const ly=yFn(last.val)+(labelOffsetY||0);
    const lb=el('text',{x:lx,y:ly+4,'text-anchor':'start',fill:color,opacity:String(opacity),
      style:'font-family:DM Mono,monospace;font-size:10px;font-weight:500'});
    lb.textContent=label;
    g.appendChild(lb);
  }

  drawRollingLine(otSeries,'#8892a4',0.5,'Others',0);
  drawRollingLine(gSeries,'#00c8d4',1,'Google',-14);
  drawRollingLine(nvSeries,'#f0a500',1,'NVIDIA',-28);
}

function renderHWPriceBar() {
  const container = document.getElementById('hw-price-bar');
  if (!container) return;
  const data = getFilteredHW().filter(h => h.price > 0 && h.releaseDate);
  if (!data.length) {
    document.getElementById('hw-price-legend').innerHTML='';
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-family:var(--font-mono);font-size:0.7rem">No price data available</div>';
    return;
  }

  const mfrMap = {};
  data.forEach(h => {
    const yr = h.releaseDate.getFullYear();
    const mfr = h.mfr || 'Other';
    if (!mfrMap[mfr]) mfrMap[mfr] = {};
    if (!mfrMap[mfr][yr] || h.price > mfrMap[mfr][yr].price) {
      mfrMap[mfr][yr] = { price: h.price, name: h.name, year: yr };
    }
  });

  const mfrs = Object.entries(mfrMap)
    .sort((a, b) => Math.max(...Object.values(b[1]).map(v => v.price)) - Math.max(...Object.values(a[1]).map(v => v.price)))
    .slice(0, 6);
  if (!mfrs.length) return;

  const allPts = mfrs.flatMap(([mfr, ym]) => Object.values(ym).map(v => ({ ...v, mfr })));
  const allYears = allPts.map(p => p.year);
  const yearMin = Math.min(...allYears), yearMax = Math.max(...allYears);
  const allPrices = allPts.map(p => p.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  const pMin = minPrice * 0.7;
  const pMax = maxPrice * 1.6;

  const { g, iW, iH } = makeSVG(container, { l: 78, r: 72, t: 28, b: 48 });

  const xFn = linScale(yearMin, yearMax, 0, iW);
  const yFn = logScale(pMin, pMax, iH, 0);

  g.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: iH, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '0.5' }));
  g.appendChild(el('line', { x1: 0, y1: iH, x2: iW, y2: iH, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '0.5' }));

  const fmtPrice = v => v >= 1000 ? `$${(v / 1000) % 1 === 0 ? v / 1000 : (v / 1000).toFixed(1)}K` : `$${v}`;
  const priceRefs = [];
  const expLo = Math.floor(Math.log10(pMin));
  const expHi = Math.ceil(Math.log10(pMax));
  for (let exp = expLo; exp <= expHi; exp++) {
    [1, 2, 3, 5].forEach(m => {
      const v = m * Math.pow(10, exp);
      if (v >= pMin && v <= pMax) priceRefs.push({ v, major: m === 1 });
    });
  }
  priceRefs.forEach(({ v, major }) => {
    const py = yFn(v);
    if (!isFinite(py) || py < -2 || py > iH + 2) return;
    g.appendChild(el('line', { x1: 0, y1: py, x2: iW, y2: py,
      stroke: major ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)', 'stroke-width': '0.5' }));
    const tx = el('text', { x: -6, y: py + 3, 'text-anchor': 'end', class: 'axis-tick' });
    tx.style.opacity = major ? '1' : '0.55';
    tx.textContent = fmtPrice(v);
    g.appendChild(tx);
    g.appendChild(el('line', { x1: -3, y1: py, x2: 0, y2: py, stroke: 'rgba(255,255,255,0.15)', 'stroke-width': '0.5' }));
  });

  for (let yr = yearMin; yr <= yearMax; yr++) {
    const x = xFn(yr);
    g.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: iH, stroke: 'rgba(255,255,255,0.03)', 'stroke-width': '0.5' }));
    const tx = el('text', { x, y: iH + 15, 'text-anchor': 'middle', class: 'axis-tick' });
    tx.textContent = yr;
    g.appendChild(tx);
  }

  const ylbl = el('text', { x: -(iH / 2), y: -62, 'text-anchor': 'middle', class: 'axis-label', transform: 'rotate(-90)' });
  ylbl.textContent = 'Launch Price (USD, log scale)';
  g.appendChild(ylbl);

  function cleanChip(name) {
    let n = name
      .replace(/^(nvidia|google|amd|intel|amazon\s*aws|amazon|huawei|cambricon|apple|meta|moore\s*threads|graphcore)\s+/i, '')
      .replace(/^(radeon\s+instinct|radeon|geforce|quadro|titan|instinct)\s+/i, '')
      .trim();
    return n.length > 14 ? n.slice(0, 13) + '…' : n;
  }

  function estW(str) { return str.length * 5.5 + 6; }

  function resolveY(labels, minGap, bounds, dir = 'up') {
    labels.sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 30; pass++) {
      let moved = false;
      for (let i = 1; i < labels.length; i++) {
        const gap = labels[i].y - labels[i - 1].y;
        if (gap < minGap) {
          if (dir === 'up') labels[i - 1].y -= (minGap - gap);
          else              labels[i].y     += (minGap - gap);
          moved = true;
        }
      }
      if (!moved) break;
    }
    labels.forEach(lb => { lb.y = Math.max(bounds[0], Math.min(bounds[1], lb.y)); });
  }

  const sorted = [...mfrs].sort(([a]) => a === 'NVIDIA' ? 1 : -1);

  const aboveLabels    = [];  // NVIDIA chip names ; placed above their dot
  const belowLabels    = [];  // non-NVIDIA chip names ; placed below their dot to avoid clashes
  const endLabelSpecs  = [];  // manufacturer end-of-line names
  const dotSpecs       = [];  // all dots, drawn last so always on top

  sorted.forEach(([mfr, ym]) => {
    const color = HW_COLORS[mfr] || HW_COLORS['Other'];
    const isNV = mfr === 'NVIDIA';
    const pts = Object.values(ym).sort((a, b) => a.year - b.year);

    if (isNV && pts.length >= 2) {
      const areaD = `M${xFn(pts[0].year).toFixed(1)},${iH} ` +
        pts.map(p => `L${xFn(p.year).toFixed(1)},${yFn(p.price).toFixed(1)}`).join(' ') +
        ` L${xFn(pts[pts.length-1].year).toFixed(1)},${iH} Z`;
      g.appendChild(el('path', { d: areaD, fill: color + '12', stroke: 'none' }));
    }

    if (pts.length >= 2) {
      const lineD = pts.map((p, i) => `${i===0?'M':'L'}${xFn(p.year).toFixed(1)},${yFn(p.price).toFixed(1)}`).join(' ');
      g.appendChild(el('path', { d: lineD,
        stroke: color, 'stroke-width': isNV ? '2.5' : '1.8', fill: 'none',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        opacity: isNV ? '0.9' : '0.65',
        'stroke-dasharray': isNV ? 'none' : '5 3'
      }));
    }

    pts.forEach(p => {
      const x = xFn(p.year), y = yFn(p.price);
      if (!isFinite(x) || !isFinite(y)) return;

      dotSpecs.push({ x, y, r: isNV ? 5.5 : 4, color, name: p.name, year: p.year, mfr, price: p.price });

      const text = cleanChip(p.name);
      if (isNV) aboveLabels.push({ dotX: x, dotY: y, y: y - 20, text, color, isNV: true });
      else      belowLabels.push({ dotX: x, dotY: y, y: y + 18, text, color, isNV: false });
    });

    const last = pts[pts.length - 1];
    if (last) {
      const lx = xFn(last.year), ly = yFn(last.price);
      if (isFinite(lx) && isFinite(ly))
        endLabelSpecs.push({ x: lx, dotY: ly, y: ly, text: mfr, color, isNV });
    }

  });

  dotSpecs.forEach(ds => {
    const dot = el('circle', { cx: ds.x, cy: ds.y, r: ds.r,
      fill: ds.color, stroke: 'var(--bg)', 'stroke-width': '1.5' });
    dot.addEventListener('mouseenter', ev => showTT(ev,
      `<div class="tt-title">${ds.name}</div>
       ${ttRow('Year', ds.year)}${ttRow('Manufacturer', ds.mfr)}${ttRow('Launch price', '$' + ds.price.toLocaleString())}`));
    dot.addEventListener('mousemove', moveTT);
    dot.addEventListener('mouseleave', hideTT);
    g.appendChild(dot);
  });

  resolveY(aboveLabels, 14, [10, iH - 4], 'up');
  resolveY(belowLabels, 14, [10, iH - 4], 'down');

  function clearDotOverlap(lb, naturalOffset) {
    const w = estW(lb.text);
    const halfBg = w / 2 + 4;
    const dirSign = naturalOffset < 0 ? -1 : 1;
    for (let i = 0; i < 12; i++) {
      let hit = false;
      for (const d of dotSpecs) {
        if (d.x === lb.dotX && d.y === lb.dotY) continue; // skip own dot
        if (Math.abs(d.x - lb.dotX) > halfBg + d.r + 2) continue;
        const top = lb.y - 10, bot = lb.y + 3;
        if (d.y + d.r >= top && d.y - d.r <= bot) {

          lb.y = dirSign > 0 ? d.y + d.r + 12 : d.y - d.r - 12;
          hit = true;
          break;
        }
      }
      if (!hit) break;
    }

    lb.y = Math.max(10, Math.min(iH - 4, lb.y));
  }
  aboveLabels.forEach(lb => clearDotOverlap(lb, -20));
  belowLabels.forEach(lb => clearDotOverlap(lb,  18));
  function drawChipLabel(lb, naturalOffset) {
    const w = estW(lb.text);

    let anchor = 'middle';
    let tx = lb.dotX;
    if (lb.dotX - w / 2 < 2) { anchor = 'start'; tx = lb.dotX - 2; }
    else if (lb.dotX + w / 2 > iW - 2) { anchor = 'end'; tx = lb.dotX + 2; }
    const bgX = anchor === 'start' ? tx - 2
              : anchor === 'end'   ? tx - w - 2
              :                      tx - w / 2 - 2;

    const naturalY = lb.dotY + naturalOffset;
    if (Math.abs(lb.y - naturalY) > 2) {
      const ly1 = naturalOffset < 0 ? lb.dotY - 8 : lb.dotY + 8;
      const ly2 = naturalOffset < 0 ? lb.y + 2     : lb.y - 2;
      const leader = el('line', { x1: lb.dotX, y1: ly1, x2: lb.dotX, y2: ly2,
        stroke: lb.color, 'stroke-width': '0.7', opacity: '0.45', 'stroke-dasharray': '2 3' });
      leader.style.pointerEvents = 'none';
      g.appendChild(leader);
    }
    const bg = el('rect', { x: bgX, y: lb.y - 9, width: w + 4, height: 11,
      fill: 'var(--bg)', opacity: '0.9', rx: '2' });
    bg.style.pointerEvents = 'none';
    g.appendChild(bg);
    const txt = el('text', { x: tx, y: lb.y, 'text-anchor': anchor, class: 'axis-tick' });
    txt.style.fill = lb.color;
    txt.style.fontSize = lb.isNV ? '8px' : '7.5px';
    txt.style.fontWeight = lb.isNV ? '600' : '500';
    txt.style.pointerEvents = 'none';
    txt.textContent = lb.text;
    g.appendChild(txt);
  }
  aboveLabels.forEach(lb => drawChipLabel(lb, -20));
  belowLabels.forEach(lb => drawChipLabel(lb,  18));

  resolveY(endLabelSpecs, 14, [8, iH - 4]);
  endLabelSpecs.forEach(lb => {
    const lx = lb.x + 14;
    const w = estW(lb.text);

    if (Math.abs(lb.y - lb.dotY) > 2) {
      const leader = el('line', { x1: lb.x + 6, y1: lb.dotY, x2: lx - 2, y2: lb.y,
        stroke: lb.color, 'stroke-width': '0.7', opacity: '0.4' });
      leader.style.pointerEvents = 'none';
      g.appendChild(leader);
    }
    const bg = el('rect', { x: lx - 3, y: lb.y - 9, width: w + 4, height: 12,
      fill: 'var(--bg)', opacity: '0.9', rx: '2' });
    bg.style.pointerEvents = 'none';
    g.appendChild(bg);
    const txt = el('text', { x: lx, y: lb.y, 'text-anchor': 'start', class: 'axis-tick' });
    txt.style.fill = lb.color;
    txt.style.fontSize = '8.5px';
    txt.style.fontWeight = lb.isNV ? '700' : '500';
    txt.style.pointerEvents = 'none';
    txt.textContent = lb.text;
    g.appendChild(txt);
  });

  const leg = document.getElementById('hw-price-legend');
  if (leg) {
    leg.innerHTML = mfrs.map(([mfr]) => {
      const color = HW_COLORS[mfr] || HW_COLORS['Other'];
      return `<div class="legend-item"><div class="legend-swatch" style="background:${color}"></div>${mfr}</div>`;
    }).join('');
  }
}

function renderOrgLandscape() {
  renderTreemap();
  renderOrgBar();
  renderDonut();
  renderNarrowingField();
}

function renderNarrowingField() {
  const container=document.getElementById('narrowing-field');
  if(!container) return;
  const models=applyDateFilter(AppState.data.models,'date').filter(m=>m.frontier&&m.date);
  if(!models.length){emptyChart(container,'No frontier records in selected range');return;}

  const yearOrgs={};
  models.forEach(m=>{
    const y=m.date.getFullYear();
    if(y<2012||y>2025) return;
    if(!yearOrgs[y]) yearOrgs[y]=new Set();
    if(m.org!=='Unknown') yearOrgs[y].add(m.org);
  });
  const years=Object.keys(yearOrgs).map(Number).sort();
  const series=years.map(y=>({year:y,count:yearOrgs[y].size,orgs:[...yearOrgs[y]]}));
  if(series.length<2){emptyChart(container,'Not enough frontier history in selected range');return;}

  const {g,iW,iH}=makeSVG(container,{l:75,r:20,t:24,b:36});
  const xFn=linScale(2012,2025,0,iW);
  const maxCount=Math.max(...series.map(p=>p.count));
  const yFn=linScale(0,Math.ceil(maxCount*1.3),iH,0);

  for(let y=2012;y<=2025;y++) {
    const x=xFn(y);
    g.appendChild(el('line',{x1:x,y1:0,x2:x,y2:iH,stroke:'rgba(255,255,255,0.04)','stroke-width':'0.5'}));
    if((y-2012)%2===0) {
      const tx=el('text',{x,y:iH+14,'text-anchor':'middle',class:'axis-tick'});
      tx.textContent=y;
      g.appendChild(tx);
    }
  }
  g.appendChild(el('line',{x1:0,y1:iH,x2:iW,y2:iH,stroke:'rgba(255,255,255,0.15)','stroke-width':'0.5'}));

  const yTicks=[0,5,10,15,20,25].filter(v=>v<=maxCount*1.3);
  drawYAxisLin(g,yTicks.slice().reverse(),yFn,v=>v);
  yTicks.forEach(v=>g.appendChild(el('line',{x1:0,y1:yFn(v),x2:iW,y2:yFn(v),stroke:'rgba(255,255,255,0.04)','stroke-width':'0.5'})));

  const areaD=`M${xFn(series[0].year)},${iH} `+series.map(p=>`L${xFn(p.year).toFixed(1)},${yFn(p.count).toFixed(1)}`).join(' ')+` L${xFn(series[series.length-1].year)},${iH} Z`;
  g.appendChild(el('path',{d:areaD,fill:'rgba(240,165,0,0.07)',stroke:'none'}));
  const lineD=series.map((p,i)=>`${i?'L':'M'}${xFn(p.year).toFixed(1)},${yFn(p.count).toFixed(1)}`).join(' ');
  g.appendChild(el('path',{d:lineD,stroke:'#f0a500','stroke-width':'2.5',fill:'none'}));

  if(series.length>=3) {
    const smoothed=series.map((p,i)=>{
      const win=series.slice(Math.max(0,i-2),Math.min(series.length,i+3));
      const avg=win.reduce((s,w)=>s+w.count,0)/win.length;
      return {year:p.year,avg};
    });
    const trendD=smoothed.map((p,i)=>`${i?'L':'M'}${xFn(p.year).toFixed(1)},${yFn(p.avg).toFixed(1)}`).join(' ');
    g.appendChild(el('path',{d:trendD,stroke:'rgba(240,165,0,0.5)','stroke-width':'2.5',fill:'none'}));
  }

  const x20=xFn(2020);
  g.appendChild(el('line',{x1:x20,y1:0,x2:x20,y2:iH,stroke:'rgba(240,165,0,0.35)','stroke-width':'1','stroke-dasharray':'4 3'}));
  const at=el('text',{x:x20+4,y:14,'text-anchor':'start',style:'font-family:DM Mono,monospace;font-size:9px;fill:rgba(240,165,0,0.7)'});
  at.textContent='GPT-3 era';
  g.appendChild(at);

  series.forEach(p=>{
    const x=xFn(p.year),y=yFn(p.count);
    if(!isFinite(x)||!isFinite(y)) return;
    const c=el('circle',{cx:x,cy:y,r:4,fill:'#f0a500'});
    c.addEventListener('mouseenter',ev=>{c.setAttribute('r',6);showTT(ev,`<div class="tt-title">${p.year}</div>${ttRow('Organizations in frontier',p.count)}${ttRow('Recorded groups',escapeHTML(p.orgs.slice(0,5).join(', ')))}`);});
    c.addEventListener('mousemove',moveTT);
    c.addEventListener('mouseleave',()=>{c.setAttribute('r',4);hideTT();});
    g.appendChild(c);
  });

  const peak=series.reduce((a,b)=>b.count>a.count?b:a);
  const curr=series[series.length-1];
  const insightEl=document.getElementById('narrowing-insight');
  if(insightEl) insightEl.textContent=`${peak.count} organizations published frontier models at peak (${peak.year}). By ${curr.year}, ${curr.count} remain active. Frontier model = TRUE records only; this is a publication count, not a measure of affordability.`;
  const px=xFn(peak.year),py=yFn(peak.count);
  if(isFinite(px)&&isFinite(py)) {
    const pt=el('text',{x:px,y:py-10,'text-anchor':'middle',style:'font-family:DM Mono,monospace;font-size:9px;fill:rgba(240,165,0,0.9)'});
    pt.textContent=`Peak: ${peak.count} orgs`;
    g.appendChild(pt);
  }
  if(curr.year!==peak.year) {
    const cx2=xFn(curr.year),cy2=yFn(curr.count);
    if(isFinite(cx2)&&isFinite(cy2)) {
      const ct=el('text',{x:cx2-6,y:cy2-10,'text-anchor':'end',style:'font-family:DM Mono,monospace;font-size:9px;fill:rgba(240,165,0,0.9)'});
      ct.textContent=`${curr.count} orgs (${curr.year})`;
      g.appendChild(ct);
    }
  }
}

function tmCellHTML(label, count, w, h) {
  if (w < 14 || h < 10) return '';
  const fs = Math.min(Math.max(Math.min(w / 5.5, h / 3.2), 6), 11);
  const maxChars = Math.max(Math.floor(w / (fs * 0.58)), 2);
  const text = label.length <= maxChars ? label : label.slice(0, maxChars - 1) + '…';
  const showCount = h >= fs * 2.8;
  return `<div class="tm-name" style="font-size:${fs.toFixed(1)}px">${text}</div>`
    + (showCount ? `<div class="tm-count" style="font-size:${(fs * 0.85).toFixed(1)}px">${count}</div>` : '');
}

function renderTreemap() {
  const container = document.getElementById('treemap-container');
  const models = applyDateFilter(AppState.data.models, 'date');

  container.innerHTML='';
  if(!models.length){emptyChart(container);renderTreemapLegend([]);return;}

  const countryMap = {};
  models.forEach(m => {
    const c = normalizeCountry(m.country);
    if (!countryMap[c]) countryMap[c] = {};
    countryMap[c][m.org] = (countryMap[c][m.org] || 0) + 1;
  });

  const countryItems = Object.entries(countryMap)
    .map(([country, orgs]) => ({
      country,
      orgs,
      total: Object.values(orgs).reduce((s, n) => s + n, 0),
      value: Object.values(orgs).reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const W = container.offsetWidth || 600;
  const H = container.offsetHeight || 340;
  const GAP = 3;
  const HEADER_H = 18;
  const ORG_ALPHAS = ['ee', 'cc', 'aa', '88', '77', '66', '55', '44'];

  container.querySelectorAll('.tm-country-group,.tm-cell').forEach(el => el.remove());

  const countryRects = squarify(countryItems, { x: 0, y: 0, w: W, h: H });

  countryRects.forEach(cr => {
    const baseColor = COUNTRY_COLORS[cr.country] || COUNTRY_COLORS['Other'];
    const gw = Math.max(cr.w - GAP * 2, 0);
    const gh = Math.max(cr.h - GAP * 2, 0);
    const showHeader = gh > HEADER_H + 8;
    const innerH = showHeader ? gh - HEADER_H : gh;

    const group = document.createElement('div');
    group.className = 'tm-country-group';
    group.style.left   = (cr.x + GAP) + 'px';
    group.style.top    = (cr.y + GAP) + 'px';
    group.style.width  = gw + 'px';
    group.style.height = gh + 'px';
    group.style.border = `2px solid ${baseColor}`;

    if (showHeader) {
      const hdr = document.createElement('div');
      hdr.className = 'tm-country-header';
      hdr.style.background = baseColor;
      hdr.style.height = HEADER_H + 'px';
      if (gw > 28) {
        const hfs = Math.min(Math.max(Math.floor(gw / 16), 6), 9);
        const maxHdrChars = Math.max(Math.floor((gw - 28) / (hfs * 0.58)), 2);
        const hdrLabel = cr.country.length <= maxHdrChars ? cr.country : cr.country.slice(0, maxHdrChars - 1) + '…';
        hdr.innerHTML = `<span class="tm-country-name" style="font-size:${hfs}px">${hdrLabel}</span><span class="tm-country-total" style="font-size:${hfs}px">${cr.total}</span>`;
      }
      group.appendChild(hdr);
    }

    const inner = document.createElement('div');
    inner.className = 'tm-inner';
    inner.style.height = innerH + 'px';
    group.appendChild(inner);

    const orgItems = Object.entries(cr.orgs)
      .map(([org, count]) => ({ org, count, value: count }))
      .sort((a, b) => b.count - a.count);

    if (orgItems.length && gw > 2 && innerH > 2) {
      const orgRects = squarify(orgItems, { x: 0, y: 0, w: gw, h: innerH });
      orgRects.forEach((or, idx) => {
        const alpha = ORG_ALPHAS[Math.min(idx, ORG_ALPHAS.length - 1)];
        const cell = document.createElement('div');
        cell.className = 'tm-cell';
        cell.style.left   = or.x + 'px';
        cell.style.top    = or.y + 'px';
        cell.style.width  = Math.max(or.w - 1, 0) + 'px';
        cell.style.height = Math.max(or.h - 1, 0) + 'px';
        cell.style.background = baseColor + alpha;

        if (AppState.filters.selectedOrg && AppState.filters.selectedOrg !== or.org) {
          cell.classList.add('dimmed');
        }
        cell.innerHTML = tmCellHTML(or.org, or.count, or.w, or.h);
        cell.addEventListener('click', e => {
          e.stopPropagation();
          AppState.filters.selectedOrg = AppState.filters.selectedOrg === or.org ? null : or.org;
          renderTreemap();
          renderOrgBar();
        });
        cell.addEventListener('mouseenter', ev => {
          showTT(ev, `<div class="tt-title">${or.org}</div>
            ${ttRow('Models', or.count)}
            ${ttRow('Country', cr.country)}`);
        });
        cell.addEventListener('mousemove', moveTT);
        cell.addEventListener('mouseleave', hideTT);
        inner.appendChild(cell);
      });
    }

    container.appendChild(group);
  });

  renderTreemapLegend(countryItems);
}

function renderTreemapLegend(countryItems) {
  const legend = document.getElementById('treemap-legend');
  if (!legend) return;
  legend.innerHTML = countryItems.map(c => {
    const color = COUNTRY_COLORS[c.country] || COUNTRY_COLORS['Other'];
    return `<div class="tl-item">
      <div class="tl-swatch" style="background:${color}"></div>
      <span class="tl-label">${c.country} (${c.total})</span>
    </div>`;
  }).join('');
}

function getCountryColor(country) {
  return COUNTRY_COLORS[normalizeCountry(country)] || COUNTRY_COLORS['Other'];
}

function squarify(items,rect) {
  if(!items.length) return [];
  if(items.length===1) return [{...items[0],...rect}];
  const sorted=[...items].sort((a,b)=>b.value-a.value);
  return layoutSquarify(sorted,rect,sorted.reduce((s,d)=>s+d.value,0));
}

function layoutSquarify(items,rect,total) {
  if(!items.length) return [];
  if(items.length===1) return [{...items[0],x:rect.x,y:rect.y,w:rect.w,h:rect.h}];
  const {x,y,w,h}=rect;
  const isWide=w>=h;
  let row=[],rowSum=0,bestWorst=Infinity,result=[];
  let cutIdx=0;
  for(let i=0;i<items.length;i++) {
    row.push(items[i]); rowSum+=items[i].value;
    const wAR=worstAR(row,rowSum,rect,total);
    if(wAR>bestWorst) { row.pop(); rowSum-=items[i].value; cutIdx=i; break; }
    bestWorst=wAR; cutIdx=i+1;
  }
  const rowFrac=rowSum/total;
  let off=isWide?y:x;
  if(isWide) {
    const rw=w*rowFrac;
    row.forEach(item=>{
      const ih=h*(item.value/rowSum);
      result.push({...item,x,y:off,w:rw,h:ih});
      off+=ih;
    });
    const rest=items.slice(cutIdx);
    if(rest.length) result.push(...layoutSquarify(rest,{x:x+rw,y,w:w-rw,h},total-rowSum));
  } else {
    const rh=h*rowFrac;
    row.forEach(item=>{
      const iw=w*(item.value/rowSum);
      result.push({...item,x:off,y,w:iw,h:rh});
      off+=iw;
    });
    const rest=items.slice(cutIdx);
    if(rest.length) result.push(...layoutSquarify(rest,{x,y:y+rh,w,h:h-rh},total-rowSum));
  }
  return result;
}

function worstAR(row,rowSum,rect,total) {
  const {w,h}=rect;
  const isWide=w>=h;
  const rowFrac=rowSum/total;
  const rs=isWide?w*rowFrac:h*rowFrac;
  const rl=isWide?h:w;
  let max=0;
  row.forEach(item=>{
    const il=rl*(item.value/rowSum);
    const ar=il>0?Math.max(rs/il,il/rs):Infinity;
    if(ar>max) max=ar;
  });
  return max;
}

function renderOrgBar() {
  const container=document.getElementById('org-bar');
  let models=applyDateFilter(AppState.data.models,'date');
  if(AppState.filters.selectedOrg) models=models.filter(m=>m.org===AppState.filters.selectedOrg);

  const orgMax={},orgWinner={};
  models.forEach(m=>{if(m.flop>0 && (!orgWinner[m.org] || m.flop>orgMax[m.org])){orgMax[m.org]=m.flop;orgWinner[m.org]=m;}});
  const sorted=Object.entries(orgMax).sort((a,b)=>b[1]-a[1]).slice(0,15);
  if(!sorted.length) { emptyChart(container); return; }

  const {g,iW,iH}=makeSVG(container,{l:150,r:24,t:12,b:24});
  const maxVal=sorted[0][1];
  const barH=Math.max(6,iH/sorted.length-4);
  const xFn=logScale(sorted[sorted.length-1][1]*0.3,maxVal*2,0,iW);

  for(let e=Math.ceil(Math.log10(sorted[sorted.length-1][1]*0.3));e<=Math.floor(Math.log10(maxVal*2));e+=2) {
    const x=xFn(Math.pow(10,e));
    g.appendChild(el('line',{x1:x,y1:0,x2:x,y2:iH,stroke:'rgba(255,255,255,0.04)','stroke-width':'0.5'}));
    const tx=el('text',{x:x,y:iH+14,'text-anchor':'middle',class:'axis-tick'});
    tx.textContent=flopLabel(e);
    g.appendChild(tx);
  }

  const orgCountry={};
  models.forEach(m=>{
    if(!orgCountry[m.org]) orgCountry[m.org]={};
    const c=normalizeCountry(m.country);
    orgCountry[m.org][c]=(orgCountry[m.org][c]||0)+1;
  });
  const orgToCountryColor={};
  Object.entries(orgCountry).forEach(([org,cMap])=>{
    const top=Object.entries(cMap).sort((a,b)=>b[1]-a[1])[0];
    orgToCountryColor[org]=COUNTRY_COLORS[top[0]]||COUNTRY_COLORS['Other'];
  });

  sorted.forEach(([org,val],i)=>{
    const y=i*(iH/sorted.length);
    const bw=xFn(val);
    const color=orgToCountryColor[org]||COUNTRY_COLORS['Other']||'#4b5568';
    const rect=el('rect',{x:0,y:y+(iH/sorted.length-barH)/2,width:Math.max(bw,2),height:barH,
      fill:color,opacity:'0.8',rx:'2'});
    rect.addEventListener('mouseenter',ev=>showTT(ev,`<div class="tt-title">${org}</div>${ttRow('Max FLOP',formatFLOP(val))}${ttRow('Model',escapeHTML(orgWinner[org].name))}${ttRow('Confidence',orgWinner[org].confidence)}`));
    rect.addEventListener('mousemove',moveTT);
    rect.addEventListener('mouseleave',hideTT);
    g.appendChild(rect);
    const tx=el('text',{x:-6,y:y+(iH/sorted.length)/2+4,'text-anchor':'end',class:'axis-tick',
      style:'font-size:10px'});
    tx.textContent=org.slice(0,22);
    g.appendChild(tx);
  });
}

function renderDonut() {
  const svg=document.getElementById('donut-svg');
  const leg=document.getElementById('donut-legend');
  const models=applyDateFilter(AppState.data.models,'date');

  const open=models.filter(m=>m.openWeights==='open').length;
  const partial=models.filter(m=>m.openWeights==='partial').length;
  const closed=models.filter(m=>m.openWeights==='closed').length;
  const total=models.length;
  const denominator=total || 1;
  const unknown=models.filter(m=>m.openWeights==='unknown').length;
  document.getElementById('weights-caveat').textContent = total ? ` Unknown: ${unknown} of ${total} (${(100*unknown/total).toFixed(1)}%). ${unknown/total >= 0.2 ? 'Substantial missing coverage; unknown does not mean closed.' : 'Unknown does not mean closed.'}` : ' No models in selected range.';

  const cats=[
    {label:'Open',   val:open,    color:'#00c8d4'},
    {label:'Partially Open',val:partial, color:'#f0a500'},
    {label:'Unknown',val:unknown,color:'#8892a4'},
    {label:'Closed', val:closed,  color:'#ff5f5f'},
  ];
  svg.innerHTML='';
  const cx=90,cy=90,R=72,r=42;
  let angle=-Math.PI/2;
  cats.forEach(cat=>{
    const a=Math.min(2*Math.PI*cat.val/denominator, 2*Math.PI-1e-7);
    if(a<0.001) return;
    const x1=cx+R*Math.cos(angle), y1=cy+R*Math.sin(angle);
    const x2=cx+R*Math.cos(angle+a), y2=cy+R*Math.sin(angle+a);
    const ix1=cx+r*Math.cos(angle), iy1=cy+r*Math.sin(angle);
    const ix2=cx+r*Math.cos(angle+a), iy2=cy+r*Math.sin(angle+a);
    const large=a>Math.PI?1:0;
    const path=el('path',{
      d:`M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large} 0 ${ix1},${iy1} Z`,
      fill:cat.color,opacity:'0.85'
    });
    path.addEventListener('mouseenter',ev=>showTT(ev,`<div class="tt-title">${cat.label}</div>${ttRow('Count',cat.val)}${ttRow('Share',(100*cat.val/denominator).toFixed(1)+'%')}`));
    path.addEventListener('mousemove',moveTT);
    path.addEventListener('mouseleave',hideTT);
    svg.appendChild(path);
    angle+=a;
  });

  const ct=el('text',{x:cx,y:cy+5,'text-anchor':'middle',fill:'var(--text)',
    style:'font-family:DM Mono,monospace;font-size:14px;font-weight:500'});
  ct.textContent=total;
  svg.appendChild(ct);
  const cl=el('text',{x:cx,y:cy+18,'text-anchor':'middle',fill:'var(--muted)',
    style:'font-family:DM Mono,monospace;font-size:9px'});
  cl.textContent='models';
  svg.appendChild(cl);

  leg.innerHTML=cats.map(c=>`<div class="donut-item">
    <div class="donut-swatch" style="background:${c.color}"></div>
    <span class="donut-label">${c.label}</span>
    <span class="donut-pct">${c.val} (${(100*c.val/denominator).toFixed(1)}%)</span>
  </div>`).join('');
}

function renderCrossDataset() {
  renderGapBarChart();
  renderArmsRace();
}

function renderGapBarChart() {
  const container=document.getElementById('cross-scatter');
  const models=applyDateFilter(AppState.data.models,'date');
  const data=acceleratorObservations(models);
  document.getElementById('cross-legend').textContent = `${data.length} of ${models.filter(m=>m.frontier).length} frontier records meet the quantity and accelerator-unit checks. Bars show the largest reported or estimated quantity in each publication year. CPU quantities and unspecified hardware units are excluded.`;
  if(!data.length) {emptyChart(container,'No eligible accelerator quantities in selected range');return;}
  const yearMap={};
  data.forEach(m=>{
    const year=m.date.getFullYear();
    if(!yearMap[year] || m.quantity>yearMap[year].quantity) yearMap[year]=m;
  });
  const years=Object.keys(yearMap).map(Number).sort((a,b)=>a-b);
  const {g,iW,iH}=makeSVG(container,{l:82,r:22,t:24,b:48});
  const vals=years.map(year=>yearMap[year].quantity), low=Math.max(1,Math.min(...vals)*.65), high=Math.max(...vals)*1.6;
  const y=logScale(low,high,iH,0);
  drawYAxisLog(g,[low,high],y,null,e=>Math.pow(10,e).toLocaleString(),1);
  const x=linScale(years[0]-.6,years[years.length-1]+.6,0,iW);
  const barW=Math.max(8,Math.min(42,iW/Math.max(years.length,1)*.58));
  years.forEach(year=>{
    const tick=el('text',{x:x(year),y:iH+16,'text-anchor':'middle',class:'axis-tick'});
    tick.textContent=year;g.appendChild(tick);
    g.appendChild(el('line',{x1:x(year),y1:0,x2:x(year),y2:iH,stroke:'rgba(255,255,255,0.035)','stroke-width':'.5'}));
  });
  const label=el('text',{x:iW/2,y:iH+36,'text-anchor':'middle',class:'axis-label'});
  label.textContent='Publication year; largest explicitly reported accelerator quantity (log scale)';g.appendChild(label);
  years.forEach(year=>{
    const m=yearMap[year], top=y(m.quantity);
    const bar=el('rect',{x:x(year)-barW/2,y:top,width:barW,height:iH-top,fill:confColor(m.confidence),opacity:'.88',rx:'2'});
    const stage=/reinforcement learning/i.test(m.dataCenter)?'RL cluster; not a pretraining-only count':'Training-stage split not standardized';
    bindPoint(bar,`<div class="tt-title">${escapeHTML(m.name)}</div>${ttRow('Published',fmtDate(m.date))}${ttRow('Largest quantity that year',m.quantity.toLocaleString())}${ttRow('Hardware',escapeHTML(m.trainingHardware || 'GPU; type unspecified'))}${ttRow('Confidence',m.confidence)}${ttRow('Context',stage)}${ttRow('Source','Epoch Hardware quantity')}`);
    g.appendChild(bar);
    const value=el('text',{x:x(year),y:Math.max(top-6,10),'text-anchor':'middle',class:'axis-tick'});
    value.textContent=m.quantity.toLocaleString();g.appendChild(value);
  });
  const latestYear=years[years.length-1], latest=yearMap[latestYear];
  const latestNote=document.getElementById('cross-latest-note');
  if(latestNote) latestNote.textContent=`Latest reported quantity: ${latest.quantity.toLocaleString()} GPUs (${latest.name}, ${latest.confidence})`;
}
function renderArmsRace() {
  const container=document.getElementById('arms-race');

  const indexed=indexedGrowth(AppState.data.models,AppState.data.hardware);
  const note=document.getElementById('index-base-note');
  if(!indexed) {note.textContent='No common base year available.';emptyChart(container);return;}
  note.textContent=`Base ${indexed.baseYear} = 1.0 (no tensor observations in 2016 in this snapshot). Sources: Epoch model and ML Hardware CSVs. Missing years are not filled; model observations end independently of hardware.`;
  const visible=(points,dateKey)=>points.filter(p=>p.row[dateKey]>=AppState.dateRange[0] && p.row[dateKey]<=AppState.dateRange[1]);
  const models=visible(indexed.models,'date').map(p=>({...p,
    tooltip:`<div class="tt-title">${escapeHTML(p.row.name)}</div>${ttRow('Year',p.year)}${ttRow('Training compute index',p.value.toLocaleString(undefined,{maximumFractionDigits:2}))}${ttRow('Annual max FLOP',formatFLOP(p.rawValue))}${ttRow('Confidence',p.row.confidence)}`}));
  const hardware=visible(indexed.hardware,'releaseDate').map(p=>({...p,
    tooltip:`<div class="tt-title">${escapeHTML(p.row.name)}</div>${ttRow('Year',p.year)}${ttRow('Chip throughput index',p.value.toLocaleString(undefined,{maximumFractionDigits:2}))}${ttRow('Annual max tensor throughput',fmtFP16Tooltip(p.rawValue))}`}));
  drawAnnualChart(container,[{points:models,color:'#f0a500'},{points:hardware,color:'#00c8d4'}],{label:`Publication / release year; dimensionless index (${indexed.baseYear} = 1)`});
}

function renderCurrentTab() {
  switch(AppState.activeTab) {
    case 'overview':  renderOverview(); break;
    case 'compute':   renderComputeRace(); break;
    case 'hardware':  renderHardwareEvolution(); break;
    case 'orgs':      renderOrgLandscape(); break;
    case 'cross':     renderCrossDataset(); break;
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tabId));
  document.querySelectorAll('.tab-panel').forEach(p=>{
    if(p.id===`tab-${tabId}`) {
      p.style.display='block';
      p.classList.add('active');
      p.style.opacity='1';
      p.style.transform='translateY(0)';
    } else {
      p.classList.remove('active');
      p.style.display='none';
    }
  });
  AppState.activeTab=tabId;
  renderCurrentTab();
}

function wireControls() {
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderCurrentTab,120);});

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
  });

  document.getElementById('theme-btn').addEventListener('click',()=>{
    const t=document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme',t==='dark'?'light':'dark');
  });

  document.getElementById('trend-toggle').addEventListener('click',function(){
    AppState.filters.showTrend=!AppState.filters.showTrend;
    this.classList.toggle('active',AppState.filters.showTrend);
    this.textContent=AppState.filters.showTrend?'Hide':'Show';
    renderComputeScatter();
  });

  document.querySelectorAll('.hw-filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.hw;
      hwFilter = (hwFilter===t&&t!=='all') ? 'all' : t;
      document.querySelectorAll('.hw-filter-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.hw===hwFilter || (hwFilter==='all'&&b.dataset.hw==='all'));
      });
      renderHardwareEvolution();
    });
  });

  document.querySelectorAll('.info-icon').forEach(icon=>{
    icon.addEventListener('mouseenter',ev=>{
      showTT(ev,`<div style="font-family:var(--font-body);font-size:0.73rem;line-height:1.65;color:var(--text)">${icon.dataset.tip}</div>`);
    });
    icon.addEventListener('mousemove',moveTT);
    icon.addEventListener('mouseleave',hideTT);
  });

  document.getElementById('treemap-reset').addEventListener('click',()=>{
    AppState.filters.selectedOrg=null;
    renderTreemap(); renderOrgBar();
  });

  document.querySelectorAll('#cost-confidence-controls [data-cost-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.costMode;
      if(AppState.filters.costConfidenceMode === mode) return;
      AppState.filters.costConfidenceMode = mode;
      document.querySelectorAll('#cost-confidence-controls [data-cost-mode]').forEach(b => {
        b.classList.toggle('active', b.dataset.costMode === mode);
      });
      renderCostChart();
    });
  });

  wireMethodologyModal();
}

function wireMethodologyModal() {
  const trigger = document.getElementById('capex-method-btn');
  const overlay = document.getElementById('methodology-overlay');
  const modal   = document.getElementById('methodology-modal');
  const closeBtn= document.getElementById('methodology-close');
  if(!trigger||!overlay||!modal||!closeBtn) return;

  let lastFocus = null;

  function focusableEls() {
    return Array.from(modal.querySelectorAll(
      'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }

  function onKeydown(ev) {
    if(ev.key === 'Escape') { ev.preventDefault(); closeModal(); return; }
    if(ev.key !== 'Tab') return;
    const items = focusableEls();
    if(!items.length) { ev.preventDefault(); modal.focus(); return; }

    if(!modal.contains(document.activeElement)) {
      ev.preventDefault();
      items[0].focus();
      return;
    }
    const first = items[0], last = items[items.length-1];
    if(ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if(!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function openModal() {
    lastFocus = document.activeElement;
    overlay.hidden = false;

    requestAnimationFrame(()=>overlay.classList.add('open'));
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);

    setTimeout(()=>{ closeBtn.focus(); }, 30);
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';

    setTimeout(()=>{ overlay.hidden = true; }, 200);
    if(lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch(_){}
    }
  }

  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', ev => { if(ev.target === overlay) closeModal(); });
}

async function loadCSV(path) {
  const res=await fetch(path);
  if(!res.ok) throw new Error(`Failed: ${path}`);
  const text=await res.text();
  return new Promise((resolve,reject)=>{
    Papa.parse(text,{
      header:true,
      skipEmptyLines:true,
      complete:r=>r.errors.length ? reject(new Error('Invalid CSV: '+path)) : resolve(r.data),
      error:reject
    });
  });
}

function processModels(rows) {
  return rows.map(r=>{

    const confidence = normalizeConfidence((r['Confidence'] || '').trim());

    const cemRaw = (r['Training compute estimation method']||'').trim();
    const computeEstimationMethod = cemRaw || null;

    const overRaw = (r['Estimated over 1e25 FLOP']||'').trim();
    const estimatedOver1e25 = overRaw || null;
    return {
      name:         (r['Model']||'').trim(),
      quantity:     parseNum(r['Hardware quantity']),
      trainingHardware: (r['Training hardware'] || '').trim(),
      computeNotes: r['Training compute notes'] || '',
      dataCenter: r['Training data center'] || '',
      sourceLink: r['Link'] || '',
      date:         parseDate(r['Publication date']),
      org:          r['Organization']||'Unknown',
      flop:         parseNum(r['Training compute (FLOP)']),
      domain:       getPrimaryDomain(r['Domain']),
      params:       parseNum(r['Parameters']),
      accessibility:r['Model accessibility']||'',
      cost:         parseNum(r['Training compute cost (2023 USD)']),
      country:      r['Country (of organization)']||'Unknown',

      openWeights:  isOpenWeights(r),
      frontier:     isFrontier(r),

      confidence,
      computeEstimationMethod,
      estimatedOver1e25,
    };
  }).filter(r=>r.name);
}

function processHardware(rows) {
  return rows.map(r=>({
    name:       r['Hardware name']||'',
    mfr:        r['Manufacturer']||'Unknown',
    type:       (r['Type'] || '').trim() || 'Unknown',
    releaseDate:parseDate(r['Release date']),
    price:      parseNum(r['Release price (USD)']),
    fp16:       parseNum(r['Tensor-FP16/BF16 performance (FLOP/s)']),
    mem:        parseNum(r['Memory (bytes)']),
    memBW:      parseNum(r['Memory bandwidth (byte/s)']),
    tdp:        parseNum(r['TDP (W)']),
    effic:      parseNum(r['Energy efficiency']),
    process:    parseNum(r['Process size (nm)']),
  })).filter(r=>r.name);
}

function updateAboutBannerMeta() {
  const {models,hardware}=AppState.data;
  const coverage=(rows,key)=>{const dates=rows.map(r=>r[key]).filter(Boolean);return dates.length?new Date(Math.max(...dates)).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'unknown';};
  const label=`Model data through ${coverage(models,'date')}. Hardware data through ${coverage(hardware,'releaseDate')}.`;
  document.getElementById('dbt-model-count').textContent=applyDateFilter(models,'date').length;
  document.getElementById('dbt-hw-count').textContent=applyDateFilter(hardware,'releaseDate').length;
  ['dbt-updated','df-updated-date','dataset-coverage','method-coverage'].forEach(id=>document.getElementById(id).textContent=label);
  const unknown=models.filter(m=>m.openWeights==='unknown').length;
  document.getElementById('frontier-coverage').textContent=`${models.filter(m=>m.frontier).length} of ${models.length} supplied records are marked Frontier model = TRUE.`;
  document.getElementById('weights-coverage').textContent=models.length?`Open-weight status is unknown for ${unknown}/${models.length} records (${(100*unknown/models.length).toFixed(1)}%) in the full snapshot. Unknown does not mean closed.`:'No model data loaded.';
}

function updateMethodologyConfidenceBreakdown() {
  const models=AppState.data.models;
  const counts={Confident:0,Likely:0,Speculative:0,Unknown:0};
  models.forEach(m=>counts[m.confidence]++);
  document.getElementById('method-conf-breakdown').textContent=`All ${models.length} supplied model records: `+Object.entries(counts).map(([k,v])=>`${v} ${k}`).join(', ')+'. These are source labels, not independent verification.';
  document.getElementById('method-cost-summary').textContent=`${models.filter(m=>m.cost>0).length} of ${models.length} supplied records have positive cost estimates. ${models.filter(m=>m.frontier).length} are marked Frontier model = TRUE. Missing values are omitted, not estimated.`;
  document.getElementById('hero-local-estimates').textContent='Local Epoch cost estimates: '+['GPT-4.5','Grok 4'].map(name=>{const m=models.find(m=>m.name===name);return m?`${name}: ${formatCost(m.cost)} (${m.confidence}, 2023 USD)`:`${name}: no record`;}).join('; ')+'.';
  document.getElementById('cluster-context').textContent=['Grok 3','Grok 4'].map(name=>{
    const m=models.find(m=>m.name===name);if(!m)return `${name}: no record.`;
    const context=name==='Grok 3'?'The compute notes tie this quantity to an approximately three-month training estimate; a separate stage split is not specified.':`Training data center note: ${m.dataCenter}`;
    return `${name}: ${m.quantity?.toLocaleString() || 'unknown quantity'} ${m.trainingHardware || 'GPUs, type unspecified'} (${m.confidence}). ${context}`;
  }).join(' ');
}

function initAboutBanner() {
  const toggle = document.getElementById('about-toggle');
  const panel  = document.getElementById('about-panel');
  if (toggle && panel && !toggle.dataset.wired) {
    toggle.dataset.wired = '1';
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      if (isOpen) panel.setAttribute('hidden','');
      else panel.removeAttribute('hidden');
    });
  }
}

async function init() {
  try {
    const [modelRows, hwRows] = await Promise.all([
      loadCSV('./data/frontier_ai_models.csv'),
      loadCSV('./data/ml_hardware.csv'),
    ]);

    const models = processModels(modelRows);
    const hardware = processHardware(hwRows);

    AppState.data.models = models;
    AppState.data.hardware = hardware;
    AppState.orgColors = buildOrgColors(models);

    wireControls();
    initScrubber();
    initAboutBanner();

    updateAboutBannerMeta();

    updateMethodologyConfidenceBreakdown();

    AppState.filters.domain = null;

    renderOverview();

    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
    setTimeout(()=>{ loading.style.display='none'; }, 500);

  } catch(err) {
    document.getElementById('loading').innerHTML=`
      <div style="color:var(--danger);font-family:var(--font-mono);font-size:0.8rem;text-align:center;padding:40px">
        <div style="font-size:2rem;margin-bottom:12px">✕</div>
        <div>Failed to load data</div>
        <div style="color:var(--muted);margin-top:8px;font-size:0.7rem">${err.message}</div>
        <div style="color:var(--muted);margin-top:4px;font-size:0.65rem">Ensure CSVs are in ./data/ and served via HTTP</div>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
