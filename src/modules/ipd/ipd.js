/** IPD display helpers: bed status tones (colour always comes with the text label). */

export const BED_TONE = {
  AVAILABLE: 'success',
  RESERVED: 'info',
  OCCUPIED: 'critical',
  CLEANING: 'warning',
  BLOCKED: 'neutral',
};

/** Tile classes per bed state: background and left bar, never colour alone (the label shows). */
export const BED_TILE = {
  AVAILABLE: 'border-success bg-success-bg',
  RESERVED: 'border-info bg-info-bg',
  OCCUPIED: 'border-critical bg-critical-bg',
  CLEANING: 'border-warning bg-warning-bg',
  BLOCKED: 'border-line-strong bg-neutral-bg',
};

export const STAY_TONE = {
  ADMITTED: 'info',
  UNDER_TREATMENT: 'success',
  DISCHARGE_PLANNED: 'warning',
  DISCHARGE_STARTED: 'accent',
  DISCHARGED: 'neutral',
};

export const RISK_TONE = {
  LOW: 'success',
  LOW_MEDIUM: 'warning',
  MEDIUM: 'warning',
  HIGH: 'critical',
};

export const CATEGORIES = [
  'GENERAL',
  'SEMI_PRIVATE',
  'PRIVATE',
  'DELUXE',
  'ICU',
  'HDU',
  'ISOLATION',
  'DAYCARE',
  'NICU',
  'PICU',
  'EMERGENCY',
  'LABOUR',
];

/** Same-day IST check for "expected discharges today". */
export function isTodayIST(value, now = new Date()) {
  if (!value) return false;
  const f = (d) => new Date(new Date(d).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return f(value) === f(now);
}
