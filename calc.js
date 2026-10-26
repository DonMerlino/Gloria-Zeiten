// Rechenlogik: Arbeitsminuten, Stundenkonto und Auszahlung je Zahlung am 15.
// Läuft im Browser (window.Calc) und in Node (module.exports) für Tests.
(function (root) {
  const DEFAULT_RATES = [
    { from: '2025-01-01', wage: 12.82, limit: 556 },
    { from: '2026-01-01', wage: 13.90, limit: 603 },
    { from: '2027-01-01', wage: 14.60, limit: 633 },
  ];

  function toMin(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  // Dauer eines Eintrags in Minuten: Ende - Beginn (+24 h über Mitternacht) + Korrektur.
  function entryMinutes(e) {
    const s = toMin(e.start), en = toMin(e.end);
    let base = 0;
    if (s != null && en != null) {
      base = en - s;
      if (base < 0) base += 24 * 60;
    }
    return Math.max(0, base + (e.correctionMin || 0));
  }

  function rateFor(rates, ym) {
    const list = [...rates].sort((a, b) => a.from.localeCompare(b.from));
    let r = list[0];
    for (const x of list) if (x.from.slice(0, 7) <= ym) r = x;
    return r;
  }

  function addMonth(ym, n) {
    let [y, m] = ym.split('-').map(Number);
    m += n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  // Zahlung am 15. eines Monats für die Arbeitstage vom 16. des Vormonats bis zum 15.
  // Schlüssel einer Periode ist der Zahlungsmonat (YYYY-MM).
  function periodOf(date) {
    const ym = date.slice(0, 7);
    return +date.slice(8, 10) <= 15 ? ym : addMonth(ym, 1);
  }
  function periodRange(key) {
    return { from: addMonth(key, -1) + '-16', to: key + '-15', payDate: key + '-15' };
  }

  // Berechnet alle Zahlungen ab der Periode des Startdatums bis endKey.
  // Regel: Übertrag (älteste Stunden zuerst) + Stunden der Periode werden bis zur
  // Minijob-Grenze bezahlt; was nicht mehr passt, geht in die nächste Zahlung.
  // paid/carried listen pro Arbeitstag auf, welche Minuten bezahlt bzw. übertragen werden.
  function computePeriods(entries, settings, endKey) {
    const rates = settings.rates && settings.rates.length ? settings.rates : DEFAULT_RATES;
    const startDate = settings.startDate || '2026-01-01';
    const byPeriod = {};
    for (const e of entries) {
      if (!e.date || e.date < startDate) continue;
      (byPeriod[periodOf(e.date)] = byPeriod[periodOf(e.date)] || []).push(e);
    }
    const lastKey = Object.keys(byPeriod).sort().pop();
    let end = endKey;
    if (lastKey && lastKey > end) end = lastKey;

    let carry = settings.startBalanceMin > 0
      ? [{ entryId: null, date: startDate, min: settings.startBalanceMin, total: settings.startBalanceMin, startBalance: true }]
      : [];
    const result = [];
    for (let key = periodOf(startDate); key <= end; key = addMonth(key, 1)) {
      const r = rateFor(rates, key);
      const capMin = r.limit / r.wage * 60;
      const own = (byPeriod[key] || []).slice()
        .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
        .map(e => ({ entryId: e.id, date: e.date, start: e.start, end: e.end, min: entryMinutes(e), total: entryMinutes(e) }));
      const carryIn = carry.reduce((s, c) => s + c.min, 0);
      const worked = own.reduce((s, c) => s + c.min, 0);
      const paid = [], carried = [];
      let left = capMin;
      for (const c of [...carry.map(c => ({ ...c, fromCarry: true })), ...own]) {
        const take = Math.min(c.min, left);
        left -= take;
        const rest = c.min - take;
        if (take > 1e-6 || c.min === 0) paid.push({ ...c, min: take, split: rest > 1e-6 });
        if (rest > 1e-6) carried.push({ ...c, min: rest, split: take > 1e-6, fromCarry: false, fromKey: c.fromKey || key });
      }
      const paidMin = capMin - left;
      const carryOut = carried.reduce((s, c) => s + c.min, 0);
      result.push({
        key, ...periodRange(key), worked, carryIn, available: carryIn + worked, paidMin, carryOut,
        pay: Math.round(paidMin / 60 * r.wage * 100) / 100,
        earned: Math.round(worked / 60 * r.wage * 100) / 100,
        wage: r.wage, limit: r.limit, capMin, freeMin: Math.max(0, left), paid, carried,
      });
      carry = carried;
    }
    return result;
  }

  const api = { DEFAULT_RATES, toMin, entryMinutes, rateFor, addMonth, periodOf, periodRange, computePeriods };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
