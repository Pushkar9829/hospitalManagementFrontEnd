import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import {
  useExportDataMutation,
  useSaveSettingsExtraMutation,
  useSettingsExtraQuery,
} from '../api.js';

/** Save with an error notice; returns [run, failure, saving]. */
function useSave() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [save, state] = useSaveSettingsExtraMutation();
  const [failure, setFailure] = useState(null);
  const run = async (args, done = t('settings.x.saved')) => {
    setFailure(null);
    try {
      const out = await save(args).unwrap();
      toast({ tone: 'success', title: done });
      return out;
    } catch (e) {
      setFailure(e);
      return null;
    }
  };
  return [run, failure, state.isLoading];
}

// ---------------------------------------------------------------- print

export function PrintTab() {
  const q = useSettingsExtraQuery('print');
  return (
    <QueryView query={q} rows={4}>
      {(p) => <PrintForm key={p.version} p={p} />}
    </QueryView>
  );
}

function PrintForm({ p }) {
  const { t } = useTranslation();
  const can = useCan();
  const edit = can('settings:hospital:update');
  const [f, setF] = useState(p);
  const [run, failure, saving] = useSave();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('settings.x.print.title')} description={t('settings.x.print.hint')}>
      <div className="flex max-w-2xl flex-col gap-3">
        <FormField label={t('settings.x.print.paper')} className="w-40">
          <Select
            value={f.paperSize}
            disabled={!edit}
            onChange={set('paperSize')}
            options={['A4', 'A5'].map((x) => ({ value: x, label: x }))}
          />
        </FormField>
        <Checkbox
          label={t('settings.x.print.logo')}
          checked={f.showLogo}
          disabled={!edit}
          onChange={(e) => setF({ ...f, showLogo: e.target.checked })}
        />
        <FormField label={t('settings.x.print.header')} hint={t('settings.x.print.headerHint')}>
          <Input value={f.headerNote} disabled={!edit} onChange={set('headerNote')} />
        </FormField>
        <FormField label={t('settings.x.print.footer')}>
          <Input value={f.footerNote} disabled={!edit} onChange={set('footerNote')} />
        </FormField>
        <FormField label={t('settings.x.print.signatory')}>
          <Input value={f.signatory} disabled={!edit} onChange={set('signatory')} />
        </FormField>
        <ApiErrorNotice error={failure} />
        {edit && (
          <div>
            <Button
              loading={saving}
              onClick={() =>
                run({
                  path: 'print',
                  body: {
                    version: p.version,
                    paperSize: f.paperSize,
                    showLogo: f.showLogo,
                    headerNote: f.headerNote.trim() || undefined,
                    footerNote: f.footerNote.trim() || undefined,
                    signatory: f.signatory.trim() || undefined,
                  },
                })
              }
            >
              {t('settings.x.save')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- messages

export function MessagesTab() {
  const { t } = useTranslation();
  const q = useSettingsExtraQuery('messages');
  const [code, setCode] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('settings.x.msg.hint')}</p>
      <QueryView query={q} rows={6}>
        {(d) => {
          const current = d.items.find((m) => m.code === code) ?? d.items[0];
          return (
            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <Card padding={false}>
                <ul className="flex flex-col" aria-label={t('settings.x.msg.list')}>
                  {d.items.map((m) => (
                    <li key={m.code}>
                      <button
                        type="button"
                        aria-current={m.code === current.code ? 'true' : undefined}
                        onClick={() => setCode(m.code)}
                        className="flex w-full items-center justify-between gap-2 border-b border-line px-4 py-2 text-left hover:bg-surface-2 aria-[current]:bg-surface-2 aria-[current]:font-semibold"
                      >
                        <span>{t(`settings.x.msg.codes.${m.code}`, { defaultValue: m.code })}</span>
                        {!m.enabled ? (
                          <StatusBadge tone="neutral" label={t('settings.x.msg.off')} />
                        ) : (
                          m.customised && (
                            <StatusBadge tone="info" label={t('settings.x.msg.custom')} />
                          )
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
              <MessageForm key={`${current.code}-${d.version}`} m={current} version={d.version} />
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}

function MessageForm({ m, version }) {
  const { t } = useTranslation();
  const can = useCan();
  const edit = can('settings:hospital:update');
  const [f, setF] = useState({ en: m.en, hi: m.hi, dltId: m.dltId, enabled: m.enabled });
  const [run, failure, saving] = useSave();
  const required = /OTP|RESET|INVITE/.test(m.code);
  return (
    <Card
      title={t(`settings.x.msg.codes.${m.code}`, { defaultValue: m.code })}
      description={t('settings.x.msg.placeholders', { list: m.placeholders.join(' ') })}
    >
      <div className="flex flex-col gap-3">
        <FormField
          label={t('settings.x.msg.en')}
          hint={t('settings.x.msg.length', { n: f.en.length })}
        >
          <Textarea
            rows={3}
            value={f.en}
            disabled={!edit}
            onChange={(e) => setF({ ...f, en: e.target.value })}
          />
        </FormField>
        <FormField label={t('settings.x.msg.hi')}>
          <Textarea
            rows={3}
            value={f.hi}
            disabled={!edit}
            onChange={(e) => setF({ ...f, hi: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('settings.x.msg.dlt')}
          hint={t('settings.x.msg.dltHint')}
          className="max-w-sm"
        >
          <Input
            value={f.dltId}
            disabled={!edit}
            onChange={(e) => setF({ ...f, dltId: e.target.value })}
          />
        </FormField>
        {!required && (
          <Checkbox
            label={t('settings.x.msg.enabled')}
            checked={f.enabled}
            disabled={!edit}
            onChange={(e) => setF({ ...f, enabled: e.target.checked })}
          />
        )}
        <ApiErrorNotice error={failure} />
        {edit && (
          <div className="flex flex-wrap gap-2">
            <Button
              loading={saving}
              onClick={() =>
                run({
                  path: `messages/${m.code}`,
                  body: {
                    version,
                    en: f.en.trim(),
                    hi: f.hi.trim() || undefined,
                    dltId: f.dltId.trim() || undefined,
                    enabled: required ? true : f.enabled,
                  },
                })
              }
            >
              {t('settings.x.save')}
            </Button>
            {m.customised && (
              <Button
                variant="ghost"
                onClick={() =>
                  run({ method: 'POST', path: `messages/${m.code}/reset`, body: { version } })
                }
              >
                {t('settings.x.msg.reset')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- integrations

const FIELDS = {
  sms: ['provider', 'senderId'],
  whatsapp: ['enabled', 'number'],
  email: ['from'],
  payments: ['gateway', 'merchantId'],
  gst: ['provider', 'gstin'],
  abdm: ['enabled', 'hipId'],
  lis: ['enabled', 'host'],
  pacs: ['enabled', 'aeTitle'],
};

export function IntegrationsTab() {
  const { t } = useTranslation();
  const q = useSettingsExtraQuery('integrations');
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info">{t('settings.x.int.secrets')}</Banner>
      <QueryView query={q} rows={6}>
        {(d) => (
          <div className="grid gap-4 md:grid-cols-2">
            {d.items.map((i) => (
              <IntegrationCard key={`${i.key}-${d.version}`} item={i} version={d.version} />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function IntegrationCard({ item, version }) {
  const { t } = useTranslation();
  const can = useCan();
  const edit = can('settings:hospital:update');
  const [f, setF] = useState(() =>
    Object.fromEntries(
      FIELDS[item.key].map((k) => [k, item.config[k] ?? (k === 'enabled' ? false : '')]),
    ),
  );
  const [run, failure, saving] = useSave();
  return (
    <Card
      title={t(`settings.x.int.names.${item.key}`)}
      description={t(`settings.x.int.about.${item.key}`)}
      actions={
        <StatusBadge
          tone={item.configured ? 'success' : 'neutral'}
          label={item.configured ? t('settings.x.int.configured') : t('settings.x.int.notSet')}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {FIELDS[item.key].map((k) =>
          k === 'enabled' ? (
            <Checkbox
              key={k}
              label={t('settings.x.int.f.enabled')}
              checked={f.enabled}
              disabled={!edit}
              onChange={(e) => setF({ ...f, enabled: e.target.checked })}
            />
          ) : (
            <FormField key={k} label={t(`settings.x.int.f.${k}`)}>
              <Input
                value={f[k]}
                disabled={!edit}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </FormField>
          ),
        )}
        <ApiErrorNotice error={failure} />
        {edit && (
          <div>
            <Button
              size="sm"
              loading={saving}
              onClick={() =>
                run({
                  path: 'integrations',
                  body: {
                    version,
                    key: item.key,
                    config: Object.fromEntries(
                      Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
                    ),
                  },
                })
              }
            >
              {t('settings.x.save')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- security

export function SecurityTab() {
  const q = useSettingsExtraQuery('security');
  return (
    <QueryView query={q} rows={6}>
      {(s) => <SecurityForm key={`${s.idleTimeoutMin}-${s.twoFactorRoles.join()}`} s={s} />}
    </QueryView>
  );
}

function SecurityForm({ s }) {
  const { t } = useTranslation();
  const can = useCan();
  const edit = can('settings:security:update');
  const [roles, setRoles] = useState(new Set(s.twoFactorRoles));
  const [idle, setIdle] = useState(String(s.idleTimeoutMin));
  const [run, failure, saving] = useSave();
  const idleOk = Number(idle) >= 5 && Number(idle) <= 120;
  return (
    <div className="flex flex-col gap-4">
      <Card title={t('settings.x.sec.twoFactor')} description={t('settings.x.sec.twoFactorHint')}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {s.roles.map((r) => (
            <Checkbox
              key={r.code}
              label={r.privileged ? `${r.name} · ${t('settings.x.sec.privileged')}` : r.name}
              checked={r.code === 'superadmin' || roles.has(r.code)}
              disabled={!edit || r.code === 'superadmin'}
              onChange={(e) => {
                const next = new Set(roles);
                if (e.target.checked) next.add(r.code);
                else next.delete(r.code);
                setRoles(next);
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          {t('settings.x.sec.usersOn', { count: s.usersWithTwoFactor })}
        </p>
      </Card>
      <Card title={t('settings.x.sec.session')}>
        <div className="flex flex-col gap-3">
          <FormField
            label={t('settings.x.sec.idle')}
            className="w-56"
            error={idleOk ? undefined : t('settings.x.sec.idleError')}
          >
            <Input
              inputMode="numeric"
              value={idle}
              disabled={!edit}
              onChange={(e) => setIdle(e.target.value)}
            />
          </FormField>
          <p className="text-sm text-muted">
            {t('settings.x.sec.password', { n: s.passwordRules.minLength })}
          </p>
        </div>
      </Card>
      {roles.size > s.twoFactorRoles.length && (
        <Banner tone="warning">{t('settings.x.sec.warn')}</Banner>
      )}
      <ApiErrorNotice error={failure} />
      {edit && (
        <div>
          <Button
            loading={saving}
            disabled={!idleOk}
            onClick={() =>
              run({
                path: 'security',
                body: { twoFactorRoles: [...roles], idleTimeoutMin: Number(idle) },
              })
            }
          >
            {t('settings.x.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- data export

const DATASETS = [
  { id: 'patients', dated: true },
  { id: 'bills', dated: true },
  { id: 'services', dated: false },
  { id: 'users', dated: false },
];

export function ExportTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [run, state] = useExportDataMutation();
  const [range, setRange] = useState({ from: '', to: '' });
  const [failure, setFailure] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="warning">{t('settings.x.exp.warn')}</Banner>
      <div className="flex flex-wrap gap-3">
        <FormField label={t('settings.x.exp.from')}>
          <Input
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </FormField>
        <FormField label={t('settings.x.exp.to')}>
          <Input
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </FormField>
      </div>
      <ApiErrorNotice error={failure} />
      <div className="grid gap-4 md:grid-cols-2">
        {DATASETS.map((d) => (
          <Card
            key={d.id}
            title={t(`settings.x.exp.sets.${d.id}`)}
            description={t(`settings.x.exp.about.${d.id}`)}
          >
            <Button
              variant="secondary"
              loading={state.isLoading && state.originalArgs?.dataset === d.id}
              onClick={async () => {
                setFailure(null);
                try {
                  const r = await run({
                    dataset: d.id,
                    ...(d.dated
                      ? { from: range.from || undefined, to: range.to || undefined }
                      : {}),
                  }).unwrap();
                  toast({
                    tone: 'success',
                    title: t('settings.x.exp.done', { count: r.count, file: r.filename }),
                  });
                } catch (e) {
                  setFailure(e);
                }
              }}
            >
              {t('settings.x.exp.download')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- help

const HELP_LINKS = [
  { id: 'setup', to: '/setup' },
  { id: 'users', to: '/settings/users' },
  { id: 'roles', to: '/settings/roles' },
  { id: 'approvals', to: '/approvals' },
  { id: 'audit', to: '/audit' },
  { id: 'reports', to: '/reports' },
];

export function HelpTab() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('settings.x.help.start')}>
        <ul className="flex flex-col gap-2">
          {HELP_LINKS.map((l) => (
            <li key={l.id}>
              <Link className="font-semibold text-primary underline" to={l.to}>
                {t(`settings.x.help.links.${l.id}`)}
              </Link>
              <p className="text-sm text-muted">{t(`settings.x.help.about.${l.id}`)}</p>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('settings.x.help.faq')}>
        <dl className="flex flex-col gap-3">
          {['tariff', 'approval', 'locked', 'sms', 'backup'].map((k) => (
            <div key={k}>
              <dt className="font-semibold text-ink">{t(`settings.x.help.q.${k}`)}</dt>
              <dd className="text-sm text-muted">{t(`settings.x.help.a.${k}`)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title={t('settings.x.help.support')} className="lg:col-span-2">
        <p className="text-muted">{t('settings.x.help.supportText')}</p>
      </Card>
    </div>
  );
}
