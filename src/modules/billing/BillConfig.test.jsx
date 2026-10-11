import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const settings = {
  shiftVarianceLimit: 10000,
  defaultOpeningCash: 500000,
  billPaper: 'A4',
  receiptPaper: 'THERMAL_80',
  billFooter: '',
  version: 2,
};

describe('Billing settings', () => {
  it('saves cash rules in rupees with the version', async () => {
    let sent;
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'admin' })],
      'GET /approvals/count': () => [200, { count: 0 }],
      'GET /billing/settings': () => [200, settings],
      'PUT /billing/settings': (_req, body) => {
        sent = body;
        return [200, { ...settings, ...body, version: 3 }];
      },
    });
    const user = userEvent.setup();
    renderApp('/settings/billing?tab=cash');
    expect(await screen.findByRole('heading', { name: 'Billing settings' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Payment modes' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Bills and receipts' })).toBeVisible();
    expect(await screen.findByText(/section 269ST/)).toBeVisible();
    const variance = screen.getByLabelText(/Shift variance that needs a reason/);
    expect(variance).toHaveValue('100');
    await user.clear(variance);
    await user.type(variance, '250');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent).toEqual({
        version: 2,
        shiftVarianceLimit: 250,
        defaultOpeningCash: 5000,
        billPaper: 'A4',
        receiptPaper: 'THERMAL_80',
        billFooter: '',
      }),
    );
    expect(await screen.findByText('Billing settings saved')).toBeVisible();
  });
});
