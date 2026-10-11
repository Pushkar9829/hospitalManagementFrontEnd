import { makeBundle } from './bundle.js';
import { radEn } from './radiology.en.js';
import { radHi } from './radiology.hi.js';

export { radEn, radHi };

/** Adds the radiology screens' strings to an i18next instance (once). */
export const addRadStrings = makeBundle(radEn, radHi);
