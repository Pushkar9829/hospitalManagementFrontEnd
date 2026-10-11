/**
 * The consultation form (board Consult): the fields the doctor edits, and the body sent with
 * PUT /opd/visits/{id}/consultation (auto-save) and POST /opd/visits/{id}/complete (sign).
 */

export const CONSULT_FIELDS = [
  'complaints',
  'history',
  'examination',
  'diagnoses',
  'noDiagnosisReason',
  'rx',
  'orders',
  'advice',
  'followUp',
  'printLanguage',
  'specialty',
];

export const PRINT_LANGUAGES = ['en', 'hi', 'mr'];
export const ORDER_PRIORITIES = ['ROUTINE', 'TODAY', 'STAT', 'SCHEDULE'];
export const CERT_TYPES = ['SICK_LEAVE', 'FITNESS', 'MEDICAL'];
export const WARD_TYPES = ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU'];
export const URGENCIES = ['ROUTINE', 'TODAY', 'EMERGENCY'];

/** Form values from the saved consultation (empty strings, never undefined, for inputs). */
export function consultDefaults(c) {
  return {
    complaints: c?.complaints ?? '',
    history: c?.history ?? '',
    examination: c?.examination ?? '',
    diagnoses: c?.diagnoses ?? [],
    noDiagnosisReason: c?.noDiagnosisReason ?? '',
    rx: (c?.rx ?? []).map((r) => ({ ...r, days: r.days ?? '' })),
    orders: c?.orders ?? [],
    advice: c?.advice ?? '',
    followUp: { date: c?.followUp?.date ?? '', note: c?.followUp?.note ?? '' },
    printLanguage: c?.printLanguage ?? 'en',
    specialty: c?.specialty ?? null,
  };
}

/** The API body: only the consultation fields, with days as numbers. */
export function consultBody(values) {
  const body = Object.fromEntries(CONSULT_FIELDS.map((k) => [k, values[k]]));
  body.rx = (values.rx ?? []).map((r) => ({ ...r, days: r.days === '' ? null : Number(r.days) }));
  return body;
}

/** A prescription line for a formulary drug, with the usual adult defaults filled in. */
const FORM_DEFAULTS = {
  Tablet: { dose: '1 tab', route: 'Oral' },
  Capsule: { dose: '1 cap', route: 'Oral' },
  Gel: { dose: 'Thin layer', route: 'Topical' },
  Inhaler: { dose: '2 puffs', route: 'Inhalation' },
};

export function rxFromDrug(d) {
  const f = FORM_DEFAULTS[d.form] ?? { dose: '', route: 'Oral' };
  return {
    drugId: d.id,
    brand: d.brand,
    generic: d.generic,
    dose: f.dose,
    frequency: 'OD',
    days: 5,
    route: f.route,
    instructions: '',
  };
}

/** An order line for an orderable test or procedure; it goes to the bill on completion. */
export function orderFrom(o) {
  return {
    code: o.code,
    name: o.name,
    type: o.type,
    priority: 'ROUTINE',
    price: o.price,
    status: 'DRAFT',
  };
}

/** Adds lines that are not there yet (by drug or order code), keeping the doctor's edits. */
export function mergeLines(current, added, key) {
  const have = new Set(current.map((x) => x[key]));
  return [...current, ...added.filter((x) => !have.has(x[key]))];
}
