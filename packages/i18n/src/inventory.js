import { makeBundle } from './bundle.js';
import { inventoryEn } from './inventory.en.js';
import { inventoryHi } from './inventory.hi.js';

export { inventoryEn, inventoryHi };

/** Adds the inventory and pharmacy screens' strings to an i18next instance (once). */
export const addInventoryStrings = makeBundle(inventoryEn, inventoryHi);
