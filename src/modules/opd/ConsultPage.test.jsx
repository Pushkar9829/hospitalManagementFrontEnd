import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorBody, makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

const PATIENT = {
  id: 'p1',
  uhid: 'CC0000123',
  name: 'Ravi Kumar',
  age: '47Y',
  gender: 'MALE',
  mobile: '9820012345',
  allergies: ['Penicillin'],
};
const DOCTOR = { id: 'd1', name: 'Dr. Meera Iyer', department: 'Cardiology', room: '4' };

const VISIT = {
  id: 'v1',
  visitNo: 'OP/26-27/000101',
  token: 'T-07',
  date: '2026-10-10',
  patient: PATIENT,
  doctor: DOCTOR,
  visitType: 'FOLLOW_UP',
  stage: 'WITH_DOCTOR',
  status: 'TRIAGE_DONE',
  priority: 'AMBER',
  complaint: 'Chest tightness on climbing stairs',
  vitals: { bp: '148/92', pulse: 84, spo2: 97, weightKg: 78, bmi: 26.4 },
  procedures: [],
  history: [
    {
      id: 'h1',
      date: '2026-09-25T05:30:00.000Z',
      kind: 'LAB',
      title: 'Lipid profile',
      note: 'LDL 168 mg/dL, high',
    },
  ],
  vitalsTrend: [],
  triageRequired: true,
};

const queueEntry = (v, stage) => ({
  visitId: v.id,
  token: v.token,
  patient: v.patient,
  doctor: v.doctor,
  visitType: v.visitType,
  stage,
  priority: v.priority,
  waitedMin: 12,
});

const NEXT = {
  ...VISIT,
  id: 'v2',
  token: 'T-08',
  patient: { ...PATIENT, id: 'p2', name: 'Divya Rao', allergies: [] },
};

const noChecks = { allergy: [], interactions: [], duplicates: [] };
const draft = (extra = {}) => ({
  visitId: 'v1',
  status: 'DRAFT',
  complaints: VISIT.complaint,
  history: '',
  examination: '',
  diagnoses: [],
  noDiagnosisReason: '',
  rx: [],
  orders: [],
  advice: '',
  followUp: { date: '', note: '' },
  printLanguage: 'en',
  specialty: null,
  certificate: null,
  addenda: [],
  savedAt: null,
  version: 1,
  checks: noChecks,
  ...extra,
});

function setup(handlers = {}, { path = '/opd/visits/v1', panel = 'doctor' } = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': () => [200, makeSession({ panel })],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    'GET /opd/queue': () => [
      200,
      { items: [queueEntry(VISIT, 'WITH_DOCTOR'), queueEntry(NEXT, 'TRIAGED')], total: 2, page: 1 },
    ],
    'GET /opd/visits/v1': () => [200, VISIT],
    'GET /opd/visits/v1/consultation': () => [200, draft()],
    'GET /opd/templates': () => [200, { items: [], total: 0, page: 1, limit: 100 }],
    ...handlers,
  });
  return { ...renderApp(path), fetchMock, user: userEvent.setup() };
}

const calls = (fetchMock, method, path) =>
  fetchMock.mock.calls.filter(
    ([req]) => req.method === method && new URL(req.url).pathname === `/api/v1${path}`,
  );

describe('Consultation', () => {
  it('opens the first patient from /opd/visits/next with vitals, allergy and history', async () => {
    setup({}, { path: '/opd/visits/next' });
    expect(
      await screen.findByRole('heading', { name: 'Consultation · Ravi Kumar', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('148/92')).toBeInTheDocument();
    expect(screen.getByText(/Penicillin/)).toBeInTheDocument();
    expect(screen.getByText('LDL 168 mg/dL, high')).toBeInTheDocument();
    const queue = screen.getByRole('list', { name: 'My queue' });
    expect(within(queue).getByRole('button', { name: /Ravi Kumar/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('auto-saves the notes', async () => {
    let saved;
    const { user } = setup({
      'PUT /opd/visits/v1/consultation': (_req, body) => {
        saved = body;
        return [200, draft({ ...body, savedAt: new Date().toISOString() })];
      },
    });
    await user.type(await screen.findByLabelText('Examination'), 'Chest clear');
    await waitFor(() => expect(saved?.examination).toBe('Chest clear'), { timeout: 5000 });
    expect(await screen.findByText(/^Auto-saved/)).toBeInTheDocument();
  });

  it('adds a medicine from the formulary and shows the allergy warning the save returns', async () => {
    let saved;
    const MOX = {
      id: 'mox500',
      brand: 'Mox 500 mg cap',
      generic: 'Amoxicillin',
      form: 'Capsule',
      allergyGroup: 'PENICILLIN',
    };
    const { user } = setup(
      {
        'GET /opd/formulary': () => [200, { items: [MOX], total: 1, page: 1, limit: 10 }],
        'PUT /opd/visits/v1/consultation': (_req, body) => {
          saved = body;
          return [
            200,
            draft({
              ...body,
              savedAt: new Date().toISOString(),
              checks: { ...noChecks, allergy: [{ drug: MOX.brand, allergy: 'PENICILLIN' }] },
            }),
          ];
        },
      },
      { path: '/opd/visits/v1?tab=rx' },
    );
    await user.type(await screen.findByLabelText('Add medicine'), 'amox');
    await user.click(await screen.findByRole('button', { name: /Mox 500 mg cap/ }));
    await waitFor(() => expect(saved?.rx).toHaveLength(1), { timeout: 5000 });
    expect(saved.rx[0]).toMatchObject({ drugId: 'mox500', dose: '1 cap', route: 'Oral', days: 5 });
    expect(
      await screen.findByText('Mox 500 mg cap: the patient is allergic (PENICILLIN).'),
    ).toBeInTheDocument();
  });

  it('explains rule R13 when the visit has no diagnosis, then signs and offers the next patient', async () => {
    let attempt = 0;
    const { user, fetchMock } = setup({
      'POST /opd/visits/v1/complete': () => {
        attempt += 1;
        return attempt === 1
          ? [
              422,
              errorBody(
                'NO_DIAGNOSIS',
                'Add at least one diagnosis, or the reason there is none (rule R13).',
              ),
            ]
          : [
              200,
              {
                visit: VISIT,
                consultation: draft({ status: 'SIGNED' }),
                followUp: null,
                next: null,
              },
            ];
      },
      'POST /opd/visits/v2/call': () => [200, { ...NEXT, stage: 'WITH_DOCTOR' }],
      'GET /opd/visits/v2': () => [200, NEXT],
      'GET /opd/visits/v2/consultation': () => [200, draft({ visitId: 'v2' })],
    });

    await user.click(await screen.findByRole('button', { name: 'Sign and complete visit' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sign and complete visit' }));
    expect(await screen.findAllByText(/rule R13/)).not.toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Signed: the consultation reloads as read-only.
    fetchMock.mockClear();
    mockApiSigned(fetchMock);
    await user.click(screen.getByRole('button', { name: 'Sign and complete visit' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Sign and complete visit',
      }),
    );
    expect(await screen.findByText(/Signed by Dr. Meera Iyer/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next patient T-08' }));
    expect(
      await screen.findByRole('heading', { name: 'Consultation · Divya Rao', level: 1 }),
    ).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/opd/visits/v2/call')).toHaveLength(1);
  });

  it('adds an addendum to a signed consultation instead of editing it', async () => {
    let body;
    const signed = draft({
      status: 'SIGNED',
      signedAt: new Date().toISOString(),
      signedBy: 'Dr. Meera Iyer',
      diagnoses: [{ code: 'I10', name: 'Essential (primary) hypertension' }],
    });
    const { user } = setup({
      'GET /opd/visits/v1/consultation': () => [200, signed],
      'POST /opd/visits/v1/addenda': (_req, b) => {
        body = b;
        return [
          200,
          {
            ...signed,
            addenda: [
              { id: 'a1', text: b.text, by: 'Dr. Meera Iyer', at: new Date().toISOString() },
            ],
          },
        ];
      },
    });
    expect(await screen.findByText('I10 Essential (primary) hypertension')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign and complete visit' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add addendum' }));
    expect(await screen.findByText('Write the addendum.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Addendum'), 'ECG reviewed: normal sinus rhythm.');
    await user.click(screen.getByRole('button', { name: 'Add addendum' }));
    await waitFor(() => expect(body).toEqual({ text: 'ECG reviewed: normal sinus rhythm.' }));
  });
});

/**
 * After the first (failed) attempt the handlers stay the same; the consultation GET is switched
 * to the signed record so the refetch after a successful completion shows it.
 */
function mockApiSigned(fetchMock) {
  const original = fetchMock.getMockImplementation();
  fetchMock.mockImplementation(async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/api/v1/opd/visits/v1/consultation')
      return new Response(
        JSON.stringify(
          draft({
            status: 'SIGNED',
            signedAt: new Date().toISOString(),
            signedBy: 'Dr. Meera Iyer',
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    return original(req);
  });
}
