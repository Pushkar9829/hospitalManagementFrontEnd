import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

const waits = (k = 1) => ({
  period: 'today',
  kpis: {
    visits: 412 * k,
    bookedShare: 68,
    walkInShare: 32,
    medianTotalMin: 64,
    waitToDoctorMin: 27,
    noShowRate: 6.8,
    noShows: 28,
    revenuePerVisit: 128400,
    ipdConversion: 4.4,
    admissions: 18,
  },
  targets: { totalMin: 90, waitToDoctorMin: 30, noShowRate: 8 },
  stages: [
    { stage: 'TRIAGE_DOCTOR', medianMin: 18 },
    { stage: 'CONSULT', medianMin: 11 },
  ],
  arrivalsByHour: [
    { hour: 9, count: 48 },
    { hour: 10, count: 96 },
    { hour: 11, count: 88 },
  ],
});
const doctor = (name, department, extra) => ({
  doctor: { id: name, name, department, room: '1' },
  booked: 24,
  seen: 19,
  noShow: 2,
  lateStartMin: 0,
  medianWaitMin: 19,
  medianConsultMin: 9,
  utilisation: 88,
  testsPerVisit: 1.2,
  revenue: 3960000,
  ...extra,
});
const DOCTORS = [
  doctor('Dr. Meera Iyer', 'Cardiology'),
  doctor('Dr. P. Joshi', 'Orthopaedics', { lateStartMin: 30, medianWaitMin: 41 }),
];

function setup({ noArrivals = false } = {}) {
  const seen = [];
  const fetchMock = mockApi({
    'GET /auth/me': () => [200, makeSession()],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    'GET /opd/departments': () => [
      200,
      { items: [{ id: 'Cardiology', name: 'Cardiology' }], total: 1, page: 1, limit: 100 },
    ],
    'GET /reports/opd-wait-times': (req) => {
      const q = new URL(req.url).searchParams;
      seen.push(Object.fromEntries(q));
      const w = waits(q.get('period') === 'week' ? 6 : 1);
      return [200, noArrivals ? { ...w, arrivalsByHour: [] } : w];
    },
    'GET /reports/opd-doctor-performance': (req) => {
      const dep = new URL(req.url).searchParams.get('department');
      const items = DOCTORS.filter((d) => !dep || d.doctor.department === dep);
      return [200, { items, total: items.length, page: 1, limit: 100 }];
    },
  });
  return { ...renderApp('/opd/analytics'), fetchMock, seen, user: userEvent.setup() };
}

describe('OPD analytics', () => {
  it('shows the KPIs against their targets, the stages and the peak hour', async () => {
    setup();
    expect(await screen.findByText('Visits today')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('NABH target 30 min')).toBeInTheDocument();
    expect(screen.getByText('₹1,284')).toBeInTheDocument();
    expect(screen.getByText('Triage to doctor')).toBeInTheDocument();
    expect(screen.getByText('Peak 10:00 to 11:00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '11:00 to 11:59 · 88 arrivals' }),
    ).toBeInTheDocument();
  });

  it('says so when nobody has checked in yet instead of failing', async () => {
    setup({ noArrivals: true });
    expect(
      await screen.findByText('No patient has checked in in this period yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
  });

  it('marks a late start and a wait over target in words, not only colour', async () => {
    setup();
    const row = (await screen.findByRole('rowheader', { name: /Dr. P. Joshi/ })).closest('tr');
    expect(within(row).getByText('30 min late')).toBeInTheDocument();
    expect(within(row).getByText(/over target/)).toBeInTheDocument();
    const ok = screen.getByRole('rowheader', { name: /Dr. Meera Iyer/ }).closest('tr');
    expect(within(ok).getByText('On time')).toBeInTheDocument();
  });

  it('keeps the period and the department in the URL and refetches', async () => {
    const { user, router, seen } = setup();
    await user.click(await screen.findByRole('button', { name: 'This week' }));
    expect(await screen.findByText('Visits this week')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.selectOptions(screen.getByLabelText('Department'), 'Cardiology');
    await waitFor(() => expect(seen.at(-1)).toEqual({ period: 'week', department: 'Cardiology' }));
    expect(router.state.location.search).toContain('period=week');
    await waitFor(() =>
      expect(screen.queryByRole('rowheader', { name: /Dr. P. Joshi/ })).not.toBeInTheDocument(),
    );
  });
});
