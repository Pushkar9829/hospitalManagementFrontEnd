import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const month = (m, extra = {}) => ({
  month: m,
  quarter: 1,
  locked: true,
  employees: 2,
  gross: 1_70_000_00,
  tds: 20_000_00,
  due: '2024-05-07',
  challan: null,
  short: 20_000_00,
  late: false,
  ...extra,
});

describe('TDS and Form 16', () => {
  it('records a challan, lists what blocks the 24Q and opens Form 16', async () => {
    const challans = [];
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'payroll', modules: ['HRM', 'PAY'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /payroll/settings': () => [200, { deductor: { tan: 'MUMC12345D' } }],
      'GET /payroll/tds': () => [
        200,
        {
          fy: '2024-25',
          months: [
            challans.length
              ? month('2024-04', {
                  challan: {
                    id: 'c1',
                    amount: 20_000_00,
                    bsrCode: '0510308',
                    challanSerial: '00011',
                    depositedOn: '2024-05-06',
                  },
                  short: 0,
                })
              : month('2024-04'),
          ],
          tds: 20_000_00,
          deposited: 0,
        },
      ],
      'POST /payroll/tds/challans': (_req, body) => {
        challans.push(body);
        return [200, { id: 'c1', ...body }];
      },
      'GET /payroll/tds/24q': () => [
        200,
        {
          fy: '2024-25',
          quarter: 1,
          issues: [{ code: 'NO_PAN', message: 'No PAN for Ravi: TDS is due at 20%.' }],
          challans: [],
          annexure1: [{ empNo: 'E001' }],
          annexure2: null,
          totals: { amountPaid: 5_10_000_00, tds: 60_000_00, deposited: 60_000_00 },
          csv: 'x',
        },
      ],
      'GET /payroll/form16': () => [
        200,
        {
          fy: '2024-25',
          provisional: false,
          items: [
            {
              employeeId: 'e1',
              empNo: 'E001',
              name: 'Asha Mehta',
              pan: 'ABCPM1234K',
              gross: 18_00_000_00,
              tds: 2_40_000_00,
            },
          ],
        },
      ],
    });
    renderApp('/payroll?tab=tds');
    const user = userEvent.setup();
    const fy = await screen.findByLabelText('Financial year');
    await user.clear(fy);
    await user.type(fy, '2024-25');

    const months = await screen.findByRole('table', { name: 'TDS by month' });
    const april = within(months).getByText('2024-04').closest('tr');
    expect(within(april).getByText('₹20,000 short')).toBeVisible();
    await user.click(within(april).getByRole('button', { name: 'Record challan' }));
    await user.type(screen.getByLabelText(/BSR code/), '0510308');
    await user.type(screen.getByLabelText(/Challan serial/), '00011');
    await user.type(screen.getByLabelText(/Deposited on/), '2024-05-06');
    await user.click(screen.getByRole('button', { name: 'Save challan' }));
    expect(await within(months).findByText('Deposited')).toBeVisible();
    expect(challans[0]).toMatchObject({
      month: '2024-04',
      bsrCode: '0510308',
      challanSerial: '00011',
      amount: 20_000_00,
    });

    expect(screen.getByText('No PAN for Ravi: TDS is due at 20%.')).toBeVisible();
    expect(screen.getByText('1 thing to fix before filing')).toBeVisible();
    const f16 = screen.getByRole('table', { name: 'Form 16' });
    expect(within(f16).getByRole('button', { name: 'Form 16 for Asha Mehta' })).toBeVisible();
  });
});
