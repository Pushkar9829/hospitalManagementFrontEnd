import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { consoleRoutes } from '../../app/router.jsx';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const DAY = 86_400_000;
const ID = 'a'.repeat(24);
const me = {
  id: 'p1',
  name: 'Ops',
  email: 'ops@hms.local',
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['*'],
};
const tenant = (over = {}) => ({
  id: ID,
  name: 'City Hospital',
  subdomain: 'cityhospital',
  status: 'ACTIVE',
  plan: 'HOSPITAL',
  modules: ['CORE', 'OPD', 'IPD'],
  createdAt: '2026-06-01T00:00:00.000Z',
  subscription: {
    plan: 'HOSPITAL',
    cycle: 'MONTHLY',
    converted: true,
    currentPeriod: {},
    pending: [],
  },
  ...over,
});
const invoice = (over = {}) => ({
  id: 'b'.repeat(24),
  number: 'PI/26-27/000007',
  tenantId: ID,
  period: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-31T00:00:00.000Z' },
  total: 4130000,
  status: 'ISSUED',
  issuedAt: '2026-10-01T00:00:00.000Z',
  dueAt: new Date(Date.now() - 3 * DAY).toISOString(),
  billTo: { legalName: 'City Hospital Pvt Ltd' },
  ...over,
});
const page = (items) => ({ items, total: items.length, page: 1, limit: 25 });

function setup(path, handlers = {}) {
  const fetchMock = mockApi({
    'GET /api/platform/auth/me': () => [200, me],
    'GET /api/platform/tenants': (req) => {
      const status = new URL(req.url).searchParams.get('status');
      if (status === 'TRIAL')
        return [
          200,
          page([
            tenant({
              id: 'c'.repeat(24),
              name: 'Green Valley',
              status: 'TRIAL',
              trialEndsAt: new Date(Date.now() + 2 * DAY).toISOString(),
            }),
          ]),
        ];
      if (status === 'PAST_DUE')
        return [
          200,
          page([tenant({ name: 'Riverside', status: 'PAST_DUE', statusReason: 'Invoice unpaid' })]),
        ];
      if (status) return [200, page([])];
      return [200, page([tenant()])];
    },
    ...handlers,
  });
  return { ...renderApp(path, consoleRoutes), fetchMock, user: userEvent.setup() };
}

describe('Platform console', () => {
  it('dashboard shows revenue, hospitals needing attention and trials ending', async () => {
    setup('/', {
      'GET /api/platform/metrics': () => [
        200,
        {
          mrr: 184000000,
          arr: 2208000000,
          tenants: { ACTIVE: 140, TRIAL: 12 },
          paying: 142,
          trials: 12,
          churn30: 1.4,
          arpa: 1295774,
          priceVersion: 3,
        },
      ],
    });
    expect(await screen.findByText('₹18.4 L')).toBeVisible();
    expect(screen.getByText('₹2.21 Cr')).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Riverside' })).toBeVisible();
    expect(screen.getByText('Invoice unpaid')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Green Valley' })).toBeVisible();
    expect(screen.getByText(/2 days left/)).toBeVisible();
  });

  it('lists hospitals and opens one with usage, modules and invoices', async () => {
    const { user, router } = setup('/tenants', {
      [`GET /api/platform/tenants/${ID}`]: () => [
        200,
        {
          ...tenant(),
          detail: {
            planName: 'Hospital',
            cycle: 'MONTHLY',
            converted: true,
            limits: { users: 100, branches: 3, beds: 150 },
            usage: { users: 95, branches: 1, beds: 60 },
            modules: [{ code: 'OPD', name: 'Out-patients', status: 'ACTIVE' }],
            currentPeriod: {},
            pending: [{ op: 'REMOVE', module: 'CRM' }],
            invoices: [invoice()],
          },
        },
      ],
    });
    const table = await screen.findByRole('table', { name: 'Hospitals' });
    await user.click(await within(table).findByText('City Hospital'));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/tenants/${ID}`));
    expect(await screen.findByRole('heading', { name: 'City Hospital' })).toBeVisible();
    const users = screen.getByRole('progressbar', { name: 'Users' });
    expect(users).toHaveAttribute('aria-valuetext', '95 of 100');
    expect(screen.getByText('Out-patients · On')).toBeVisible();
    expect(screen.getByText('PI/26-27/000007')).toBeVisible();
    expect(screen.getByText(/^− /)).toBeVisible();
  });

  it('suspends a hospital with a reason', async () => {
    let sent;
    const { user } = setup(`/tenants/${ID}`, {
      [`GET /api/platform/tenants/${ID}`]: () => [
        200,
        { ...tenant(), detail: { invoices: [], modules: [] } },
      ],
      [`POST /api/platform/tenants/${ID}/status`]: (_req, body) => {
        sent = body;
        return [200, tenant({ status: 'SUSPENDED' })];
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/), 'Fraud check requested');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(sent).toEqual({ action: 'SUSPEND', reason: 'Fraud check requested' }),
    );
  });

  it('records a bank transfer against an overdue invoice', async () => {
    let sent;
    const { user } = setup('/billing', {
      'GET /api/platform/invoices': () => [200, page([invoice()])],
      [`POST /api/platform/invoices/${'b'.repeat(24)}/payments`]: (_req, body) => {
        sent = body;
        return [200, invoice({ status: 'PAID' })];
      },
    });
    expect(await screen.findByText(/Overdue/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Bank reference/), 'UTR12345');
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(sent).toEqual({ reference: 'UTR12345', amount: 4130000 }));
  });
});
