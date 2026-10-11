import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 30_000 });

const page = (items, total = items.length) => ({ items, total, page: 1, limit: 25 });

function setup(path, created) {
  mockApi({
    'GET /auth/me': () => [200, makeSession({ panel: 'superadmin' })],
    'GET /approvals/count': () => [200, { count: 0 }],
    'GET /settings/entities': () => [
      200,
      [{ id: 'e1', name: 'City Hospital Pvt Ltd', gstin: '27AAACC1234A1Z5' }],
    ],
    'GET /branches': () => [200, [{ id: 'b1', code: 'MAIN', name: 'Main' }]],
    'GET /departments': () => [200, page([], 3)],
    'GET /masters/wards': () => [
      200,
      page([{ id: 'w1', code: 'W2', name: 'Ward 2', isActive: true }]),
    ],
    'GET /masters/beds': () => [200, page([], 0)],
    'GET /masters/services': () => [200, page([], 5)],
    'GET /users': () => [200, page([], 4)],
    'POST /masters/beds': (_req, body) => {
      created.push(body);
      return body.code === 'W2-201A'
        ? [409, { error: { code: 'DUPLICATE', message: 'exists' } }]
        : [201, { id: body.code, ...body }];
    },
  });
  return { ...renderApp(path), user: userEvent.setup() };
}

describe('Setup wizard', () => {
  it('shows each step done or to do, and generates beds in bulk', async () => {
    const created = [];
    const { user } = setup('/setup?step=wards', created);
    expect(await screen.findByRole('heading', { name: 'Set up the hospital' })).toBeVisible();
    const steps = screen.getByRole('navigation', { name: 'Setup steps' });
    expect(await within(steps).findByText('1 branch')).toBeVisible();
    expect(within(steps).getByText('5 services with rates')).toBeVisible();
    expect(within(steps).getByRole('button', { name: /Wards and beds/ })).toHaveAttribute(
      'aria-current',
      'step',
    );

    await user.selectOptions(screen.getByLabelText('Ward'), 'W2');
    await user.type(screen.getByLabelText('First room number'), '201');
    await user.type(screen.getByLabelText('Last room number'), '202');
    expect(screen.getByText('4 beds: W2-201A, W2-201B, W2-202A, W2-202B')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create beds' }));
    await waitFor(() => expect(created).toHaveLength(4));
    expect(created[1]).toEqual({ code: 'W2-201B', name: 'W2-201B', wardCode: 'W2', room: '201' });
    expect(await screen.findByText('3 beds created')).toBeVisible();
    expect(screen.getByText('1 already existed and were skipped.')).toBeVisible();
  });

  it('says the hospital is ready when every required step is done', async () => {
    setup('/setup?step=golive', []);
    expect(
      await screen.findByText('Every required step is done. The hospital is ready to go live.'),
    ).toBeVisible();
  });
});
