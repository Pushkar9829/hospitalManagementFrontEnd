/** Display helpers. Dates are stored in UTC and always shown in IST. */
export const IST = 'Asia/Kolkata';

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 10:42 (24-hour, IST). */
export function formatTime(value, locale = 'en-IN') {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: IST,
  }).format(d);
}

/** Thursday, 9 October 2026 (IST). */
export function formatLongDate(value, locale = 'en-IN') {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: IST,
  }).format(d);
}

/** 9 Oct 2026, 10:42 (IST). */
export function formatDateTime(value, locale = 'en-IN') {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: IST,
  }).format(d);
}

/** Hour of the day (0-23) in IST. */
export function istHour(value = new Date()) {
  const d = toDate(value) ?? new Date();
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: IST }).format(
      d,
    ),
  );
}

/** Up to two initials: "Anjali Menon" -> "AM", "Dr. Arjun Rao" -> "AR". */
export function initials(name = '') {
  const parts = String(name)
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

const AGE_UNIT = { Y: 'patient.age', M: 'patient.ageMonths', D: 'patient.ageDays' };

/**
 * An age in the reader's language: a number of years, or the case-sheet form the API sends
 * ("47Y", "14M" under two years, "12D" under a month). Anything else is shown as it is.
 */
export function ageText(t, age) {
  if (age == null || age === '') return null;
  if (typeof age === 'number') return t('patient.age', { value: age });
  const m = String(age).match(/^(\d+)\s*([YMD])$/i);
  return m ? t(AGE_UNIT[m[2].toUpperCase()], { value: Number(m[1]) }) : age;
}
