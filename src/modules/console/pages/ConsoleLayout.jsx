import { lazy } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addConsoleStrings } from '@hms/i18n/console';
import { Button, EmptyState, Page, PageHeader, cn } from '@hms/ui';
import { useStrings } from '../../../lib/useStrings.js';
import { consoleHome, menuFor } from '../access.js';
import { useConsoleLogoutMutation, useConsoleMeQuery } from '../api.js';

/** The console shell: signed-in platform staff only, menu by role (access.js). */
export default function ConsoleLayout() {
  useStrings(addConsoleStrings);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useConsoleMeQuery();
  const [logout] = useConsoleLogoutMutation();
  if (me.isLoading) return <p className="p-6 text-muted">{t('console.loading')}</p>;
  if (me.isError || !me.data) return <Navigate to="/login" replace />;
  const menu = menuFor(me.data);
  return (
    <div className="min-h-screen bg-ground">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-3">
        <strong className="text-ink">{t('console.title')}</strong>
        <nav aria-label={t('console.menuLabel')} className="flex flex-wrap gap-1">
          {menu.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              end={m.path === '/'}
              className={({ isActive }) =>
                cn(
                  'rounded-control px-3 py-1.5 text-sm font-semibold',
                  isActive ? 'bg-info-bg text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {t(`console.menu.${m.id}`)}
            </NavLink>
          ))}
        </nav>
        <span className="ml-auto text-sm text-muted">{me.data.name}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          {t('console.signOut')}
        </Button>
      </header>
      <Outlet context={{ me: me.data, home: consoleHome(me.data) }} />
    </div>
  );
}

const DashboardPage = lazy(() => import('./DashboardPage.jsx'));

/** Console sections not built yet. */
export function ConsolePlaceholder() {
  useStrings(addConsoleStrings);
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t('console.soon.title')} description={t('console.soon.description')} />
      <EmptyState title={t('console.soon.empty')} />
    </Page>
  );
}

/** "/" sends each role to the first section it can open. */
export function ConsoleHome() {
  const me = useConsoleMeQuery();
  if (!me.data) return null;
  const home = consoleHome(me.data);
  return home === '/' ? <DashboardPage /> : <Navigate to={home} replace />;
}
