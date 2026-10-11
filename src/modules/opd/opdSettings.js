/** OPD settings helpers: schedule checks, new-session defaults and 202 approval ids. */

const mins = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Checks a week before saving: each session starts before it ends, slots are 5 minutes or
 * more, and sessions on the same day do not overlap. Returns { 'MON.0': { time, slot } }
 * with i18n keys; empty when the week is fine.
 */
export function checkWeek(week) {
  const errors = {};
  for (const w of week) {
    const spans = [];
    w.sessions.forEach((s, i) => {
      const e = {};
      const a = mins(s.start);
      const b = mins(s.end);
      if (a == null || b == null || a >= b) e.time = 'opd.cfg.errors.time';
      else if (spans.some(([x, y]) => a < y && b > x)) e.time = 'opd.cfg.errors.overlap';
      else spans.push([a, b]);
      if (!(Number(s.slotNew) >= 5) || !(Number(s.slotFollowUp) >= 5))
        e.slot = 'opd.cfg.errors.slot';
      if (Object.keys(e).length) errors[`${w.day}.${i}`] = e;
    });
  }
  return errors;
}

/** A new session after the day's last one (or the doctor's usual hours), same room and slots. */
export function newSession(sessions, schedule) {
  const base = sessions.at(-1) ?? firstOf(schedule.week);
  const start = sessions.length ? '17:00' : (base?.start ?? '10:00');
  const end = sessions.length ? '19:00' : (base?.end ?? '13:00');
  const slotNew = base?.slotNew ?? 10;
  return {
    start,
    end,
    room: base?.room ?? schedule.doctor.room ?? '',
    slotNew,
    slotFollowUp: base?.slotFollowUp ?? Math.max(5, slotNew / 2),
    max: Math.round(((mins(end) ?? 0) - (mins(start) ?? 0)) / slotNew),
    overbook: base?.overbook ?? 0,
    online: true,
    tele: false,
  };
}

function firstOf(week) {
  for (const w of week) if (w.sessions.length) return w.sessions[0];
  return null;
}

/** The approval id of a 202 answer ({ approvalId } from the API, { approval: { id } } in preview). */
export function approvalIdOf(result) {
  return result?.approvalId ?? result?.approval?.id ?? null;
}
