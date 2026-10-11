import { makeBundle } from './bundle.js';
import { reportsEn } from './reports.en.js';
import { reportsHi } from './reports.hi.js';

export { reportsEn, reportsHi };

/** Adds the reports centre's strings to an i18next instance (once). */
export const addReportsStrings = makeBundle(reportsEn, reportsHi);
