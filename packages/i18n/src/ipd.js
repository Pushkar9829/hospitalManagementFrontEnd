import { makeBundle } from './bundle.js';
import { ipdEn } from './ipd.en.js';
import { ipdHi } from './ipd.hi.js';

export { ipdEn, ipdHi };

/** Adds the IPD, nursing and insurance desk screens' strings to an i18next instance (once). */
export const addIpdStrings = makeBundle(ipdEn, ipdHi);
