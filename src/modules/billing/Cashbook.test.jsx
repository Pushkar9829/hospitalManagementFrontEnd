import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const base = (extra) => ({
  'GET /auth/me': () => [200, makeSession({ panel: 'billingmgr' })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /billing/shifts': () => [200, { items: [], total: 0, page: 1, limit: 25 }],
  ...extra,
});

describe('Shift and day-end', () => {
  it('records the bank settlement for a device and shows the shortfall', async () => {
    let sent;
    let settled = null;
    mockApi(
      base({
        'GET /billing/settlements': () => [
          200,
          {
            date: '2026-10-10',
            mdrLimitPercent: 3,
            items: [
              {
                mode: 'UPI',
                modeName: 'UPI (QR)',
                kind: 'UPI',
                counter: 'C1',
                receipts: 2288000,
                count: 41,
                settled,
                reference: settled ? 'AXIS-UPI-0810-03' : null,
                difference: settled ? 2288000 - settled : null,
                state: settled ? 'SHORT' : 'PENDING',
              },
            ],
          },
        ],
        'POST /billing/settlements': (_req, body) => {
          sent = body;
          settled = body.settled * 100;
          return [200, { items: [] }];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/billing/shift?tab=settlement');
    const table = await screen.findByRole('table', { name: 'Card and UPI settlement' });
    expect(await within(table).findByText('Waiting')).toBeVisible();
    await user.click(within(table).getByRole('button', { name: 'Enter settlement' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/Amount settled/);
    await user.clear(amount);
    await user.type(amount, '22380');
    await user.type(within(dialog).getByLabelText(/UTR or batch/), 'AXIS-UPI-0810-03');
    await user.click(within(dialog).getByRole('button', { name: 'Enter settlement' }));
    await waitFor(() =>
      expect(sent).toMatchObject({
        mode: 'UPI',
        counter: 'C1',
        settled: 22380,
        reference: 'AXIS-UPI-0810-03',
      }),
    );
    expect(await within(table).findByText('Short')).toBeVisible();
  });

  it('locks the day only when every shift is verified', async () => {
    let locked = false;
    mockApi(
      base({
        [`GET /billing/days/${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}`]:
          () => [
            200,
            {
              date: 'today',
              locked,
              lockedAt: locked ? '2026-10-11T17:30:00.000Z' : null,
              lockedBy: locked ? 'Rahul Mehta' : null,
              shifts: { open: 0, toVerify: 0, verified: 3 },
            },
          ],
        [`POST /billing/days/today/lock`]: () => {
          locked = true;
          return [200, {}];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/billing/shift?tab=verify');
    expect(await screen.findByText('3 verified')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Lock the day' }));
    expect(await screen.findByText(/Locked at .* by Rahul Mehta/)).toBeVisible();
  });
});
