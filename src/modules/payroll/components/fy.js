/** The financial year ("2026-27") a date falls in (India: April to March, IST). */
export function fyOf(d = new Date()) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** This financial year and the four before it, newest first, for a picker. */
export function fyOptions(count = 5) {
  const start = Number(fyOf().slice(0, 4));
  return Array.from({ length: count }, (_, i) => {
    const s = start - i;
    const v = `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
    return { value: v, label: v };
  });
}
