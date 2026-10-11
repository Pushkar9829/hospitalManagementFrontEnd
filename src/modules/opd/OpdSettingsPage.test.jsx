import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';
import { checkWeek } from './opdSettings.js';

const DOCTOR = { id: 'd1', name: 'Dr. Meera Iyer', department: 'Cardiology', room: '4' };
const session = (start, end, extra = {}) => ({
  start,
  end,
  room: '4',
  slotNew: 10,
  slotFollowUp: 5,
  max: 18,
  overbook: 2,
  online: true,
  tele: false,
  ...extra,
});
const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => ({
  day,
  sessions: day === 'SUN' ? [] : [session('10:00', '13:00')],
}));
const SCHEDULE = {
  doctorId: 'd1',
  doctor: DOCTOR,
  sessionsPerWeek: 6,
  week: WEEK,
  fees: { NEW: 80000, FOLLOW_UP: 50000, TELE: 60000 },
  followUp: { days: 15, visits: 1 },
  pendingFeeChange: null,
};
const SETTINGS = {
  booking: {
    bookAheadDays: 30,
    latestBeforeMin: 60,
    holdMin: 5,
    maxFuturePerDoctor: 2,
    walkInEvery: 3,
    lateGraceMin: 15,
    prepayOnline: 'OPTIONAL',
    triageRequired: ['Cardiology'],
  },
  cancellation: {
    freeUntilHours: 4,
    keepPercent: 50,
    noShowAfterMin: 30,
    noShowRefund: 'CREDIT',
    prepayAfterNoShows: 3,
    prepayWindowDays: 90,
    hospitalChange: 'FULL_REFUND_OR_FREE_RESCHEDULE',
  },
  pending: null,
};
const list = (items) => ({ items, total: items.length, page: 1, limit: 100 });

function setup(handlers = {}, { path = '/settings/opd', permissions } = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': () => [200, makeSession(permissions ? { permissions } : {})],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    'GET /opd/schedules': () => [200, list([SCHEDULE])],
    'GET /opd/schedules/d1': () => [200, SCHEDULE],
    'GET /opd/settings': () => [200, SETTINGS],
    'GET /opd/departments': () => [
      200,
      list([
        { id: 'Cardiology', name: 'Cardiology' },
        { id: 'Paediatrics', name: 'Paediatrics' },
      ]),
    ],
    ...handlers,
  });
  return { ...renderApp(path), fetchMock, user: userEvent.setup() };
}

describe('checkWeek', () => {
  it('flags a session that ends before it starts, overlaps, and short slots', () => {
    const errors = checkWeek([
      {
        day: 'MON',
        sessions: [
          session('10:00', '13:00'),
          session('12:00', '14:00'),
          session('15:00', '14:00'),
          session('17:00', '19:00', { slotNew: 3 }),
        ],
      },
    ]);
    expect(errors).toEqual({
      'MON.1': { time: 'opd.cfg.errors.overlap' },
      'MON.2': { time: 'opd.cfg.errors.time' },
      'MON.3': { slot: 'opd.cfg.errors.slot' },
    });
  });
});

describe('OPD settings', () => {
  it('saves a fee change for approval and says what waits', async () => {
    let body;
    const { user } = setup({
      'PUT /opd/schedules/d1': (_req, b) => {
        body = b;
        return [202, { ...SCHEDULE, approvalId: 'apr-1', pendingFeeChange: { fees: b.fees } }];
      },
    });
    // The first test in the file also waits for the page's lazy chunk.
    const fee = await screen.findByLabelText('Fee, new visit (₹)', {}, { timeout: 20_000 });
    expect(fee).toHaveValue('800');
    await user.clear(fee);
    await user.type(fee, '900');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(body?.fees).toEqual({ NEW: 90000, FOLLOW_UP: 50000, TELE: 60000 }));
    expect(body.week).toHaveLength(7);
    expect(
      await screen.findByText(
        /Fee change waiting for Super Admin approval: Fee, new visit \(₹\) ₹900\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View request/ })).toHaveAttribute(
      'href',
      '/approvals?box=mine&id=apr-1',
    );
  });

  it('adds a session and stops an overlapping one before saving', async () => {
    const { user, fetchMock } = setup();
    await user.click(await screen.findByRole('button', { name: 'Add session on Monday' }));
    const start = screen.getByLabelText('Start, Monday 17:00');
    await user.clear(start);
    await user.type(start, '12:00');
    await user.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(
      await screen.findByText('This session overlaps another on the same day.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([r]) => r.method === 'PUT')).toBe(false);
  });

  it('checks booking rule ranges and saves the triage departments', async () => {
    let body;
    const { user } = setup(
      {
        'PUT /opd/settings': (_req, b) => {
          body = b;
          return [200, { ...SETTINGS, booking: b.booking }];
        },
      },
      { path: '/settings/opd?tab=booking' },
    );
    const ahead = await screen.findByLabelText('Book ahead up to');
    await user.clear(ahead);
    await user.type(ahead, '400');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This value is out of range.')).toBeInTheDocument();
    await user.clear(ahead);
    await user.type(ahead, '45');
    await user.click(screen.getByRole('checkbox', { name: 'Paediatrics' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(body?.booking).toMatchObject({
        bookAheadDays: 45,
        triageRequired: ['Cardiology', 'Paediatrics'],
      }),
    );
  });

  it('sends cancellation rules for approval', async () => {
    const { user } = setup(
      {
        'PUT /opd/settings': () => [202, { ...SETTINGS, approvalId: 'apr-2' }],
      },
      { path: '/settings/opd?tab=cancellation' },
    );
    await user.click(await screen.findByRole('button', { name: 'Save (needs approval)' }));
    const notice = await screen.findByText('Sent for approval.');
    expect(
      within(notice.closest('[data-tone]') ?? document.body).getByRole('link'),
    ).toHaveAttribute('href', '/approvals?box=mine&id=apr-2');
  });

  it('shows the schedule read-only without the right to change schedules', async () => {
    setup({}, { permissions: ['opd:schedule:read', 'opd:settings:*'] });
    expect(await screen.findByLabelText('Fee, new visit (₹)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save schedule' })).not.toBeInTheDocument();
  });
});
