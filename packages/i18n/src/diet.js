import { makeBundle } from './bundle.js';
import { dietEn } from './diet.en.js';
import { dietHi } from './diet.hi.js';

export { dietEn, dietHi };

/** Adds the diet and kitchen screen's strings to an i18next instance (once). */
export const addDietStrings = makeBundle(dietEn, dietHi);
