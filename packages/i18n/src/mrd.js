import { makeBundle } from './bundle.js';
import { mrdEn } from './mrd.en.js';
import { mrdHi } from './mrd.hi.js';

export { mrdEn, mrdHi };

/** Adds the medical records screen's strings to an i18next instance (once). */
export const addMrdStrings = makeBundle(mrdEn, mrdHi);
