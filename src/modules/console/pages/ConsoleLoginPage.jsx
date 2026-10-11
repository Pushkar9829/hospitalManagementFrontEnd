import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addConsoleStrings } from '@hms/i18n/console';
import { Button, Card, FormField, Input } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useStrings } from '../../../lib/useStrings.js';
import { useConsoleLoginMutation, useConsoleVerifyMutation } from '../api.js';

/**
 * Platform console sign-in: email and password, then the authenticator code (always asked for
 * platform staff). The session cookie is the console's own, separate from any hospital.
 */
export default function ConsoleLoginPage() {
  useStrings(addConsoleStrings);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [failure, setFailure] = useState(null);
  const [login, logging] = useConsoleLoginMutation();
  const [verify, verifying] = useConsoleVerifyMutation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground p-4">
      <Card className="w-full max-w-sm">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setFailure(null);
            try {
              if (!challenge) {
                const r = await login({ email: email.trim(), password }).unwrap();
                setChallenge(r.challengeId);
              } else {
                await verify({ challengeId: challenge, code: code.trim() }).unwrap();
                navigate('/', { replace: true });
              }
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          <div>
            <h1 className="text-xl font-semibold text-ink">{t('console.login.title')}</h1>
            <p className="text-sm text-muted">{t('console.login.hint')}</p>
          </div>
          <ApiErrorNotice error={failure} />
          {!challenge ? (
            <>
              <FormField label={t('console.login.email')} required>
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <FormField label={t('console.login.password')} required>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormField>
            </>
          ) : (
            <FormField label={t('console.login.code')} hint={t('console.login.codeHint')} required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>
          )}
          <Button type="submit" loading={logging.isLoading || verifying.isLoading}>
            {t(challenge ? 'console.login.verify' : 'console.login.next')}
          </Button>
        </form>
      </Card>
    </main>
  );
}
