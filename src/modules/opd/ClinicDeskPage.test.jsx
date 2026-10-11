import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorBody, makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

const DOCTOR = { id: 'd1', name: 'Dr. Anil Deshpande', department: 'General Medicine', room: '1' };
const patient = (id, name) => ({
  id,
  uhid: `CL-${id}`,
  name,
  age: '29Y',
  gender: 'MALE',
  allergies: [],
});
const visit = (id, token, name, stage) => ({
  id,
  token,
  patient: patient(id, name),
  doctor: DOCTOR,
  visitType: 'NEW',
  stage,
  status: 'OPEN',
  vitals: null,
  complaint: 'Fever with body ache for 3 days',
  fee: { amount: 50000, paid: false },
  history: [],
  vitalsTrend: [],
  procedures: [],
});
const V1 = visit('v1', 'T2', 'Rohan Gupta', 'WITH_DOCTOR');
const V2 = visit('v2', 'T3', 'Asha Kulkarni', 'TRIAGED');
const entry = (v) => ({
  visitId: v.id,
  token: v.token,
  patient: v.patient,
  doctor: DOCTOR,
  visitType: 'NEW',
  stage: v.stage,
});
const BOOKED = {
  visitId: null,
  appointmentId: 'a5',
  token: null,
  patient: patient('p5', 'Lata Shinde'),
  doctor: DOCTOR,
  visitType: 'FOLLOW_UP',
  stage: 'NOT_ARRIVED',
  slotTime: '11:30',
};
const consultation = (id, extra = {}) => ({
  visitId: id,
  status: 'DRAFT',
  complaints: '',
  history: '',
  examination: '',
  diagnoses: [{ code: 'A90', name: 'Dengue fever' }],
  noDiagnosisReason: '',
  rx: [],
  orders: [],
  advice: '',
  followUp: { date: '', note: '' },
  printLanguage: 'en',
  specialty: null,
  addenda: [],
  savedAt: null,
  version: 1,
  checks: { allergy: [], interactions: [], duplicates: [] },
  ...extra,
});
const CHARGES = {
  visitId: 'v1',
  lines: [
    { id: 'c', name: 'Consultation (new visit)', qty: 1, amount: 50000, paid: false },
    { id: 'n', name: 'Dengue NS1 rapid test', qty: 1, amount: 60000, paid: false },
  ],
  total: 110000,
};

function setup(handlers = {}, path = '/clinic') {
  const bodies = {};
  const record = (key, status, json) => (_req, body) => {
    bodies[key] = [...(bodies[key] ?? []), body];
    return [status, typeof json === 'function' ? json(body) : json];
  };
  const fetchMock = mockApi({
    'GET /auth/me': () => [200, makeSession({ panel: 'clinic' })],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    'GET /opd/queue': () => [200, { items: [entry(V1), entry(V2), BOOKED], total: 3, page: 1 }],
    'GET /opd/visits/v1': () => [200, V1],
    'GET /opd/visits/v2': () => [200, V2],
    'GET /opd/visits/v1/consultation': () => [200, consultation('v1')],
    'GET /opd/visits/v2/consultation': () => [200, consultation('v2')],
    'GET /opd/visits/v1/charges': () => [200, CHARGES],
    'GET /opd/templates': () => [200, { items: [], total: 0, page: 1, limit: 100 }],
    'PUT /opd/visits/v1/consultation': record('save', 200, (b) => consultation('v1', b)),
    'POST /opd/visits/v1/complete': record('complete', 200, { visit: V1, next: null }),
    'POST /opd/visits/v1/close': record('close', 200, {
      visit: { ...V1, status: 'CLOSED' },
      receipt: { no: 'RC/26-27/001001', amount: 110000, mode: 'CASH' },
    }),
    'POST /opd/visits/v2/call': record('call', 200, { ...V2, stage: 'WITH_DOCTOR' }),
    ...handlers,
  });
  return { ...renderApp(path), fetchMock, bodies, user: userEvent.setup() };
}

describe('Clinic desk', () => {
  it('bills, takes the payment, closes the visit and calls the next patient', async () => {
    const { user, bodies } = setup({}, '/clinic?step=bill');
    expect(
      await screen.findByRole('heading', { name: 'Rohan Gupta · Token T2' }, { timeout: 20_000 }),
    ).toBeInTheDocument();
    // The bill step saves the consultation first, then reads the charges.
    expect(await screen.findByText('₹1,100')).toBeInTheDocument();
    await waitFor(() => expect(bodies.save).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Next: print and send' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Print receipt' }));
    await user.click(await screen.findByRole('button', { name: 'Finish visit and call T3' }));
    await waitFor(() => expect(bodies.close).toHaveLength(1));
    expect(bodies.complete[0].diagnoses).toEqual([{ code: 'A90', name: 'Dengue fever' }]);
    expect(bodies.close[0]).toEqual({
      mode: 'CASH',
      outputs: ['PRINT_RX', 'WHATSAPP', 'FOLLOW_UP_REMINDER'],
    });
    await waitFor(() => expect(bodies.call).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { name: 'Asha Kulkarni · Token T3' }),
    ).toBeInTheDocument();
  });

  it('goes back to the consultation when the visit has no diagnosis (rule R13)', async () => {
    const { user, bodies, router } = setup(
      {
        'POST /opd/visits/v1/complete': () => [
          422,
          errorBody(
            'NO_DIAGNOSIS',
            'Add at least one diagnosis, or the reason there is none (rule R13).',
          ),
        ],
      },
      '/clinic?step=finish',
    );
    await user.click(
      await screen.findByRole('button', { name: 'Finish visit and call T3' }, { timeout: 20_000 }),
    );
    expect(await screen.findAllByText(/rule R13/)).not.toHaveLength(0);
    expect(bodies.close).toBeUndefined();
    await waitFor(() => expect(router.state.location.search).toContain('step=consult'));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '2 · Consult and prescription' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('checks in a booked patient when picked, then calls them in', async () => {
    let checkIn;
    const { user } = setup({
      'POST /opd/appointments/a5/check-in': (_req, b) => {
        checkIn = b;
        return [200, { visit: { id: 'v2' }, token: { no: 'T5' } }];
      },
    });
    const list = await screen.findByRole('list', { name: 'Today’s patients' }, { timeout: 20_000 });
    await user.click(within(list).getByRole('button', { name: /Lata Shinde/ }));
    await waitFor(() => expect(checkIn).toEqual({ detailsConfirmed: true }));
    expect(await screen.findByText('Lata Shinde checked in, token T5')).toBeInTheDocument();
  });
});
