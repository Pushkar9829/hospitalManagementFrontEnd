import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const analytics = (over = {}) => ({
  from: '2026-10-01',
  to: '2026-10-02',
  revenue: {
    bills: 3,
    op: 2,
    ip: 1,
    gross: 900000,
    discount: 60000,
    net: 840000,
    averageDay: 420000,
    previousNet: 700000,
    change: 20,
  },
  collection: {
    collected: 800000,
    refunded: 0,
    efficiency: 95.2,
    daysToCollect: 1.5,
    patientDues: 40000,
  },
  byGroup: [
    { group: 'BED', amount: 500000 },
    { group: 'CONSULTATION', amount: 340000 },
  ],
  byPayer: [
    { payer: 'CASH', amount: 640000 },
    { payer: 'INSURANCE', amount: 200000 },
    { payer: 'CORPORATE', amount: 0 },
    { payer: 'SCHEME', amount: 0 },
  ],
  ageing: [
    { payer: 'PATIENT', d0_30: 40000, d31_60: 0, d61_90: 0, d90: 0, total: 40000 },
    { payer: 'INSURANCE', d0_30: 0, d31_60: 0, d61_90: 0, d90: 120000, total: 120000 },
  ],
  leakage: {
    discount: { amount: 60000, percent: 6.7 },
    cancellations: { count: 1, amount: 50000 },
    refunds: { count: 0, amount: 0 },
    oldDrafts: 2,
    shiftVariance: { shifts: 4, over: 0, total: 3000, threshold: 10000 },
  },
  daily: [
    { date: '2026-10-01', billed: 400000, collected: 380000 },
    { date: '2026-10-02', billed: 440000, collected: 420000 },
  ],
  ...over,
});

describe('Billing analytics', () => {
  it('shows revenue, collection, ageing and leakage for the chosen period', async () => {
    const seen = [];
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'superadmin' })],
      'GET /approvals/count': () => [200, { count: 0 }],
      'GET /billing/analytics': (req) => {
        seen.push(Object.fromEntries(new URL(req.url).searchParams));
        return [200, analytics()];
      },
    });
    const user = userEvent.setup();
    renderApp('/billing/analytics?from=2026-10-01&to=2026-10-02');
    expect(await screen.findByRole('heading', { name: 'Billing analytics' })).toBeVisible();
    expect(await screen.findByText('₹8,400')).toBeVisible();
    expect(screen.getByText('+20% vs the previous 2 days')).toBeVisible();
    expect(screen.getByText('95.2%')).toBeVisible();
    expect(screen.getByText('Room and nursing')).toBeVisible();
    expect(screen.getByText('Insurance and TPA', { selector: 'span' })).toBeVisible();
    const ageing = screen.getByRole('table', { name: 'Receivables by age' });
    expect(within(ageing).getAllByText('₹1,200')[0]).toHaveClass('text-critical');
    const leakage = screen.getByRole('table', { name: 'Leakage checks' });
    const drafts = within(leakage).getByText('Draft bills older than a day').closest('tr');
    expect(within(drafts).getByText('Investigate')).toBeVisible();
    const discount = within(leakage).getByText('Discounts as a share of gross').closest('tr');
    expect(within(discount).getByText('Watch')).toBeVisible();
    expect(seen[0]).toEqual({ from: '2026-10-01', to: '2026-10-02' });

    await user.click(screen.getByRole('button', { name: 'Today' }));
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    await vi.waitFor(() => expect(seen.at(-1)).toEqual({ from: today, to: today }));
  });
});
