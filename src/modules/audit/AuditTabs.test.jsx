import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const base = () => ({
  'GET /auth/me': () => [200, makeSession({ panel: 'auditor' })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
});

describe('Audit log tabs', () => {
  it('flags sign-ins outside working hours', async () => {
    const seen = [];
    mockApi({
      ...base(),
      'GET /audit': (req) => {
        seen.push(new URL(req.url).searchParams.get('actions'));
        return [
          200,
          {
            items: [
              {
                id: 'a1',
                action: 'LOGIN',
                userName: 'ramesh.iyer',
                at: '2026-10-10T20:44:00.000Z',
                ip: '49.36.12.8',
              },
              {
                id: 'a2',
                action: 'LOGIN_FAILED',
                userName: 'lalit.g',
                at: '2026-10-10T04:42:00.000Z',
                summary: 'Account locked after 5 attempts',
              },
            ],
            total: 2,
            page: 1,
            limit: 100,
          },
        ];
      },
    });
    renderApp('/audit?tab=logins');
    const table = await screen.findByRole('table', { name: 'Sign-ins' });
    const late = (await within(table).findByText('ramesh.iyer')).closest('tr');
    expect(within(late).getByText('Outside working hours')).toBeVisible();
    const day = within(table).getByText('lalit.g').closest('tr');
    expect(within(day).queryByText('Outside working hours')).toBeNull();
    expect(seen.at(-1)).toContain('LOGIN_FAILED');
  });

  it('lists the day’s exceptions with counts', async () => {
    mockApi({
      ...base(),
      'GET /audit/exceptions': () => [
        200,
        {
          date: '2026-10-11',
          items: [
            {
              kind: 'FAILED_LOGINS',
              count: 6,
              users: 2,
              example: {
                at: '2026-10-11T04:42:00.000Z',
                userName: 'lalit.g',
                summary: 'Account locked',
              },
            },
            { kind: 'EXPORTS', count: 0, users: 0, example: null },
          ],
        },
      ],
    });
    renderApp('/audit?tab=exceptions');
    const table = await screen.findByRole('table', { name: 'Daily exceptions' });
    const failed = (await within(table).findByText('Failed sign-ins and locked accounts')).closest(
      'tr',
    );
    expect(within(failed).getByText('6')).toBeVisible();
    expect(within(failed).getByText(/lalit\.g · Account locked/)).toBeVisible();
    const exports = within(table).getByText('Exports and downloads').closest('tr');
    expect(within(exports).getByText('None')).toBeVisible();
  });
});
