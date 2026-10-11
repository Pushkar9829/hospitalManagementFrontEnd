import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PANELS } from '@hms/shared/catalog';
import { addRoleHomeStrings } from '@hms/i18n/rolehome';
import {
  Page,
  PageHeader,
  StatusBadge,
  buttonSizes,
  buttonVariants,
  cn,
  formatLongDate,
  istHour,
} from '@hms/ui';
import { canOpen, menuFor, panelKeys } from '../../app/access.js';
import { selectSession } from '../../app/session.js';
import { useStrings } from '../../lib/useStrings.js';
import { useUrlState } from '../../lib/useUrlState.js';
import { HospitalDashboard } from '../reports/components/Dashboard.jsx';
import { RoleHome } from './components/RoleHome.jsx';
import { QUICK } from './quick.js';

function greetingKey(hour) {
  if (hour < 12) return 'home.morning';
  if (hour < 17) return 'home.afternoon';
  return 'home.evening';
}

/** The areas the user's menu opens, as shortcuts under the role's widgets. */
function Areas({ session }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const groups = useMemo(
    () =>
      menuFor(session)
        .map((g) => ({ ...g, items: g.items.filter((it) => !it.route.includes(':')) }))
        .filter((g) => g.items.length),
    [session],
  );
  if (!groups.length) return <p className="text-muted">{t('home.noMenu')}</p>;
  return (
    <section aria-labelledby="home-areas" className="flex flex-col gap-3">
      <h2 id="home-areas" className="text-md font-semibold text-ink">
        {t('home.dashboardTitle')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.group} className="rounded-card border border-line bg-surface p-3">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {g.group}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map((it) => (
                <li key={it.screen}>
                  <a
                    href={it.route}
                    onClick={(e) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      navigate(it.route);
                    }}
                    className="inline-flex min-h-8 items-center rounded-control border border-line-strong bg-surface px-2.5 text-sm font-medium text-ink hover:border-muted pointer-coarse:min-h-tap"
                  >
                    {it.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

/**
 * Role home (design boards Home*): a greeting, what this panel is for, quick actions, then the
 * panel's live numbers, worklist and alerts from GET /home. A user with several roles switches
 * panel here (kept in the URL). The Super Admin also sees the management dashboard.
 */
export default function HomePage() {
  useStrings(addRoleHomeStrings);
  const { t, i18n } = useTranslation();
  const { data } = useSelector(selectSession);
  const panels = panelKeys(data);
  const [panelParam, setPanel] = useUrlState('panel', panels[0] ?? '');
  const panel = panels.includes(panelParam) ? panelParam : panels[0];
  const now = new Date();
  const firstName = data.user.name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/\s+/)[0];
  const quick = (QUICK[panel] ?? []).filter((a) => canOpen(a.screen, data));

  return (
    <Page>
      <PageHeader
        eyebrow={formatLongDate(now, i18n.language === 'hi' ? 'hi-IN' : 'en-IN')}
        title={t(greetingKey(istHour(now)), { name: firstName })}
        description={[
          panel ? t(`rh.sub.${panel}`, { defaultValue: PANELS[panel]?.name ?? '' }) : '',
          data.branch?.name ?? data.tenant.name,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          quick.length > 0 && (
            <nav aria-label={t('rh.quickLabel')} className="flex flex-wrap gap-2">
              {quick.map((a, i) => (
                <Link
                  key={a.id}
                  to={a.to}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-control border font-semibold whitespace-nowrap transition-colors',
                    buttonVariants[i === 0 ? 'primary' : 'secondary'],
                    buttonSizes.md,
                  )}
                >
                  {t(`rh.quick.${a.id}`)}
                </Link>
              ))}
            </nav>
          )
        }
      />

      {panels.length > 1 && (
        <div
          role="group"
          aria-label={t('home.panel')}
          className="mb-4 inline-flex flex-wrap gap-1 rounded-control bg-neutral-bg p-1"
        >
          {panels.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === panel}
              onClick={() => setPanel(p)}
              className={cn(
                'min-h-9 cursor-pointer rounded-control px-3 text-sm font-semibold',
                p === panel ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              )}
            >
              {PANELS[p].name}
            </button>
          ))}
        </div>
      )}
      {PANELS[panel]?.readOnly && (
        <div className="mb-4">
          <StatusBadge tone="info" label={t('home.readOnly')} />
        </div>
      )}

      <div className="flex flex-col gap-6">
        {panel && <RoleHome panel={panel} />}
        {panel === 'superadmin' && <HospitalDashboard />}
        <Areas session={data} />
      </div>
    </Page>
  );
}
