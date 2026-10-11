import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const rec = (id, ipNo, blockedBy = null) => ({
  id,
  ipNo,
  patient: { id: `p${id}`, name: `Patient ${ipNo}`, uhid: `CC${id}` },
  retainUntil: '2020-01-01',
  status: 'CLOSED',
  mlc: blockedBy === 'MLC',
  legalHold: blockedBy === 'LEGAL_HOLD' ? { reason: 'Court case' } : null,
  blockedBy,
  checklist: [],
});

describe('MRD retention', () => {
  it('lets only destroyable records be picked and sends the batch for approval', async () => {
    const calls = [];
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'mrd', modules: ['IPD', 'MRD'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /mrd/records': () => [200, { items: [], total: 0, page: 1, limit: 25 }],
      'GET /mrd/deficiencies': () => [200, { items: [] }],
      'GET /mrd/retention-due': () => [
        200,
        { items: [rec('1', 'IP/1'), rec('2', 'IP/2', 'MLC'), rec('3', 'IP/3', 'LEGAL_HOLD')] },
      ],
      'GET /mrd/destructions': () => [200, { items: [] }],
      'POST /mrd/destructions': (_req, body) => {
        calls.push(body);
        return [
          202,
          {
            id: 'b1',
            batchNo: 'MDB/26-27/000001',
            status: 'PENDING_APPROVAL',
            approvalId: 'a'.repeat(24),
            items: [],
          },
        ];
      },
    });
    const user = userEvent.setup();
    renderApp('/records?tab=retention');
    const table = await screen.findByRole('table', { name: 'Past retention' });
    expect(within(table).getByRole('checkbox', { name: 'Pick IP/2' })).toBeDisabled();
    expect(within(table).getByRole('checkbox', { name: 'Pick IP/3' })).toBeDisabled();
    expect(within(table).getByText('MLC: keep')).toBeVisible();
    await user.click(within(table).getByRole('checkbox', { name: 'Pick IP/1' }));
    await user.click(screen.getByRole('button', { name: 'Propose destruction (1)' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      recordIds: ['1'],
      method: 'SHREDDING',
      reason: 'Retention period over',
    });
    expect(await screen.findByText('Batch MDB/26-27/000001 sent for approval')).toBeVisible();
  });
});
