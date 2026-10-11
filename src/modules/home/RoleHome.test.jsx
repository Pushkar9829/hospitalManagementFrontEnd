import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const doctorHome = {
  panel: 'doctor',
  widgets: [
    {
      id: 'opd.myToday',
      kind: 'kpi',
      value: 18,
      format: 'count',
      params: { seen: 7, waiting: 3 },
      link: '/opd/visits/next',
    },
    {
      id: 'ipd.myPatients',
      kind: 'kpi',
      value: 4,
      format: 'count',
      params: { icu: 1 },
      tone: 'warning',
    },
    {
      id: 'opd.myQueue',
      kind: 'list',
      link: '/opd/visits/next',
      columns: [
        { key: 'token', kind: 'id' },
        { key: 'patient', kind: 'text' },
        { key: 'waited', kind: 'minutes' },
        { key: 'status', kind: 'status' },
      ],
      rows: [
        {
          id: 'v1',
          token: 'T-07',
          patient: 'Ravi Kumar',
          waited: 14,
          status: { code: 'WITH_DOCTOR', tone: 'accent' },
        },
      ],
    },
    {
      id: 'lab.critical',
      kind: 'alerts',
      items: [
        {
          type: 'critical',
          tone: 'critical',
          params: { patient: 'N. Iyer', test: 'Troponin I', value: '2.4', location: 'W2-203' },
        },
      ],
    },
  ],
};

describe('Role home', () => {
  it('shows the doctor their numbers, queue, critical results and quick actions', async () => {
    const seen = [];
    mockApi({
      'GET /auth/me': () => [
        200,
        makeSession({ panel: 'doctor', name: 'Dr. Meera Iyer', modules: ['OPD', 'IPD', 'LAB'] }),
      ],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /home': (req) => {
        seen.push(new URL(req.url).searchParams.get('panel'));
        return [200, doctorHome];
      },
    });
    renderApp('/home');
    expect(await screen.findByRole('heading', { name: /Meera/ })).toBeVisible();
    expect(screen.getByText(/Your OPD, in-patients and pending sign-offs/)).toBeVisible();
    expect(await screen.findByText('7 seen, 3 waiting')).toBeVisible();
    expect(screen.getByText('1 in intensive care')).toBeVisible();
    const queue = screen.getByRole('table', { name: 'Your OPD queue' });
    expect(within(queue).getByText('T-07')).toBeVisible();
    expect(within(queue).getByText('In consult')).toBeVisible();
    expect(within(queue).getByText('14 min')).toBeVisible();
    expect(screen.getByText('N. Iyer: Troponin I 2.4 W2-203')).toBeVisible();
    const quick = screen.getByRole('navigation', { name: 'Quick actions' });
    expect(within(quick).getByRole('link', { name: 'Start OPD' })).toHaveAttribute(
      'href',
      '/opd/visits/next',
    );
    expect(seen).toEqual(['doctor']);
  });

  it('says when the cashier has no shift open', async () => {
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'cashier', name: 'Neha Shah' })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /home': () => [
        200,
        {
          panel: 'cashier',
          widgets: [
            {
              id: 'bill.myShift',
              kind: 'kpi',
              value: null,
              format: 'money',
              params: { context: 'closed' },
            },
          ],
        },
      ],
    });
    renderApp('/home');
    expect(await screen.findByText('No shift open')).toBeVisible();
    expect(screen.getByText('Collected this shift')).toBeVisible();
  });
});
