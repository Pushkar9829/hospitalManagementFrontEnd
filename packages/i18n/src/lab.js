import { makeBundle } from './bundle.js';
import { labEn } from './lab.en.js';
import { labHi } from './lab.hi.js';

export { labEn, labHi };

/** Adds the laboratory screens' strings to an i18next instance (once). */
export const addLabStrings = makeBundle(labEn, labHi);
