import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const session = () => makeSession({ panel: 'payroll', modules: ['HRM', 'PAY'] });

describe('Gratuity and bonus', () => {
  it('shows the gratuity register with the liability and who is eligible', async () => {
    mockApi({
      'GET /auth/me': () => [200, session()],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /payroll/gratuity': () => [
        200,
        {
          asOf: '2026-10-11',
          liability: 2_65_384_00,
          payableNow: 1_73_076_00,
          items: [
            {
              employeeId: 'a',
              empNo: 'E001',
              name: 'Sita Devi',
              joinedOn: '2016-01-01',
              countedYears: 11,
              completedYears: 10,
              monthlyWage: 27_272_00,
              amount: 1_73_076_00,
              eligible: true,
            },
            {
              employeeId: 'b',
              empNo: 'E002',
              name: 'Anil Rao',
              joinedOn: '2023-04-01',
              countedYears: 4,
              completedYears: 3,
              monthlyWage: 40_000_00,
              amount: 92_308_00,
              eligible: false,
            },
          ],
        },
      ],
    });
    renderApp('/payroll?tab=gratuity');
    const table = await screen.findByRole('table', { name: 'Gratuity' });
    const anil = within(table).getByText('Anil Rao').closest('tr');
    expect(within(anil).getByText('Under 5 years')).toBeVisible();
    expect(within(table).getByText('Sita Devi').closest('tr')).toHaveTextContent('Eligible');
    expect(screen.getByText('Payable now')).toBeVisible();
  });

  it('works out the bonus and sends it to Finance', async () => {
    let runs = [];
    const posted = [];
    const run = (status) => ({
      id: 'bn1',
      fy: '2026-27',
      percent: 8.33,
      minimumWage: 0,
      status,
      total: 5_831_00,
      approvalId: status === 'PENDING_APPROVAL' ? 'ap1' : null,
      version: status === 'DRAFT' ? 0 : 1,
      lines: [
        {
          employeeId: 'b',
          empNo: 'E002',
          name: 'Anil Rao',
          months: 10,
          days: 300,
          highestWage: 20_000_00,
          basis: 70_000_00,
          bonus: 5_831_00,
        },
      ],
    });
    mockApi({
      'GET /auth/me': () => [200, session()],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /payroll/bonus': () => [200, { items: runs }],
      'POST /payroll/bonus': (_req, body) => {
        posted.push(body);
        runs = [run('DRAFT')];
        return [200, runs[0]];
      },
      'POST /payroll/bonus/bn1/pay': () => {
        runs = [run('PENDING_APPROVAL')];
        return [202, runs[0]];
      },
    });
    renderApp('/payroll?tab=bonus');
    const user = userEvent.setup();
    await screen.findByText('No bonus worked out yet');
    const fy = screen.getByLabelText('Financial year');
    await user.clear(fy);
    await user.type(fy, '2026-27');
    await user.click(screen.getByRole('button', { name: 'Work out bonus' }));
    const table = await screen.findByRole('table', { name: 'Bonus by employee 2026-27' });
    expect(within(table).getByText('Anil Rao').closest('tr')).toHaveTextContent('₹5,831');
    expect(posted[0]).toEqual({ fy: '2026-27', percent: 8.33, minimumWage: 0 });
    await user.click(screen.getByRole('button', { name: 'Send for payment' }));
    expect(await screen.findByText('Waiting for Finance')).toBeVisible();
  });
});
