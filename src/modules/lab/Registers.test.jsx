import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const LOT = 'a'.repeat(24);
const CASE = 'b'.repeat(24);
const session = () => [200, makeSession({ panel: 'superadmin', modules: ['LAB'] })];

describe('Lab registers', () => {
  it('lists QC lots with their expiry and adds a lot', async () => {
    const calls = [];
    const items = [
      {
        id: LOT,
        lotNo: 'L1-2604',
        material: 'Bio-Rad Multiqual',
        level: 'L1',
        expiresOn: '2020-01-31',
        active: true,
        version: 0,
      },
    ];
    mockApi({
      'GET /auth/me': session,
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /lab/qc/lots': () => [200, { items }],
      'POST /lab/qc/lots': (_req, body) => {
        calls.push(body);
        items.push({ ...body, id: 'c'.repeat(24), version: 0 });
        return [201, items.at(-1)];
      },
    });
    const user = userEvent.setup();
    renderApp('/lab/qc?tab=lots');
    const table = await screen.findByRole('table', { name: 'QC lots' });
    expect(within(table).getByText('L1-2604')).toBeVisible();
    expect(within(table).getByText('Expired')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Lot/), 'L2-2611');
    await user.type(within(dialog).getByLabelText(/^Material/), 'Liquichek');
    await user.type(within(dialog).getByLabelText(/^Expires/), '2030-11-30');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      lotNo: 'L2-2611',
      material: 'Liquichek',
      expiresOn: '2030-11-30',
      active: true,
    });
  });

  it('issues histology blocks from the archive', async () => {
    const calls = [];
    mockApi({
      'GET /auth/me': session,
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /lab/histo/archive': () => [
        200,
        {
          items: [
            {
              id: CASE,
              caseNo: 'HP/26-27/000003',
              patient: 'Meena',
              blocks: 3,
              slides: 6,
              location: 'Cabinet 3, drawer 12',
              issuedTo: null,
            },
          ],
        },
      ],
      [`POST /lab/histo/archive/${CASE}/issue`]: (_req, body) => {
        calls.push(body);
        return [200, { issuedTo: body.to }];
      },
    });
    const user = userEvent.setup();
    renderApp('/lab/histo?tab=archive');
    const table = await screen.findByRole('table', { name: 'Blocks and slides archive' });
    expect(within(table).getByText('Cabinet 3, drawer 12')).toBeVisible();
    await user.click(within(table).getByRole('button', { name: 'Issue' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Issued to/), 'Tata Memorial');
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));
    await waitFor(() => expect(calls).toEqual([{ to: 'Tata Memorial' }]));
  });

  it('shows infection alerts in microbiology', async () => {
    mockApi({
      'GET /auth/me': session,
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /lab/micro/alerts': () => [
        200,
        {
          items: [
            {
              id: 'x',
              alert: 'MRSA',
              patient: 'Mohan',
              location: 'Ward 3',
              specimen: 'Pus',
              organism: 'Staphylococcus aureus',
              at: '2026-10-10T08:00:00.000Z',
              final: true,
            },
          ],
        },
      ],
    });
    renderApp('/lab/micro?tab=alerts');
    const table = await screen.findByRole('table', { name: 'Infection alerts' });
    expect(within(table).getByText('MRSA')).toBeVisible();
    expect(within(table).getByText('Staphylococcus aureus')).toBeVisible();
  });
});
