import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const PID = 'e'.repeat(24);
const patient = {
  id: PID,
  uhid: 'CC0000124',
  status: 'ACTIVE',
  name: { first: 'Ravi', last: 'Kumar', full: 'Ravi Kumar' },
  gender: 'M',
  age: '47Y',
  mobile: '9876543210',
  category: 'GENERAL',
  allergies: [],
  ids: [],
  documents: [],
  toComplete: [],
  version: 0,
};
const list = (items) => [200, { items, total: items.length, page: 1, limit: 25 }];

function setup(path) {
  mockApi({
    'GET /auth/me': () => [200, makeSession({ panel: 'superadmin' })],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    [`GET /patients/${PID}`]: () => [200, patient],
    [`GET /patients/${PID}/timeline`]: () => [200, { items: [] }],
    [`GET /patients/${PID}/summary`]: () => [
      200,
      {
        conditions: ['Essential (primary) hypertension'],
        activeMedicines: 2,
        opdVisits: 3,
        ipdStays: 1,
        outstanding: 2_200_00,
        wallet: 1_500_00,
        admission: { ipNo: 'IP/26-27/000871', bed: 'W2-204-B' },
        membership: 'Family Gold',
      },
    ],
    [`GET /patients/${PID}/reports`]: () =>
      list([
        {
          id: 'r1',
          date: '2026-10-09T05:10:00.000Z',
          name: 'Lipid profile',
          kind: 'LAB',
          status: 'RELEASED',
          flag: 'HIGH',
          flagText: 'LDL 168 mg/dL',
        },
        {
          id: 'r2',
          date: '2026-10-09T08:00:00.000Z',
          name: '2D Echo',
          kind: 'RAD',
          status: 'SCHEDULED',
          flag: null,
        },
      ]),
    [`GET /patients/${PID}/prescriptions`]: () =>
      list([
        {
          id: 'm1',
          medicine: 'Amlodipine 10 mg',
          dose: '1 tab · OD',
          since: '2026-10-09',
          until: '2026-11-08',
          by: 'Dr. Meera Iyer',
        },
      ]),
  });
  return renderApp(path);
}

describe('Patient record sections', () => {
  it('shows the summary and the reports with their flags', async () => {
    setup(`/patients/${PID}?tab=reports`);
    expect(await screen.findByText('Diagnosed: Essential (primary) hypertension')).toBeVisible();
    expect(screen.getByText('In now: IP/26-27/000871 · W2-204-B')).toBeVisible();
    const table = await screen.findByRole('table', { name: 'Reports' });
    expect(within(table).getByText('High · LDL 168 mg/dL')).toBeVisible();
    expect(within(table).getByText('In progress')).toBeVisible();
    expect(within(table).getByText('Imaging')).toBeVisible();
  });

  it('lists current medicines', async () => {
    setup(`/patients/${PID}?tab=medicines`);
    const table = await screen.findByRole('table', { name: 'Medicines' });
    expect(within(table).getByText('Amlodipine 10 mg')).toBeVisible();
    expect(within(table).getByText('Dr. Meera Iyer')).toBeVisible();
  });
});
