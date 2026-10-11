import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const employee = {
  id: 'e1',
  empNo: 'EMP-0007',
  first: 'Anjali',
  name: 'Anjali Menon',
  designation: 'Staff nurse',
  joinedOn: '2025-04-01',
  mobile: '9820041220',
  email: 'anjali@example.com',
  address: 'Flat 12, Green Park, Pune',
  emergencyContact: null,
  bank: { name: 'HDFC', accountNo: 'XXXX4410', ifsc: 'HDFC0001234' },
};

const base = (extra) => ({
  'GET /auth/me': () => [200, makeSession({ panel: 'employee', modules: ['HRM', 'PAY'] })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /me/employee': () => [200, employee],
  'GET /hr/leave-requests': () => [200, { items: [] }],
  ...extra,
});

describe('My Space: tax declaration and profile', () => {
  it('saves an old-regime declaration with its deductions', async () => {
    let sent;
    mockApi(
      base({
        'GET /me/tax-declaration': () => [200, { fy: '2026-27', declaration: null }],
        'PUT /me/tax-declaration': (_req, body) => {
          sent = body;
          return [
            200,
            { fy: '2026-27', declaration: { ...body, status: 'SUBMITTED', version: 0 } },
          ];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/me?tab=tax');
    expect(await screen.findByText('Income tax declaration 2026-27')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Regime'), 'OLD');
    await user.type(screen.getByLabelText(/House rent paid per month/), '12000');
    await user.type(screen.getByLabelText(/80C investments/), '60000');
    await user.type(screen.getByLabelText(/80D health insurance/), '18000');
    await user.click(screen.getByRole('button', { name: 'Save declaration' }));
    await waitFor(() =>
      expect(sent).toEqual({
        regime: 'OLD',
        rentMonthly: 12000,
        deductions80C: 60000,
        deductions80D: 18000,
      }),
    );
  });

  it('sends only the changed details to HR', async () => {
    let sent;
    mockApi(
      base({
        'GET /me/profile-changes': () => [200, { items: [] }],
        'POST /me/profile-changes': (_req, body) => {
          sent = body;
          return [202, { status: 'PENDING', approvalId: 'a1' }];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/me?tab=profile');
    expect(await screen.findByText('My profile')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send changes to HR' })).toBeDisabled();
    const mobile = screen.getAllByLabelText('Mobile')[0];
    await user.clear(mobile);
    await user.type(mobile, '9820041299');
    await user.click(screen.getByRole('button', { name: 'Send changes to HR' }));
    await waitFor(() => expect(sent).toEqual({ mobile: '9820041299' }));
    expect(await screen.findByText('Sent to HR for approval')).toBeVisible();
  });
});
