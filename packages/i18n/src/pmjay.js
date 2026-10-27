import { makeBundle } from './bundle.js';
import { pmjayEn } from './pmjay.en.js';
import { pmjayHi } from './pmjay.hi.js';

export { pmjayEn, pmjayHi };

/** Adds the PM-JAY cashless desk's strings to an i18next instance (once). */
export const addPmjayStrings = makeBundle(pmjayEn, pmjayHi);
