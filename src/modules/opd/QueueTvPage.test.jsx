import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { errorBody, makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

const DISPLAY = {
  title: 'OPD Floor 1',
  rooms: [
    {
      doctor: { id: 'd1', name: 'Dr. Meera Iyer', department: 'Cardiology', room: '12' },
      now: 'T-07',
      next: 'T-08',
    },
    {
      doctor: { id: 'd2', name: 'Dr. L. Gupta', department: 'Dermatology', room: '9' },
      now: null,
      next: null,
    },
  ],
  counters: [{ name: 'Billing', current: 'B-119' }],
  updatedAt: new Date().toISOString(),
};

function setup(path, { signedIn = false } = {}) {
  const headers = [];
  const fetchMock = mockApi({
    'GET /auth/me': () =>
      signedIn ? [200, makeSession()] : [401, errorBody('UNAUTHENTICATED', 'Sign in')],
    'POST /auth/refresh': () => [401, errorBody('UNAUTHENTICATED', 'Sign in')],
    'GET /approvals/count': () => [200, { inbox: 0 }],
    'GET /opd/queue/display': (req) => {
      headers.push(req.headers.get('X-Display-Key'));
      return [200, DISPLAY];
    },
    // A TV with a key uses its own endpoint (no signed-in user).
    'GET /opd/queue/display/tv': (req) => {
      headers.push(req.headers.get('X-Display-Key'));
      return [200, { ...DISPLAY, branch: 'Main Branch' }];
    },
  });
  return { ...renderApp(path), fetchMock, headers };
}

describe('Queue TV', () => {
  it('says the display is not set up without a key or a signed-in user', async () => {
    const { headers } = setup('/display/queue');
    expect(
      await screen.findByRole('heading', { name: 'This display is not set up' }),
    ).toBeInTheDocument();
    expect(headers).toEqual([]);
  });

  it('shows every room with the token now and the next one, using the display key', async () => {
    const { headers } = setup('/display/queue?key=tv-floor-1');
    const rooms = await screen.findByRole('list', { name: 'Consultation rooms' });
    const meera = within(rooms).getByText('Dr. Meera Iyer').closest('li');
    expect(within(meera).getByText('Room 12')).toBeInTheDocument();
    expect(within(meera).getByText('T-07')).toBeInTheDocument();
    expect(within(meera).getByText('T-08')).toBeInTheDocument();
    const gupta = within(rooms).getByText('Dr. L. Gupta').closest('li');
    expect(within(gupta).getByText('Waiting')).toBeInTheDocument();
    expect(
      screen.getByText(/Billing: B-119 · Please keep your token slip ready/),
    ).toBeInTheDocument();
    expect(headers[0]).toBe('tv-floor-1');
    // No menu or app shell on the TV.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('works for a signed-in desk user without a key and names the hospital', async () => {
    const { headers } = setup('/display/queue', { signedIn: true });
    expect(
      await screen.findByRole('heading', { name: 'Test Hospital · OPD Floor 1' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(headers[0]).toBeNull());
  });

  it('offers to turn on spoken announcements where the browser can speak', async () => {
    vi.stubGlobal('speechSynthesis', { speak: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', function Utterance(text) {
      this.text = text;
    });
    setup('/display/queue?key=tv-floor-1');
    const on = await screen.findByRole('button', { name: 'Turn on announcements' });
    await userEvent.setup().click(on);
    expect(screen.queryByRole('button', { name: 'Turn on announcements' })).toBeNull();
  });
});

afterEach(() => vi.unstubAllGlobals());
