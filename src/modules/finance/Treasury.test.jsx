import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const base = {
  'GET /auth/me': () => [200, makeSession({ panel: 'accounts', modules: ['FIN'] })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /finance/accounts': () => [200, { items: [] }],
};

describe('Bank reconciliation', () => {
  it('imports a pasted statement and shows the reconciliation agreeing', async () => {
    const imported = [];
    mockApi({
      ...base,
      'GET /finance/bank/statement': () => [
        200,
        {
          account: { id: 'b', code: '1010', name: 'Bank account' },
          items: [
            {
              id: 'l1',
              date: '2025-04-30',
              description: 'Service charges',
              ref: '',
              amount: -590_00,
              status: 'UNMATCHED',
              version: 0,
              candidates: [],
            },
          ],
        },
      ],
      'POST /finance/bank/statement': (_req, body) => {
        imported.push(body);
        return [200, { added: 2, skipped: 0, matched: 1 }];
      },
      'GET /finance/bank/reconciliation': () => [
        200,
        {
          account: { id: 'b', code: '1010', name: 'Bank account' },
          asOf: '2025-04-30',
          bookBalance: 7_38_000_00,
          chequesNotPresented: [{ voucherNo: 'PV/0003', amount: 12_000_00 }],
          depositsNotCredited: [],
          bankOnly: [{ id: 'l1', amount: -590_00 }],
          computedBankBalance: 7_49_410_00,
          statementBalance: 7_49_410_00,
          statementBalanceOn: '2025-04-30',
          difference: 0,
          counts: { lines: 4, matched: 3, ignored: 0, open: 1 },
        },
      ],
    });
    renderApp('/finance?tab=bank');
    const user = userEvent.setup();
    const csv = await screen.findByLabelText('Statement CSV');
    fireEvent.change(csv, {
      target: {
        value:
          'Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Balance\n' +
          '01/04/2025,Capital,NEFT1,,"20,00,000.00","20,00,000.00"\n' +
          '30/04/2025,Service charges,,590.00,,"19,99,410.00"\n',
      },
    });
    await user.click(screen.getByRole('button', { name: 'Import 2 lines' }));
    expect(await screen.findByText('2 lines imported, 0 already there, 1 matched')).toBeVisible();
    expect(imported[0].lines).toEqual([
      {
        date: '2025-04-01',
        description: 'Capital',
        ref: 'NEFT1',
        amount: 20_00_000_00,
        balance: 20_00_000_00,
      },
      {
        date: '2025-04-30',
        description: 'Service charges',
        ref: '',
        amount: -590_00,
        balance: 19_99_410_00,
      },
    ]);
    const brs = screen.getByRole('table', { name: 'Bank reconciliation statement' });
    expect(
      within(brs).getByText('Add: cheques issued, not presented').closest('tr'),
    ).toHaveTextContent('12,000.00');
    expect(screen.getByText('The books agree with the bank statement.')).toBeVisible();
    const lines = screen.getByRole('table', { name: 'Statement lines' });
    expect(within(lines).getByRole('button', { name: 'Book it' })).toBeVisible();
  });
});

describe('Fixed assets', () => {
  it('shows the register and charges a month’s depreciation', async () => {
    const runs = [];
    mockApi({
      ...base,
      'GET /finance/assets': () => [
        200,
        {
          blocks: [
            {
              code: 'MEDICAL_EQUIPMENT',
              name: 'Medical and surgical equipment',
              life: 13,
              wdv: 15,
            },
          ],
          items: [
            {
              id: 'a1',
              code: 'FA-001',
              name: 'MRI 1.5T',
              block: 'MEDICAL_EQUIPMENT',
              blockName: 'Medical and surgical equipment',
              method: 'SLM',
              usefulLifeYears: 13,
              cost: 13_00_000_00,
              accumulated: 19_791_67,
              bookValue: 12_80_208_33,
              status: 'ACTIVE',
              version: 0,
            },
          ],
          totals: { cost: 13_00_000_00, accumulated: 19_791_67, bookValue: 12_80_208_33 },
        },
      ],
      'GET /finance/assets/equipment': () => [200, { items: [] }],
      'GET /finance/assets/depreciation/preview': () => [
        200,
        { month: '2025-07', done: runs.length > 0, lines: [{ code: 'FA-001' }], total: 7_916_67 },
      ],
      'GET /finance/assets/depreciation': () => [200, { items: runs }],
      'POST /finance/assets/depreciation': (_req, body) => {
        runs.push({ id: 'r1', month: body.month, total: 7_916_67, assets: 1 });
        return [200, { id: 'r1', month: body.month, total: 7_916_67, lines: [] }];
      },
      'GET /finance/assets/schedule': () => [200, { fy: '2025-26', items: [], totals: {} }],
    });
    renderApp('/finance?tab=assets');
    const user = userEvent.setup();
    const reg = await screen.findByRole('table', { name: 'Fixed asset register' });
    const mri = within(reg).getByText('MRI 1.5T').closest('tr');
    expect(mri).toHaveTextContent('Straight line, 13 years');
    expect(mri).toHaveTextContent('12,80,208.33');
    expect(await screen.findByText(/Will charge ₹7,916.67 on 1 asset/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Charge depreciation' }));
    expect(await screen.findByText('Already charged for this month.')).toBeVisible();
    expect(runs).toHaveLength(1);
  });
});
