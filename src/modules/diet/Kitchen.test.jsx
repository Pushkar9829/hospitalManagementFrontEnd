import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const SETTINGS = {
  types: [{ code: 'NORMAL', name: 'Normal', texture: 'REGULAR' }],
  meals: [
    { code: 'BREAKFAST', name: 'Breakfast', time: '08:00', cutoff: '06:30' },
    { code: 'LUNCH', name: 'Lunch', time: '12:30', cutoff: '10:30' },
  ],
  defaultDiet: 'NORMAL',
  chargeCategories: ['PRIVATE'],
  version: 0,
};

describe('Kitchen costing', () => {
  it('shows cost per tray by meal and says when there is no kitchen store', async () => {
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'kitchen', modules: ['IPD', 'DIET'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /diet/settings': () => [200, SETTINGS],
      'GET /diet/kitchen/stock': () => [
        409,
        { error: { code: 'NO_KITCHEN_STORE', message: 'Set up a kitchen store' } },
      ],
      'GET /diet/kitchen/consumption': () => [200, { items: [] }],
      'GET /diet/kitchen/costing': () => [
        200,
        {
          cost: 62_000,
          trays: 4,
          perTray: 15_500,
          charged: 1,
          recovered: 15_000,
          days: [{ date: '2026-10-11', cost: 62_000, trays: 4, perTray: 15_500 }],
          meals: [
            { meal: 'BREAKFAST', cost: 0, trays: 0, perTray: null },
            { meal: 'LUNCH', cost: 62_000, trays: 4, perTray: 15_500 },
          ],
          topItems: [{ itemId: 'r', name: 'Rice', unit: 'kg', qty: 12, value: 62_000 }],
        },
      ],
    });
    renderApp('/diet?tab=kitchen');
    const byMeal = await screen.findByRole('table', { name: 'By meal' });
    const lunch = within(byMeal).getByText('Lunch').closest('tr');
    expect(within(lunch).getByText('₹155')).toBeVisible();
    expect(
      screen.getByText(
        'There is no kitchen store yet. Ask the store to set one up (store kind: Kitchen) and transfer food items to it.',
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('table', { name: 'Costliest items' })).getByText('Rice'),
    ).toBeVisible();
  });
});
