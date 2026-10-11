import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const PAYER = 'c'.repeat(24);
const corporate = {
  id: PAYER,
  code: 'TATA',
  name: 'Tata Motors',
  kind: 'CORPORATE',
  gstin: '27AAACT2727Q1ZW',
  creditLimit: 100000000,
  creditDays: 30,
  used: 64230000,
  percent: 64,
  overdue: 0,
  overdueDays: 0,
  draft: { bills: 1, amount: 426000 },
  hold: null,
  status: 'ACTIVE',
};
const invoice = {
  id: 'd'.repeat(24),
  invoiceNo: 'CI/26-27/0093',
  payerId: PAYER,
  payer: { name: 'Tata Motors' },
  month: '2026-10',
  total: 426000,
  taxable: 0,
  paid: 0,
  balance: 426000,
  status: 'ISSUED',
  dueAt: '2026-11-10T00:00:00.000Z',
  overdueDays: 0,
  einvoice: { status: 'NOT_NEEDED' },
  version: 0,
};

describe('Corporate and credit', () => {
  it('issues the month invoice and records a bank payment against it', async () => {
    const sent = {};
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'billingmgr' })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /billing/corporates': () => [
        200,
        { items: [corporate], totals: { active: 1, used: 64230000, overdue: 0, drafts: 426000 } },
      ],
      [`GET /billing/corporates/${PAYER}`]: () => [
        200,
        {
          ...corporate,
          draftBills: [
            {
              billId: 'b1',
              billNo: 'OP/26-27/000812',
              patient: 'Anil Pawar',
              date: '2026-10-05T05:00:00.000Z',
              amount: 426000,
              taxable: 0,
            },
          ],
          invoices: sent.issued ? [invoice] : [],
        },
      ],
      [`GET /billing/corporates/${PAYER}/statement`]: () => [200, { entries: [], balance: 0 }],
      'POST /billing/corporate-invoices': (_req, body) => {
        sent.issued = body;
        return [201, invoice];
      },
      [`POST /billing/corporate-invoices/${'d'.repeat(24)}/payments`]: (_req, body) => {
        sent.payment = body;
        return [200, { ...invoice, paid: 426000, balance: 0, status: 'PAID' }];
      },
    });
    const user = userEvent.setup();
    renderApp(`/billing/corporates?id=${PAYER}`);
    expect(await screen.findByRole('heading', { name: 'Corporate and credit' })).toBeVisible();
    expect(await screen.findByText('OP/26-27/000812')).toBeVisible();
    expect(screen.getByText('64% of limit')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() =>
      expect(sent.issued).toMatchObject({
        payerId: PAYER,
        month: expect.stringMatching(/^\d{4}-\d{2}$/),
      }),
    );
    expect(await screen.findByText('Invoice CI/26-27/0093 issued for ₹4,260')).toBeVisible();

    const invoices = await screen.findByRole('table', { name: 'Invoices' });
    await user.click(within(invoices).getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/UTR or cheque number/), 'UTR445566');
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() =>
      expect(sent.payment).toEqual({
        version: 0,
        mode: 'BANK_TRANSFER',
        reference: 'UTR445566',
        amount: 4260,
      }),
    );
  });
});
