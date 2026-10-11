import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const VENDOR = 'a'.repeat(24);
const HEAD = 'b'.repeat(24);
const session = () => [200, makeSession({ panel: 'accounts', modules: ['FIN'] })];
const base = {
  'GET /auth/me': session,
  'GET /approvals/count': () => [200, { inbox: 0 }],
};

describe('Finance sub-ledgers', () => {
  it('shows aged payables and pays a vendor', async () => {
    const calls = [];
    mockApi({
      ...base,
      'GET /finance/payables': () => [
        200,
        {
          asOf: '2026-10-11',
          total: 16_800_00,
          buckets: { d30: 5_600_00, d60: 0, d90: 11_200_00, over90: 0 },
          items: [
            {
              vendorId: VENDOR,
              vendorName: 'Medi Distributors',
              outstanding: 16_800_00,
              buckets: { d30: 5_600_00, d60: 0, d90: 11_200_00, over90: 0 },
              grns: [{}, {}],
            },
          ],
        },
      ],
      'GET /finance/vendor-payments': () => [200, { items: [] }],
      'POST /finance/vendor-payments': (_req, body) => {
        calls.push(body);
        return [201, { id: 'p1', paymentNo: 'VP/26-27/000001', ...body }];
      },
    });
    const user = userEvent.setup();
    renderApp('/finance?tab=payables');
    const table = await screen.findByRole('table', { name: 'Payables' });
    expect(within(table).getByText('Medi Distributors')).toBeVisible();
    await user.click(within(table).getByRole('button', { name: 'Pay' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/^Amount/);
    await user.clear(amount);
    await user.type(amount, '12000');
    await user.type(within(dialog).getByLabelText(/^TDS withheld/), '200');
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      vendorId: VENDOR,
      amount: 12_000_00,
      tds: 200_00,
      mode: 'BANK_TRANSFER',
    });
    expect(await screen.findByText('Payment VP/26-27/000001 recorded')).toBeVisible();
  });

  it('pays a petty cash expense that goes for approval', async () => {
    const calls = [];
    mockApi({
      ...base,
      'GET /finance/accounts': () => [
        200,
        {
          items: [
            { id: HEAD, code: '5500', name: 'General expenses', type: 'EXPENSE', isActive: true },
          ],
        },
      ],
      'GET /finance/petty-cash': () => [
        200,
        {
          balance: 4_000_00,
          pending: 0,
          float: 20_000_00,
          approvalOver: 2_000_00,
          version: 0,
          items: [],
        },
      ],
      'POST /finance/petty-cash': (_req, body) => {
        calls.push(body);
        return [
          202,
          {
            id: 'e1',
            entryNo: 'PC/1',
            status: 'PENDING_APPROVAL',
            approvalId: 'c'.repeat(24),
            ...body,
          },
        ];
      },
    });
    const user = userEvent.setup();
    renderApp('/finance?tab=petty');
    expect(
      await screen.findByText('Petty cash is below a quarter of the float. Top it up.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay an expense' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Amount/), '3000');
    await user.selectOptions(within(dialog).getByLabelText(/^Expense head/), HEAD);
    await user.type(within(dialog).getByLabelText(/^Paid to/), 'Plumber');
    await user.click(within(dialog).getByRole('button', { name: 'Pay an expense' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      kind: 'EXPENSE',
      amount: 3_000_00,
      accountId: HEAD,
      payee: 'Plumber',
    });
    expect(await screen.findByText('Sent for approval')).toBeVisible();
  });
});
