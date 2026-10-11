import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const WARDS = [
  { id: 'w1', name: 'General Ward', category: 'GENERAL', patients: 1, beds: 10 },
  { id: 'w2', name: 'ICU', category: 'ICU', patients: 2, beds: 6 },
];

describe('Nursing station', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('opens the ward the nurse used last', async () => {
    localStorage.setItem('hms.nursing.lastWard', 'w2');
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'nurse', modules: ['IPD', 'NUR'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /nursing/wards': () => [200, { items: WARDS }],
      'GET /nursing/wards/w2/census': () => [200, { items: [] }],
    });
    renderApp('/nursing/all');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nursing station · ICU' }),
    ).toBeVisible();
  });

  it('lists the wards the first time', async () => {
    mockApi({
      'GET /auth/me': () => [200, makeSession({ panel: 'nurse', modules: ['IPD', 'NUR'] })],
      'GET /approvals/count': () => [200, { inbox: 0 }],
      'GET /nursing/wards': () => [200, { items: WARDS }],
    });
    renderApp('/nursing/all');
    expect(await screen.findByRole('link', { name: /General Ward/ })).toBeVisible();
  });
});
