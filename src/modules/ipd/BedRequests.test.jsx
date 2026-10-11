import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const REQUEST = {
  id: 'r1',
  patient: { name: 'Anita Kulkarni', age: '46 y' },
  doctor: { name: 'Dr. Meera Iyer' },
  reason: 'Knee replacement',
  urgency: 'ROUTINE',
  wardCategory: 'PRIVATE',
  isolation: false,
  expectedDays: 4,
  status: 'OPEN',
  createdAt: new Date().toISOString(),
};

describe('Bed requests', () => {
  it('shows a request to the superintendent without asking for bed suggestions', async () => {
    const suggest = vi.fn(() => [200, { items: [] }]);
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'medsupt', modules: ['IPD'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /ipd/admission-requests': () => [200, { items: [REQUEST] }],
      'GET /ipd/beds/suggest': suggest,
    });
    renderApp('/ipd/bed-requests');
    expect(await screen.findByText('Knee replacement · ordered by Dr. Meera Iyer')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Beds that suit' })).toBeNull();
    expect(suggest).not.toHaveBeenCalled();
  });
});
