import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const OPENING = 'a'.repeat(24);
const CAND = 'b'.repeat(24);
const APR = 'c'.repeat(24);

const hrBase = {
  'GET /auth/me': () => [200, makeSession({ panel: 'hr', modules: ['HRM', 'PAY'] })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /hr/employees': () => [200, { items: [], total: 0 }],
  'GET /hr/leave-requests': () => [200, { items: [], total: 0 }],
  'GET /hr/credential-alerts': () => [200, { items: [] }],
};

describe('HR talent screens', () => {
  it('moves an interviewed candidate to an offer', async () => {
    const calls = [];
    mockApi({
      ...hrBase,
      'GET /hr/openings': () => [
        200,
        {
          items: [
            {
              id: OPENING,
              title: 'Staff nurse',
              department: 'Nursing',
              positions: 2,
              status: 'OPEN',
              version: 0,
              pipeline: {
                APPLIED: 0,
                SCREENED: 0,
                INTERVIEW: 1,
                OFFERED: 0,
                JOINED: 0,
                REJECTED: 0,
              },
            },
          ],
        },
      ],
      [`GET /hr/openings/${OPENING}/candidates`]: () => [
        200,
        {
          items: [
            {
              id: CAND,
              name: 'Priya Menon',
              mobile: '9876543210',
              stage: 'INTERVIEW',
              interviews: [{ rating: 4 }],
              version: 2,
            },
          ],
        },
      ],
      [`POST /hr/candidates/${CAND}/move`]: (_req, body) => {
        calls.push(body);
        return [200, { id: CAND, stage: 'OFFERED' }];
      },
    });
    const user = userEvent.setup();
    renderApp('/hr?tab=recruitment');
    const table = await screen.findByRole('table', { name: 'Candidates for Staff nurse' });
    expect(within(table).getByText('Priya Menon')).toBeVisible();
    await user.click(within(table).getByRole('button', { name: 'Make offer' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Annual CTC/), '360000');
    await user.click(within(dialog).getByRole('button', { name: 'Make offer' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ version: 2, stage: 'OFFERED', offer: { ctc: 3_60_000_00 } });
  });

  it('shows mandatory training gaps', async () => {
    mockApi({
      ...hrBase,
      'GET /hr/training': () => [200, { items: [] }],
      'GET /hr/training/compliance': () => [
        200,
        {
          topics: [{ topic: 'BLS', compliant: 1, total: 2, percent: 50, validMonths: 24 }],
          gaps: [
            {
              employeeId: 'e2',
              empNo: 'EMP-0002',
              name: 'Bala',
              topic: 'BLS',
              status: 'NEVER',
              lastOn: null,
            },
          ],
        },
      ],
    });
    renderApp('/hr?tab=training');
    const table = await screen.findByRole('table', { name: 'Due or missing' });
    expect(within(table).getByText('Never trained')).toBeVisible();
    expect(screen.getByText('1 of 2 current')).toBeVisible();
  });

  it('lets an employee submit their self review in My Space', async () => {
    const calls = [];
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'employee', modules: ['HRM'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /me/employee': () => [
        200,
        { id: 'e1', empNo: 'EMP-0007', first: 'Bala', name: 'Bala', joinedOn: '2025-04-01' },
      ],
      'GET /hr/leave-requests': () => [200, { items: [] }],
      'GET /me/appraisal': () => [
        200,
        {
          cycle: { id: 'cy', name: 'FY 2026-27', status: 'OPEN', progress: {} },
          appraisal: {
            id: APR,
            status: 'SELF',
            version: 0,
            goals: [
              { title: 'Patient care', weight: 60 },
              { title: 'Teamwork', weight: 40 },
            ],
          },
          team: [],
        },
      ],
      [`POST /me/appraisal/${APR}/self`]: (_req, body) => {
        calls.push(body);
        return [200, { id: APR, status: 'MANAGER' }];
      },
    });
    const user = userEvent.setup();
    renderApp('/me?tab=appraisal');
    await user.selectOptions(await screen.findByLabelText('Rating for Patient care'), '4');
    await user.selectOptions(screen.getByLabelText('Rating for Teamwork'), '3');
    await user.type(screen.getByLabelText('Comments'), 'Handled ICU overflow');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(calls).toEqual([{ version: 0, ratings: [4, 3], comments: 'Handled ICU overflow' }]),
    );
  });
});
