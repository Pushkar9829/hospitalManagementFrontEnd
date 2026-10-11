/** Lab display helpers: colour always comes with a text label. */

export const STATUS_TONE = {
  ORDERED: 'neutral',
  COLLECTED: 'info',
  RECEIVED: 'info',
  RESULTED: 'warning',
  VERIFIED: 'accent',
  RELEASED: 'success',
  CANCELLED: 'neutral',
};

export const PRIORITY_TONE = { STAT: 'critical', URGENT: 'warning', ROUTINE: 'neutral' };

/** Result flags: L/H out of range, LL/HH critical, A abnormal choice, N normal. */
export const FLAG_TONE = {
  N: 'success',
  L: 'warning',
  H: 'warning',
  LL: 'critical',
  HH: 'critical',
  A: 'warning',
};
export const FLAG_TEXT_CLASS = {
  L: 'text-warning font-semibold',
  H: 'text-warning font-semibold',
  LL: 'text-critical font-bold',
  HH: 'text-critical font-bold',
  A: 'text-warning font-semibold',
};

export const QC_TONE = { IN_CONTROL: 'success', WARNING: 'warning', REJECTED: 'critical' };

export const DEPARTMENTS = [
  'BIOCHEMISTRY',
  'HAEMATOLOGY',
  'CLINICAL_PATHOLOGY',
  'SEROLOGY',
  'MICROBIOLOGY',
  'HISTOPATHOLOGY',
];

/** Minutes until (positive) or past (negative) a due time. */
export function minutesLeft(dueAt, now = Date.now()) {
  if (!dueAt) return null;
  return Math.round((new Date(dueAt).getTime() - now) / 60000);
}
