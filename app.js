'use strict';

/* ============================================================
   용돈 챌린지 — app.js
   아이 모드 + 부모님 모드 + 주간 정산 + Firebase 동기화
   ============================================================ */

/* ---------- 1. 상수 & 유틸 ---------- */
const LS_KEY = 'allowance-challenge-v1';
const APP_VERSION = '1.2.0';
const MUSTDO_AMOUNT = 100;
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_FULL = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const PASTELS = ['#FFE3D8', '#FFEFC9', '#E3F6EC', '#E9E3FB', '#FFE0E6', '#DDF0FF', '#F3E9DC', '#E6F4D9', '#FFE7D1', '#E7F0FF'];
const EMOJIS = ['🪥', '🧺', '🧮', '📔', '✏️', '🧩', '📚', '📘', '🩳', '🍽️', '💻', '🎨', '🎹', '🧹', '🚿', '🛏️', '🏃', '🗒️', '🔤', '🧠', '⭐', '❤️', '🐶', '🌱'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => (n < 10 ? '0' : '') + n;
const won = n => Number(n || 0).toLocaleString('ko-KR');
const wonU = n => won(n) + '원';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const randomId = () => 'd_' + Math.random().toString(36).slice(2, 10);

/* ---------- 2. 날짜 ---------- */
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseYmd(s) { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function mondayIndex(d) { return (d.getDay() + 6) % 7; }
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -mondayIndex(x)); }
function weekDates(ws) { const s = parseYmd(ws); return Array.from({ length: 7 }, (_, i) => ymd(addDays(s, i))); }
function todayStr() { return ymd(new Date()); }
function currentWeekStart() { return ymd(mondayOf(new Date())); }
function fmtMD(ds) { const d = parseYmd(ds); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DAY_NAMES[mondayIndex(d)] + ')';
}
function fmtTime(d) { return d.getHours() + ':' + pad2(d.getMinutes()); }

/* ---------- 3. 상태 ---------- */
function seedTasks() {
  const d = (arr) => arr.slice();
  return [
    { id: 't1', title: '아침 양치하기', emoji: '🪥', days: d(ALL_DAYS), amount: 100, active: true, order: 1 },
    { id: 't2', title: '벗은 옷·양말 빨래통에 넣기', emoji: '🧺', days: d(ALL_DAYS), amount: 100, active: true, order: 2, repeat: true },
    { id: 't3', title: '단꿈e 수학 강의 보기', emoji: '🧮', days: d(ALL_DAYS), amount: 100, active: true, order: 3 },
    { id: 't4', title: '감사하는 일 적기', emoji: '📔', days: d(ALL_DAYS), amount: 100, active: true, order: 4 },
    { id: 't5', title: '식사 후 그릇 싱크대에 치우기', emoji: '🍽️', days: d(ALL_DAYS), amount: 100, active: true, order: 5 },
    { id: 't6', title: '간식·과자 먹은 후 쓰레기 버리기', emoji: '🗑️', days: d(ALL_DAYS), amount: 100, active: true, order: 6 },
    { id: 't7', title: '공부 후 책상 위 필기구·책 정리하기', emoji: '🗂️', days: d(ALL_DAYS), amount: 100, active: true, order: 7 },
    { id: 't8', title: '취침 전 휴대폰·태블릿 충전기에 꽂아두기', emoji: '🔌', days: d(ALL_DAYS), amount: 100, active: true, order: 8 },
    { id: 't9', title: '미래엔 수학 학원 숙제', emoji: '✏️', days: [0, 2, 3], amount: 100, active: true, order: 9 },
    { id: 't10', title: '플레이팩토 문제집 끝내기', emoji: '🧩', days: [1, 4, 5], amount: 100, active: true, order: 10 },
    { id: 't11', title: '어휘력 문제집 풀기', emoji: '📚', days: [4, 5, 6], amount: 100, active: true, order: 11 },
    { id: 't12', title: '디딤돌 문제집 풀기', emoji: '📘', days: [4, 5, 6], amount: 100, active: true, order: 12 },
    { id: 't13', title: '수영장 가방 수건 빨래통에 넣기', emoji: '🩳', days: [0, 1, 3, 4], amount: 100, active: true, order: 13 },
    { id: 't14', title: '일기 쓰기', emoji: '📝', days: [6], amount: 100, active: true, order: 14 }
  ];
}

function defaultState() {
  return {
    v: 1,
    clock: 0,
    tasks: seedTasks(),
    tasksTs: 0,
    mustdos: {},
    completions: {},
    settlements: [],
    settings: { name: '우리 딸', sound: true },
    settingsTs: 0,
    pin: '0000',
    pinTs: 0,
    sync: { url: '', code: '', enabled: false, lastSync: null },
    updatedAt: 0,
    deviceId: randomId()
  };
}

function normTask(t, i) {
  if (!t || typeof t !== 'object') return null;
  const title = String(t.title || '').trim().slice(0, 50);
  if (!title) return null;
  let days = Array.isArray(t.days) ? t.days.map(Number).filter(x => x >= 0 && x <= 6) : ALL_DAYS.slice();
  days = Array.from(new Set(days)).sort((a, b) => a - b);
  return {
    id: String(t.id || ('t_' + i + '_' + Math.random().toString(36).slice(2, 6))),
    title,
    emoji: String(t.emoji || '⭐').slice(0, 8),
    days,
    amount: clamp(Math.round(Number(t.amount) || 0), 0, 100000),
    active: t.active !== false,
    repeat: !!t.repeat,
    order: Number.isFinite(Number(t.order)) ? Number(t.order) : i
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const s = Object.assign({}, base, raw);
  s.tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(normTask).filter(Boolean)
    : base.tasks;
  s.mustdos = {};
  if (raw.mustdos && typeof raw.mustdos === 'object' && !Array.isArray(raw.mustdos)) {
    Object.keys(raw.mustdos).forEach(function (ds) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return;
      const arr = raw.mustdos[ds];
      if (!Array.isArray(arr)) return;
      const out = arr.slice(0, 60).map(function (m, i) {
        if (!m || typeof m !== 'object') return null;
        const text = String(m.text || '').trim().slice(0, 40);
        if (!text) return null;
        return {
          id: String(m.id || ('m_' + i + '_' + Math.random().toString(36).slice(2, 6))),
          text: text,
          done: !!m.done,
          amount: clamp(Math.round(Number(m.amount) || MUSTDO_AMOUNT), 0, 100000),
          c: Number(m.c) || 0,
          ord: Number.isFinite(Number(m.ord)) ? Number(m.ord) : i,
          at: String(m.at || ''),
          del: !!m.del
        };
      }).filter(Boolean);
      if (out.length) s.mustdos[ds] = out;
    });
  }
  s.completions = {};
  if (raw.completions && typeof raw.completions === 'object') {
    Object.keys(raw.completions).forEach(function (ds) {
      const row = raw.completions[ds];
      if (!row || typeof row !== 'object') return;
      const out = {};
      Object.keys(row).forEach(function (k) {
        const e = row[k];
        if (!e || typeof e !== 'object') return;
        const n = e.del ? 0 : clamp(Math.round(Number(e.n) || 1), 1, 50);
        out[k] = {
          c: Number(e.c) || 0,
          at: String(e.at || ''),
          amount: Math.max(0, Math.round(Number(e.amount) || 0)),
          title: String(e.title || '').slice(0, 50),
          emoji: String(e.emoji || '⭐').slice(0, 8),
          n: n,
          del: !!e.del
        };
      });
      if (Object.keys(out).length) s.completions[ds] = out;
    });
  }
  s.settlements = Array.isArray(raw.settlements) ? raw.settlements.filter(x => x && x.id).map(x => ({
    id: String(x.id),
    weekStart: String(x.weekStart || ''),
    weekEnd: String(x.weekEnd || ''),
    amount: Math.max(0, Math.round(Number(x.amount) || 0)),
    count: Math.max(0, Math.round(Number(x.count) || 0)),
    note: String(x.note || '').slice(0, 80),
    paidAt: String(x.paidAt || new Date().toISOString()),
    c: Number(x.c) || 0,
    del: !!x.del
  })) : [];
  s.settings = {
    name: String((raw.settings && raw.settings.name) || '우리 딸').slice(0, 12),
    sound: !(raw.settings && raw.settings.sound === false)
  };
  s.pin = /^\d{4}$/.test(String(raw.pin || '')) ? String(raw.pin) : '0000';
  s.sync = {
    url: String((raw.sync && raw.sync.url) || ''),
    code: String((raw.sync && raw.sync.code) || ''),
    enabled: !!(raw.sync && raw.sync.enabled),
    lastSync: (raw.sync && raw.sync.lastSync) || null
  };
  s.clock = Number(raw.clock) || 0;
  s.tasksTs = Number(raw.tasksTs) || 0;
  s.settingsTs = Number(raw.settingsTs) || 0;
  s.pinTs = Number(raw.pinTs) || 0;
  s.updatedAt = Number(raw.updatedAt) || 0;
  s.deviceId = String(raw.deviceId || base.deviceId);
  return s;
}

function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { raw = null; }
  return normalizeState(raw);
}

let state = loadState();

const ui = {
  mode: 'kid',
  tab: 'tasks',
  selectedDate: todayStr(),
  weekStart: currentWeekStart(),
  todayCache: todayStr(),
  pinFails: 0,
  pinLockedUntil: 0,
  hiddenAt: 0
};

function saveState(push = true) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 저장 공간 부족 등 */ }
  if (push && state.sync.enabled) schedulePush();
}

function touch(kind) {
  state.clock = (state.clock || 0) + 1;
  if (kind === 'tasks') state.tasksTs = state.clock;
  if (kind === 'settings') state.settingsTs = state.clock;
  if (kind === 'pin') state.pinTs = state.clock;
  state.updatedAt = Date.now();
  saveState();
}

/* ---------- 4. 조회 ---------- */
function tasksForDow(dow) {
  return state.tasks
    .filter(t => t.active && t.days.includes(dow))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function tasksForDate(ds) { return tasksForDow(mondayIndex(parseYmd(ds))); }
function getEntry(ds, taskId) {
  const row = state.completions[ds];
  const e = row && row[taskId];
  return e && !e.del ? e : null;
}
function isDone(ds, taskId) { return !!getEntry(ds, taskId); }
function getCount(ds, taskId) {
  const e = getEntry(ds, taskId);
  if (!e) return 0;
  return clamp(Math.round(Number(e.n) || 1), 1, 50);
}
function allDone(ds) {
  const ts = tasksForDate(ds);
  return ts.length > 0 && ts.every(t => isDone(ds, t.id));
}

/* 오늘 꼭 해야 할 일 (날짜별 저장, 용돈 정산과는 별개) */
function mustDoRows(ds) {
  const row = state.mustdos && state.mustdos[ds];
  return Array.isArray(row) ? row : [];
}
function mustDosFor(ds) {
  return mustDoRows(ds)
    .filter(m => m && m.id && !m.del)
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
}
function mustDoAmount(m) {
  const n = Number(m && m.amount);
  return clamp(Math.round(Number.isFinite(n) && n > 0 ? n : MUSTDO_AMOUNT), 0, 100000);
}
function addMustDo(ds, text) {
  const t = String(text || '').trim().slice(0, 40);
  if (!t) return false;
  state.clock = (state.clock || 0) + 1;
  if (!state.mustdos) state.mustdos = {};
  if (!state.mustdos[ds]) state.mustdos[ds] = [];
  const maxOrd = state.mustdos[ds].reduce((a, m) => Math.max(a, Number(m.ord) || 0), 0);
  state.mustdos[ds].push({
    id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    text: t,
    done: false,
    amount: MUSTDO_AMOUNT,
    c: state.clock,
    ord: maxOrd + 1,
    at: new Date().toISOString(),
    del: false
  });
  state.updatedAt = Date.now();
  saveState();
  return true;
}
function toggleMustDo(ds, id) {
  const m = mustDoRows(ds).find(x => x.id === id);
  if (!m) return;
  state.clock = (state.clock || 0) + 1;
  m.done = !m.done;
  m.c = state.clock;
  state.updatedAt = Date.now();
  saveState();
}
function deleteMustDo(ds, id) {
  const m = mustDoRows(ds).find(x => x.id === id);
  if (!m) return;
  state.clock = (state.clock || 0) + 1;
  m.del = true;
  m.c = state.clock;
  state.updatedAt = Date.now();
  saveState();
}

function weekSummary(ws) {
  const dates = weekDates(ws);
  const byDay = dates.map(ds => {
    const row = state.completions[ds] || {};
    const entries = [];
    let taskTotal = 0;
    Object.keys(row).forEach(tid => {
      const e = row[tid];
      if (e && !e.del) {
        const n = clamp(Math.round(Number(e.n) || 1), 1, 50);
        entries.push(Object.assign({ taskId: tid }, e, { n: n }));
        taskTotal += (Number(e.amount) || 0) * n;
      }
    });
    // 오늘 꼭 해야 할 일도 체크하면 용돈이 쌓여요 (기본 100원)
    const mustDone = mustDosFor(ds).filter(m => m.done);
    const mustTotal = mustDone.reduce((a, m) => a + mustDoAmount(m), 0);
    const dayTasks = tasksForDate(ds);
    return {
      date: ds,
      total: taskTotal + mustTotal,
      taskTotal,
      mustTotal,
      mustCount: mustDone.length,
      entries,
      doneCount: dayTasks.filter(t => isDone(ds, t.id)).length,
      totalTasks: dayTasks.length
    };
  });
  const byTask = {};
  byDay.forEach(day => {
    day.entries.forEach(e => {
      const n = e.n || 1;
      const t = state.tasks.find(x => x.id === e.taskId);
      const rec = byTask[e.taskId] || (byTask[e.taskId] = {
        taskId: e.taskId,
        title: e.title || (t && t.title) || '할 일',
        emoji: e.emoji || (t && t.emoji) || '⭐',
        days: {}, total: 0, count: 0
      });
      rec.days[day.date] = e;
      rec.total += (Number(e.amount) || 0) * n;
      rec.count += n;
    });
  });
  const settlements = state.settlements.filter(s => s.weekStart === ws && !s.del);
  const settledAmount = settlements.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const taskTotal = byDay.reduce((a, d) => a + d.taskTotal, 0);
  const mustTotal = byDay.reduce((a, d) => a + d.mustTotal, 0);
  const mustCount = byDay.reduce((a, d) => a + d.mustCount, 0);
  const taskCount = byDay.reduce((a, d) => a + d.entries.reduce((x, e) => x + (e.n || 1), 0), 0);
  const total = taskTotal + mustTotal;
  const count = taskCount + mustCount;
  return {
    ws, dates, byDay, byTask, total, taskTotal, mustTotal,
    count, taskCount, mustCount,
    settlements, settledAmount,
    remaining: Math.max(0, total - settledAmount)
  };
}

function setCheckCount(ds, taskId, count, task) {
  state.clock = (state.clock || 0) + 1;
  const c = state.clock;
  const t = task || state.tasks.find(x => x.id === taskId);
  if (!state.completions[ds]) state.completions[ds] = {};
  const prev = state.completions[ds][taskId];
  const n = clamp(Math.round(Number(count) || 0), 0, 50);
  const base = {
    c: c,
    at: new Date().toISOString(),
    amount: Number(prev && prev.amount) || Number(t && t.amount) || 0,
    title: (prev && prev.title) || (t && t.title) || '',
    emoji: (prev && prev.emoji) || (t && t.emoji) || '⭐'
  };
  if (n <= 0) {
    state.completions[ds][taskId] = Object.assign(base, { del: true, n: 0 });
  } else {
    state.completions[ds][taskId] = Object.assign(base, { n: n });
  }
  saveState();
}
function setCheck(ds, taskId, on, task) {
  setCheckCount(ds, taskId, on ? 1 : 0, task);
}

function settleWeek(opts) {
  const ws = currentWeekStart();
  const dates = weekDates(ws);
  state.clock = (state.clock || 0) + 1;
  state.settlements.push({
    id: 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    weekStart: ws,
    weekEnd: dates[6],
    amount: Math.max(0, Math.round(Number(opts.amount) || 0)),
    count: Math.max(0, Math.round(Number(opts.count) || 0)),
    note: String(opts.note || '').slice(0, 80),
    paidAt: new Date().toISOString(),
    c: state.clock,
    del: false
  });
  saveState();
}

function calcStreak() {
  let d = new Date();
  if (!allDone(ymd(d))) d = addDays(d, -1);
  let streak = 0;
  for (let i = 0; i < 120; i++) {
    const ds = ymd(d);
    if (allDone(ds)) { streak++; d = addDays(d, -1); }
    else break;
  }
  return streak;
}

/* ---------- 5. Firebase 동기화 ---------- */
function normalizeUrl(v) {
  let u = String(v || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}
function syncEndpoint(s) {
  const cfg = s || state.sync;
  if (!cfg.url || !cfg.code) return null;
  return normalizeUrl(cfg.url) + '/families/' + encodeURIComponent(cfg.code) + '.json';
}
function syncPayload(s) {
  return {
    clock: s.clock || 0,
    tasks: s.tasks,
    tasksTs: s.tasksTs || 0,
    mustdos: s.mustdos || {},
    completions: s.completions,
    settlements: s.settlements,
    settings: s.settings,
    settingsTs: s.settingsTs || 0,
    pin: s.pin,
    pinTs: s.pinTs || 0,
    updatedAt: s.updatedAt || 0
  };
}
function pickRemote(o) {
  return {
    clock: Number(o.clock) || 0,
    tasks: Array.isArray(o.tasks) ? o.tasks : [],
    tasksTs: Number(o.tasksTs) || 0,
    mustdos: (o.mustdos && typeof o.mustdos === 'object' && !Array.isArray(o.mustdos)) ? o.mustdos : {},
    completions: (o.completions && typeof o.completions === 'object') ? o.completions : {},
    settlements: Array.isArray(o.settlements) ? o.settlements : [],
    settings: o.settings || {},
    settingsTs: Number(o.settingsTs) || 0,
    pin: o.pin,
    pinTs: Number(o.pinTs) || 0
  };
}
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return local;
  const out = JSON.parse(JSON.stringify(local));
  out.clock = Math.max(local.clock || 0, Number(remote.clock) || 0);
  if ((Number(remote.tasksTs) || 0) > (local.tasksTs || 0) && Array.isArray(remote.tasks)) {
    out.tasks = remote.tasks.map(normTask).filter(Boolean);
    out.tasksTs = Number(remote.tasksTs) || 0;
  }
  if ((Number(remote.settingsTs) || 0) > (local.settingsTs || 0) && remote.settings) {
    out.settings = {
      name: String(remote.settings.name || out.settings.name).slice(0, 12),
      sound: remote.settings.sound !== false
    };
    out.settingsTs = Number(remote.settingsTs) || 0;
  }
  if ((Number(remote.pinTs) || 0) > (local.pinTs || 0) && /^\d{4}$/.test(String(remote.pin || ''))) {
    out.pin = String(remote.pin);
    out.pinTs = Number(remote.pinTs) || 0;
  }
  const comp = {};
  const dates = new Set(Object.keys(local.completions || {}).concat(Object.keys(remote.completions || {})));
  dates.forEach(ds => {
    const a = (local.completions || {})[ds] || {};
    const b = (remote.completions || {})[ds] || {};
    const row = {};
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => {
      const x = a[k], y = b[k];
      if (!x) row[k] = y;
      else if (!y) row[k] = x;
      else row[k] = (Number(y.c) || 0) > (Number(x.c) || 0) ? y : x;
    });
    if (Object.keys(row).length) comp[ds] = row;
  });
  out.completions = comp;
  const must = {};
  const mustDates = new Set(Object.keys(local.mustdos || {}).concat(Object.keys(remote.mustdos || {})));
  mustDates.forEach(ds => {
    const a = (local.mustdos || {})[ds] || [];
    const b = (remote.mustdos || {})[ds] || [];
    const byId = {};
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(m => {
      if (!m || !m.id) return;
      const cur = byId[m.id];
      if (!cur || (Number(m.c) || 0) > (Number(cur.c) || 0)) byId[m.id] = m;
    });
    const arr = Object.values(byId).sort((x, y) => (Number(x.ord) || 0) - (Number(y.ord) || 0));
    if (arr.length) must[ds] = arr;
  });
  out.mustdos = must;
  const map = {};
  (local.settlements || []).concat(remote.settlements || []).forEach(s => {
    if (!s || !s.id) return;
    const cur = map[s.id];
    if (!cur || (Number(s.c) || 0) > (Number(cur.c) || 0)) map[s.id] = s;
  });
  out.settlements = Object.values(map).sort((a, b) => String(a.paidAt || '').localeCompare(String(b.paidAt || '')));
  return out;
}

let syncBusy = false;
let pushTimer = null;

async function testSync(url, code) {
  const ep = normalizeUrl(url) + '/families/' + encodeURIComponent(code) + '.json';
  try {
    const r = await fetch(ep, { cache: 'no-store' });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: '권한이 없어요. Firebase 규칙을 테스트 모드로 바꿔 주세요.' };
    }
    if (!r.ok && r.status !== 404) return { ok: false, message: '연결 오류 (' + r.status + ')' };
    return { ok: true, message: r.status === 404 ? '연결 성공! 새 저장소를 만들 거예요.' : '연결 성공! 가족 기록을 찾았어요.' };
  } catch (e) {
    return { ok: false, message: '주소에 연결할 수 없어요. URL을 확인해 주세요.' };
  }
}

async function syncNow() {
  const ep = syncEndpoint();
  if (!state.sync.enabled || !ep) return { ok: false, reason: 'off' };
  if (syncBusy) return { ok: false, reason: 'busy' };
  syncBusy = true;
  try {
    const res = await fetch(ep, { cache: 'no-store' });
    let remote = null;
    if (res.status !== 404) {
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403 ? '권한이 없어요 (Firebase 규칙 확인)' : '연결 오류 (' + res.status + ')');
      }
      remote = await res.json().catch(() => null);
    }
    const merged = mergeStates(state, remote);
    const localChanged = stable(syncPayload(merged)) !== stable(syncPayload(state));
    if (localChanged) { state = merged; saveState(false); }
    const needPush = !remote || stable(syncPayload(merged)) !== stable(pickRemote(remote));
    if (needPush) {
      const put = await fetch(ep, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncPayload(merged))
      });
      if (!put.ok) throw new Error('저장 실패 (' + put.status + ')');
    }
    state.sync.lastSync = Date.now();
    saveState(false);
    if (localChanged) renderAll();
    return { ok: true, changed: localChanged };
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) };
  } finally {
    syncBusy = false;
  }
}

function schedulePush() {
  if (!state.sync.enabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { syncNow(); }, 1200);
}

/* 1탭 동기화 링크: #sync=<base64(JSON {url, code})> 또는 #sync=<URL인코딩 JSON> */
function decodeSyncHash(hash) {
  const h = String(hash || '');
  if (h.indexOf('#sync=') !== 0) return null;
  const raw = h.slice(6).trim();
  if (!raw) return null;
  let obj = null;
  try {
    let b = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e1) {
    try { obj = JSON.parse(decodeURIComponent(raw)); } catch (e2) { obj = null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const url = normalizeUrl(obj.url || obj.u || '');
  const code = String(obj.code || obj.c || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  if (!/^https:\/\/[^\s/]+/i.test(url)) return null;
  if (!code) return null;
  return { url: url, code: code };
}

function applySyncHash() {
  const cfg = decodeSyncHash(window.location.hash);
  if (!cfg) return false;
  state.sync = { url: cfg.url, code: cfg.code, enabled: true, lastSync: null };
  saveState(false);
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 주소창 정리 실패 */ }
  return true;
}

function connectFromSyncHash() {
  if (!applySyncHash()) return false;
  renderAll();
  toast('가족 동기화를 연결하는 중이에요…', 1600);
  syncNow().then(r => {
    if (ui.mode === 'kid') renderKid(); else renderTab();
    toast(r && r.ok ? '가족 기기와 동기화를 연결했어요' : '동기화를 켰어요. 연결을 확인해 주세요', 2400);
  });
  return true;
}

/* ---------- 6. 효과음 & 애니메이션 ---------- */
let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
function playChime(kind) {
  if (!state.settings.sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = kind === 'all'
      ? [[659.25, 0], [783.99, 0.09], [987.77, 0.18], [1318.51, 0.28]]
      : [[880, 0], [1174.66, 0.08]];
    notes.forEach(function (n) {
      const f = n[0], t = n[1];
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.linearRampToValueAtTime(0.11, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.55);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + t);
      o.stop(now + t + 0.6);
    });
  } catch (e) { /* 소리 실패는 무시 */ }
}

function gainFx(x, y, amount) {
  if (prefersReduced()) return;
  const fx = $('#fxRoot');
  const f = document.createElement('div');
  f.className = 'float-gain';
  f.textContent = '+' + wonU(amount);
  f.style.left = x + 'px';
  f.style.top = y + 'px';
  fx.appendChild(f);
  setTimeout(() => f.remove(), 1150);
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('div');
    c.className = 'coin';
    c.textContent = '₩';
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    c.style.setProperty('--dx', (Math.random() * 150 - 75).toFixed(0) + 'px');
    c.style.setProperty('--dy', (-45 - Math.random() * 85).toFixed(0) + 'px');
    c.style.animationDelay = (Math.random() * 90).toFixed(0) + 'ms';
    fx.appendChild(c);
    setTimeout(() => c.remove(), 1350);
  }
}

function sparkle(x, y) {
  if (prefersReduced()) return;
  const fx = $('#fxRoot');
  const chars = ['✨', '⭐', '💛', '🌟'];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.textContent = chars[i % chars.length];
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.random() * 90 - 45).toFixed(0) + 'px');
    s.style.setProperty('--dy', (-30 - Math.random() * 50).toFixed(0) + 'px');
    fx.appendChild(s);
    setTimeout(() => s.remove(), 800);
  }
}

function celebrate() {
  const host = $('#celebrate');
  host.classList.remove('hidden');
  const colors = ['#FF8A6B', '#FFC46B', '#6FD3BC', '#B3A2EA', '#FFAFC3', '#FFD166'];
  let pieces = '';
  for (let i = 0; i < 34; i++) {
    pieces += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + colors[i % colors.length] +
      ';animation-duration:' + (1.9 + Math.random() * 1.5).toFixed(2) + 's;animation-delay:' + (Math.random() * 0.7).toFixed(2) +
      's;width:' + (6 + Math.random() * 5).toFixed(0) + 'px;height:' + (9 + Math.random() * 8).toFixed(0) + 'px"></i>';
  }
  host.innerHTML = '<div class="confetti">' + pieces + '</div>' +
    '<div class="cele-card"><div class="cele-emoji">🎉</div>' +
    '<div class="cele-title">오늘 할 일 모두 완료!</div>' +
    '<div class="cele-sub">' + esc(state.settings.name) + ' 최고예요!</div>' +
    '<button class="btn primary" id="celeClose" type="button">좋아!</button></div>';
  const close = () => { host.classList.add('hidden'); host.innerHTML = ''; };
  const btn = $('#celeClose');
  if (btn) btn.addEventListener('click', close);
  host.onclick = (e) => { if (e.target === host) close(); };
  setTimeout(() => { if (host && !host.classList.contains('hidden')) close(); }, 4500);
}

let shownAmount = null;
function animateAmount(target) {
  const el = $('#weekAmount');
  if (!el) return;
  if (shownAmount === null || prefersReduced()) {
    shownAmount = target;
    el.textContent = won(target);
    return;
  }
  const from = shownAmount;
  shownAmount = target;
  if (from === target) { el.textContent = won(target); return; }
  const start = performance.now();
  const dur = 520;
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = won(Math.round(from + (target - from) * e));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- 7. 토스트 / 시트 ---------- */
function toast(msg, ms) {
  const root = $('#toastRoot');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 280);
  }, ms || 1900);
}

let activeSheet = null;
function openSheet(opts) {
  const root = $('#sheetRoot');
  root.innerHTML = '<div class="sheet-backdrop" data-close></div>' +
    '<div class="sheet" role="dialog" aria-modal="true">' +
    '<div class="sheet-handle"></div>' +
    '<h2 class="sheet-title">' + esc(opts.title || '') + '</h2>' +
    '<div class="sheet-body">' + (opts.body || '') + '</div>' +
    (opts.footer ? '<div class="sheet-actions">' + opts.footer + '</div>' : '') +
    '</div>';
  document.body.style.overflow = 'hidden';
  const close = () => {
    if (!activeSheet || activeSheet.root !== root) return;
    root.innerHTML = '';
    document.body.style.overflow = '';
    activeSheet = null;
    if (opts.onClose) opts.onClose();
  };
  activeSheet = { root, close };
  root.onclick = (e) => {
    if (e.target.closest('[data-close]')) { e.preventDefault(); close(); }
  };
  if (opts.onMount) opts.onMount({ root, close });
  return { root, close };
}
function closeSheet() { if (activeSheet) activeSheet.close(); }
function sheetIsOpen() { return !!activeSheet; }

/* ---------- 8. 아이 모드 ---------- */
function updateSoundBtn() {
  const b = $('#soundBtn');
  if (!b) return;
  b.textContent = state.settings.sound ? '🔔' : '🔕';
  b.setAttribute('aria-label', state.settings.sound ? '소리 끄기' : '소리 켜기');
}

function greetText() {
  const h = new Date().getHours();
  const name = state.settings.name || '우리 딸';
  if (h < 10) return '좋은 아침이에요, ' + name + '!';
  if (h < 17) return '좋은 오후예요, ' + name + '!';
  if (h < 21) return '좋은 저녁이에요, ' + name + '!';
  return '오늘도 수고했어요, ' + name + '!';
}

function progressMessage(done, total, isToday, isPast) {
  if (!total) return isPast ? '이 날은 할 일이 없었어요' : '오늘은 쉬어 가는 날이에요';
  if (!isToday) return isPast ? total + '개 중 ' + done + '개를 했어요' : '미리 볼 수 있어요';
  const r = done / total;
  if (r >= 1) return '오늘 할 일을 모두 끝냈어요! 최고예요 🎉';
  if (done === 0) return '첫 할 일을 시작해 볼까요?';
  if (r >= 0.6) return '거의 다 왔어요! 조금만 더 힘내요 💪';
  return '하나씩 잘 해내고 있어요!';
}

function renderMustDo() {
  const ds = todayStr();
  const items = mustDosFor(ds);
  const done = items.filter(m => m.done).length;
  const doneMoney = items.filter(m => m.done).reduce((a, m) => a + mustDoAmount(m), 0);
  const sub = $('#mustDoSub');
  const list = $('#mustDoList');
  if (sub) {
    if (!items.length) sub.textContent = '오늘 꼭 할 일을 적어 봐요';
    else if (done === items.length) sub.textContent = '모두 끝났어요! 오늘 용돈 +' + wonU(doneMoney) + ' 👏';
    else sub.textContent = items.length + '개 중 ' + done + '개 했어요' + (done ? ' · +' + wonU(doneMoney) : '');
  }
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<li class="mustdo-empty"><img src="assets/cat-sleep.webp" alt="" width="58" height="47"><span>아직 적은 일이 없어요.<br>오늘 꼭 해야 할 일을 적어 보세요.</span></li>';
    return;
  }
  list.innerHTML = items.map(m =>
    '<li class="mustdo-item' + (m.done ? ' done' : '') + '">' +
    '<button class="mustdo-check" type="button" data-must-toggle="' + esc(m.id) + '" aria-pressed="' + m.done +
    '" aria-label="' + esc(m.text) + (m.done ? ' 완료 취소' : ' 완료') + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<span class="mustdo-text">' + esc(m.text) + '</span>' +
    '<span class="mustdo-amount' + (m.done ? ' on' : '') + '" aria-hidden="true">+' + wonU(mustDoAmount(m)) + '</span>' +
    '<button class="mustdo-del" type="button" data-must-del="' + esc(m.id) + '" aria-label="' + esc(m.text) + ' 지우기">✕</button>' +
    '</li>'
  ).join('');
}

function renderKid() {
  updateSoundBtn();
  const today = todayStr();
  const ws = currentWeekStart();
  const sum = weekSummary(ws);
  const now = new Date();

  $('#todayDate').textContent = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
  $('#todayDow').textContent = '(' + DAY_NAMES[mondayIndex(now)] + ')';
  const dow = mondayIndex(now);
  $('#dateSub').textContent = DAY_FULL[dow] + (dow === 6 ? ' · 오늘은 정산날이에요' : ' · 일요일까지 ' + (6 - dow) + '일 남았어요');
  $('#greeting').textContent = greetText();
  renderMustDo();

  // 히어로 금액 / 안내문
  animateAmount(sum.remaining);
  const daysLeft = 6 - mondayIndex(now);
  let note;
  if (sum.settlements.length && sum.remaining === 0) {
    note = '이번 주 용돈 ' + wonU(sum.settledAmount) + ' 받았어요!';
  } else if (sum.settlements.length && sum.remaining > 0) {
    note = '정산하고 ' + wonU(sum.remaining) + ' 더 모았어요';
  } else if (daysLeft === 0) {
    note = '오늘은 정산날! 부모님께 용돈을 받아요';
  } else {
    note = '일요일까지 ' + daysLeft + '일 남았어요';
  }
  $('#weekNote').textContent = note;

  const streak = calcStreak();
  const chip = $('#streakChip');
  if (streak >= 2) {
    chip.classList.remove('hidden');
    $('#streakNum').textContent = streak;
  } else {
    chip.classList.add('hidden');
  }

  // 요일 막대
  const maxDay = Math.max.apply(null, sum.byDay.map(d => d.total).concat([100]));
  $('#weekBars').innerHTML = sum.byDay.map((d, i) => {
    const ds = d.date;
    const h = d.total ? Math.max(10, Math.round(d.total / maxDay * 100)) : 6;
    const cls = ['wb'];
    if (d.total > 0) cls.push('has');
    if (ds === today) cls.push('today');
    if (ds === ui.selectedDate) cls.push('sel');
    return '<div class="' + cls.join(' ') + '"><div class="wb-track"><div class="wb-bar" style="height:' + h + '%"></div></div><span class="wb-label">' + DAY_NAMES[i] + '</span></div>';
  }).join('');

  // 선택한 날 진행
  const sel = ui.selectedDate;
  const selTasks = tasksForDate(sel);
  const done = selTasks.filter(t => isDone(sel, t.id)).length;
  const total = selTasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const ring = $('#ring');
  ring.style.setProperty('--p', pct);
  ring.classList.toggle('full', total > 0 && done === total);
  $('#ringText').textContent = done + '/' + total;
  const isToday = sel === today;
  $('#progressTitle').textContent = isToday ? '오늘의 할 일' : DAY_FULL[mondayIndex(parseYmd(sel))] + ' 할 일';
  $('#progressSub').textContent = progressMessage(done, total, isToday, sel < today);
  $('#stamp').textContent = total > 0 && done === total ? '🎉' : (done > 0 ? '⭐' : '🌟');

  // 요일 선택
  $('#dayStrip').innerHTML = weekDates(ws).map((ds, i) => {
    const ts = tasksForDate(ds);
    const dn = ts.filter(t => isDone(ds, t.id)).length;
    const cls = ['day-btn'];
    if (ds === today) cls.push('today');
    if (ds === sel) cls.push('sel');
    if (ts.length && dn === ts.length) cls.push('done');
    else if (dn > 0) cls.push('partial');
    return '<button class="' + cls.join(' ') + '" type="button" role="tab" data-date="' + ds + '" aria-selected="' + (ds === sel) + '">' +
      DAY_NAMES[i] + '<span class="day-dot"></span></button>';
  }).join('');

  const hint = $('#dayHint');
  if (!isToday) {
    hint.classList.remove('hidden');
    hint.textContent = sel < today ? '지난 날이에요. 보기만 할 수 있어요.' : '아직 오지 않은 날이에요. 미리 볼 수 있어요.';
  } else {
    hint.classList.add('hidden');
  }

  // 할 일 카드
  const list = $('#taskList');
  if (!selTasks.length) {
    list.innerHTML = '<div class="empty-card"><span class="big">🌈</span>' +
      (isToday ? '오늘은 할 일이 없어요.<br>부모님이 할 일을 추가하면 여기에 보여요.' : '이 날은 할 일이 없어요.') + '</div>';
  } else {
    list.innerHTML = selTasks.map((t, i) => {
      const n = getCount(sel, t.id);
      const d = n > 0;
      const cls = ['task-card'];
      if (d) cls.push('done');
      if (t.repeat) cls.push('repeat');
      if (!isToday) cls.push('locked');
      const meta = t.repeat
        ? (n ? '<b class="t-count">' + n + '회</b> · 한 번에 +' + wonU(t.amount) : '누를 때마다 +' + wonU(t.amount))
        : ((d ? '완료! ' : '완료하면 ') + '<b>+' + wonU(t.amount) + '</b>');
      const ctrl = t.repeat
        ? '<span class="t-ctrl">' +
          (n > 0 ? '<button class="undo-btn" type="button" data-undo="' + esc(t.id) + '" aria-label="하나 취소">−</button>' : '') +
          '<span class="t-check plus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg></span></span>'
        : '<span class="t-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
      return '<div class="' + cls.join(' ') + '" role="button" tabindex="0" data-task="' + esc(t.id) + '" aria-label="' + esc(t.title) + '" style="--pastel:' + PASTELS[i % PASTELS.length] + '">' +
        '<span class="t-emoji">' + esc(t.emoji) + '</span>' +
        '<span class="t-main"><span class="t-title">' + esc(t.title) + '</span>' +
        '<span class="t-meta">' + meta + '</span></span>' +
        ctrl +
        '</div>';
    }).join('');
  }
}

function onTaskTap(taskId, cardEl, undo) {
  const ds = ui.selectedDate;
  const today = todayStr();
  if (ds !== today) {
    toast(ds < today ? '지난 날은 볼 수만 있어요' : '아직 오지 않은 날이에요');
    return;
  }
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const count = getCount(ds, taskId);
  const weekSettled = state.settlements.some(s => s.weekStart === currentWeekStart() && !s.del);

  if (task.repeat) {
    if (undo && count <= 0) return;
    if (undo && weekSettled) { toast('이번 주는 이미 정산했어요. 부모님께 말씀드려요'); return; }
    const next = count + (undo ? -1 : 1);
    setCheckCount(ds, taskId, next, task);
    renderKid();
    if (undo) {
      toast('하나 취소했어요', 1300);
    } else {
      const r = cardEl.getBoundingClientRect();
      gainFx(r.left + r.width * 0.84, r.top + r.height / 2, task.amount);
      sparkle(r.left + r.width * 0.84, r.top + r.height / 2);
      playChime();
      if (allDone(ds)) setTimeout(() => { celebrate(); playChime('all'); }, 380);
    }
    return;
  }

  if (count > 0 && weekSettled) {
    toast('이번 주는 이미 정산했어요. 부모님께 말씀드려요');
    return;
  }
  if (count === 0) {
    const r = cardEl.getBoundingClientRect();
    setCheck(ds, taskId, true, task);
    renderKid();
    gainFx(r.left + r.width * 0.82, r.top + r.height / 2, task.amount);
    sparkle(r.left + r.width * 0.82, r.top + r.height / 2);
    playChime();
    if (allDone(ds)) {
      setTimeout(() => { celebrate(); playChime('all'); }, 380);
    }
  } else {
    setCheck(ds, taskId, false, task);
    renderKid();
    toast('체크를 취소했어요');
  }
}

/* ---------- 9. 부모님 모드 ---------- */
function renderParent() {
  const today = todayStr();
  const ts = tasksForDate(today);
  const done = ts.filter(t => isDone(today, t.id)).length;
  $('#parentSub').textContent = state.settings.name + ' · 오늘 ' + done + '/' + ts.length + ' 완료';
  renderTab();
}
function renderTab() {
  if (ui.tab === 'tasks') renderTasksTab();
  else if (ui.tab === 'log') renderLogTab();
  else if (ui.tab === 'settle') renderSettleTab();
  else renderSettingsTab();
}
function daysLabel(days) {
  const d = days.slice().sort((a, b) => a - b);
  if (d.length === 7) return '매일';
  if (!d.length) return '요일 없음';
  return d.map(i => DAY_NAMES[i]).join('·');
}

function renderTasksTab() {
  const list = state.tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = list.map((t, i) => {
    return '<div class="prow' + (t.active ? '' : ' off') + '" data-id="' + esc(t.id) + '">' +
      '<div class="prow-emoji" style="background:' + PASTELS[i % PASTELS.length] + '">' + esc(t.emoji) + '</div>' +
      '<div class="prow-main"><div class="prow-title">' + esc(t.title) + '</div>' +
      '<div class="prow-sub">' + daysLabel(t.days) + ' · ' + wonU(t.amount) + (t.repeat ? ' · 수시로' : '') + '</div></div>' +
      '<label class="switch" aria-label="' + esc(t.title) + ' 사용"><input type="checkbox" data-act="toggle" ' + (t.active ? 'checked' : '') + '><span></span></label>' +
      '<button class="mini-btn" type="button" data-act="edit" aria-label="수정">✏️</button>' +
      '<button class="mini-btn" type="button" data-act="del" aria-label="삭제">🗑️</button>' +
      '</div>';
  }).join('');
  $('#tabTasks').innerHTML =
    '<div class="pcard">' +
    '<div class="pcard-head"><h3>할 일 목록</h3><span class="chip">' + state.tasks.length + '개</span></div>' +
    '<div class="task-rows">' + (rows || '<p class="hint">아직 할 일이 없어요.</p>') + '</div>' +
    '<button class="btn primary" id="addTaskBtn" type="button">+ 새 할 일 추가</button>' +
    '</div>' +
    '<p class="hint">요일에 맞춰 아이 화면에 자동으로 나타나요. 오늘 ' + tasksForDate(todayStr()).length + '개 · 한 번씩만 해도 하루 최대 ' + wonU(maxDailyAmount()) + '까지 모을 수 있어요.</p>';
}
function maxDailyAmount() {
  let max = 0;
  for (let d = 0; d < 7; d++) {
    const sum = tasksForDow(d).reduce((a, t) => a + t.amount, 0);
    if (sum > max) max = sum;
  }
  return max;
}

function renderLogTab() {
  const ws = ui.weekStart;
  const dates = weekDates(ws);
  const sum = weekSummary(ws);
  const today = todayStr();
  const isThis = ws === currentWeekStart();
  const rows = [];
  const seen = new Set();
  state.tasks.forEach(t => { rows.push({ id: t.id, title: t.title, emoji: t.emoji }); seen.add(t.id); });
  Object.keys(sum.byTask).forEach(id => {
    if (!seen.has(id)) {
      rows.push({ id, title: sum.byTask[id].title, emoji: sum.byTask[id].emoji });
      seen.add(id);
    }
  });

  const head = '<tr><th class="sticky">할 일</th>' +
    dates.map((ds, i) => '<th class="' + (ds === today ? 'today' : '') + '">' + DAY_NAMES[i] + '<span>' + Number(ds.slice(8)) + '</span></th>').join('') +
    '<th>합계</th></tr>';

  const body = rows.length ? rows.map(r => {
    const t = state.tasks.find(x => x.id === r.id);
    const cells = dates.map((ds, i) => {
      const hasEntry = !!(sum.byTask[r.id] && sum.byTask[r.id].days[ds]);
      const scheduled = (t && t.days.includes(i)) || hasEntry;
      if (!scheduled) return '<td><span class="cell-check na">·</span></td>';
      const cnt = getCount(ds, r.id);
      const on = cnt > 0;
      const isRepeat = !!(t && t.repeat);
      return '<td><button class="cell-check ' + (on ? 'on' : '') + '" type="button" data-date="' + ds + '" data-task="' + esc(r.id) +
        '" aria-label="' + esc(r.title) + ' ' + DAY_FULL[i] + ' ' + (on ? cnt + '회' : '기록 없음') + '">' +
        (isRepeat ? (on ? cnt : '') : '✓') + '</button></td>';
    }).join('');
    const total = sum.byTask[r.id] ? sum.byTask[r.id].total : 0;
    return '<tr><td class="sticky"><div class="row-title"><span class="e">' + esc(r.emoji) + '</span><span>' + esc(r.title) + '</span></div></td>' +
      cells + '<td>' + (total ? won(total) : '-') + '</td></tr>';
  }).join('') : '<tr><td class="sticky">할 일이 없어요</td>' + dates.map(() => '<td></td>').join('') + '<td>-</td></tr>';

  const foot = '<tr><td class="sticky">하루 합계</td>' +
    sum.byDay.map(d => '<td>' + (d.total ? won(d.total) : '-') + '</td>').join('') +
    '<td>' + won(sum.total) + '</td></tr>';

  $('#tabLog').innerHTML =
    '<div class="pcard">' +
    '<div class="week-nav">' +
    '<button class="nav-btn" id="weekPrev" type="button" aria-label="이전 주">‹</button>' +
    '<div class="nav-label">' + fmtMD(ws) + ' ~ ' + fmtMD(dates[6]) + '<small>' + (isThis ? '이번 주' : '지난 기록') + '</small></div>' +
    '<button class="nav-btn" id="weekNext" type="button" aria-label="다음 주">›</button>' +
    '</div>' +
    (isThis ? '' : '<button class="btn secondary sm" id="weekThis" type="button" style="margin-bottom:10px">이번 주로 돌아가기</button>') +
    '<div class="stat-row">' +
    '<div class="stat"><b>' + sum.count + '개</b><span>완료한 일</span></div>' +
    '<div class="stat"><b>' + wonU(sum.total) + '</b><span>주간 합계</span></div>' +
    '<div class="stat"><b>' + (sum.settlements.length ? wonU(sum.settledAmount) : '–') + '</b><span>정산 금액</span></div>' +
    '</div>' +
    '<div class="log-scroll"><table class="log-table"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>' +
    '<p class="hint" style="margin:10px 2px 0">칸을 누르면 그날의 체크를 켜고 끌 수 있어요. (부모님 권한)</p>' +
    (sum.mustTotal ? '<p class="hint" style="margin:4px 2px 0;color:#B5762F">📌 오늘 꼭 한 일 ' + sum.mustCount + '개 · ' + wonU(sum.mustTotal) + ' 포함</p>' : '') +
    (sum.settlements.length ? '<p class="hint" style="margin:4px 2px 0;color:#2E8C74">✓ 이 주는 ' + wonU(sum.settledAmount) + ' 정산했어요.</p>' : '') +
    '</div>';
}

function renderSettleTab() {
  const ws = currentWeekStart();
  const dates = weekDates(ws);
  const sum = weekSummary(ws);
  const history = state.settlements.filter(s => !s.del).slice().sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
  const chips = sum.byDay.map((d, i) => '<span class="dcv">' + DAY_NAMES[i] + ' <b>' + won(d.total) + '</b></span>').join('');

  const historyHTML = history.length ? history.map(s =>
    '<div class="history-item">' +
    '<div class="hi-ico">💵</div>' +
    '<div class="hi-main"><div class="hi-top"><span class="hi-amount">+' + wonU(s.amount) + '</span><span class="hi-date">' + fmtDate(s.paidAt) + '</span></div>' +
    '<div class="hi-sub">' + fmtMD(s.weekStart) + ' ~ ' + fmtMD(s.weekEnd) + (s.count ? ' · ' + s.count + '번 체크' : '') + (s.note ? ' · ' + esc(s.note) : '') + '</div></div>' +
    '<button class="hi-del" type="button" data-del-settle="' + esc(s.id) + '" aria-label="정산 기록 삭제">✕</button>' +
    '</div>'
  ).join('') : '<p class="hint" style="margin:0">아직 정산 기록이 없어요. 일요일에 첫 정산을 해 보세요.</p>';

  $('#tabSettle').innerHTML =
    '<div class="settle-hero">' +
    '<div class="sh-label">이번 주 정산할 금액</div>' +
    '<div class="sh-amount"><b>' + won(sum.remaining) + '</b><em>원</em></div>' +
    '<div class="sh-meta">' + fmtMD(ws) + ' ~ ' + fmtMD(dates[6]) + ' · 체크 ' + sum.count + '번</div>' +
    '<div class="day-chips-view">' + chips + '</div>' +
    '</div>' +
    (sum.settlements.length
      ? '<div class="pcard" style="background:#F3FBF7;border-color:rgba(111,211,188,.35)">' +
        '<div class="setting-row" style="border:0;padding:0"><div class="sr-main"><div class="sr-title" style="color:#2E8C74">✓ 이번 주 정산 완료</div>' +
        '<div class="sr-sub">' + wonU(sum.settledAmount) + ' · ' + fmtDate(sum.settlements[sum.settlements.length - 1].paidAt) +
        (sum.remaining > 0 ? ' · 정산 후 ' + wonU(sum.remaining) + ' 더 모았어요' : '') + '</div></div></div></div>'
      : '') +
    '<button class="btn primary" id="settleBtn" type="button" style="margin-bottom:12px" ' + (sum.remaining > 0 ? '' : 'disabled') + '>' +
    (sum.remaining > 0 ? '이번 주 용돈 정산하기 · ' + wonU(sum.remaining) : '정산할 금액이 없어요') + '</button>' +
    '<div class="pcard"><div class="pcard-head"><h3>요일별 모은 금액</h3><span class="chip">이번 주</span></div>' +
    '<div class="task-rows">' + sum.byDay.map((d, i) =>
      '<div class="setting-row" style="padding:8px 2px"><div class="sr-main"><div class="sr-title">' + DAY_FULL[i] + '</div>' +
      '<div class="sr-sub">' + d.doneCount + '/' + d.totalTasks + '개 완료' + (d.mustCount ? ' · 꼭 할 일 ' + d.mustCount + '개' : '') + '</div></div>' +
      '<div style="font-weight:900;font-size:13px;color:' + (d.total ? '#D2603B' : '#C0AC9D') + '">' + wonU(d.total) + '</div></div>'
    ).join('') + '</div></div>' +
    '<div class="pcard"><div class="pcard-head"><h3>정산 내역</h3><span class="chip">' + history.length + '건</span></div>' + historyHTML + '</div>' +
    '<p class="hint">정산하면 아이 화면의 ‘이번 주 모은 용돈’이 0원부터 다시 시작해요. 체크 기록은 기록 탭에 그대로 남아요.</p>';
}

function renderSettingsTab() {
  const s = state.sync;
  const last = s.lastSync ? new Date(s.lastSync) : null;
  $('#tabSettings').innerHTML =
    '<div class="pcard"><div class="pcard-head"><h3>아이 정보</h3></div>' +
    '<div class="field" style="margin-bottom:0"><label>아이 이름</label>' +
    '<input id="childName" class="input" maxlength="12" value="' + esc(state.settings.name) + '" placeholder="우리 딸"></div></div>' +

    '<div class="pcard"><div class="pcard-head"><h3>소리와 잠금</h3></div>' +
    '<div class="setting-row"><div class="sr-main"><div class="sr-title">체크 소리</div><div class="sr-sub">체크할 때 부드러운 종소리가 나요</div></div>' +
    '<label class="switch"><input type="checkbox" id="soundToggle" ' + (state.settings.sound ? 'checked' : '') + '><span></span></label></div>' +
    '<div class="setting-row"><div class="sr-main"><div class="sr-title">부모님 PIN</div><div class="sr-sub">4자리 · 지금은 ' + state.pin.slice(0, 2) + '••</div></div>' +
    '<button class="sr-action" type="button" data-settings-action="pin">PIN 변경</button></div></div>' +

    '<div class="pcard"><div class="pcard-head"><h3>가족 기기 동기화</h3><span class="chip ' + (s.enabled ? 'ok' : '') + '">' + (s.enabled ? '연결됨' : '꺼짐') + '</span></div>' +
    '<p class="hint" style="margin:-4px 0 12px">부모님 폰과 아이 폰에 같은 기록이 보이도록 Firebase 무료 데이터베이스에 연결해요. 연결하지 않아도 이 폰에는 기록이 저장돼요.</p>' +
    '<div class="field"><label>Firebase Realtime Database URL</label>' +
    '<input id="syncUrl" class="input" type="url" autocomplete="off" spellcheck="false" placeholder="https://내프로젝트-default-rtdb.firebaseio.com" value="' + esc(s.url) + '"></div>' +
    '<div class="field"><label>가족 코드</label><div class="code-row">' +
    '<input id="syncCode" class="input" autocomplete="off" spellcheck="false" placeholder="예: gajok-7f3a9ck2" value="' + esc(s.code) + '">' +
    '<button class="mini-btn wide" type="button" data-settings-action="gencode">자동 생성</button></div></div>' +
    '<div class="btn-row">' +
    '<button class="btn primary sm" type="button" data-settings-action="connect">' + (s.enabled ? '연결 확인' : '동기화 켜기') + '</button>' +
    (s.enabled ? '<button class="btn ghost sm" type="button" data-settings-action="syncnow">지금 동기화</button>' : '') +
    (s.enabled ? '<button class="btn ghost sm" type="button" data-settings-action="syncoff">끄기</button>' : '') +
    '</div>' +
    (s.enabled ? '<div class="sync-status" id="syncStatus">' + (last ? '마지막 동기화: ' + fmtDate(last.toISOString()) + ' ' + fmtTime(last) : '아직 동기화 전이에요') + '</div>' : '') +
    '<details class="help"><summary>Firebase 준비 방법 (3분)</summary><ol>' +
    '<li><code>console.firebase.google.com</code> 접속 → 프로젝트 만들기</li>' +
    '<li>왼쪽 <b>빌드 → Realtime Database</b> → 데이터베이스 만들기 → <b>테스트 모드</b></li>' +
    '<li>화면 위의 주소를 복사 (예: <code>https://내프로젝트-default-rtdb.firebaseio.com</code>)</li>' +
    '<li>규칙 탭에 아래 규칙을 붙여넣고 <b>게시</b></li>' +
    '</ol><pre>{ "rules": { "families": { "$code": { ".read": true, ".write": true } } } }</pre>' +
    '<p class="hint" style="margin:8px 0 0">이 규칙은 주소와 가족 코드를 아는 사람만 접근할 수 있는 간단한 방식이에요. 가족 코드는 ‘자동 생성’으로 12자 이상 만들어 주세요. 더 강한 보안이 필요하면 Firebase 로그인(인증)을 추가해야 해요.</p>' +
    '</details></div>' +

    '<div class="pcard"><div class="pcard-head"><h3>기록 보관</h3></div>' +
    '<div class="setting-row"><div class="sr-main"><div class="sr-title">백업 내려받기</div><div class="sr-sub">모든 기록을 JSON 파일로 저장해요</div></div>' +
    '<button class="sr-action" type="button" data-settings-action="export">내려받기</button></div>' +
    '<div class="setting-row"><div class="sr-main"><div class="sr-title">백업 복원</div><div class="sr-sub">백업 파일을 불러와요</div></div>' +
    '<button class="sr-action" type="button" data-settings-action="import">불러오기</button></div>' +
    '<div class="setting-row"><div class="sr-main"><div class="sr-title">처음 상태로</div><div class="sr-sub">모든 기록을 지우고 기본 할 일로 시작해요</div></div>' +
    '<button class="sr-action" type="button" data-settings-action="reset" style="color:#C9453C">초기화</button></div></div>' +

    '<div class="pcard"><div class="pcard-head"><h3>홈 화면 앱</h3></div>' +
    '<p class="hint" style="margin:-4px 0 10px">홈 화면에 추가하면 주소창 없이 앱처럼 열려요. 인터넷이 없어도 기록은 저장돼요.</p>' +
    '<button class="btn secondary sm" type="button" data-settings-action="install">설치 방법 보기</button></div>' +

    '<p class="hint" style="text-align:center;margin-top:16px">용돈 챌린지 v' + APP_VERSION + ' · 매주 일요일 정산</p>';
}

/* ---------- 10. 시트들 ---------- */
function openTaskSheet(taskId) {
  const existing = taskId ? state.tasks.find(t => t.id === taskId) : null;
  const draft = existing
    ? { title: existing.title, emoji: existing.emoji, days: existing.days.slice(), amount: existing.amount, active: existing.active, repeat: !!existing.repeat }
    : { title: '', emoji: '⭐', days: ALL_DAYS.slice(), amount: 100, active: true, repeat: false };

  const body =
    '<div class="field"><label>할 일 이름</label><input id="fTitle" class="input" maxlength="40" placeholder="예: 책 10분 읽기" value="' + esc(draft.title) + '"></div>' +
    '<div class="field"><label>아이콘</label><div class="emoji-grid" id="fEmojis">' +
    EMOJIS.map(e => '<button type="button" class="emoji-btn' + (e === draft.emoji ? ' on' : '') + '" data-emoji="' + e + '">' + e + '</button>').join('') +
    '</div></div>' +
    '<div class="field"><label>하는 요일</label><div class="day-chips" id="fDays">' +
    DAY_NAMES.map((n, i) => '<button type="button" class="day-chip' + (draft.days.includes(i) ? ' on' : '') + '" data-day="' + i + '">' + n + '</button>').join('') +
    '</div><div class="quick-row" id="fPresets"><button type="button" data-preset="all">매일</button><button type="button" data-preset="weekday">평일</button><button type="button" data-preset="weekend">주말</button></div></div>' +
    '<div class="field"><label>체크 방식</label><div class="seg" id="fRepeat">' +
    '<button type="button" data-repeat="0" class="' + (draft.repeat ? '' : 'on') + '">하루 1번</button>' +
    '<button type="button" data-repeat="1" class="' + (draft.repeat ? 'on' : '') + '">수시로 여러 번</button>' +
    '</div><p class="hint" id="fRepeatHint" style="margin:6px 2px 0">' +
    (draft.repeat ? '누를 때마다 1회씩 쌓이고, 횟수만큼 용돈이 붙어요.' : '완료하면 하루 한 번만 체크할 수 있어요.') +
    '</p></div>' +
    '<div class="field"><label>한 번에 받는 용돈</label><div class="amount-row">' +
    '<input id="fAmount" class="input" type="number" inputmode="numeric" min="10" max="10000" step="10" value="' + draft.amount + '"><span>원</span></div>' +
    '<div class="quick-row" id="fAmounts">' + [50, 100, 200, 500].map(a => '<button type="button" data-amount="' + a + '">' + a + '원</button>').join('') + '</div></div>';

  const sheet = openSheet({
    title: existing ? '할 일 수정' : '새 할 일 추가',
    body,
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn primary" id="taskSave" type="button">저장</button>',
    onMount: function (api) {
      const root = api.root;
      const daysBox = root.querySelector('#fDays');
      const emojiBox = root.querySelector('#fEmojis');
      daysBox.addEventListener('click', e => {
        const b = e.target.closest('[data-day]');
        if (!b) return;
        const d = Number(b.dataset.day);
        if (draft.days.includes(d)) draft.days = draft.days.filter(x => x !== d);
        else draft.days.push(d);
        b.classList.toggle('on', draft.days.includes(d));
      });
      emojiBox.addEventListener('click', e => {
        const b = e.target.closest('[data-emoji]');
        if (!b) return;
        draft.emoji = b.dataset.emoji;
        $$('.emoji-btn', emojiBox).forEach(x => x.classList.toggle('on', x === b));
      });
      root.querySelector('#fPresets').addEventListener('click', e => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        const p = b.dataset.preset;
        draft.days = p === 'all' ? ALL_DAYS.slice() : (p === 'weekday' ? [0, 1, 2, 3, 4] : [5, 6]);
        $$('[data-day]', daysBox).forEach(x => x.classList.toggle('on', draft.days.includes(Number(x.dataset.day))));
      });
      root.querySelector('#fAmounts').addEventListener('click', e => {
        const b = e.target.closest('[data-amount]');
        if (!b) return;
        root.querySelector('#fAmount').value = b.dataset.amount;
      });
      root.querySelector('#fRepeat').addEventListener('click', e => {
        const b = e.target.closest('[data-repeat]');
        if (!b) return;
        draft.repeat = b.dataset.repeat === '1';
        $$('[data-repeat]', root.querySelector('#fRepeat')).forEach(x => x.classList.toggle('on', x === b));
        root.querySelector('#fRepeatHint').textContent = draft.repeat
          ? '누를 때마다 1회씩 쌓이고, 횟수만큼 용돈이 붙어요.'
          : '완료하면 하루 한 번만 체크할 수 있어요.';
      });
      root.querySelector('#taskSave').addEventListener('click', () => {
        const title = root.querySelector('#fTitle').value.trim();
        const amount = Math.round(Number(root.querySelector('#fAmount').value) || 0);
        if (!title) { toast('할 일 이름을 적어 주세요'); root.querySelector('#fTitle').focus(); return; }
        if (!draft.days.length) { toast('요일을 하나 이상 골라 주세요'); return; }
        if (amount < 1) { toast('금액을 1원 이상으로 정해 주세요'); return; }
        if (existing) {
          const t = state.tasks.find(x => x.id === existing.id);
          if (!t) { toast('할 일을 찾을 수 없어요'); return; }
          t.title = title;
          t.emoji = draft.emoji;
          t.days = draft.days.slice().sort((a, b) => a - b);
          t.amount = amount;
          t.repeat = !!draft.repeat;
        } else {
          const maxOrder = state.tasks.reduce((a, t) => Math.max(a, t.order || 0), 0);
          state.tasks.push({
            id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            title, emoji: draft.emoji,
            days: draft.days.slice().sort((a, b) => a - b),
            amount, active: true, repeat: !!draft.repeat, order: maxOrder + 1
          });
        }
        touch('tasks');
        api.close();
        renderAll();
        toast(existing ? '할 일을 수정했어요' : '새 할 일을 추가했어요');
      });
      const input = root.querySelector('#fTitle');
      if (input && !existing) setTimeout(() => { try { input.focus(); } catch (e) {} }, 320);
    }
  });
  return sheet;
}

function confirmDeleteTask(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  openSheet({
    title: '할 일을 지울까요?',
    body: '<p class="sheet-note">‘' + esc(t.title) + '’을(를) 목록에서 지워요. 지금까지 모은 체크 기록과 정산 내역은 그대로 남아요.</p>',
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn danger" id="delTask" type="button">지우기</button>',
    onMount: function (api) {
      api.root.querySelector('#delTask').addEventListener('click', () => {
        state.tasks = state.tasks.filter(x => x.id !== taskId);
        touch('tasks');
        api.close();
        renderAll();
        toast('할 일을 지웠어요');
      });
    }
  });
}

function openSettleSheet() {
  const ws = currentWeekStart();
  const sum = weekSummary(ws);
  if (sum.remaining <= 0) { toast('정산할 금액이 없어요'); return; }
  const body =
    '<p class="sheet-note">이번 주 체크 <b>' + sum.count + '번</b> · 계산된 금액 <b>' + wonU(sum.total) + '</b>' +
    (sum.settlements.length ? ' (이미 정산 ' + wonU(sum.settledAmount) + ')' : '') + '</p>' +
    '<div class="field" style="margin-top:14px"><label>아이에게 줄 금액</label>' +
    '<div class="amount-row"><input id="settleAmount" class="input" type="number" inputmode="numeric" step="10" min="0" value="' + sum.remaining + '"><span>원</span></div>' +
    '<div class="quick-row" id="settleQuick"><button type="button" data-add="100">+100원</button><button type="button" data-add="-100">-100원</button><button type="button" data-reset="' + sum.remaining + '">계산대로</button></div></div>' +
    '<div class="field"><label>메모 (선택)</label><input id="settleNote" class="input" maxlength="40" placeholder="예: 일요일 저녁 현금으로 줌"></div>' +
    '<label class="setting-row" style="border:0;padding:4px 0"><div class="sr-main"><div class="sr-title">현금으로 전달했어요</div>' +
    '<div class="sr-sub">이번 주 용돈을 직접 주고 이 화면에 기록해요</div></div>' +
    '<span class="switch"><input type="checkbox" id="settleCash" checked><span></span></span></label>' +
    '<p class="sheet-note" id="settleDiff" style="display:none"></p>';

  const sheet = openSheet({
    title: '이번 주 용돈 정산',
    body,
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn primary" id="settleConfirm" type="button">정산 완료</button>',
    onMount: function (api) {
      const amt = api.root.querySelector('#settleAmount');
      const diff = api.root.querySelector('#settleDiff');
      const check = () => {
        const v = Math.round(Number(amt.value) || 0);
        if (v !== sum.remaining) {
          diff.style.display = 'block';
          diff.textContent = '계산된 금액(' + wonU(sum.remaining) + ')과 ' + wonU(Math.abs(v - sum.remaining)) + ' 차이가 있어요.';
        } else {
          diff.style.display = 'none';
        }
      };
      amt.addEventListener('input', check);
      api.root.querySelector('#settleQuick').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.reset) amt.value = b.dataset.reset;
        else amt.value = Math.max(0, (Number(amt.value) || 0) + Number(b.dataset.add));
        check();
      });
      api.root.querySelector('#settleConfirm').addEventListener('click', () => {
        const amount = Math.round(Number(amt.value) || 0);
        if (amount <= 0) { toast('금액을 1원 이상 입력해 주세요'); return; }
        const note = api.root.querySelector('#settleNote').value.trim();
        const cash = api.root.querySelector('#settleCash').checked;
        settleWeek({ amount, note: cash ? (note || '현금으로 지급') : note, count: sum.count });
        api.close();
        renderAll();
        toast(wonU(amount) + ' 정산을 기록했어요');
        playChime('all');
      });
    }
  });
  return sheet;
}

function deleteSettlement(id) {
  const s = state.settlements.find(x => x.id === id);
  if (!s) return;
  openSheet({
    title: '정산 기록을 지울까요?',
    body: '<p class="sheet-note">' + wonU(s.amount) + ' · ' + fmtMD(s.weekStart) + ' ~ ' + fmtMD(s.weekEnd) +
      ' 정산 기록을 지워요. 이번 주 모은 용돈이 다시 계산돼요.</p>',
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn danger" id="delSettle" type="button">지우기</button>',
    onMount: function (api) {
      api.root.querySelector('#delSettle').addEventListener('click', () => {
        state.clock = (state.clock || 0) + 1;
        s.del = true;
        s.c = state.clock;
        saveState();
        api.close();
        renderAll();
        toast('정산 기록을 지웠어요');
      });
    }
  });
}

function openPinChangeSheet() {
  const body =
    '<div class="field"><label>새 PIN (숫자 4자리)</label><input id="newPin1" class="input" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></div>' +
    '<div class="field"><label>새 PIN 한 번 더</label><input id="newPin2" class="input" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></div>' +
    '<p class="sheet-note">PIN은 아이가 부모님 모드를 열지 못하도록 막는 잠금이에요. 아이가 알기 쉬운 번호는 피해 주세요.</p>';
  openSheet({
    title: '부모님 PIN 변경',
    body,
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn primary" id="pinSave" type="button">바꾸기</button>',
    onMount: function (api) {
      api.root.querySelector('#pinSave').addEventListener('click', () => {
        const a = api.root.querySelector('#newPin1').value;
        const b = api.root.querySelector('#newPin2').value;
        if (!/^\d{4}$/.test(a)) { toast('숫자 4자리로 정해 주세요'); return; }
        if (a !== b) { toast('두 번 입력한 PIN이 달라요'); return; }
        state.pin = a;
        touch('pin');
        api.close();
        renderTab();
        toast('PIN을 바꿨어요');
      });
    }
  });
}

function openInstallSheet() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const body =
    '<p class="sheet-note">' + (ios ? '아이폰은 Safari에서 아래 순서로 추가해요.' : '안드로이드는 Chrome에서 아래 순서로 추가해요.') + '</p>' +
    '<ol style="padding-left:18px;font-size:12.5px;line-height:1.95;font-weight:600;color:#7A6154;margin:12px 0 0">' +
    (ios
      ? '<li>Safari 아래쪽 공유 버튼(□↑)을 눌러요</li><li>‘홈 화면에 추가’를 골라요</li><li>오른쪽 위 ‘추가’를 눌러요</li>'
      : '<li>Chrome 오른쪽 위 ⋮ 메뉴를 열어요</li><li>‘앱 설치’ 또는 ‘홈 화면에 추가’를 골라요</li><li>‘설치’를 눌러요</li>') +
    '</ol>' +
    (deferredPrompt ? '<button class="btn primary" id="doInstall" type="button" style="margin-top:14px">지금 설치하기</button>' : '') +
    '<p class="sheet-note">홈 화면에 추가한 뒤에는 주소창 없이 앱처럼 열려요. 한 번 열어 두면 인터넷이 없어도 기록이 저장돼요.</p>';
  const sheet = openSheet({
    title: '홈 화면에 앱처럼 추가',
    body,
    footer: '<button class="btn ghost" type="button" data-close>닫기</button>',
    onMount: function (api) {
      const b = api.root.querySelector('#doInstall');
      if (b) b.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } catch (e) { /* 무시 */ }
        deferredPrompt = null;
        api.close();
      });
    }
  });
  return sheet;
}

function exportData() {
  const safe = JSON.parse(JSON.stringify(state));
  safe.sync = { url: '', code: '', enabled: false, lastSync: null };
  const payload = { app: '용돈 챌린지', version: APP_VERSION, exportedAt: new Date().toISOString(), state: safe };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '용돈챌린지-백업-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('백업 파일을 내려받았어요');
}

function importData() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.onchange = function () {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = function () {
      let next = null;
      try {
        const data = JSON.parse(String(fr.result));
        next = normalizeState(data && data.state ? data.state : data);
      } catch (e) { toast('백업 파일을 읽지 못했어요'); return; }
      openSheet({
        title: '백업을 불러올까요?',
        body: '<p class="sheet-note">지금 이 폰의 기록을 백업 파일로 바꿔요. 지금 기록은 사라지니 필요한 경우 먼저 내려받아 주세요.</p>',
        footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn primary" id="doImport" type="button">불러오기</button>',
        onMount: function (api) {
          api.root.querySelector('#doImport').addEventListener('click', () => {
            next.sync = state.sync;
            state = next;
            saveState();
            api.close();
            renderAll();
            toast('백업을 불러왔어요');
          });
        }
      });
    };
    fr.readAsText(f);
  };
  inp.click();
}

function confirmReset() {
  openSheet({
    title: '처음 상태로 되돌릴까요?',
    body: '<p class="sheet-note">이 폰의 모든 체크 기록과 정산 내역이 사라지고, 처음 할 일 목록으로 시작해요. 되돌릴 수 없어요. 필요한 기록은 먼저 백업해 주세요.</p>',
    footer: '<button class="btn ghost" type="button" data-close>취소</button><button class="btn danger" id="resetAll" type="button">초기화</button>',
    onMount: function (api) {
      api.root.querySelector('#resetAll').addEventListener('click', () => {
        const syncCfg = state.sync;
        state = defaultState();
        state.sync = syncCfg;
        saveState();
        api.close();
        renderAll();
        toast('처음 상태로 돌아갔어요');
      });
    }
  });
}

function randomCode() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  try {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) out += abc[arr[i] % abc.length];
  } catch (e) {
    for (let i = 0; i < 12; i++) out += abc[Math.floor(Math.random() * abc.length)];
  }
  return 'gajok-' + out;
}

/* ---------- 11. PIN ---------- */
let pinBuffer = '';
function buildKeypad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  $('#keypad').innerHTML = keys.map(k => {
    if (k === '') return '<span></span>';
    if (k === 'del') return '<button class="key fn" type="button" data-key="del" aria-label="지우기">⌫</button>';
    return '<button class="key" type="button" data-key="' + k + '">' + k + '</button>';
  }).join('');
}
function updatePinDots() {
  $$('#pinDots span').forEach((d, i) => d.classList.toggle('on', i < pinBuffer.length));
}
function openPinGate() {
  pinBuffer = '';
  updatePinDots();
  $('#pinGate').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closePinGate() {
  $('#pinGate').classList.add('hidden');
  document.body.style.overflow = '';
  pinBuffer = '';
  updatePinDots();
}
function pinKey(k) {
  if (Date.now() < ui.pinLockedUntil) { toast('잠시 후 다시 시도해 주세요'); return; }
  if (k === 'del') { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); return; }
  if (!/^\d$/.test(k)) return;
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  updatePinDots();
  if (pinBuffer.length === 4) setTimeout(submitPin, 110);
}
function submitPin() {
  if (pinBuffer === state.pin) {
    closePinGate();
    unlockParent();
    return;
  }
  const dots = $('#pinDots');
  dots.classList.add('shake');
  setTimeout(() => dots.classList.remove('shake'), 430);
  ui.pinFails += 1;
  pinBuffer = '';
  updatePinDots();
  if (ui.pinFails >= 5) {
    ui.pinFails = 0;
    ui.pinLockedUntil = Date.now() + 15000;
    toast('5번 틀렸어요. 15초 뒤에 다시 시도해 주세요');
  } else {
    toast('PIN이 맞지 않아요 (' + (5 - ui.pinFails) + '번 남음)');
  }
}
function unlockParent() {
  ui.mode = 'parent';
  ui.tab = 'tasks';
  ui.weekStart = currentWeekStart();
  $$('#ptabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'tasks'));
  ['tasks', 'log', 'settle', 'settings'].forEach(t => {
    const el = $('#tab' + cap(t));
    if (el) el.classList.toggle('hidden', t !== 'tasks');
  });
  $('#kidView').classList.add('hidden');
  $('#parentView').classList.remove('hidden');
  renderParent();
  window.scrollTo(0, 0);
}
function lockParent() {
  ui.mode = 'kid';
  $('#parentView').classList.add('hidden');
  $('#kidView').classList.remove('hidden');
  renderKid();
  window.scrollTo(0, 0);
}

/* ---------- 12. 전체 렌더 ---------- */
function renderAll() {
  renderKid();
  if (ui.mode === 'parent') renderParent();
}

/* ---------- 13. 이벤트 ---------- */
let deferredPrompt = null;

function bindEvents() {
  $('#soundBtn').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    touch('settings');
    updateSoundBtn();
    if (state.settings.sound) playChime();
    toast(state.settings.sound ? '소리를 켰어요' : '소리를 껐어요', 1200);
  });

  $('#parentBtn').addEventListener('click', openPinGate);
  $('#pinCancel').addEventListener('click', closePinGate);
  $('#pinGate').addEventListener('click', e => { if (e.target === $('#pinGate')) closePinGate(); });
  $('#keypad').addEventListener('click', e => {
    const b = e.target.closest('[data-key]');
    if (b) pinKey(b.dataset.key);
  });

  $('#exitParentBtn').addEventListener('click', lockParent);

  $('#ptabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    ui.tab = b.dataset.tab;
    $$('#ptabs button').forEach(x => x.classList.toggle('active', x === b));
    ['tasks', 'log', 'settle', 'settings'].forEach(t => {
      $('#tab' + cap(t)).classList.toggle('hidden', t !== ui.tab);
    });
    renderTab();
    window.scrollTo(0, 0);
  });

  $('#dayStrip').addEventListener('click', e => {
    const b = e.target.closest('[data-date]');
    if (!b) return;
    ui.selectedDate = b.dataset.date;
    renderKid();
  });

  $('#taskList').addEventListener('click', e => {
    const undo = e.target.closest('[data-undo]');
    if (undo) {
      const card = undo.closest('[data-task]');
      if (card) onTaskTap(card.dataset.task, card, true);
      return;
    }
    const card = e.target.closest('[data-task]');
    if (!card) return;
    onTaskTap(card.dataset.task, card, false);
  });
  $('#taskList').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-task]');
    if (!card || e.target !== card) return;
    e.preventDefault();
    onTaskTap(card.dataset.task, card, false);
  });

  $('#installHintBtn').addEventListener('click', openInstallSheet);

  // 아이: 오늘 꼭 해야 할 일
  $('#mustDoForm').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#mustDoInput');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) { toast('할 일을 적어 주세요', 1300); inp.focus(); return; }
    if (mustDosFor(todayStr()).length >= 30) { toast('오늘은 30개까지만 적을 수 있어요', 1600); return; }
    if (addMustDo(todayStr(), text)) {
      inp.value = '';
      renderMustDo();
      toast('오늘 꼭 할 일에 담았어요', 1300);
    }
  });

  $('#mustDoList').addEventListener('click', e => {
    const del = e.target.closest('[data-must-del]');
    if (del) { deleteMustDo(todayStr(), del.dataset.mustDel); renderKid(); return; }
    const tog = e.target.closest('[data-must-toggle]');
    if (!tog) return;
    const id = tog.dataset.mustToggle;
    const before = mustDosFor(todayStr()).find(x => x.id === id);
    const wasDone = !!(before && before.done);
    let rect = null;
    try { rect = tog.getBoundingClientRect(); } catch (err) { rect = null; }
    toggleMustDo(todayStr(), id);
    renderKid();
    const after = mustDosFor(todayStr()).find(x => x.id === id);
    if (after && after.done) {
      if (rect) {
        gainFx(rect.left + rect.width / 2, rect.top + rect.height / 2, mustDoAmount(after));
        sparkle(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      playChime();
      toast('오늘 꼭 할 일 완료! +' + wonU(mustDoAmount(after)), 1400);
    } else if (wasDone) {
      toast('체크를 취소했어요', 1200);
    }
  });

  // 부모님: 할 일
  $('#tabTasks').addEventListener('click', e => {
    const add = e.target.closest('#addTaskBtn');
    if (add) { openTaskSheet(null); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const row = act.closest('.prow');
    if (!row) return;
    const id = row.dataset.id;
    const what = act.dataset.act;
    if (what === 'edit') openTaskSheet(id);
    else if (what === 'del') confirmDeleteTask(id);
  });
  $('#tabTasks').addEventListener('change', e => {
    const t = e.target.closest('[data-act="toggle"]');
    if (!t) return;
    const row = t.closest('.prow');
    const task = state.tasks.find(x => x.id === row.dataset.id);
    if (!task) return;
    task.active = t.checked;
    touch('tasks');
    renderAll();
    toast(task.active ? '아이 화면에 다시 보여요' : '아이 화면에서 잠시 숨겼어요', 1500);
  });

  // 부모님: 기록
  $('#tabLog').addEventListener('click', e => {
    if (e.target.closest('#weekPrev')) { ui.weekStart = ymd(addDays(parseYmd(ui.weekStart), -7)); renderLogTab(); return; }
    if (e.target.closest('#weekNext')) { ui.weekStart = ymd(addDays(parseYmd(ui.weekStart), 7)); renderLogTab(); return; }
    if (e.target.closest('#weekThis')) { ui.weekStart = currentWeekStart(); renderLogTab(); return; }
    const cell = e.target.closest('[data-date][data-task]');
    if (cell) {
      const t = state.tasks.find(x => x.id === cell.dataset.task);
      if (t && t.repeat) openCountSheet(cell.dataset.date, cell.dataset.task);
      else toggleCell(cell.dataset.date, cell.dataset.task);
    }
  });

  // 부모님: 정산
  $('#tabSettle').addEventListener('click', e => {
    if (e.target.closest('#settleBtn')) { openSettleSheet(); return; }
    const del = e.target.closest('[data-del-settle]');
    if (del) deleteSettlement(del.dataset.delSettle);
  });

  // 부모님: 설정
  $('#tabSettings').addEventListener('click', e => {
    const b = e.target.closest('[data-settings-action]');
    if (!b) return;
    const a = b.dataset.settingsAction;
    if (a === 'pin') openPinChangeSheet();
    else if (a === 'gencode') {
      const el = $('#syncCode');
      if (el) { el.value = randomCode(); toast('가족 코드를 만들었어요'); }
    } else if (a === 'connect') connectSync(b);
    else if (a === 'syncnow') syncNow().then(r => {
      if (r.ok) { toast('동기화했어요'); renderTab(); }
      else toast(r.message || '동기화하지 못했어요');
    });
    else if (a === 'syncoff') {
      state.sync.enabled = false;
      saveState(false);
      renderTab();
      toast('동기화를 껐어요. 이 폰 기록은 그대로 있어요');
    } else if (a === 'export') exportData();
    else if (a === 'import') importData();
    else if (a === 'reset') confirmReset();
    else if (a === 'install') openInstallSheet();
  });
  $('#tabSettings').addEventListener('change', e => {
    if (e.target.id === 'soundToggle') {
      state.settings.name = state.settings.name;
      state.settings.sound = e.target.checked;
      touch('settings');
      updateSoundBtn();
    } else if (e.target.id === 'childName') {
      const v = e.target.value.trim().slice(0, 12) || '우리 딸';
      state.settings.name = v;
      touch('settings');
      renderAll();
      toast('이름을 저장했어요');
    }
  });

  // 키보드 (데스크톱 테스트/PIN)
  document.addEventListener('keydown', e => {
    if (!$('#pinGate').classList.contains('hidden')) {
      if (/^\d$/.test(e.key)) { pinKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pinKey('del'); e.preventDefault(); }
      else if (e.key === 'Escape') { closePinGate(); }
      return;
    }
    if (e.key === 'Escape' && sheetIsOpen()) closeSheet();
  });

  document.addEventListener('pointerdown', () => { ensureAudio(); }, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      ui.hiddenAt = Date.now();
      return;
    }
    if (ui.mode === 'parent' && ui.hiddenAt && Date.now() - ui.hiddenAt > 5 * 60 * 1000) {
      lockParent();
      toast('부모님 모드를 잠갔어요', 1600);
    }
    if (state.sync.enabled) syncNow();
  });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

function openCountSheet(ds, taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  const entry = getEntry(ds, taskId);
  let n = getCount(ds, taskId);
  const amount = Number(entry && entry.amount) || Number(t && t.amount) || 0;
  const title = (t && t.title) || (entry && entry.title) || '할 일';
  const body =
    '<p class="sheet-note">' + fmtMD(ds) + ' (' + DAY_NAMES[mondayIndex(parseYmd(ds))] + ') · ' + esc(title) + '</p>' +
    '<div class="counter">' +
    '<button type="button" class="cnt-btn" data-step="-1" aria-label="하나 줄이기">−</button>' +
    '<div class="cnt-val"><b id="cntVal">' + n + '</b><span>회</span></div>' +
    '<button type="button" class="cnt-btn plus" data-step="1" aria-label="체크 추가">+</button>' +
    '</div>' +
    '<p class="sheet-note" id="cntSum">' + n + '회 × ' + wonU(amount) + ' = <b>' + wonU(n * amount) + '</b></p>' +
    '<p class="hint">수시로 하는 할 일이에요. 누를 때마다 1회씩 쌓이고, 횟수만큼 용돈이 붙어요.</p>';
  openSheet({
    title: '체크 횟수 바꾸기',
    body: body,
    footer: '<button class="btn primary" type="button" data-close>닫기</button>',
    onMount: function (api) {
      const val = api.root.querySelector('#cntVal');
      const sum = api.root.querySelector('#cntSum');
      api.root.querySelector('.counter').addEventListener('click', e => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        n = clamp(n + Number(b.dataset.step), 0, 50);
        setCheckCount(ds, taskId, n, t);
        val.textContent = n;
        sum.innerHTML = n + '회 × ' + wonU(amount) + ' = <b>' + wonU(n * amount) + '</b>';
        if (ui.tab === 'log') renderLogTab();
      });
    },
    onClose: function () { renderAll(); }
  });
}

function toggleCell(ds, taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  const on = !isDone(ds, taskId);
  setCheck(ds, taskId, on, t);
  const ws = ymd(mondayOf(parseYmd(ds)));
  const settled = state.settlements.some(s => s.weekStart === ws && !s.del);
  renderLogTab();
  if (on) toast(settled ? '체크했어요 · 정산 후 금액이 바뀌었어요' : '체크했어요');
  else toast('체크를 해제했어요');
}

async function connectSync(btn) {
  const urlEl = $('#syncUrl');
  const codeEl = $('#syncCode');
  if (!urlEl || !codeEl) return;
  const url = normalizeUrl(urlEl.value);
  const code = codeEl.value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  if (!/^https?:\/\/[^\s/]+/i.test(url)) { toast('Firebase URL을 확인해 주세요'); return; }
  if (code.length < 6) { toast('가족 코드는 6자 이상으로 만들어 주세요'); return; }
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '연결 중…';
  state.sync.url = url;
  state.sync.code = code;
  saveState(false);
  const test = await testSync(url, code);
  if (!test.ok) {
    state.sync.enabled = false;
    saveState(false);
    btn.disabled = false;
    btn.textContent = old;
    toast(test.message);
    renderTab();
    return;
  }
  state.sync.enabled = true;
  saveState(false);
  const r = await syncNow();
  btn.disabled = false;
  btn.textContent = old;
  renderTab();
  if (r.ok) toast(r.changed ? '동기화 완료! 기록을 합쳤어요' : '동기화 연결 완료');
  else toast(r.message || '동기화하지 못했어요');
}

/* ---------- 14. 시작 ---------- */
function boot() {
  buildKeypad();
  updateSoundBtn();
  bindEvents();
  ui.selectedDate = todayStr();
  ui.weekStart = currentWeekStart();
  ui.todayCache = todayStr();
  const hooked = connectFromSyncHash();
  if (!hooked) renderAll();

  setInterval(() => {
    if (document.hidden) return;
    const t = todayStr();
    if (t !== ui.todayCache) {
      ui.todayCache = t;
      if (ui.mode === 'kid') ui.selectedDate = t;
      ui.weekStart = currentWeekStart();
      renderAll();
    }
  }, 30000);

  setInterval(() => {
    if (state.sync.enabled && !document.hidden) syncNow();
  }, 15000);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.addEventListener('online', () => { if (state.sync.enabled) syncNow(); });
  window.addEventListener('hashchange', () => { connectFromSyncHash(); });
}

boot();
