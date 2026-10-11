import { makeBundle } from './bundle.js';
import { portalEn } from './portal.en.js';
import { portalHi } from './portal.hi.js';

export { portalEn, portalHi };

/** Adds the patient portal's strings to an i18next instance (once). */
export const addPortalStrings = makeBundle(portalEn, portalHi);
