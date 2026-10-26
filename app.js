'use strict';
/* Minijob Zeiten – Web-App (PWA). Daten liegen nur im Browser-Speicher (IndexedDB) des Geräts. */

const $ = (s, el = document) => el.querySelector(s);
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MODELS = {
  'claude-opus-5-5': 'Opus 5.5 – genauer (ca. 1–2 Cent/Foto)',
  'claude-haiku-5-5': 'Haiku 5.5 – günstiger (< 0,1 Cent/Foto)',
};

// ---------- Speicher (IndexedDB) ----------
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('minijob-zeiten', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries', { keyPath: 'id' });
      r.result.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
const dbAll = () => idb('entries', 'readonly', s => s.getAll());
const dbPut = e => idb('entries', 'readwrite', s => s.put(e));
const dbDel = id => idb('entries', 'readwrite', s => s.delete(id));
const dbClear = () => idb('entries', 'readwrite', s => s.clear());
const kvGet = k => idb('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => idb('kv', 'readwrite', s => s.put(v, k));

// ---------- Zustand ----------
const DEFAULT_SETTINGS = {
  apiKey: '', model: 'claude-opus-5-5', region: null,
  startDate: '2026-01-01', startBalanceMin: 0,
  rates: Calc.DEFAULT_RATES.map(r => ({ ...r })),
};
const state = { entries: [], settings: { ...DEFAULT_SETTINGS }, tab: 'month', month: Calc.periodOf(todayStr()), year: +todayStr().slice(0, 4) };

async function load() {
  state.entries = await dbAll();
  const s = await kvGet('settings');
  if (s) state.settings = { ...DEFAULT_SETTINGS, ...s };
}
const saveSettings = () => kvSet('settings', state.settings);

// ---------- Hilfsfunktionen ----------
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }
function dateFromStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDur(min) {
  const neg = min < 0; min = Math.round(Math.abs(min));
  return `${neg ? '−' : ''}${Math.floor(min / 60)}:${pad(min % 60)}`;
}
const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtEur = v => eurFmt.format(v);
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDay = s => dayFmt.format(dateFromStr(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// "1", "1:30", "1,5", "-0:45" -> Minuten
function parseDur(str) {
  str = String(str || '').trim().replace('−', '-');
  if (!str) return 0;
  const neg = str.startsWith('-'); str = str.replace(/^[+-]/, '');
  let min;
  if (str.includes(':')) { const [h, m] = str.split(':'); min = (+h || 0) * 60 + (+m || 0); }
  else min = Math.round(parseFloat(str.replace(',', '.')) * 60) || 0;
  return neg ? -min : min;
}
function normTime(t) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t || '').trim());
  if (!m || +m[1] > 24 || +m[2] > 59) return '';
  return `${pad(+m[1] % 24)}:${m[2]}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function overlay(on, text) { $('#overlay').classList.toggle('open', on); if (text) $('#overlayText').textContent = text; }

function periods() {
  const end = [state.month, `${state.year}-12`, Calc.periodOf(todayStr())].sort().pop();
  return Calc.computePeriods(state.entries, state.settings, end);
}
const shortDay = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
const payLabel = key => `15. ${MONTHS[+key.slice(5) - 1]} ${key.slice(0, 4)}`;

// ---------- Ansichten ----------
function render() {
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('#fab').classList.toggle('hidden', state.tab === 'settings');
  const v = $('#view');
  if (state.tab === 'month') v.innerHTML = viewMonth();
  else if (state.tab === 'year') v.innerHTML = viewYear();
  else v.innerHTML = viewSettings();
}

// Eine Zeile in der Zahlungsansicht: ein Arbeitstag (ganz oder anteilig) oder das Startguthaben.
function chunkHtml(c, carried) {
  if (c.startBalance) return `<div class="item"><div class="ph">Start</div>
    <div class="main"><div>Startguthaben${c.split ? '<span class="badge">teilweise</span>' : ''}</div><div class="muted">Stand ${fmtDay(c.date)}</div></div>
    <div class="dur">${fmtDur(c.min)}</div></div>`;
  const e = state.entries.find(x => x.id === c.entryId);
  if (!e) return '';
  const corrected = e.correctionMin || (e.origStart && (e.origStart !== e.start || e.origEnd !== e.end));
  const badges = (c.fromCarry ? '<span class="badge info">Übertrag</span>' : '')
    + (c.split ? `<span class="badge">${carried ? 'Rest' : 'teilweise'}</span>` : '')
    + (corrected ? '<span class="badge">korrigiert</span>' : '');
  return `<div class="item" data-edit="${e.id}">
    ${e.photo ? `<img src="${e.photo}" alt="">` : `<div class="ph">ohne<br>Foto</div>`}
    <div class="main"><div>${fmtDay(e.date)}${badges}</div>
      <div class="muted">${e.start || '–'}–${e.end || '–'}${e.correctionMin ? ` · Korr. ${e.correctionMin > 0 ? '+' : ''}${fmtDur(e.correctionMin)}` : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
    <div class="dur">${fmtDur(c.min)}${c.split ? `<div class="muted" style="font-weight:400">von ${fmtDur(c.total)}</div>` : ''}</div></div>`;
}

function viewMonth() {
  const key = state.month;
  const p = periods().find(x => x.key === key);
  const r = Calc.periodRange(key);
  const nav = `<div class="monthnav"><button data-month="-1" aria-label="Vorherige Zahlung">‹</button>
    <div style="text-align:center"><div class="title">${payLabel(key)}</div><div class="muted">Zahlung für ${shortDay(r.from)}–${shortDay(r.to)}${r.to.slice(0, 4)}</div></div>
    <button data-month="1" aria-label="Nächste Zahlung">›</button></div>`;
  const manualBtn = '<button class="btn small secondary" data-action="manual">+ ohne Foto</button>';
  if (!p) {
    const list = state.entries.filter(e => Calc.periodOf(e.date) === key);
    return `${nav}<div class="card"><div class="muted">Dieser Zeitraum liegt vor dem Startdatum in den Einstellungen (${fmtDay(state.settings.startDate)}) und wird nicht berechnet.</div></div>
      <div class="row"><h2>Einträge (${list.length})</h2>${manualBtn}</div>
      <div class="list">${list.map(e => chunkHtml({ entryId: e.id, min: Calc.entryMinutes(e) })).join('') || '<div class="empty">Keine Einträge.</div>'}</div>`;
  }
  const pct = Math.min(100, p.available / p.capMin * 100);
  const nextKey = Calc.addMonth(key, 1);
  const status = p.payDate <= todayStr() ? 'Ausgezahlt' : 'Voraussichtlich';
  return `${nav}
  <div class="card">
    <div class="kpi-label">${status} am ${shortDay(p.payDate)}${p.payDate.slice(0, 4)}${p.payDate > todayStr() && todayStr() >= p.from ? ' · Zeitraum läuft noch' : ''}</div>
    <div class="big">${fmtEur(p.pay)}</div>
    <div class="progress ${p.available > p.capMin ? 'over' : ''}"><div style="width:${pct}%"></div></div>
    <div class="row muted"><span>${fmtDur(p.paidMin)} von ${fmtDur(p.capMin)} Std. bezahlt</span><span>Grenze ${fmtEur(p.limit)}</span></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="kpi-label">Gearbeitet im Zeitraum</div><div class="kpi">${fmtDur(p.worked)}</div><div class="muted">${fmtEur(p.earned)} verdient</div></div>
    <div class="card"><div class="kpi-label">Noch frei bis Grenze</div><div class="kpi">${fmtDur(p.freeMin)}</div><div class="muted">Std. à ${fmtEur(p.wage)}</div></div>
    <div class="card"><div class="kpi-label">Übertrag aus letzter Zahlung</div><div class="kpi">${fmtDur(p.carryIn)}</div></div>
    <div class="card"><div class="kpi-label">Geht in Zahlung ${shortDay(nextKey + '-15')}</div><div class="kpi" style="color:${p.carryOut > 0 ? 'var(--warn)' : 'inherit'}">${fmtDur(p.carryOut)}</div></div>
  </div>
  <div class="row"><h2>Bezahlt am 15.</h2>${manualBtn}</div>
  <div class="list">${p.paid.map(c => chunkHtml(c, false)).join('') || '<div class="empty">Noch keine Stunden in diesem Zeitraum.<br>Tippe auf die Kamera, um ein Foto aufzunehmen.</div>'}</div>
  ${p.carried.length ? `<h2>Fällt in die Zahlung am ${fmtDay(nextKey + '-15')}</h2>
  <div class="list">${p.carried.map(c => chunkHtml(c, true)).join('')}</div>` : ''}`;
}

function viewYear() {
  const y = String(state.year);
  const ms = periods().filter(m => m.key.startsWith(y));
  const today = todayStr();
  const done = ms.filter(m => m.payDate <= today);
  const sum = k => ms.reduce((s, m) => s + m[k], 0);
  const paidSoFar = done.reduce((s, m) => s + m.pay, 0);
  const activeMonths = done.filter(m => m.worked > 0 || m.pay > 0).length;
  const projection = activeMonths ? paidSoFar / activeMonths * 12 : 0;
  const yearLimit = ms.reduce((s, m) => s + m.limit, 0);

  const rows = ms.map(m => `<tr class="clickable${m.payDate > today ? ' future' : ''}" data-goto="${m.key}">
    <td>15. ${MONTHS_SHORT[+m.key.slice(5) - 1]}</td><td>${fmtDur(m.worked)}</td><td>${fmtDur(m.paidMin)}</td>
    <td>${fmtEur(m.pay)}</td><td style="color:${m.carryOut > 0 ? 'var(--warn)' : 'inherit'}">${fmtDur(m.carryOut)}</td></tr>`).join('');

  return `
  <div class="monthnav"><button data-year="-1" aria-label="Vorjahr">‹</button><div class="title">${y}</div><button data-year="1" aria-label="Folgejahr">›</button></div>
  ${ms.length ? `
  <div class="card"><div class="kpi-label">Ausgezahlt ${y} bis heute</div><div class="big">${fmtEur(paidSoFar)}</div>
    <div class="muted">Hochrechnung aufs Jahr: <b class="num">${fmtEur(projection)}</b> · Jahresgrenze ${fmtEur(yearLimit)}</div></div>
  <div class="grid2">
    <div class="card"><div class="kpi-label">Gearbeitet ${y}</div><div class="kpi">${fmtDur(sum('worked'))}</div></div>
    <div class="card"><div class="kpi-label">Stundenkonto aktuell</div><div class="kpi">${fmtDur((done[done.length - 1] || ms[ms.length - 1]).carryOut)}</div></div>
  </div>
  <h2>Stunden pro Zahlung</h2>
  <div class="card chart">${chartHours(ms)}
    <div class="legend"><span><i style="background:var(--accent)"></i>gearbeitet</span><span><i style="background:var(--bar2)"></i>bezahlt</span><span><i style="background:var(--warn);height:2px"></i>Grenze</span></div></div>
  <h2>Auszahlung am 15.</h2>
  <div class="card chart">${chartPay(ms)}</div>
  <h2>Verlauf Stundenkonto</h2>
  <div class="card chart">${chartBalance(ms)}</div>
  <h2>Tabelle</h2>
  <div class="card tablewrap"><table>
    <tr><th>Zahlung</th><th>Gearb.</th><th>Bezahlt</th><th>Auszahlung</th><th>Konto</th></tr>
    ${rows}
    <tr class="sum"><td>Summe${ms.some(m => m.payDate > today) ? '*' : ''}</td><td>${fmtDur(sum('worked'))}</td><td>${fmtDur(sum('paidMin'))}</td><td>${fmtEur(sum('pay'))}</td><td></td></tr>
  </table>${ms.some(m => m.payDate > today) ? '<div class="muted" style="margin-top:8px">* Graue Zeilen sind noch nicht ausgezahlt: laufender Zeitraum und Prognose, wie das vorhandene Guthaben in den kommenden Zahlungen ausbezahlt würde.</div>' : ''}</div>` : `<div class="card empty">Für ${y} gibt es noch keine Daten (Startdatum: ${fmtDay(state.settings.startDate)}).</div>`}`;
}

// ---------- Diagramme (SVG) ----------
const CW = 340, CH = 170, PL = 34, PB = 22, PT = 10;
function axis(maxV, fmt) {
  const ih = CH - PB - PT; let out = '';
  for (let i = 0; i <= 2; i++) {
    const v = maxV * i / 2, y = PT + ih - ih * i / 2;
    out += `<line x1="${PL}" x2="${CW}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>
      <text x="${PL - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(v)}</text>`;
  }
  return out;
}
function xLabels(ms, step) {
  return ms.map((m, i) => `<text x="${PL + step * i + step / 2}" y="${CH - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${MONTHS_SHORT[+m.key.slice(5) - 1].slice(0, 1)}</text>`).join('');
}
function chartHours(ms) {
  const max = Math.max(60, ...ms.map(m => Math.max(m.worked, m.capMin))) / 60;
  const top = Math.ceil(max / 10) * 10, ih = CH - PB - PT, step = (CW - PL) / ms.length, bw = step * 0.34;
  const y = h => PT + ih - ih * h / top;
  let bars = '';
  ms.forEach((m, i) => {
    const x = PL + step * i + step * 0.14;
    const hw = m.worked / 60, hp = m.paidMin / 60;
    bars += `<rect x="${x}" y="${y(hw)}" width="${bw}" height="${ih * hw / top}" rx="2" fill="var(--accent)"><title>${MONTHS[+m.key.slice(5) - 1]}: ${fmtDur(m.worked)} gearbeitet</title></rect>
      <rect x="${x + bw + 1}" y="${y(hp)}" width="${bw}" height="${ih * hp / top}" rx="2" fill="var(--bar2)"><title>${fmtDur(m.paidMin)} bezahlt</title></rect>`;
  });
  const capPath = ms.map((m, i) => `${i ? 'L' : 'M'}${PL + step * i},${y(m.capMin / 60)}H${PL + step * (i + 1)}`).join('');
  return `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Stunden pro Monat">${axis(top, v => v + ' h')}${bars}
    <path d="${capPath}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="4 3" fill="none"/>${xLabels(ms, step)}</svg>`;
}
function chartPay(ms) {
  const top = Math.ceil(Math.max(100, ...ms.map(m => m.limit)) / 100) * 100, ih = CH - PB - PT, step = (CW - PL) / ms.length, bw = step * 0.6;
  const bars = ms.map((m, i) => `<rect x="${PL + step * i + step * 0.2}" y="${PT + ih - ih * m.pay / top}" width="${bw}" height="${ih * m.pay / top}" rx="3" fill="var(--accent)"><title>${MONTHS[+m.key.slice(5) - 1]}: ${fmtEur(m.pay)}</title></rect>`).join('');
  return `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Auszahlung pro Monat">${axis(top, v => Math.round(v) + ' €')}${bars}${xLabels(ms, step)}</svg>`;
}
function chartBalance(ms) {
  const top = Math.max(5, Math.ceil(Math.max(...ms.map(m => m.carryOut)) / 60 / 5) * 5), ih = CH - PB - PT, step = (CW - PL) / ms.length;
  const pts = ms.map((m, i) => [PL + step * i + step / 2, PT + ih - ih * (m.carryOut / 60) / top]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  const area = `${line}L${pts[pts.length - 1][0]},${PT + ih}L${pts[0][0]},${PT + ih}Z`;
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--warn)"><title>Ende ${MONTHS[+ms[i].key.slice(5) - 1]}: ${fmtDur(ms[i].carryOut)} Std.</title></circle>`).join('');
  return `<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Verlauf Stundenkonto">${axis(top, v => v + ' h')}
    <path d="${area}" fill="var(--warn)" opacity=".15"/><path d="${line}" stroke="var(--warn)" stroke-width="2" fill="none"/>${dots}${xLabels(ms, step)}</svg>`;
}

function viewSettings() {
  const s = state.settings;
  const rates = [...s.rates].sort((a, b) => a.from.localeCompare(b.from)).map((r, i) => `
    <div class="inline" style="margin-top:8px">
      <input type="date" data-rate="${i}" data-k="from" value="${r.from}" aria-label="gültig ab">
      <input type="text" inputmode="decimal" data-rate="${i}" data-k="wage" value="${String(r.wage).replace('.', ',')}" aria-label="Stundenlohn">
      <input type="text" inputmode="decimal" data-rate="${i}" data-k="limit" value="${String(r.limit).replace('.', ',')}" aria-label="Monatsgrenze">
    </div>`).join('');
  return `
  <h1>Einstellungen</h1>
  <h2>Foto-Erkennung (KI)</h2>
  <div class="card">
    <label class="field"><span>Claude API-Schlüssel (bleibt nur auf diesem Gerät)</span>
      <input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <label class="field"><span>Modell</span>
      <select id="model">${Object.entries(MODELS).map(([k, v]) => `<option value="${k}" ${k === s.model ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <div class="hint ${s.region ? 'ok' : ''}">${s.region ? 'Die Stelle mit deinen Zeiten auf der Checkliste ist festgelegt.' : 'Tipp: Lege einmal fest, wo auf der Checkliste deine Zeiten stehen. Das macht die Erkennung zuverlässiger.'}</div>
    <button class="btn secondary" data-action="region">${s.region ? 'Stelle neu festlegen' : 'Stelle auf der Checkliste festlegen'}</button>
    ${s.region ? '<button class="btn danger" data-action="region-clear">Festgelegte Stelle entfernen</button>' : ''}
  </div>
  <h2>Startwerte</h2>
  <div class="card">
    <label class="field"><span>Rechnen ab Datum (am besten ein 16., dem Beginn eines Zahlungszeitraums)</span><input type="date" id="startDate" value="${s.startDate}"></label>
    <label class="field"><span>Stundenguthaben zu diesem Datum (Std:Min)</span>
      <input type="text" inputmode="numbers-and-punctuation" id="startBalance" value="${fmtDur(s.startBalanceMin)}" placeholder="0:00"></label>
  </div>
  <h2>Mindestlohn &amp; Minijob-Grenze</h2>
  <div class="card">
    <div class="inline muted"><span>gültig ab</span><span>€ / Std.</span><span>Grenze € / Monat</span></div>
    ${rates}
    <button class="btn secondary" data-action="rate-add">+ Zeile hinzufügen</button>
  </div>
  <button class="btn primary" data-action="save-settings">Einstellungen speichern</button>
  <h2>Daten</h2>
  <div class="card">
    <div class="muted">${state.entries.length} Einträge auf diesem Gerät gespeichert. Sichere regelmäßig, z. B. in iCloud Drive.</div>
    <button class="btn secondary" data-action="export">Sicherung exportieren</button>
    <button class="btn secondary" data-action="import">Sicherung wiederherstellen</button>
  </div>
  <div class="muted" style="margin:16px 4px 40px">Installation: In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen. Nutze die App danach immer über das Symbol auf dem Home-Bildschirm.</div>`;
}

// ---------- Bearbeiten-Dialog ----------
let editQueue = [];
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheet').classList.add('open'); $('#sheetBg').classList.add('open'); $('#sheet').scrollTop = 0; }
function closeSheet() { $('#sheet').classList.remove('open'); $('#sheetBg').classList.remove('open'); $('#sheet').innerHTML = ''; }

function openEditor(entry, opts = {}) {
  const isNew = !state.entries.some(e => e.id === entry.id);
  const c = entry.correctionMin || 0;
  const hasOrig = entry.origStart || entry.origEnd;
  openSheet(`
    <h3>${isNew ? 'Neuer Eintrag' : 'Eintrag bearbeiten'}${opts.of > 1 ? ` (${opts.idx} von ${opts.of})` : ''}</h3>
    ${entry.photo ? `<img class="photo" src="${entry.photo}" alt="Foto" data-action="zoom">` : ''}
    ${opts.hint ? `<div class="hint ${opts.hintOk ? 'ok' : ''}">${esc(opts.hint)}</div>` : ''}
    <label class="field"><span>Datum${opts.dateSource ? ` (${opts.dateSource})` : ''}</span><input type="date" id="fDate" value="${entry.date}"></label>
    <div class="inline">
      <label class="field"><span>Beginn</span><input type="time" id="fStart" value="${entry.start || ''}" class="${entry.uncertain ? 'uncertain' : ''}"></label>
      <label class="field"><span>Ende</span><input type="time" id="fEnd" value="${entry.end || ''}" class="${entry.uncertain ? 'uncertain' : ''}"></label>
    </div>
    ${hasOrig ? `<div class="orig">Vom Foto erkannt: ${entry.origStart || '–'}–${entry.origEnd || '–'}</div>` : ''}
    <label class="field"><span>Korrektur in Std:Min (z. B. -1:00 oder +0:30)</span>
      <input type="text" inputmode="numbers-and-punctuation" id="fCorr" value="${c ? (c > 0 ? '+' : '-') + fmtDur(Math.abs(c)) : ''}" placeholder="keine"></label>
    <label class="field"><span>Notiz / Begründung</span><input type="text" id="fNote" value="${esc(entry.note)}" placeholder="z. B. eine Stunde zu viel notiert"></label>
    <div class="card" style="background:var(--bg);margin:14px 0 0"><div class="row"><span>Zählt mit</span><b class="num" id="fSum"></b></div></div>
    <button class="btn primary" data-action="save-entry">Speichern</button>
    <button class="btn secondary" data-action="cancel-entry">${opts.of > 1 ? 'Diesen überspringen' : 'Abbrechen'}</button>
    ${isNew ? '' : '<button class="btn danger" data-action="delete-entry">Eintrag löschen</button>'}`);
  $('#sheet').dataset.entry = JSON.stringify({ ...entry, photo: undefined });
  $('#sheet')._photo = entry.photo;
  const upd = () => {
    const min = Calc.entryMinutes({ start: $('#fStart').value, end: $('#fEnd').value, correctionMin: parseDur($('#fCorr').value) });
    const r = Calc.rateFor(state.settings.rates, Calc.periodOf($('#fDate').value || todayStr()));
    $('#fSum').textContent = `${fmtDur(min)} Std. · ${fmtEur(min / 60 * r.wage)}`;
  };
  ['fStart', 'fEnd', 'fCorr', 'fDate'].forEach(id => $('#' + id).addEventListener('input', () => { $('#' + id).classList.remove('uncertain'); upd(); }));
  upd();
}

async function saveEntryFromSheet() {
  const base = JSON.parse($('#sheet').dataset.entry);
  const e = {
    ...base, photo: $('#sheet')._photo,
    date: $('#fDate').value, start: $('#fStart').value, end: $('#fEnd').value,
    correctionMin: parseDur($('#fCorr').value), note: $('#fNote').value.trim(), uncertain: false,
  };
  if (!e.date) return toast('Bitte ein Datum angeben.');
  if (!e.start || !e.end) return toast('Bitte Beginn und Ende angeben.');
  await dbPut(e);
  const i = state.entries.findIndex(x => x.id === e.id);
  if (i >= 0) state.entries[i] = e; else state.entries.push(e);
  state.month = Calc.periodOf(e.date);
  toast('Gespeichert');
  nextInQueue();
}
function nextInQueue() {
  closeSheet();
  if (editQueue.length) { const q = editQueue.shift(); openEditor(q.entry, q.opts); }
  render();
}

// ---------- Foto: EXIF-Datum, Bild verkleinern ----------
function exifDate(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < v.byteLength - 4) {
      const marker = v.getUint16(o), len = v.getUint16(o + 2);
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
        const readTags = ifd => {
          const tags = {}, n = u16(t + ifd);
          for (let i = 0; i < n; i++) {
            const e = t + ifd + 2 + i * 12, tag = u16(e);
            tags[tag] = { type: u16(e + 2), count: u32(e + 4), off: u32(e + 8) };
          }
          return tags;
        };
        const str = tg => { let s = ''; for (let i = 0; i < tg.count - 1; i++) s += String.fromCharCode(v.getUint8(t + tg.off + i)); return s; };
        const ifd0 = readTags(u32(t + 4));
        let d = null;
        if (ifd0[0x8769]) { const ex = readTags(ifd0[0x8769].off); if (ex[0x9003]) d = str(ex[0x9003]); }
        if (!d && ifd0[0x0132]) d = str(ifd0[0x0132]);
        const m = d && /^(\d{4}):(\d{2}):(\d{2})/.exec(d);
        return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch (_) { /* kein EXIF */ }
  return null;
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Bild konnte nicht geladen werden'));
    img.src = url;
  });
}
// Zeichnet einen Bildausschnitt (Anteile 0..1) verkleinert auf maxSide in ein JPEG.
function toJpeg(img, maxSide, quality, crop) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = crop || { x: 0, y: 0, w: 1, h: 1 };
  const sx = c.x * W, sy = c.y * H, sw = c.w * W, sh = c.h * H;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const cv = document.createElement('canvas');
  cv.width = Math.round(sw * scale); cv.height = Math.round(sh * scale);
  cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', quality);
}

// ---------- KI-Erkennung (Claude API, direkt aus dem Browser) ----------
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['eintraege', 'hinweis'],
  properties: {
    eintraege: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['beginn', 'ende', 'sicher'],
        properties: {
          beginn: { type: 'string', description: 'Beginn im Format HH:MM (24 Stunden)' },
          ende: { type: 'string', description: 'Ende im Format HH:MM (24 Stunden)' },
          sicher: { type: 'boolean', description: 'false, wenn die Handschrift schwer lesbar ist' },
        },
      },
    },
    hinweis: { type: 'string', description: 'Kurzer Hinweis auf Deutsch, falls etwas unklar ist, sonst leer' },
  },
};
const PROMPT = `Das Foto zeigt eine vorgedruckte Arbeitseinsatzcheckliste eines Minijobs. Darauf hat die Mitarbeiterin bzw. der Mitarbeiter handschriftlich die Arbeitszeit ergänzt, im Format „Beginn–Ende“, z. B. „8:00–12:30“.
Lies nur diese handschriftlich ergänzten Uhrzeiten (Beginn und Ende). Ignoriere den vorgedruckten Text, Checkboxen und Einträge anderer Personen.
Gib die Zeiten im 24-Stunden-Format HH:MM zurück. Nachmittagszeiten wie „1:30“ nach einem Beginn am Vormittag bedeuten 13:30.
Wenn mehrere Zeiträume für denselben Tag ergänzt wurden, gib jeden als eigenen Eintrag zurück. Findest du keine handschriftliche Zeit, gib eine leere Liste zurück und erkläre im Hinweis kurz, warum.
Setze „sicher“ auf false, wenn du eine Ziffer nicht eindeutig lesen kannst.`;

async function recognize(fullB64, cropB64) {
  const s = state.settings;
  const content = [];
  if (cropB64) {
    content.push({ type: 'text', text: 'Bild 1: Ausschnitt der Stelle, an der die Zeiten normalerweise stehen.' });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cropB64 } });
    content.push({ type: 'text', text: 'Bild 2: das ganze Foto zur Orientierung.' });
  }
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fullB64 } });
  content.push({ type: 'text', text: PROMPT });

  const send = async (withFallback) => {
    const headers = {
      'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    const body = {
      model: s.model, max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    };
    if (withFallback) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
    return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  };

  const useFallback = s.model !== 'claude-haiku-5-5';
  let r = await send(useFallback);
  if (r.status === 400 && useFallback) r = await send(false);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new Error('Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.');
    if (r.status === 429 || r.status === 529) throw new Error('Der KI-Dienst ist gerade ausgelastet. Bitte gleich nochmal versuchen.');
    throw new Error('KI-Fehler: ' + (data.error?.message || r.status));
  }
  if (data.stop_reason === 'refusal') throw new Error('Die KI hat das Foto nicht ausgewertet. Bitte Zeiten selbst eintragen.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = JSON.parse(text);
  return {
    entries: (parsed.eintraege || []).map(x => ({ start: normTime(x.beginn), end: normTime(x.ende), sure: !!x.sicher })),
    hint: parsed.hinweis || '',
  };
}

async function handlePhoto(file) {
  overlay(true, 'Foto wird vorbereitet …');
  try {
    const buf = await file.arrayBuffer();
    let date = exifDate(buf), dateSource = 'Aufnahmedatum des Fotos';
    if (!date) {
      const d = new Date(file.lastModified || Date.now());
      date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      dateSource = 'Datum der Datei, bitte prüfen';
    }
    const img = await loadImage(file);
    const thumb = toJpeg(img, 900, 0.6);
    const base = { id: uid(), date, start: '', end: '', correctionMin: 0, note: '', photo: thumb, createdAt: Date.now() };

    if (!state.settings.apiKey) {
      overlay(false);
      return openEditor(base, { dateSource, hint: 'Ohne API-Schlüssel werden die Zeiten nicht automatisch gelesen. Bitte Beginn und Ende eintragen.' });
    }
    overlay(true, 'Lese Zeiten vom Foto …');
    const full = toJpeg(img, 1568, 0.85).split(',')[1];
    let crop = null;
    const rg = state.settings.region;
    if (rg) {
      const m = 0.08;
      const c = { x: Math.max(0, rg.x - m), y: Math.max(0, rg.y - m) };
      c.w = Math.min(1 - c.x, rg.w + 2 * m); c.h = Math.min(1 - c.y, rg.h + 2 * m);
      crop = toJpeg(img, 1568, 0.9, c).split(',')[1];
    }
    let res;
    try { res = await recognize(full, crop); }
    catch (err) {
      overlay(false);
      const msg = err instanceof TypeError ? 'Keine Verbindung zum KI-Dienst. Bitte Zeiten selbst eintragen.' : err.message;
      return openEditor(base, { dateSource, hint: msg });
    }
    overlay(false);
    if (!res.entries.length) return openEditor(base, { dateSource, hint: res.hint || 'Auf dem Foto wurden keine Zeiten gefunden. Bitte selbst eintragen.' });
    const n = res.entries.length;
    const drafts = res.entries.map((x, i) => ({
      entry: { ...base, id: i ? uid() : base.id, start: x.start, end: x.end, origStart: x.start, origEnd: x.end, uncertain: !x.sure },
      opts: {
        dateSource, idx: i + 1, of: n,
        hint: !x.sure ? `Die Handschrift war schwer lesbar. Bitte die markierten Zeiten prüfen.${res.hint ? ' ' + res.hint : ''}` : (res.hint || 'Zeiten erkannt. Bitte kurz prüfen.'),
        hintOk: x.sure && !res.hint,
      },
    }));
    editQueue = drafts.slice(1);
    openEditor(drafts[0].entry, drafts[0].opts);
  } catch (err) {
    overlay(false);
    toast(err.message || 'Fehler beim Verarbeiten des Fotos');
  }
}

// ---------- Stelle auf der Checkliste festlegen ----------
function openRegionPicker(file) {
  loadImage(file).then(img => {
    const src = toJpeg(img, 1200, 0.7);
    openSheet(`<h3>Wo stehen deine Zeiten?</h3>
      <div class="muted">Ziehe mit dem Finger ein Rechteck um die Stelle, an der du Beginn und Ende einträgst.</div>
      <div class="regionwrap" id="rw"><img src="${src}" alt="Checkliste"><div class="regionbox hidden" id="rb"></div></div>
      <button class="btn primary" data-action="region-save">Stelle speichern</button>
      <button class="btn secondary" data-action="cancel-entry">Abbrechen</button>`);
    const rw = $('#rw'), rb = $('#rb');
    let start = null, rect = null;
    const pos = ev => { const b = rw.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (ev.clientY - b.top) / b.height)) }; };
    const draw = () => { rb.classList.remove('hidden'); Object.assign(rb.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' }); };
    if (state.settings.region) { rect = { ...state.settings.region }; draw(); }
    rw.addEventListener('pointerdown', ev => { start = pos(ev); rw.setPointerCapture(ev.pointerId); });
    rw.addEventListener('pointermove', ev => {
      if (!start) return; const p = pos(ev);
      rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; draw();
    });
    rw.addEventListener('pointerup', () => { start = null; });
    $('#sheet')._getRegion = () => rect;
  }).catch(err => toast(err.message));
}

// ---------- Sicherung ----------
async function exportBackup() {
  const { apiKey, ...settings } = state.settings;
  const data = JSON.stringify({ app: 'minijob-zeiten', version: 1, exportedAt: new Date().toISOString(), settings, entries: state.entries });
  const name = `minijob-zeiten-${todayStr()}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
}
async function importBackup(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'minijob-zeiten' || !Array.isArray(d.entries)) throw new Error();
    if (!confirm(`Sicherung vom ${new Date(d.exportedAt).toLocaleDateString('de-DE')} mit ${d.entries.length} Einträgen wiederherstellen? Die aktuellen Einträge auf diesem Gerät werden ersetzt.`)) return;
    await dbClear();
    for (const e of d.entries) await dbPut(e);
    state.entries = d.entries;
    state.settings = { ...DEFAULT_SETTINGS, ...d.settings, apiKey: state.settings.apiKey };
    await saveSettings();
    toast('Sicherung wiederhergestellt'); render();
  } catch (_) { toast('Diese Datei ist keine gültige Sicherung.'); }
}

// ---------- Ereignisse ----------
let photoMode = 'entry';
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-tab],[data-month],[data-year],[data-edit],[data-goto],[data-action]');
  if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.month) { state.month = Calc.addMonth(state.month, +t.dataset.month); render(); return; }
  if (t.dataset.year) { state.year += +t.dataset.year; render(); return; }
  if (t.dataset.goto) { state.month = t.dataset.goto; state.tab = 'month'; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.edit) { editQueue = []; openEditor(state.entries.find(e => e.id === t.dataset.edit)); return; }
  const s = state.settings;
  switch (t.dataset.action) {
    case 'manual': {
      const pr = Calc.periodRange(state.month), t = todayStr();
      const d = t >= pr.from && t <= pr.to ? t : pr.from;
      editQueue = []; openEditor({ id: uid(), date: d, start: '', end: '', correctionMin: 0, note: '', createdAt: Date.now() }); break;
    }
    case 'save-entry': await saveEntryFromSheet(); break;
    case 'cancel-entry': nextInQueue(); break;
    case 'delete-entry': {
      const e = JSON.parse($('#sheet').dataset.entry);
      if (!confirm('Diesen Eintrag wirklich löschen?')) return;
      await dbDel(e.id); state.entries = state.entries.filter(x => x.id !== e.id);
      toast('Eintrag gelöscht'); nextInQueue(); break;
    }
    case 'zoom': { const lb = $('#lightbox'); lb.querySelector('img').src = $('#sheet')._photo; lb.classList.add('open'); break; }
    case 'region': photoMode = 'region'; $('#photoInput').click(); break;
    case 'region-save': {
      const r = $('#sheet')._getRegion && $('#sheet')._getRegion();
      if (!r || r.w < 0.02 || r.h < 0.02) return toast('Bitte ein Rechteck aufziehen.');
      s.region = r; await saveSettings(); closeSheet(); toast('Stelle gespeichert'); render(); break;
    }
    case 'region-clear': s.region = null; await saveSettings(); render(); break;
    case 'rate-add': collectSettings(); s.rates.push({ from: `${new Date().getFullYear() + 1}-01-01`, wage: 0, limit: 0 }); render(); break;
    case 'save-settings': collectSettings(); await saveSettings(); toast('Einstellungen gespeichert'); render(); break;
    case 'export': exportBackup(); break;
    case 'import': $('#importInput').click(); break;
  }
});
function collectSettings() {
  const s = state.settings;
  s.apiKey = $('#apiKey').value.trim();
  s.model = $('#model').value;
  s.startDate = $('#startDate').value || s.startDate;
  s.startBalanceMin = parseDur($('#startBalance').value);
  const sorted = [...s.rates].sort((a, b) => a.from.localeCompare(b.from));
  document.querySelectorAll('[data-rate]').forEach(inp => {
    const r = sorted[+inp.dataset.rate], k = inp.dataset.k;
    r[k] = k === 'from' ? inp.value : (parseFloat(inp.value.replace(',', '.')) || 0);
  });
  s.rates = sorted.filter(r => r.from && r.wage > 0 && r.limit > 0);
  if (!s.rates.length) s.rates = Calc.DEFAULT_RATES.map(r => ({ ...r }));
}
$('#fab').addEventListener('click', () => { photoMode = 'entry'; $('#photoInput').click(); });
$('#photoInput').addEventListener('change', ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  if (photoMode === 'region') openRegionPicker(f); else handlePhoto(f);
});
$('#importInput').addEventListener('change', ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importBackup(f); });
$('#sheetBg').addEventListener('click', () => { editQueue = []; closeSheet(); });
$('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('open'));

// ---------- Start ----------
(async () => {
  try { await load(); } catch (e) { toast('Speicher nicht verfügbar: ' + e.message); }
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
