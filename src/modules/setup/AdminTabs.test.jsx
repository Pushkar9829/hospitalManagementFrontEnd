import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeSession } from '../../test/fixtures.js';
import { mockApi, renderApp } from '../../test/renderApp.jsx';

vi.setConfig({ testTimeout: 60_000 });

const base = (panel = 'superadmin') => ({
  'GET /auth/me': () => [200, makeSession({ panel })],
  'GET /approvals/count': () => [200, { inbox: 0 }],
  'GET /settings/hospital': () => [200, { displayName: 'Demo', version: 1, idleTimeoutMin: 15 }],
});

const MESSAGES = {
  version: 4,
  items: [
    {
      code: 'PATIENT_WELCOME',
      placeholders: ['{hospital}', '{uhid}'],
      defaults: { en: 'Welcome to {hospital}. Your UHID is {uhid}.', hi: '' },
      en: 'Welcome to {hospital}. Your UHID is {uhid}.',
      hi: '',
      dltId: '',
      enabled: true,
      customised: false,
    },
  ],
};

describe('Hospital settings: messages, security, help', () => {
  it('rewords a message', async () => {
    const calls = [];
    mockApi({
      ...base(),
      'GET /settings/messages': () => [200, MESSAGES],
      'PUT /settings/messages/PATIENT_WELCOME': (_req, body) => {
        calls.push(body);
        return [200, { ...MESSAGES.items[0], ...body, customised: true }];
      },
    });
    const user = userEvent.setup();
    renderApp('/settings?tab=messages');
    expect(await screen.findByText('Keep these placeholders: {hospital} {uhid}')).toBeVisible();
    const en = screen.getByLabelText(/^English/);
    await user.clear(en);
    await user.type(en, 'Namaste from {{hospital}. UHID {{uhid}.');
    await user.type(screen.getByLabelText(/^DLT template ID/), '1107160000000000001');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      version: 4,
      en: 'Namaste from {hospital}. UHID {uhid}.',
      dltId: '1107160000000000001',
      enabled: true,
    });
  });

  it('keeps Super Admin on two-factor and saves the policy', async () => {
    const calls = [];
    mockApi({
      ...base(),
      'GET /settings/security': () => [
        200,
        {
          twoFactorRoles: ['superadmin'],
          idleTimeoutMin: 15,
          roles: [
            { code: 'superadmin', name: 'Super Admin', privileged: true },
            { code: 'accounts', name: 'Accounts', privileged: true },
          ],
          usersWithTwoFactor: 1,
          passwordRules: { minLength: 10 },
        },
      ],
      'PUT /settings/security': (_req, body) => {
        calls.push(body);
        return [
          200,
          { ...body, roles: [], usersWithTwoFactor: 1, passwordRules: { minLength: 10 } },
        ];
      },
    });
    const user = userEvent.setup();
    renderApp('/settings?tab=security');
    const sa = await screen.findByRole('checkbox', { name: /Super Admin/ });
    expect(sa).toBeChecked();
    expect(sa).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Accounts/ }));
    expect(screen.getByText(/must set up two-factor sign-in the next time/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ twoFactorRoles: ['superadmin', 'accounts'], idleTimeoutMin: 15 });
  });

  it('hides security and export from an admin, shows help', async () => {
    mockApi(base('admin'));
    renderApp('/settings?tab=help');
    expect(await screen.findByRole('link', { name: 'Setup wizard' })).toHaveAttribute(
      'href',
      '/setup',
    );
    expect(screen.queryByRole('tab', { name: 'Security' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Data export' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Messages' })).toBeVisible();
  });
});
