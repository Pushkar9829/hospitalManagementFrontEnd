import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const VID = 'e'.repeat(24);
const visit = (over = {}) => ({
  id: VID,
  visitNo: 'HV/26-27/000004',
  patient: { id: 'p1', uhid: 'CC0000123', name: 'Kiran Sharma' },
  address: '12 Lake Road, Baner, Pune',
  phone: '9876543210',
  date: '2026-10-11',
  slot: '07:00-08:00',
  orderNo: 'LO/26-27/000010',
  tests: ['Complete blood count', 'Kidney function test'],
  phlebotomist: { userId: 'u1', name: 'Test User' },
  status: 'ASSIGNED',
  sampleNos: [],
  payment: 'OK',
  version: 0,
  ...over,
});

describe('Home visits', () => {
  it('lets the phlebotomist start the visit and collect after the UHID scan', async () => {
    const calls = [];
    let current = visit();
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'phlebotomist', modules: ['LAB'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /lab/home-visits': (req) => {
        calls.push(Object.fromEntries(new URL(req.url).searchParams));
        return [200, { items: [current] }];
      },
      [`POST /lab/home-visits/${VID}/start`]: (_req, body) => {
        calls.push({ start: body });
        current = visit({ status: 'ON_THE_WAY', version: 1 });
        return [200, current];
      },
      [`POST /lab/home-visits/${VID}/collect`]: (_req, body) => {
        calls.push({ collect: body });
        current = visit({ status: 'COLLECTED', version: 2, sampleNos: ['LB-26-000101'] });
        return [
          200,
          {
            visit: current,
            labels: [
              {
                sampleNo: 'LB-26-000101',
                sampleType: 'Blood',
                container: 'EDTA (lavender)',
                tests: ['CBC'],
              },
            ],
          },
        ];
      },
    });
    const user = userEvent.setup();
    renderApp('/lab/home-visits');
    expect(await screen.findByRole('heading', { name: 'My home visits' })).toBeVisible();
    expect(await screen.findByText('12 Lake Road, Baner, Pune')).toBeVisible();
    expect(calls[0]).toMatchObject({ mine: 'true' });
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:9876543210');

    await user.click(screen.getByRole('button', { name: 'Start visit' }));
    await waitFor(() => expect(calls).toContainEqual({ start: { version: 0 } }));
    expect(await screen.findByText('On the way')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collect samples' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/UHID/), 'CC0000123');
    await user.click(within(dialog).getByRole('button', { name: 'Collect samples' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ collect: { version: 1, scan: 'CC0000123' } }),
    );
    expect(await screen.findByText(/LB-26-000101 · EDTA \(lavender\) · CBC/)).toBeVisible();
  });

  it('holds collection while the bill is unpaid', async () => {
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'phlebotomist', modules: ['LAB'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /lab/home-visits': () => [200, { items: [visit({ payment: 'UNPAID' })] }],
    });
    renderApp('/lab/home-visits');
    expect(await screen.findByText('Collection waits for the bill to be paid.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collect samples' })).toBeDisabled();
  });
});
