import { makeBundle } from './bundle.js';
import { crmEn } from './crm.en.js';
import { crmHi } from './crm.hi.js';

export { crmEn, crmHi };

/** Adds the CRM screen's strings to an i18next instance (once). */
export const addCrmStrings = makeBundle(crmEn, crmHi);
