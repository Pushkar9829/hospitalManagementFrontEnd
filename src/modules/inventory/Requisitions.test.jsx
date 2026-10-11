import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const STORE = 's'.repeat(24);
const base = (extra = {}) => ({
  'GET /auth/me': () => [200, makeSession({ panel: 'store', modules: ['INV'] })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /inventory/stores': () => [200, { items: [{ id: STORE, name: 'Central Store' }] }],
  'GET /inventory/vendors': () => [200, { items: [{ id: 'v1', name: 'Medline Surgicals' }] }],
  ...extra,
});

describe('Inventory requisitions and transfers', () => {
  it('turns an open requisition into a purchase order for a vendor', async () => {
    let sent;
    mockApi(
      base({
        'GET /inventory/requisitions': () => [
          200,
          {
            items: [
              {
                id: 'r1',
                prNo: 'PR/26-27/000611',
                storeId: STORE,
                source: 'REORDER',
                reason: 'Below reorder level',
                lines: [{ itemId: 'i1', name: 'Nitrile gloves, medium', qty: 40, rate: 41000 }],
                estimate: 1640000,
                status: 'OPEN',
                raisedBy: 'System',
                version: 0,
              },
            ],
          },
        ],
        'POST /inventory/requisitions/r1/convert': (_req, body) => {
          sent = body;
          return [200, { requisition: { status: 'PO_CREATED' }, po: { id: 'po1' } }];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/inventory?tab=requisitions');
    expect(await screen.findByText('PR/26-27/000611')).toBeVisible();
    expect(screen.getByText(/Reorder level · Below reorder level/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Make PO' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Vendor/), 'v1');
    await user.click(within(dialog).getByRole('button', { name: 'Make PO' }));
    await waitFor(() => expect(sent).toEqual({ version: 0, vendorId: 'v1' }));
  });

  it('lists store transfers in the register', async () => {
    mockApi(
      base({
        'GET /inventory/transfers': () => [
          200,
          {
            items: [
              {
                ref: 'TRF/26-27/000331',
                at: '2026-10-09T05:00:00.000Z',
                from: 'Central Store',
                to: 'ICU sub-store',
                lines: 8,
                qty: 120,
                value: 1845000,
                kind: 'TRANSFER',
              },
            ],
          },
        ],
      }),
    );
    renderApp('/inventory?tab=transfers');
    const table = await screen.findByRole('table', { name: 'Transfer register' });
    expect(await within(table).findByText('TRF/26-27/000331')).toBeVisible();
    expect(within(table).getByText('Central Store → ICU sub-store')).toBeVisible();
    expect(within(table).getByText('₹18,450')).toBeVisible();
  });
});
