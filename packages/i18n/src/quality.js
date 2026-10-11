import { makeBundle } from './bundle.js';
import { qualityEn } from './quality.en.js';
import { qualityHi } from './quality.hi.js';

export { qualityEn, qualityHi };

/** Adds the quality screens's strings to an i18next instance (once). */
export const addQualityStrings = makeBundle(qualityEn, qualityHi);
