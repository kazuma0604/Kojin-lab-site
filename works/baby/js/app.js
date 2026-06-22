(function () {
'use strict';

const STORAGE_KEY = 'kl-baby-tracker-v1';
const GROWTH_KEY = 'kl-baby-tracker-growth-v1';
const SETTINGS_KEY = 'kl-baby-tracker-settings-v1';
const VAX_KEY = 'kl-baby-tracker-vax-v1';
const FAV_KEY = 'kl-baby-tracker-favorites-v1';
const MILESTONE_KEY = 'kl-baby-tracker-milestones-v1';
const PHOTO_KEY = 'kl-baby-tracker-photos-v1';
const MEDICAL_KEY = 'kl-baby-tracker-medical-v1';

// --- Tunable constants (values unchanged from inline original) ---
const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 86400000;
const DEFAULT_RANGE_DAYS = 7;          // week view default
const REMINDER_HOURS = 3;              // feeding reminder delay
const VAX_SOON_DAYS = 7;              // "due soon" window before scheduled date
const VAX_OVERDUE_DAYS = 180;         // keep flagging overdue up to this many days
const PHOTO_MAX_WIDTH = 800;          // photo downscale target width (px)
const PHOTO_JPEG_QUALITY = 0.75;      // photo JPEG compression quality
const SLEEP_GOOD_HOURS = 14;          // "slept well" comment threshold
const MILK_LOTS_ML = 700;             // "drank a lot" comment threshold
const POOP_GOOD_COUNT = 2;            // "regular" comment threshold
const FEVER_TEMP = 37.5;              // fever warning threshold (℃)
const AGE_DAYS_TO_MONTHS = 100;       // switch from "X日" to "Xヶ月Y日" display
const DEMO_DAYS_BACK = 100;           // demo birthday offset (days ago)
const SEARCH_FOCUS_DELAY = 100;       // ms before focusing search input

const state = {
  data: loadJSON(STORAGE_KEY, {}),
  growth: loadJSON(GROWTH_KEY, []),
  settings: loadJSON(SETTINGS_KEY, {}),    // { birthDate, dark, reminder }
  vax: loadJSON(VAX_KEY, {}),
  favorites: loadJSON(FAV_KEY, []),
  milestones: loadJSON(MILESTONE_KEY, {}), // { [id]: 'YYYY-MM-DD' }
  photos: loadJSON(PHOTO_KEY, {}),         // { 'YYYY-MM-DD': dataUrl }
  medical: loadJSON(MEDICAL_KEY, []),      // [{ id, date, type, title, note }]
  current: todayStr(),
  editingId: null,
  modalType: null,
  range: DEFAULT_RANGE_DAYS,
  tipCat: 0,
  calMonth: null,
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}
function saveGrowth() {
  localStorage.setItem(GROWTH_KEY, JSON.stringify(state.growth));
}
function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function dayObj(date) {
  if (!state.data[date]) state.data[date] = { entries: [], memo: '' };
  return state.data[date];
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// --- Rendering ---
function render() {
  document.getElementById('dateInput').value = state.current;
  const day = dayObj(state.current);

  // summary
  let milk = 0, diaper = 0, poop = 0, sleep = 0, lastTemp = null, lastTempMin = -1;
  day.entries.forEach(e => {
    if (e.type === 'milk') milk += Number(e.amount) || 0;
    if (e.type === 'diaper') diaper++;
    if (e.type === 'poop') poop++;
    if (e.type === 'sleep' && e.endMin != null) {
      let dur = e.endMin - e.startMin;
      if (dur < 0) dur += MINUTES_PER_DAY;
      sleep += dur;
    }
    if (e.type === 'temp' && e.startMin > lastTempMin) {
      lastTemp = e.value; lastTempMin = e.startMin;
    }
  });
  document.getElementById('sumMilk').textContent = milk + 'ml';
  document.getElementById('sumDiaper').textContent = diaper + '回';
  document.getElementById('sumPoop').textContent = poop + '回';
  document.getElementById('sumSleep').textContent = (sleep / 60).toFixed(1) + 'h';
  document.getElementById('sumTemp').textContent = lastTemp != null ? lastTemp.toFixed(1) + '℃' : '—';

  // hourly grid
  const list = document.getElementById('hourList');
  list.innerHTML = '';
  const nowH = (state.current === todayStr()) ? new Date().getHours() : -1;
  const hoursWithEntries = new Set(day.entries.map(e => Math.floor((e.startMin ?? 0) / 60)));

  for (let h = 0; h < 24; h++) {
    const hasEntries = hoursWithEntries.has(h);
    const isNow = h === nowH;
    if (!hasEntries && !isNow) {
      // collapse consecutive empty hours into one slim row
      const last = list.lastElementChild;
      if (last && last.classList.contains('empty')) {
        last.querySelector('.hour-label').textContent =
          last.querySelector('.hour-label').dataset.start + '–' +
          String(h).padStart(2, '0') + ':00';
        continue;
      }
      const row = document.createElement('div');
      row.className = 'hour empty';
      const label = document.createElement('div');
      label.className = 'hour-label';
      label.textContent = String(h).padStart(2, '0') + ':00';
      label.dataset.start = String(h).padStart(2, '0') + ':00';
      row.appendChild(label);
      row.appendChild(document.createElement('div'));
      list.appendChild(row);
      continue;
    }

    const row = document.createElement('div');
    row.className = 'hour' + (isNow ? ' now' : '');
    const label = document.createElement('div');
    label.className = 'hour-label';
    label.textContent = String(h).padStart(2, '0') + ':00';
    const entries = document.createElement('div');
    entries.className = 'entries';

    day.entries
      .filter(e => Math.floor((e.startMin ?? 0) / 60) === h)
      .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0))
      .forEach(e => entries.appendChild(renderEntry(e)));

    row.appendChild(label);
    row.appendChild(entries);
    list.appendChild(row);
  }

  document.getElementById('memo').value = day.memo || '';

  renderGrowth();
  renderSummary();
  renderVax();
  renderFavoriteState();
  renderAge();
  renderDailySummary();
  renderMilestones();
  renderCalendar();
  renderPhoto();
  renderMedical();
  scheduleReminder();
}

function renderGrowth() {
  const sorted = state.growth.slice().sort((a, b) => a.date.localeCompare(b.date));
  const weightPts = sorted.filter(g => g.weight != null).map(g => ({ date: g.date, value: g.weight }));
  const heightPts = sorted.filter(g => g.height != null).map(g => ({ date: g.date, value: g.height }));

  // latest + delta vs previous
  setLatest('latestWeight', 'deltaWeight', weightPts, 'g', 0);
  setLatest('latestHeight', 'deltaHeight', heightPts, 'cm', 1);

  renderChart(document.getElementById('weightChart'), weightPts, '#7bbcf0', 'g', 0);
  renderChart(document.getElementById('heightChart'), heightPts, '#6dbd8b', 'cm', 1);

  // list
  const list = document.getElementById('growthList');
  list.innerHTML = '';
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'growth-empty';
    empty.textContent = 'まだ記録がありません。＋ボタンで追加してください';
    list.appendChild(empty);
    return;
  }
  sorted.slice().reverse().forEach(g => {
    const row = document.createElement('div');
    row.className = 'growth-item';
    row.innerHTML =
      `<span class="gdate">${g.date}</span>` +
      `<span>${g.weight != null ? '🟦 ' + g.weight + 'g' : ''}</span>` +
      `<span>${g.height != null ? '🟩 ' + g.height + 'cm' : ''}</span>`;
    row.addEventListener('click', () => openModal('growth', g));
    list.appendChild(row);
  });
}

function setLatest(valId, deltaId, pts, unit, digits) {
  const valEl = document.getElementById(valId);
  const dEl = document.getElementById(deltaId);
  if (pts.length === 0) { valEl.textContent = '—'; dEl.textContent = ''; return; }
  const last = pts[pts.length - 1];
  valEl.textContent = last.value.toFixed(digits) + unit;
  if (pts.length >= 2) {
    const diff = last.value - pts[pts.length - 2].value;
    const sign = diff > 0 ? '+' : (diff < 0 ? '' : '±');
    dEl.textContent = `前回比 ${sign}${diff.toFixed(digits)}${unit}`;
    dEl.className = 'delta' + (diff === 0 ? ' zero' : '');
  } else {
    dEl.textContent = '';
  }
}

function renderChart(svg, points, color, unit, digits) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  const w = svg.clientWidth || 320;
  const h = 140;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  if (points.length === 0) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', w / 2); t.setAttribute('y', h / 2);
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', '#bbb');
    t.setAttribute('font-size', '11');
    t.textContent = 'データがありません';
    svg.appendChild(t);
    return;
  }

  const padding = { l: 40, r: 10, t: 8, b: 20 };
  const values = points.map(p => p.value);
  let vMin = Math.min(...values), vMax = Math.max(...values);
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const pad = (vMax - vMin) * 0.1;
  vMin -= pad; vMax += pad;
  const vRange = vMax - vMin;

  const times = points.map(p => new Date(p.date).getTime());
  let tMin = Math.min(...times), tMax = Math.max(...times);
  if (tMin === tMax) { tMin -= MS_PER_DAY; tMax += MS_PER_DAY; }
  const tRange = tMax - tMin;

  const xS = t => padding.l + ((t - tMin) / tRange) * (w - padding.l - padding.r);
  const yS = v => padding.t + (1 - (v - vMin) / vRange) * (h - padding.t - padding.b);

  // y grid + labels
  for (let i = 0; i <= 2; i++) {
    const v = vMax - (vMax - vMin) * i / 2;
    const y = padding.t + i * (h - padding.t - padding.b) / 2;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', padding.l); line.setAttribute('x2', w - padding.r);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#ead9c9'); line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', padding.l - 4); text.setAttribute('y', y + 3);
    text.setAttribute('fill', '#999'); text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', 'end');
    text.textContent = v.toFixed(digits);
    svg.appendChild(text);
  }

  // x labels (first and last)
  const fmtDate = ts => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  [['start', tMin, padding.l], ['end', tMax, w - padding.r]].forEach(([anchor, ts, x]) => {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', h - 6);
    t.setAttribute('fill', '#999'); t.setAttribute('font-size', '10');
    t.setAttribute('text-anchor', anchor);
    t.textContent = fmtDate(ts);
    svg.appendChild(t);
  });

  // line
  const ptsStr = points.map(p => `${xS(new Date(p.date).getTime())},${yS(p.value)}`).join(' ');
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('points', ptsStr);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', color);
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);

  // dots
  points.forEach(p => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', xS(new Date(p.date).getTime()));
    c.setAttribute('cy', yS(p.value));
    c.setAttribute('r', '3.5');
    c.setAttribute('fill', color);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${p.date}: ${p.value.toFixed(digits)}${unit}`;
    c.appendChild(title);
    svg.appendChild(c);
  });
}

// --- Summary (week/month) ---
function renderSummary() {
  const n = state.range;
  const days = [];
  const today = new Date(state.current);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(todayStr(d));
  }

  const milkPts = [], diaperPts = [], sleepPts = [];
  let mSum = 0, dSum = 0, sSum = 0;

  days.forEach(date => {
    const day = state.data[date] || { entries: [] };
    let m = 0, dia = 0, slp = 0;
    day.entries.forEach(e => {
      if (e.type === 'milk') m += Number(e.amount) || 0;
      if (e.type === 'diaper') dia++;
      if (e.type === 'sleep' && e.endMin != null) {
        let dur = e.endMin - e.startMin;
        if (dur < 0) dur += MINUTES_PER_DAY;
        slp += dur;
      }
    });
    milkPts.push({ date, value: m });
    diaperPts.push({ date, value: dia });
    sleepPts.push({ date, value: slp / 60 });
    mSum += m; dSum += dia; sSum += slp / 60;
  });

  document.getElementById('avgMilk').textContent   = Math.round(mSum / n) + 'ml';
  document.getElementById('avgDiaper').textContent = (dSum / n).toFixed(1) + '回';
  document.getElementById('avgSleep').textContent  = (sSum / n).toFixed(1) + 'h';

  renderBars(document.getElementById('milkBars'),  milkPts,  '#7bbcf0', 'ml', 0);
  renderBars(document.getElementById('sleepBars'), sleepPts, '#9b8cd1', 'h',  1);
}

function renderBars(svg, points, color, unit, digits) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  const w = svg.clientWidth || 320;
  const h = 140;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const padding = { l: 36, r: 8, t: 8, b: 18 };
  const innerW = w - padding.l - padding.r;
  const innerH = h - padding.t - padding.b;
  const n = points.length;
  if (n === 0) return;

  const vMax = Math.max(...points.map(p => p.value), 1);
  const slot = innerW / n;
  const barW = Math.max(slot * 0.7, 1);

  // y grid + labels
  [vMax, vMax / 2, 0].forEach((v, i) => {
    const y = padding.t + i * innerH / 2;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', padding.l); line.setAttribute('x2', w - padding.r);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#ead9c9'); line.setAttribute('stroke-width', '0.5');
    svg.appendChild(line);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', padding.l - 4); text.setAttribute('y', y + 3);
    text.setAttribute('fill', '#999'); text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', 'end');
    text.textContent = v.toFixed(digits);
    svg.appendChild(text);
  });

  // bars
  points.forEach((p, i) => {
    const cx = padding.l + i * slot + slot / 2;
    const x = cx - barW / 2;
    const barH = (p.value / vMax) * innerH;
    const y = padding.t + innerH - barH;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', barW); rect.setAttribute('height', Math.max(barH, 0));
    rect.setAttribute('fill', color); rect.setAttribute('rx', '2');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${p.date}: ${p.value.toFixed(digits)}${unit}`;
    rect.appendChild(title);
    svg.appendChild(rect);
  });

  // x labels: first, middle, last
  const fmtMD = ds => { const d = new Date(ds); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const labelIdx = n >= 3 ? [0, Math.floor(n / 2), n - 1] : (n === 2 ? [0, 1] : [0]);
  const anchors  = n >= 3 ? ['start', 'middle', 'end'] : (n === 2 ? ['start', 'end'] : ['middle']);
  labelIdx.forEach((idx, j) => {
    const cx = padding.l + idx * slot + slot / 2;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', cx); text.setAttribute('y', h - 4);
    text.setAttribute('fill', '#999'); text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', anchors[j]);
    text.textContent = fmtMD(points[idx].date);
    svg.appendChild(text);
  });
}

// --- Vaccinations ---
const VAX_SCHEDULE = [
  { id: 'rota',  name: 'ロタウイルス',         sub: '初回（2ヶ月以降）',    months: 2 },
  { id: 'hib1',  name: 'ヒブ (Hib)',           sub: '1回目',                months: 2 },
  { id: 'pcv1',  name: '小児用肺炎球菌',       sub: '1回目',                months: 2 },
  { id: 'hbv1',  name: 'B型肝炎',              sub: '1回目',                months: 2 },
  { id: 'hib2',  name: 'ヒブ (Hib)',           sub: '2回目',                months: 3 },
  { id: 'pcv2',  name: '小児用肺炎球菌',       sub: '2回目',                months: 3 },
  { id: 'dpt1',  name: '四種混合 (DPT-IPV)',   sub: '1回目',                months: 3 },
  { id: 'hbv2',  name: 'B型肝炎',              sub: '2回目',                months: 3 },
  { id: 'hib3',  name: 'ヒブ (Hib)',           sub: '3回目',                months: 4 },
  { id: 'pcv3',  name: '小児用肺炎球菌',       sub: '3回目',                months: 4 },
  { id: 'dpt2',  name: '四種混合 (DPT-IPV)',   sub: '2回目',                months: 4 },
  { id: 'dpt3',  name: '四種混合 (DPT-IPV)',   sub: '3回目',                months: 5 },
  { id: 'bcg',   name: 'BCG',                  sub: '5〜7ヶ月推奨',         months: 5 },
  { id: 'hbv3',  name: 'B型肝炎',              sub: '3回目（7-8ヶ月）',     months: 7 },
  { id: 'mr1',   name: '麻しん・風しん (MR)',  sub: '1期（1歳）',           months: 12 },
  { id: 'var1',  name: '水痘',                 sub: '1回目（1歳）',         months: 12 },
  { id: 'hib4',  name: 'ヒブ (Hib)',           sub: '追加（1歳〜）',        months: 12 },
  { id: 'pcv4',  name: '小児用肺炎球菌',       sub: '追加（1歳〜）',        months: 12 },
  { id: 'var2',  name: '水痘',                 sub: '2回目（1歳3ヶ月〜）',  months: 15 },
  { id: 'dpt4',  name: '四種混合 (DPT-IPV)',   sub: '追加（1歳〜）',        months: 18 },
];

function renderVax() {
  const birth = state.settings.birthDate;
  document.getElementById('birthDate').value = birth || '';
  const list = document.getElementById('vaxList');
  list.innerHTML = '';

  if (!birth) {
    const empty = document.createElement('div');
    empty.className = 'growth-empty';
    empty.textContent = '生年月日を入れると、推奨スケジュールが表示されます';
    list.appendChild(empty);
    return;
  }

  const today = new Date(state.current);
  const birthD = new Date(birth);
  const soonMs = VAX_SOON_DAYS * MS_PER_DAY;

  VAX_SCHEDULE.forEach(v => {
    const due = new Date(birthD);
    due.setMonth(due.getMonth() + v.months);
    const dueStr = todayStr(due);
    const done = state.vax[v.id];
    const diff = due - today;
    const isDue = !done && diff <= soonMs && diff >= -VAX_OVERDUE_DAYS * MS_PER_DAY;

    const row = document.createElement('div');
    row.className = 'vax-item' + (done ? ' done' : (isDue ? ' due' : ''));
    row.innerHTML =
      `<div><div class="vname">${v.name}<span class="vsub">${v.sub}</span></div></div>` +
      `<div class="vdate">${done ? '済 ' + done : '予定 ' + dueStr}</div>` +
      `<button data-vid="${v.id}">${done ? '取消' : '完了'}</button>`;
    row.querySelector('button').addEventListener('click', () => toggleVax(v.id));
    list.appendChild(row);
  });
}

function toggleVax(id) {
  if (state.vax[id]) {
    delete state.vax[id];
  } else {
    state.vax[id] = todayStr();
  }
  saveJSON(VAX_KEY, state.vax);
  renderVax();
}

// --- Favorites (memo) ---
function isFavorite(date) { return state.favorites.includes(date); }

function toggleFavorite() {
  const date = state.current;
  const i = state.favorites.indexOf(date);
  if (i >= 0) {
    state.favorites.splice(i, 1);
  } else {
    state.favorites.push(date);
  }
  saveJSON(FAV_KEY, state.favorites);
  renderFavoriteState();
}

function renderFavoriteState() {
  const star = document.getElementById('memoStar');
  const count = document.getElementById('favCount');
  const fav = isFavorite(state.current);
  star.textContent = fav ? '★' : '☆';
  star.classList.toggle('active', fav);
  star.title = fav ? 'お気に入りから外す' : 'お気に入りに追加';
  star.classList.remove('bump');
  if (fav) { void star.offsetWidth; star.classList.add('bump'); }
  count.textContent = state.favorites.length;
  count.classList.toggle('zero', state.favorites.length === 0);
}

function renderFavoritesList() {
  const list = document.getElementById('favList');
  list.innerHTML = '';
  const sorted = state.favorites.slice().sort().reverse();
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fav-empty';
    empty.innerHTML = '⭐ まだお気に入りはありません<br>メモ欄の☆をタップで追加できます';
    list.appendChild(empty);
    return;
  }
  const wd = ['日','月','火','水','木','金','土'];
  sorted.forEach(date => {
    const memo = (state.data[date] && state.data[date].memo) || '';
    const item = document.createElement('div');
    item.className = 'fav-item';

    const row = document.createElement('div');
    row.className = 'fav-item-row';
    const d = new Date(date);
    const dateSpan = document.createElement('div');
    dateSpan.innerHTML = `<span class="fav-date">${date}</span><span class="fav-weekday">(${wd[d.getDay()]})</span>`;
    const unstar = document.createElement('button');
    unstar.className = 'fav-unstar';
    unstar.textContent = '★';
    unstar.title = 'お気に入りから外す';
    unstar.addEventListener('click', e => {
      e.stopPropagation();
      const i = state.favorites.indexOf(date);
      if (i >= 0) state.favorites.splice(i, 1);
      saveJSON(FAV_KEY, state.favorites);
      renderFavoritesList();
      renderFavoriteState();
    });
    row.appendChild(dateSpan);
    row.appendChild(unstar);

    const text = document.createElement('div');
    text.className = 'fav-text';
    text.textContent = memo || '(メモはありません)';
    if (!memo) text.style.color = 'var(--muted)';

    item.appendChild(row);
    item.appendChild(text);
    item.addEventListener('click', () => {
      state.current = date;
      document.getElementById('favModalBg').classList.remove('show');
      switchTab('today');
      render();
    });
    list.appendChild(item);
  });
}

function openFavorites() {
  renderFavoritesList();
  document.getElementById('favModalBg').classList.add('show');
}

// --- Tips (豆知識) ---
const TIPS = [
  {
    id: 'feed', label: '🍼 授乳', items: [
      { icon: '⏱', title: '授乳の間隔の目安', body: '新生児期は2〜3時間おきが目安ですが、「飲みたがるサイン（くちをパクパク、手をなめる、ぐずる）」があれば時間に関わらず授乳してOK。\n回数より、1日の合計量と体重の増え方が大切です。' },
      { icon: '🍼', title: '1回のミルク量の目安', body: '0〜1ヶ月: 60〜100ml/回\n1〜2ヶ月: 100〜140ml/回\n3〜4ヶ月: 140〜200ml/回\n5〜6ヶ月: 200〜220ml/回\n※あくまで目安。飲まない・残すは正常範囲。' },
      { icon: '💨', title: 'げっぷは必ず出す', body: '授乳後すぐ寝かせると吐き戻しの原因に。\n5〜10分は縦抱きにして背中を優しくトントン。\nどうしても出ないときは右側を下にして寝かせると安心です。' },
      { icon: '⚠', title: 'ミルクは作り置きNG', warn: true, body: 'ミルクは作って1時間以内に飲ませる。\n70℃以上のお湯で溶かし、人肌まで冷ましてから。\n飲み残しは雑菌が増えるので必ず廃棄してください。' },
    ]
  },
  {
    id: 'sleep', label: '😴 睡眠', items: [
      { icon: '🌙', title: '新生児の睡眠サイクル', body: '1日合計16〜20時間、2〜3時間ごとの短いサイクル。\n昼夜の区別がつくのは生後3〜4ヶ月頃から。\n夜中の授乳は自然なことなので焦らず。' },
      { icon: '🛏', title: '寝かせ方の鉄則', danger: true, body: 'うつ伏せ寝はSIDS（乳幼児突然死症候群）のリスクが高いため必ず仰向けで。\n柔らかすぎる布団・枕・ぬいぐるみは顔の周りに置かない。\n添い寝は窒息リスクに注意。' },
      { icon: '🌡', title: '快適な寝室環境', body: '室温20〜22℃、湿度50〜60%が目安。\n寝室は薄暗く静かに。\n季節に応じてスリーパーで温度調整、寝具で覆いすぎない。' },
      { icon: '✨', title: '寝かしつけのコツ', body: 'おくるみ巻き・ホワイトノイズ・抱っこゆらゆらが効果的なことが多い。\n眠そうなサイン（あくび、目をこする）が出たら寝室へ。\n完全に寝てから置くより、うとうと状態で布団に置くと自分で眠る練習に。' },
    ]
  },
  {
    id: 'milestone', label: '👶 発達', items: [
      { icon: '👀', title: '1ヶ月', body: '物を目で追う。\n握り反射で指を握る。\n大きな音にビクッと反応。' },
      { icon: '😊', title: '2〜3ヶ月', body: '首がすわり始める。\n声を出して笑う（社会的微笑）。\nあやすと反応する。' },
      { icon: '🔄', title: '4〜5ヶ月', body: '寝返り。\n知らない人を意識し始める。\n手を伸ばしておもちゃを掴む。' },
      { icon: '🍚', title: '6〜7ヶ月', body: 'お座りができる。\n離乳食スタート。\n喃語（あー、うー）が増える。' },
      { icon: '🐛', title: '8〜9ヶ月', body: 'ハイハイ・ずりばい。\n人見知り・後追いが始まる。\nつまみ食べを始める子も。' },
      { icon: '🚶', title: '10〜12ヶ月', body: 'つかまり立ち→つたい歩き。\n「ママ」「パパ」などの初語。\nバイバイなどの真似ができる。' },
      { icon: '💡', title: '個人差は大きい', body: '発達には2〜3ヶ月の幅があるのが普通。\n他の子と比べず、その子のペースを大切に。\n気になる遅れがあれば小児科や保健センターに相談を。' },
    ]
  },
  {
    id: 'health', label: '🌡 病気のサイン', items: [
      { icon: '🚨', title: '今すぐ受診すべきサイン', danger: true, body: '・生後3ヶ月未満で37.5℃以上の発熱\n・けいれん、意識がない、ぐったりしている\n・呼吸が苦しそう、顔色が悪い\n・何度も嘔吐し水分が取れない\n・大泉門が陥没または膨らんでいる\n・血便、黒い便\n→ 迷わず救急受診または #8000 へ' },
      { icon: '🤒', title: '発熱したとき', body: '38℃以上が目安。\n機嫌・食欲・水分摂取ができているかを確認。\n薄着にして水分補給、おでこを冷やすより脇や首の付け根を。\n解熱剤は医師の指示があるときだけ。' },
      { icon: '🤮', title: '吐き戻し vs 嘔吐', body: '授乳後の少量の戻しは生理的なものが多い。\n勢いよく噴水のように吐く・繰り返す場合は受診を。\n水分が取れない、ぐったりしている時も注意。' },
      { icon: '💩', title: 'うんちの色で見る健康', body: '黄色〜茶色は正常。\n緑色も問題ないことが多い。\n赤・黒・白っぽい便は要受診。\n下痢が続く・水様便は脱水に注意。' },
    ]
  },
  {
    id: 'care', label: '🛁 お世話', items: [
      { icon: '🛁', title: '沐浴・お風呂', body: '生後1ヶ月までは沐浴（ベビーバス）。\n湯温は38〜40℃、10分以内が目安。\n1ヶ月健診後は大人とお風呂OK。\nお風呂上がりはすぐ保湿。' },
      { icon: '🧴', title: 'スキンケアの基本', body: '赤ちゃんの肌は薄くデリケート。\n洗うときは泡で優しく、こすらない。\n保湿は1日2回以上、低刺激のローション・クリームで。\n乳児湿疹は清潔と保湿で改善することが多い。' },
      { icon: '✂', title: '爪切り', body: '週2〜3回、寝ているときが切りやすい。\nベビー用の小さなはさみか爪切りを使用。\n深爪に注意。少しずつ角を落とすイメージで。' },
      { icon: '👕', title: '服装の目安', body: '生後1ヶ月までは大人より1枚多め、それ以降は1枚少なめが基本。\n首や背中を触って汗ばんでいたら厚着しすぎ。\n手足の冷たさだけで判断しない（赤ちゃんは末端が冷たくなりがち）。' },
    ]
  },
  {
    id: 'cry', label: '😢 泣くとき', items: [
      { icon: '🔎', title: '泣いたらまずチェック', body: '①お腹空いた ②おむつ ③暑い・寒い ④眠い ⑤げっぷ出したい ⑥どこか痛い・かゆい\nの順でチェックすると原因が見つけやすい。' },
      { icon: '🌅', title: '黄昏泣き（コリック）', body: '生後2〜3ヶ月頃、夕方〜夜に理由なく泣くことが多い。\n生後5〜6ヶ月で自然に減っていく。\n病気ではないので焦らずに。' },
      { icon: '🤗', title: '泣き止ませのワザ', body: 'おくるみで包む / ホワイトノイズ / 抱っこゆらゆら / お風呂 / 外気浴。\n効くものは赤ちゃんによって違うので色々試してOK。' },
      { icon: '💆', title: 'どうしてもダメな時', body: '安全な場所（ベビーベッドなど）に寝かせて、一度離れて深呼吸。\n親が追い詰められない方が大事。\n誰かに頼る・電話相談を使うのも立派な選択。' },
    ]
  },
  {
    id: 'parent', label: '💕 親のケア', items: [
      { icon: '💤', title: '睡眠は最優先', body: '「寝る時に寝る」が鉄則。\n家事は手抜きで大丈夫。\nパートナーや家族で分担、3時間でも連続で寝ると回復します。' },
      { icon: '🍱', title: '食事は簡単に', body: '冷凍食品・宅配・コンビニOK。\n水分補給はこまめに（特に授乳中は喉が渇く）。\n産後しばらくは栄養より「食べる」ことを優先。' },
      { icon: '🫂', title: '産後うつのサイン', warn: true, body: '・2週間以上気分が落ち込む\n・赤ちゃんが可愛く思えない\n・食欲・睡眠の極端な変化\n→ 早めに産婦人科・保健センター・かかりつけ医に相談を。\n一人で抱え込まないで。' },
      { icon: '📞', title: '頼れる窓口', body: '#8000：子ども医療電話相談\n#7119：救急安心センター（地域による）\n保健センター：地域の子育て相談\nファミサポ・一時保育も活用を。' },
    ]
  },
];

function renderCatBar() {
  const bar = document.getElementById('catBar');
  bar.innerHTML = '';
  TIPS.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'cat-chip' + (i === (state.tipCat || 0) ? ' active' : '');
    btn.textContent = cat.label;
    btn.addEventListener('click', () => {
      state.tipCat = i;
      renderCatBar();
      renderTipList();
    });
    bar.appendChild(btn);
  });
}

function renderTipList() {
  const list = document.getElementById('tipList');
  list.innerHTML = '';
  const cat = TIPS[state.tipCat || 0];
  cat.items.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tip-card' + (t.danger ? ' danger' : (t.warn ? ' warn' : ''));
    const h = document.createElement('h4');
    h.innerHTML = `<span class="tip-icon">${t.icon}</span>${t.title}`;
    const p = document.createElement('p');
    p.textContent = t.body;
    card.appendChild(h);
    card.appendChild(p);
    list.appendChild(card);
  });
}

function renderTips() {
  renderCatBar();
  renderTipList();
}

// --- Photos ---
function renderPhoto() {
  const preview = document.getElementById('photoPreview');
  const delBtn = document.getElementById('photoDeleteBtn');
  const dataUrl = state.photos[state.current];
  if (dataUrl) {
    preview.innerHTML = '';
    preview.classList.remove('empty');
    const img = document.createElement('img');
    img.src = dataUrl;
    preview.appendChild(img);
    delBtn.style.display = '';
  } else {
    preview.innerHTML = '';
    preview.classList.add('empty');
    delBtn.style.display = 'none';
  }
}

function compressAndStorePhoto(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxW = PHOTO_MAX_WIDTH;
      const scale = Math.min(1, maxW / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
      try {
        state.photos[state.current] = dataUrl;
        saveJSON(PHOTO_KEY, state.photos);
        renderPhoto();
      } catch (err) {
        alert('保存に失敗しました（容量不足の可能性）: ' + err.message);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// --- Medical log ---
function renderMedical() {
  const list = document.getElementById('medicalList');
  list.innerHTML = '';
  const today = state.medical.filter(m => m.date === state.current)
                     .sort((a, b) => b.id.localeCompare(a.id));
  if (today.length === 0) {
    list.innerHTML = '<div class="medical-empty">記録はまだありません</div>';
    return;
  }
  const icons = { '通院': '🏥', '薬': '💊', '症状': '🤒', 'その他': '📝' };
  today.forEach(m => {
    const item = document.createElement('div');
    item.className = 'medical-item';
    item.innerHTML = `
      <div class="med-icon">${icons[m.type] || '📝'}</div>
      <div><div class="med-title">${escapeHtml(m.title)}</div>${m.note ? '<span class="med-note">' + escapeHtml(m.note) + '</span>' : ''}</div>
      <div class="med-date">${m.type}</div>
    `;
    item.addEventListener('click', () => openMedicalEdit(m));
    list.appendChild(item);
  });
}
function openMedicalEdit(m) {
  openModal('medical', m);
}

// --- Calendar ---
function renderCalendar() {
  let m = state.calMonth;
  if (!m) {
    const d = new Date(state.current);
    m = state.calMonth = { y: d.getFullYear(), mo: d.getMonth() };
  }
  document.getElementById('calLabel').textContent = `${m.y}年 ${m.mo + 1}月`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const heads = ['日','月','火','水','木','金','土'];
  heads.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'cal-head' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : ''));
    el.textContent = h;
    grid.appendChild(el);
  });
  const first = new Date(m.y, m.mo, 1);
  const last = new Date(m.y, m.mo + 1, 0);
  for (let i = 0; i < first.getDay(); i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const dateStr = `${m.y}-${String(m.mo + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const day = state.data[dateStr];
    const cell = document.createElement('div');
    let cls = 'cal-day';
    if (dateStr === todayStr()) cls += ' today';
    if (dateStr === state.current) cls += ' selected';
    cell.className = cls;
    cell.innerHTML = `<span class="cd-num">${d}</span>`;
    const dots = document.createElement('div');
    dots.className = 'cd-dots';
    if (day && day.entries.some(e => e.type === 'milk')) dots.innerHTML += '<span class="dot d-milk"></span>';
    if (day && day.entries.some(e => e.type === 'poop')) dots.innerHTML += '<span class="dot d-poop"></span>';
    if (state.favorites.includes(dateStr)) dots.innerHTML += '<span class="dot d-fav"></span>';
    cell.appendChild(dots);
    cell.addEventListener('click', () => {
      state.current = dateStr;
      switchTab('today');
      render();
    });
    grid.appendChild(cell);
  }
}

// --- Daily summary text ---
function renderDailySummary() {
  const el = document.getElementById('dailySummary');
  const day = state.data[state.current];
  if (!day || day.entries.length === 0) {
    el.innerHTML = '';
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  let milk = 0, milkCount = 0, diaper = 0, poop = 0, sleep = 0, temps = [];
  day.entries.forEach(e => {
    if (e.type === 'milk') { milk += Number(e.amount) || 0; milkCount++; }
    if (e.type === 'diaper') diaper++;
    if (e.type === 'poop') poop++;
    if (e.type === 'sleep' && e.endMin != null) {
      let d = e.endMin - e.startMin;
      if (d < 0) d += MINUTES_PER_DAY;
      sleep += d;
    }
    if (e.type === 'temp') temps.push(e.value);
  });
  const sleepH = (sleep / 60).toFixed(1);
  const parts = [];
  if (milkCount > 0) parts.push(`ミルク <span class="ds-stat">${milkCount}回</span>（合計 <span class="ds-stat">${milk}ml</span>）`);
  if (diaper > 0) parts.push(`おむつ替え <span class="ds-stat">${diaper}回</span>`);
  if (poop > 0) parts.push(`うんち <span class="ds-stat">${poop}回</span>`);
  if (sleep > 0) parts.push(`睡眠 <span class="ds-stat">${sleepH}時間</span>`);
  if (temps.length) {
    const maxT = Math.max(...temps);
    parts.push(`体温 最高 <span class="ds-stat">${maxT.toFixed(1)}℃</span>`);
  }
  let comment = '';
  if (sleep / 60 >= SLEEP_GOOD_HOURS) comment = '今日はよく眠れました 😴✨';
  else if (milk >= MILK_LOTS_ML) comment = 'たくさん飲みました 🍼💪';
  else if (poop >= POOP_GOOD_COUNT) comment = '快腸でした 💩';
  else if (temps.some(t => t >= FEVER_TEMP)) comment = '⚠ 熱があります。様子を見てあげてください';
  else comment = 'おつかれさまでした 🌷';

  el.innerHTML = `
    <div class="ds-title">📋 ${state.current} のまとめ</div>
    <div class="ds-text">${parts.join('、')}。<br>${comment}</div>
  `;
}

// --- Milestones ---
const MILESTONES = [
  { id: 'smile',    icon: '😊', name: '初めての笑顔',         sub: '社会的微笑（生後2ヶ月頃）' },
  { id: 'neck',     icon: '🦒', name: '首がすわった',         sub: '生後3〜4ヶ月頃' },
  { id: 'roll',     icon: '🔄', name: '寝返り',               sub: '生後4〜6ヶ月頃' },
  { id: 'sit',      icon: '🪑', name: 'お座りができた',       sub: '生後6〜7ヶ月頃' },
  { id: 'crawl',    icon: '🐛', name: 'ハイハイ',             sub: '生後8〜10ヶ月頃' },
  { id: 'stand',    icon: '🧍', name: 'つかまり立ち',         sub: '生後9〜11ヶ月頃' },
  { id: 'walk',     icon: '🚶', name: '初めての一歩',         sub: '生後10〜14ヶ月頃' },
  { id: 'word',     icon: '🗣',  name: '初めての言葉',         sub: '「ママ」「パパ」など' },
  { id: 'tooth',    icon: '🦷', name: '最初の歯',             sub: '生後6〜9ヶ月頃' },
  { id: 'baby_food',icon: '🍚', name: '離乳食スタート',       sub: '生後5〜6ヶ月頃' },
  { id: 'laugh',    icon: '😆', name: '声を出して笑う',       sub: '生後3〜4ヶ月頃' },
  { id: 'wave',     icon: '👋', name: 'バイバイができた',     sub: '生後10〜12ヶ月頃' },
];

function renderMilestones() {
  const list = document.getElementById('milestoneList');
  list.innerHTML = '';
  MILESTONES.forEach(m => {
    const done = state.milestones[m.id];
    const item = document.createElement('div');
    item.className = 'milestone-item' + (done ? ' done' : '');
    item.innerHTML = `
      <div class="m-icon">${m.icon}</div>
      <div><div class="m-name">${m.name}</div><span class="m-sub">${m.sub}</span></div>
      <div class="m-date">${done ? done : '—'}</div>
      <button data-id="${m.id}">${done ? '取消' : '達成'}</button>
    `;
    item.querySelector('button').addEventListener('click', () => toggleMilestone(m.id));
    list.appendChild(item);
  });
}
function toggleMilestone(id) {
  if (state.milestones[id]) delete state.milestones[id];
  else state.milestones[id] = state.current;
  saveJSON(MILESTONE_KEY, state.milestones);
  renderMilestones();
}

// --- Age counter ---
// 生年月日を「ローカル日付の0時」として扱い、当日との日数差で計算する。
// 例: 誕生日=6/3 → 6/3 は生後0日、6/4 は生後1日、6/8 は生後5日。
function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function renderAge() {
  const el = document.getElementById('ageText');
  const birth = state.settings.birthDate;
  if (!birth) { el.textContent = '生年月日を設定'; el.classList.add('empty'); return; }
  el.classList.remove('empty');
  const b = parseLocalDate(birth);
  const nowRaw = new Date();
  const now = new Date(nowRaw.getFullYear(), nowRaw.getMonth(), nowRaw.getDate());
  const diffMs = now - b;
  if (diffMs < 0) { el.textContent = 'もうすぐ誕生!'; return; }
  const days = Math.round(diffMs / MS_PER_DAY);
  if (days < AGE_DAYS_TO_MONTHS) { el.textContent = `生後 ${days} 日`; return; }
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  const dayDiff = now.getDate() - b.getDate();
  if (dayDiff < 0) months--;
  let extraDays = dayDiff;
  if (extraDays < 0) {
    const prev = new Date(now.getFullYear(), now.getMonth(), 0);
    extraDays += prev.getDate();
  }
  if (months < 12) {
    el.textContent = `生後 ${months}ヶ月${extraDays}日`;
  } else {
    const years = Math.floor(months / 12);
    const rem = months % 12;
    el.textContent = `${years}歳${rem}ヶ月`;
  }
}

// --- Dark mode ---
function applyTheme() {
  const dark = !!state.settings.dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1a1815' : '#d67487');
  const t = document.getElementById('darkToggle');
  if (t) t.checked = dark;
}

// --- Search ---
function renderSearch(q) {
  const list = document.getElementById('searchResults');
  list.innerHTML = '';
  q = (q || '').trim();
  if (!q) {
    list.innerHTML = '<div class="search-empty">検索したいキーワードを入力してください</div>';
    return;
  }
  const matches = [];
  Object.keys(state.data).forEach(date => {
    const memo = state.data[date].memo || '';
    if (memo.toLowerCase().includes(q.toLowerCase())) {
      matches.push({ date, memo });
    }
  });
  matches.sort((a, b) => b.date.localeCompare(a.date));
  if (matches.length === 0) {
    list.innerHTML = '<div class="search-empty">"' + escapeHtml(q) + '" に該当するメモはありません</div>';
    return;
  }
  const wd = ['日','月','火','水','木','金','土'];
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'fav-item';
    const d = new Date(m.date);
    const head = `<div class="fav-item-row"><div><span class="fav-date">${m.date}</span><span class="fav-weekday">(${wd[d.getDay()]})</span></div></div>`;
    const body = escapeHtml(m.memo).replace(re, '<mark>$1</mark>');
    item.innerHTML = head + `<div class="fav-text">${body}</div>`;
    item.addEventListener('click', () => {
      state.current = m.date;
      document.getElementById('searchModalBg').classList.remove('show');
      switchTab('today');
      render();
    });
    list.appendChild(item);
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// --- JSON export / import ---
function exportJSON() {
  const dump = {
    data: state.data,
    growth: state.growth,
    settings: state.settings,
    vax: state.vax,
    favorites: state.favorites,
    milestones: state.milestones,
    photos: state.photos,
    medical: state.medical,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `baby-tracker-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
// Reminder stub (full implementation in scheduleReminder section below)
let reminderTimer = null;
function scheduleReminder() {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if (!state.settings.reminder) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const day = state.data[todayStr()];
  if (!day) return;
  const lastMilk = day.entries.filter(e => e.type === 'milk')
    .sort((a, b) => (b.startMin ?? 0) - (a.startMin ?? 0))[0];
  if (!lastMilk) return;
  const now = new Date();
  const lastTime = new Date();
  lastTime.setHours(Math.floor(lastMilk.startMin / 60), lastMilk.startMin % 60, 0, 0);
  const next = new Date(lastTime.getTime() + REMINDER_HOURS * 60 * 60 * 1000);
  const ms = next - now;
  if (ms <= 0) return;
  reminderTimer = setTimeout(() => {
    new Notification('🍼 そろそろ授乳の時間です', {
      body: `最後の授乳から3時間が経ちました`,
      icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ccircle cx=\'50\' cy=\'58\' r=\'30\' fill=\'%23b8b4b0\'/%3E%3C/svg%3E'
    });
  }, ms);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!confirm('現在のデータを上書きします。よろしいですか？')) return;
      if (d.data) state.data = d.data;
      if (d.growth) state.growth = d.growth;
      if (d.settings) state.settings = d.settings;
      if (d.vax) state.vax = d.vax;
      if (d.favorites) state.favorites = d.favorites;
      if (d.milestones) state.milestones = d.milestones;
      if (d.photos) state.photos = d.photos;
      if (d.medical) state.medical = d.medical;
      saveAll(); saveGrowth();
      saveJSON(SETTINGS_KEY, state.settings);
      saveJSON(VAX_KEY, state.vax);
      saveJSON(FAV_KEY, state.favorites);
      saveJSON(MILESTONE_KEY, state.milestones);
      saveJSON(PHOTO_KEY, state.photos);
      saveJSON(MEDICAL_KEY, state.medical);
      applyTheme();
      render();
      alert('インポートが完了しました');
    } catch (err) {
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function renderEntry(e) {
  const span = document.createElement('span');
  span.className = 'entry e-' + e.type;
  const t = minToHm(e.startMin);
  let text = '';
  if (e.type === 'milk')   text = `🍼 ${t} ${e.amount}ml`;
  if (e.type === 'diaper') text = `👶 ${t} ${e.state}`;
  if (e.type === 'poop')   text = `💩 ${t} ${e.state}・${e.amount}`;
  if (e.type === 'sleep') {
    const end = e.endMin != null ? minToHm(e.endMin) : '?';
    text = `😴 ${t}〜${end}`;
  }
  if (e.type === 'temp') {
    text = `🌡 ${t} ${e.value.toFixed(1)}℃`;
    if (e.value >= FEVER_TEMP) span.classList.add('warn');
  }
  span.textContent = text;
  span.addEventListener('click', () => openModal(e.type, e));
  return span;
}

function minToHm(min) {
  if (min == null) return '--:--';
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
function hmToMin(s) {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// --- Modal ---
function openModal(type, entry = null) {
  state.modalType = type;
  state.editingId = entry ? entry.id : null;

  document.getElementById('modalTitle').textContent =
    (entry ? '記録を編集 - ' : '記録を追加 - ') +
    ({milk:'ミルク', diaper:'おむつ', poop:'うんち', sleep:'睡眠', temp:'体温', growth:'体重・身長', medical:'通院・薬'}[type]);

  ['Milk','Diaper','Poop','Sleep','Temp','Growth','Medical'].forEach(t =>
    document.getElementById('field' + t).style.display = 'none');
  document.getElementById('field' + cap(type)).style.display = 'block';

  // time field is hidden for growth and medical (they use date instead)
  const timeInput = document.getElementById('mTime');
  const timeRow = timeInput.parentElement;
  const timeLabel = timeRow.previousElementSibling;
  const showTime = type !== 'growth' && type !== 'medical';
  timeLabel.style.display = showTime ? '' : 'none';
  timeRow.style.display = showTime ? '' : 'none';

  // defaults
  const now = new Date();
  const defTime = entry
    ? minToHm(entry.startMin)
    : String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  timeInput.value = defTime;

  if (type === 'milk')   document.getElementById('mMilk').value = entry?.amount ?? '';
  if (type === 'diaper') document.getElementById('mDiaper').value = entry?.state ?? 'おしっこ';
  if (type === 'poop') {
    document.getElementById('mPoopState').value = entry?.state ?? 'ふつう';
    document.getElementById('mPoopAmount').value = entry?.amount ?? '中';
  }
  if (type === 'sleep')  document.getElementById('mSleepEnd').value = entry?.endMin != null ? minToHm(entry.endMin) : '';
  if (type === 'temp')   document.getElementById('mTemp').value = entry?.value ?? '';
  if (type === 'growth') {
    document.getElementById('mGrowthDate').value = entry?.date ?? state.current;
    document.getElementById('mWeight').value = entry?.weight ?? '';
    document.getElementById('mHeight').value = entry?.height ?? '';
  }
  if (type === 'medical') {
    document.getElementById('mMedDate').value = entry?.date ?? state.current;
    document.getElementById('mMedType').value = entry?.type ?? '通院';
    document.getElementById('mMedTitle').value = entry?.title ?? '';
    document.getElementById('mMedNote').value = entry?.note ?? '';
  }

  document.getElementById('btnDelete').style.display = entry ? 'block' : 'none';
  document.getElementById('modalBg').classList.add('show');
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
  state.editingId = null;
  state.modalType = null;
}

function saveModal() {
  const type = state.modalType;

  if (type === 'growth') {
    const date = document.getElementById('mGrowthDate').value;
    if (!date) { alert('日付を入れてください'); return; }
    const wRaw = document.getElementById('mWeight').value;
    const hRaw = document.getElementById('mHeight').value;
    const weight = wRaw === '' ? null : Number(wRaw);
    const height = hRaw === '' ? null : Number(hRaw);
    if (weight == null && height == null) { alert('体重か身長のどちらかを入れてください'); return; }

    let g = state.editingId ? state.growth.find(x => x.id === state.editingId) : null;
    if (!g) { g = { id: uid() }; state.growth.push(g); }
    g.date = date;
    g.weight = weight;
    g.height = height;
    saveGrowth();
    closeModal();
    render();
    return;
  }

  if (type === 'medical') {
    const date = document.getElementById('mMedDate').value;
    const title = document.getElementById('mMedTitle').value.trim();
    if (!date || !title) { alert('日付とタイトルを入れてください'); return; }
    let m = state.editingId ? state.medical.find(x => x.id === state.editingId) : null;
    if (!m) { m = { id: uid() }; state.medical.push(m); }
    m.date = date;
    m.type = document.getElementById('mMedType').value;
    m.title = title;
    m.note = document.getElementById('mMedNote').value;
    saveJSON(MEDICAL_KEY, state.medical);
    closeModal();
    render();
    return;
  }

  const startMin = hmToMin(document.getElementById('mTime').value);
  if (startMin == null) { alert('時刻を入れてください'); return; }

  const day = dayObj(state.current);
  let entry = state.editingId ? day.entries.find(x => x.id === state.editingId) : null;
  if (!entry) {
    entry = { id: uid(), type };
    day.entries.push(entry);
  }
  entry.startMin = startMin;

  if (type === 'milk') {
    const v = Number(document.getElementById('mMilk').value);
    if (!(v >= 0)) { alert('量を入れてください'); return; }
    entry.amount = v;
  }
  if (type === 'diaper') entry.state = document.getElementById('mDiaper').value;
  if (type === 'poop') {
    entry.state = document.getElementById('mPoopState').value;
    entry.amount = document.getElementById('mPoopAmount').value;
  }
  if (type === 'sleep') entry.endMin = hmToMin(document.getElementById('mSleepEnd').value);
  if (type === 'temp') {
    const v = Number(document.getElementById('mTemp').value);
    if (!(v > 0)) { alert('体温を入れてください'); return; }
    entry.value = v;
  }

  saveAll();
  closeModal();
  render();
}

function deleteEntry() {
  if (state.modalType === 'growth') {
    state.growth = state.growth.filter(x => x.id !== state.editingId);
    saveGrowth();
  } else if (state.modalType === 'medical') {
    state.medical = state.medical.filter(x => x.id !== state.editingId);
    saveJSON(MEDICAL_KEY, state.medical);
  } else {
    const day = dayObj(state.current);
    day.entries = day.entries.filter(x => x.id !== state.editingId);
    saveAll();
  }
  closeModal();
  render();
}

// --- Events ---
document.getElementById('dateInput').addEventListener('change', e => { state.current = e.target.value; render(); });
document.getElementById('prevDay').addEventListener('click', () => shiftDay(-1));
document.getElementById('nextDay').addEventListener('click', () => shiftDay(1));
document.getElementById('todayBtn').addEventListener('click', () => { state.current = todayStr(); render(); });

function shiftDay(delta) {
  const d = new Date(state.current);
  d.setDate(d.getDate() + delta);
  state.current = todayStr(d);
  render();
}

document.querySelectorAll('.add-row button').forEach(b =>
  b.addEventListener('click', () => openModal(b.dataset.type)));

document.getElementById('addGrowthBtn').addEventListener('click', () => openModal('growth'));
window.addEventListener('resize', () => { renderGrowth(); renderSummary(); });

document.querySelectorAll('#rangeToggle button').forEach(b =>
  b.addEventListener('click', () => {
    state.range = Number(b.dataset.range);
    document.querySelectorAll('#rangeToggle button').forEach(x =>
      x.classList.toggle('active', x === b));
    renderSummary();
  }));

document.getElementById('birthDate').addEventListener('change', e => {
  state.settings.birthDate = e.target.value;
  saveJSON(SETTINGS_KEY, state.settings);
  renderVax();
});

document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', saveModal);
document.getElementById('btnDelete').addEventListener('click', deleteEntry);
document.getElementById('modalBg').addEventListener('click', e => {
  if (e.target.id === 'modalBg') closeModal();
});

document.getElementById('memo').addEventListener('input', e => {
  dayObj(state.current).memo = e.target.value;
  saveAll();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm(state.current + ' の記録をすべて削除します。よろしいですか？')) return;
  delete state.data[state.current];
  saveAll();
  render();
});

// (exportBtn moved into settings modal as exportCsvBtn)

// Favorites
document.getElementById('memoStar').addEventListener('click', toggleFavorite);
document.getElementById('favListBtn').addEventListener('click', openFavorites);
document.getElementById('favCloseBtn').addEventListener('click', () =>
  document.getElementById('favModalBg').classList.remove('show'));
document.getElementById('favModalBg').addEventListener('click', e => {
  if (e.target.id === 'favModalBg')
    document.getElementById('favModalBg').classList.remove('show');
});

// Settings modal
const settingsModal = document.getElementById('settingsModalBg');
document.getElementById('settingsBtn').addEventListener('click', () => settingsModal.classList.add('show'));
document.getElementById('settingsCloseBtn').addEventListener('click', () => settingsModal.classList.remove('show'));
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) settingsModal.classList.remove('show');
});
document.getElementById('darkToggle').addEventListener('change', e => {
  state.settings.dark = e.target.checked;
  saveJSON(SETTINGS_KEY, state.settings);
  applyTheme();
});
document.getElementById('reminderToggle').addEventListener('change', async e => {
  if (e.target.checked) {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('通知を許可してください');
        e.target.checked = false;
        return;
      }
    } else {
      alert('このブラウザは通知に対応していません');
      e.target.checked = false;
      return;
    }
  }
  state.settings.reminder = e.target.checked;
  saveJSON(SETTINGS_KEY, state.settings);
  scheduleReminder();
});
document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
document.getElementById('importJsonBtn').addEventListener('click', () =>
  document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
  if (e.target.files[0]) importJSON(e.target.files[0]);
});

// Search modal
const searchModal = document.getElementById('searchModalBg');
document.getElementById('searchBtn').addEventListener('click', () => {
  searchModal.classList.add('show');
  document.getElementById('searchInput').value = '';
  renderSearch('');
  setTimeout(() => document.getElementById('searchInput').focus(), SEARCH_FOCUS_DELAY);
});
document.getElementById('searchCloseBtn').addEventListener('click', () => searchModal.classList.remove('show'));
searchModal.addEventListener('click', e => {
  if (e.target === searchModal) searchModal.classList.remove('show');
});
document.getElementById('searchInput').addEventListener('input', e => renderSearch(e.target.value));

// Photo handlers
document.getElementById('photoUploadBtn').addEventListener('click', () =>
  document.getElementById('photoInput').click());
document.getElementById('photoInput').addEventListener('change', e => {
  if (e.target.files[0]) compressAndStorePhoto(e.target.files[0]);
});
document.getElementById('photoDeleteBtn').addEventListener('click', () => {
  if (!confirm('この日の写真を削除しますか？')) return;
  delete state.photos[state.current];
  saveJSON(PHOTO_KEY, state.photos);
  renderPhoto();
});

// Medical
document.getElementById('addMedBtn').addEventListener('click', () => openModal('medical'));

// Calendar navigation
document.getElementById('calPrev').addEventListener('click', () => {
  if (!state.calMonth) return;
  state.calMonth.mo--;
  if (state.calMonth.mo < 0) { state.calMonth.mo = 11; state.calMonth.y--; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  if (!state.calMonth) return;
  state.calMonth.mo++;
  if (state.calMonth.mo > 11) { state.calMonth.mo = 0; state.calMonth.y++; }
  renderCalendar();
});

// Apply theme + age on load
applyTheme();
document.getElementById('reminderToggle').checked = !!state.settings.reminder;

// Tab switching (WAI-ARIA tabs pattern)
const tabButtons = Array.from(document.querySelectorAll('#tabBar button'));
tabButtons.forEach((b, i) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
  // Roving keyboard navigation between tabs
  b.addEventListener('keydown', e => {
    let target = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = tabButtons[(i + 1) % tabButtons.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = tabButtons[(i - 1 + tabButtons.length) % tabButtons.length];
    else if (e.key === 'Home') target = tabButtons[0];
    else if (e.key === 'End') target = tabButtons[tabButtons.length - 1];
    if (target) {
      e.preventDefault();
      switchTab(target.dataset.tab);
      target.focus();
    }
  });
});

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('active', s.dataset.tab === tab));
  document.querySelectorAll('#tabBar button').forEach(b => {
    const selected = b.dataset.tab === tab;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
    b.tabIndex = selected ? 0 : -1;
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  // re-render charts to pick up correct width
  if (tab === 'trends') { renderGrowth(); renderSummary(); }
  if (tab === 'tips') renderTips();
}

function exportCSV() {
  const rows = [['日付','時刻','種類','値1','値2']];
  Object.keys(state.data).sort().forEach(date => {
    const day = state.data[date];
    day.entries
      .slice()
      .sort((a,b) => (a.startMin ?? 0) - (b.startMin ?? 0))
      .forEach(e => {
        const t = minToHm(e.startMin);
        if (e.type === 'milk')   rows.push([date, t, 'ミルク', e.amount + 'ml', '']);
        if (e.type === 'diaper') rows.push([date, t, 'おむつ', e.state, '']);
        if (e.type === 'poop')   rows.push([date, t, 'うんち', e.state, e.amount]);
        if (e.type === 'sleep')  rows.push([date, t, '睡眠', '〜' + minToHm(e.endMin), '']);
        if (e.type === 'temp')   rows.push([date, t, '体温', e.value + '℃', '']);
      });
    if (day.memo) rows.push([date, '', 'メモ', day.memo.replace(/\n/g,' '), '']);
  });
  state.growth.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(g => {
    if (g.weight != null) rows.push([g.date, '', '体重', g.weight + 'g', '']);
    if (g.height != null) rows.push([g.date, '', '身長', g.height + 'cm', '']);
  });
  const csv = '﻿' + rows.map(r =>
    r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')
  ).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `baby-tracker-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Demo data (portfolio preview) ---
// 公開デモ用。記録が空のとき「デモデータを試す」を表示し、
// 押すと架空のサンプル（生後3〜4ヶ月）を投入する。
// 投入前の全キーを DEMO_BACKUP_KEY に退避し、リセットで完全復元する。
const DEMO_KEYS = [STORAGE_KEY, GROWTH_KEY, SETTINGS_KEY, VAX_KEY, FAV_KEY, MILESTONE_KEY, PHOTO_KEY, MEDICAL_KEY];
const DEMO_BACKUP_KEY = 'kl-baby-tracker-demo-backup-v1';
const DEMO_FLAG_KEY = 'kl-baby-tracker-demo-active-v1';

function isDemoActive() { return localStorage.getItem(DEMO_FLAG_KEY) === '1'; }

// 実データが空か（誕生日・記録・成長・通院・マイルストーンがすべて無い）
function isAllEmpty() {
  const hasEntries = Object.values(state.data).some(d => d.entries && d.entries.length);
  return !state.settings.birthDate && !hasEntries &&
         state.growth.length === 0 && state.medical.length === 0 &&
         Object.keys(state.milestones).length === 0;
}

function buildDemoData() {
  const today = new Date();
  // 誕生日 = 今日から約100日前（生後3ヶ月強）
  const birth = new Date(today); birth.setDate(birth.getDate() - DEMO_DAYS_BACK);
  const birthStr = todayStr(birth);

  // 直近18日分の授乳・睡眠・おむつ・体温
  const data = {};
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  for (let back = 17; back >= 0; back--) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    const dateStr = todayStr(d);
    const isToday = back === 0;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const entries = [];

    // 授乳: 1日6〜8回（おおむね3時間おき + 量のばらつき）
    const feeds = rnd(6, 8);
    const first = rnd(20, 70); // 0:20〜1:10頃の最初の授乳
    const gap = Math.floor((MINUTES_PER_DAY - first - 60) / feeds);
    for (let i = 0; i < feeds; i++) {
      const t = first + i * gap + rnd(-20, 20);
      if (t < 0 || t >= MINUTES_PER_DAY) continue;
      if (isToday && t > nowMin) continue;
      entries.push({ id: uid(), type: 'milk', startMin: t, amount: rnd(20, 32) * 5 }); // 100〜160ml
    }

    // おむつ: 1日5〜7回（おしっこ中心、うんち1〜2回）
    const diapers = rnd(5, 7);
    for (let i = 0; i < diapers; i++) {
      const t = rnd(0, 23) * 60 + rnd(0, 59);
      if (isToday && t > nowMin) continue;
      const states = ['おしっこ', 'おしっこ', 'おしっこ', '両方'];
      entries.push({ id: uid(), type: 'diaper', startMin: t, state: states[rnd(0, states.length - 1)] });
    }
    // うんち: 1〜2回
    const poops = rnd(1, 2);
    for (let i = 0; i < poops; i++) {
      const t = rnd(6, 21) * 60 + rnd(0, 59);
      if (isToday && t > nowMin) continue;
      const ps = ['ふつう', 'ふつう', 'ゆるい', '緑色'];
      entries.push({ id: uid(), type: 'poop', startMin: t, state: ps[rnd(0, ps.length - 1)], amount: ['少', '中', '中', '多'][rnd(0, 3)] });
    }

    // 睡眠: 夜のまとまった睡眠 + 昼寝2〜3回
    const naps = [
      [rnd(0, 30), rnd(5, 6) * 60 + rnd(0, 40)],        // 夜間（前夜から朝）
      [9 * 60 + rnd(0, 40), 10 * 60 + rnd(20, 50)],     // 午前寝
      [13 * 60 + rnd(0, 40), 15 * 60 + rnd(0, 50)],     // 午後寝
      [17 * 60 + rnd(0, 30), 18 * 60 + rnd(0, 30)],     // 夕寝
    ];
    naps.forEach(([s, e]) => {
      if (isToday && s > nowMin) return;
      entries.push({ id: uid(), type: 'sleep', startMin: s, endMin: Math.min(e, isToday ? nowMin : e) });
    });

    // 体温: 1日1回（朝の検温）
    const tt = 7 * 60 + rnd(0, 40);
    if (!(isToday && tt > nowMin)) {
      entries.push({ id: uid(), type: 'temp', startMin: tt, value: Math.round((36.5 + Math.random() * 0.6) * 10) / 10 });
    }

    let memo = '';
    if (back === 3) memo = '今日はよく笑ってくれた。寝返りしそうな素ぶり。';
    if (back === 10) memo = '少し鼻づまり気味。授乳は問題なし。';
    data[dateStr] = { entries, memo };
  }

  // 成長記録: 出生〜直近まで数点（月齢相当の自然な値, 体重はg）
  const growth = [
    { id: uid(), date: todayStr(birth), weight: 3100, height: 49.5 },
    { id: uid(), date: shiftDate(birth, 30),  weight: 4300, height: 54.5 },
    { id: uid(), date: shiftDate(birth, 60),  weight: 5400, height: 58.0 },
    { id: uid(), date: shiftDate(birth, 90),  weight: 6300, height: 60.5 },
    { id: uid(), date: shiftDate(birth, 98),  weight: 6500, height: 61.0 },
  ];

  // マイルストーン: 月齢相当で数件
  const milestones = {
    smile: shiftDate(birth, 58),
    neck:  shiftDate(birth, 95),
    laugh: shiftDate(birth, 92),
  };

  // 予防接種: 2〜3ヶ月分を接種済みに
  const vax = {
    rota: shiftDate(birth, 62),
    hib1: shiftDate(birth, 62),
    pcv1: shiftDate(birth, 62),
    hbv1: shiftDate(birth, 62),
    hib2: shiftDate(birth, 93),
    pcv2: shiftDate(birth, 93),
    dpt1: shiftDate(birth, 93),
    hbv2: shiftDate(birth, 93),
  };

  // 通院記録
  const medical = [
    { id: uid(), date: shiftDate(birth, 30), type: '通院', title: '1ヶ月健診', note: '体重・身長ともに順調。問題なし。' },
    { id: uid(), date: shiftDate(birth, 62), type: '通院', title: '予防接種（2ヶ月）', note: 'ロタ・ヒブ・肺炎球菌・B型肝炎。発熱なし。' },
  ];

  return { birthStr, data, growth, milestones, vax, medical };
}

function shiftDate(base, days) {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return todayStr(d);
}

function loadDemoData() {
  // 投入前の状態を退避
  const backup = {};
  DEMO_KEYS.forEach(k => { backup[k] = localStorage.getItem(k); });
  localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(backup));

  const demo = buildDemoData();
  state.data = demo.data;
  state.growth = demo.growth;
  state.settings = Object.assign({}, state.settings, { birthDate: demo.birthStr });
  state.vax = demo.vax;
  state.favorites = [];
  state.milestones = demo.milestones;
  state.medical = demo.medical;

  saveAll(); saveGrowth();
  saveJSON(SETTINGS_KEY, state.settings);
  saveJSON(VAX_KEY, state.vax);
  saveJSON(FAV_KEY, state.favorites);
  saveJSON(MILESTONE_KEY, state.milestones);
  saveJSON(MEDICAL_KEY, state.medical);
  localStorage.setItem(DEMO_FLAG_KEY, '1');

  state.current = todayStr();
  render();
  renderDemoUI();
  switchTab('today');
}

function resetDemoData() {
  // 退避した状態に完全復元
  const raw = localStorage.getItem(DEMO_BACKUP_KEY);
  const backup = raw ? JSON.parse(raw) : {};
  DEMO_KEYS.forEach(k => {
    const v = backup[k];
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  });
  localStorage.removeItem(DEMO_BACKUP_KEY);
  localStorage.removeItem(DEMO_FLAG_KEY);

  // state を再読込
  state.data = loadJSON(STORAGE_KEY, {});
  state.growth = loadJSON(GROWTH_KEY, []);
  state.settings = loadJSON(SETTINGS_KEY, {});
  state.vax = loadJSON(VAX_KEY, {});
  state.favorites = loadJSON(FAV_KEY, []);
  state.milestones = loadJSON(MILESTONE_KEY, {});
  state.medical = loadJSON(MEDICAL_KEY, []);
  state.current = todayStr();

  render();
  renderDemoUI();
  switchTab('today');
}

function renderDemoUI() {
  const prompt = document.getElementById('demoPrompt');
  const banner = document.getElementById('demoBanner');
  if (isDemoActive()) {
    prompt.style.display = 'none';
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
    prompt.style.display = isAllEmpty() ? 'flex' : 'none';
  }
}

document.getElementById('demoLoadBtn').addEventListener('click', loadDemoData);
document.getElementById('demoResetBtn').addEventListener('click', () => {
  if (!confirm('デモデータを消去して元の状態に戻します。よろしいですか？')) return;
  sessionStorage.setItem('kl-baby-tracker-demo-dismissed-session', '1');
  resetDemoData();
});

// --- Esc closes any open modal/dialog ---
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.modal-bg.show');
  if (!open) return;
  open.classList.remove('show');
  if (open.id === 'modalBg') { state.editingId = null; state.modalType = null; }
});

if (isAllEmpty() && !sessionStorage.getItem('kl-baby-tracker-demo-dismissed-session')) {
  loadDemoData();
} else {
  render();
  renderDemoUI();
}

})();
