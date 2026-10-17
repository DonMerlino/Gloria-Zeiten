// Rechenlogik: Arbeitsminuten, Stundenkonto und Auszahlung pro Monat.
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

  // Berechnet alle Monate von startMonth bis endMonth.
  // Regel: verfügbar = Guthaben + Monatsstunden; bezahlt wird höchstens die Minijob-Grenze,
  // der Rest wird als Guthaben in den Folgemonat übertragen.
  function computeMonths(entries, settings, endMonth) {
    const rates = settings.rates && settings.rates.length ? settings.rates : DEFAULT_RATES;
    const startMonth = (settings.startDate || '2026-01-01').slice(0, 7);
    const byMonth = {};
    for (const e of entries) {
      const ym = e.date.slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + entryMinutes(e);
    }
    const lastEntry = Object.keys(byMonth).sort().pop();
    let end = endMonth;
    if (lastEntry && lastEntry > end) end = lastEntry;

    const result = [];
    let balance = (settings.startBalanceMin || 0);
    for (let ym = startMonth; ym <= end; ym = addMonth(ym, 1)) {
      const r = rateFor(rates, ym);
      const worked = byMonth[ym] || 0;
      const available = balance + worked;
      const capMin = r.limit / r.wage * 60;
      const paidMin = Math.min(available, capMin);
      const pay = Math.round(paidMin / 60 * r.wage * 100) / 100;
      const carryIn = balance;
      balance = available - paidMin;
      if (balance < 1e-6) balance = 0;
      result.push({
        ym, worked, carryIn, available, paidMin, pay,
        carryOut: balance, wage: r.wage, limit: r.limit, capMin,
        earned: Math.round(worked / 60 * r.wage * 100) / 100,
        freeMin: Math.max(0, capMin - available),
      });
    }
    return result;
  }

  const api = { DEFAULT_RATES, toMin, entryMinutes, rateFor, addMonth, computeMonths };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
