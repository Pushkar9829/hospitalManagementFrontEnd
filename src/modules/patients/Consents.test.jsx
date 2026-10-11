import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const PID = 'd'.repeat(24);
const patient = {
  id: PID,
  uhid: 'CC0000123',
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

describe('Patient consents', () => {
  it('shows consents with validity and withdraws one with a reason', async () => {
    let withdrawn;
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'superadmin' })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      [`GET /patients/${PID}`]: () => [200, patient],
      [`GET /patients/${PID}/timeline`]: () => [200, { items: [] }],
      [`GET /patients/${PID}/consents`]: () => [
        200,
        {
          items: [
            {
              id: 'c1',
              type: 'WHATSAPP',
              channel: 'REGISTRATION_FORM',
              givenAt: '2026-06-02T05:00:00.000Z',
              validUntil: null,
              status: withdrawn ? 'WITHDRAWN' : 'ACTIVE',
              version: 0,
            },
            {
              id: 'c2',
              type: 'ADMISSION',
              channel: 'TABLET_SIGNATURE',
              givenAt: '2026-01-02T05:00:00.000Z',
              validUntil: '2026-01-10',
              scope: 'IP/25-26/000871',
              status: 'EXPIRED',
              version: 0,
            },
          ],
        },
      ],
      [`POST /patients/${PID}/consents/c1/withdraw`]: (_req, body) => {
        withdrawn = body;
        return [200, { id: 'c1', status: 'WITHDRAWN' }];
      },
    });
    const user = userEvent.setup();
    renderApp(`/patients/${PID}?tab=consents`);
    const table = await screen.findByRole('table', { name: 'Consents' });
    const wa = (await within(table).findByText('WhatsApp messages')).closest('tr');
    expect(within(wa).getByText('Until withdrawn')).toBeVisible();
    expect(
      within(within(table).getByText('Admission').closest('tr')).getByText('Expired'),
    ).toBeVisible();
    await user.click(within(wa).getByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/), 'Asked on the phone');
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(withdrawn).toEqual({ version: 0, reason: 'Asked on the phone' }));
    expect(await within(table).findByText('Withdrawn')).toBeVisible();
  });
});
