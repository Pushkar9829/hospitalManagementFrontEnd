import { makeBundle } from './bundle.js';
import { facilityEn } from './facility.en.js';
import { facilityHi } from './facility.hi.js';

export { facilityEn, facilityHi };

/** Adds the facility screen's strings to an i18next instance (once). */
export const addFacilityStrings = makeBundle(facilityEn, facilityHi);
