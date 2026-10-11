import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const settings = {
  diets: [{ code: 'DIABETIC', name: 'Diabetic', texture: 'REGULAR', active: true }],
  meals: [
    { code: 'BREAKFAST', name: 'Breakfast', time: '08:00', cutoff: '06:30' },
    { code: 'LUNCH', name: 'Lunch', time: '12:30', cutoff: '10:30' },
  ],
  defaultDiet: 'DIABETIC',
  chargeCategories: ['PRIVATE'],
};

const base = (extra) => ({
  'GET /auth/me': () => [200, makeSession({ panel: 'superadmin', modules: ['DIET', 'IPD'] })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /diet/settings': () => [200, settings],
  ...extra,
});

describe('Diet master and meal billing', () => {
  it('saves energy, restrictions and the menu for a diet type', async () => {
    let sent;
    mockApi(
      base({
        'PUT /diet/settings': (_req, body) => {
          sent = body;
          return [200, settings];
        },
      }),
    );
    const user = userEvent.setup();
    renderApp('/diet?tab=menu');
    await user.type(await screen.findByLabelText('kcal a day'), '1800');
    await user.type(screen.getByLabelText('Restrictions'), 'No sugar, low GI');
    await user.type(screen.getByLabelText('Breakfast'), 'Oats, milk without sugar');
    await user.click(screen.getByRole('button', { name: 'Save diet master' }));
    await waitFor(() =>
      expect(sent.diets[0]).toMatchObject({
        code: 'DIABETIC',
        calories: 1800,
        restrictions: 'No sugar, low GI',
        menu: { BREAKFAST: 'Oats, milk without sugar' },
      }),
    );
  });

  it('lists the day’s meals posted to running bills', async () => {
    mockApi(
      base({
        'GET /diet/billing': () => [
          200,
          {
            date: '2026-10-11',
            mealRate: 15000,
            attendantRate: 15000,
            total: 90000,
            items: [
              {
                admissionId: 'a1',
                bed: 'PVT-05',
                patient: 'L. Das',
                meals: 3,
                attendantMeals: 3,
                amount: 90000,
              },
            ],
          },
        ],
      }),
    );
    renderApp('/diet?tab=billing');
    const table = await screen.findByRole('table', { name: 'Meal billing' });
    expect(await within(table).findByText('PVT-05')).toBeVisible();
    expect(within(table).getByText('₹900')).toBeVisible();
    expect(screen.getByText('Total ₹900')).toBeVisible();
  });
});
