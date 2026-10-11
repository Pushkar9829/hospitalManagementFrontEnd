import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MODULE_CODES, MODULES, unmetDependencies } from '@hms/shared';
import { addConsoleStrings } from '@hms/i18n/console';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { inr, parseRupees, rupeesText } from '../../../lib/money.js';
import { useStrings } from '../../../lib/useStrings.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { usePlatformCan } from '../access.js';
import {
  useCreatePlanMutation,
  usePlatformPlansQuery,
  useUpdateModulePriceMutation,
  useUpdatePlanMutation,
  useUpdatePriceSettingsMutation,
} from '../api.js';

const LIMITS = ['users', 'branches', 'beds', 'storageGb'];
const blank = {
  code: '',
  name: '',
  description: '',
  monthly: '',
  byQuote: false,
  modules: ['CORE', 'OPD'],
  limits: { users: '15', branches: '1', beds: '0', storageGb: '25' },
  isActive: true,
  isPublic: true,
  sortOrder: '10',
};
const fromPlan = (p) => ({
  code: p.code,
  name: p.name,
  description: p.description ?? '',
  monthly: p.monthly == null ? '' : rupeesText(p.monthly),
  byQuote: p.monthly == null,
  modules: p.modules,
  limits: Object.fromEntries(LIMITS.map((k) => [k, String(p.limits?.[k] ?? '')])),
  isActive: p.isActive,
  isPublic: p.isPublic,
  sortOrder: String(p.sortOrder ?? 0),
});

/**
 * One plan's editor: name, monthly price (or by quote), the modules it includes and its limits.
 * Editing a plan others are on can move them to the new modules and limits at once.
 */
function PlanEditor({ plan, docVersion, onClose }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isNew = !plan;
  const [f, setF] = useState(() => (plan ? fromPlan(plan) : blank));
  const [apply, setApply] = useState(false);
  const [failure, setFailure] = useState(null);
  const [create, creating] = useCreatePlanMutation();
  const [update, updating] = useUpdatePlanMutation();
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const missing = unmetDependencies(f.modules);
  const removed = plan ? plan.modules.filter((m) => !f.modules.includes(m)) : [];
  const toggle = (code, on) =>
    setF((s) => ({
      ...s,
      modules: on ? [...new Set([...s.modules, code])] : s.modules.filter((m) => m !== code),
    }));
  return (
    <Card title={isNew ? t('console.cat.newPlan') : t('console.cat.editPlan', { name: plan.name })}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFailure(null);
          const body = {
            name: f.name.trim(),
            description: f.description.trim() || undefined,
            monthly: f.byQuote ? null : parseRupees(f.monthly),
            modules: f.modules,
            limits: Object.fromEntries(LIMITS.map((k) => [k, Number(f.limits[k])])),
            isActive: f.isActive,
            isPublic: f.isPublic,
            sortOrder: Number(f.sortOrder || 0),
          };
          try {
            if (isNew) await create({ code: f.code.trim().toUpperCase(), ...body }).unwrap();
            else {
              const r = await update({
                code: plan.code,
                ...body,
                applyToExisting: apply,
                version: docVersion,
              }).unwrap();
              if (r.moved)
                toast({ tone: 'success', title: t('console.cat.moved', { count: r.moved }) });
            }
            toast({ tone: 'success', title: t('console.cat.saved', { name: body.name }) });
            onClose();
          } catch (err) {
            setFailure(err);
          }
        }}
      >
        <ApiErrorNotice error={failure} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {isNew && (
            <FormField label={t('console.cat.code')} hint={t('console.cat.codeHint')} required>
              <Input mono value={f.code} onChange={set('code')} />
            </FormField>
          )}
          <FormField label={t('console.cat.name')} required>
            <Input value={f.name} onChange={set('name')} />
          </FormField>
          <FormField label={t('console.cat.monthly')} required={!f.byQuote}>
            <Input
              inputMode="decimal"
              value={f.monthly}
              disabled={f.byQuote}
              onChange={set('monthly')}
            />
          </FormField>
          <Checkbox
            className="self-end"
            checked={f.byQuote}
            onChange={(e) => setF((s) => ({ ...s, byQuote: e.target.checked }))}
            label={t('console.cat.byQuote')}
          />
        </div>
        <FormField label={t('console.cat.descriptionField')} optional>
          <Textarea rows={2} value={f.description} onChange={set('description')} />
        </FormField>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold text-ink">
            {t('console.cat.modules')}
          </legend>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {MODULE_CODES.map((code) => (
              <Checkbox
                key={code}
                checked={f.modules.includes(code)}
                disabled={code === 'CORE'}
                onChange={(e) => toggle(code, e.target.checked)}
                label={`${MODULES[code].name}${code === 'CORE' ? ` · ${t('console.cat.always')}` : ''}`}
              />
            ))}
          </div>
          {missing.length > 0 && (
            <Banner tone="warning">
              {missing
                .map((m) =>
                  t('console.cat.needs', {
                    module: MODULES[m.module].name,
                    needs: MODULES[m.needs].name,
                  }),
                )
                .join(' ')}
            </Banner>
          )}
        </fieldset>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {LIMITS.map((k) => (
            <FormField key={k} label={t(`console.cat.limit.${k}`)}>
              <Input
                type="number"
                min={0}
                value={f.limits[k]}
                onChange={(e) =>
                  setF((s) => ({ ...s, limits: { ...s.limits, [k]: e.target.value } }))
                }
              />
            </FormField>
          ))}
          <FormField label={t('console.cat.order')}>
            <Input type="number" min={0} value={f.sortOrder} onChange={set('sortOrder')} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <Checkbox
            checked={f.isActive}
            onChange={(e) => setF((s) => ({ ...s, isActive: e.target.checked }))}
            label={t('console.cat.onSale')}
          />
          <Checkbox
            checked={f.isPublic}
            onChange={(e) => setF((s) => ({ ...s, isPublic: e.target.checked }))}
            label={t('console.cat.public')}
          />
        </div>
        {!isNew && plan.hospitals > 0 && (
          <div className="flex flex-col gap-2 rounded-control border border-line p-3">
            <Checkbox
              checked={apply}
              onChange={(e) => setApply(e.target.checked)}
              label={t('console.cat.applyExisting', { count: plan.hospitals })}
            />
            <p className="text-sm text-muted">{t('console.cat.applyHint')}</p>
            {apply && removed.length > 0 && (
              <Banner tone="warning">
                {t('console.cat.removedWarn', {
                  list: removed.map((m) => MODULES[m].name).join(', '),
                })}
              </Banner>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={creating.isLoading || updating.isLoading}
            disabled={
              missing.length > 0 ||
              f.name.trim().length < 2 ||
              (!f.byQuote && !(parseRupees(f.monthly) >= 0)) ||
              (isNew && f.code.trim().length < 2)
            }
          >
            {t(isNew ? 'console.cat.create' : 'console.cat.save')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('console.cat.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ModulePrices({ book, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [edits, setEdits] = useState({});
  const [failure, setFailure] = useState(null);
  const [save] = useUpdateModulePriceMutation();
  return (
    <Card title={t('console.cat.modulePrices')} description={t('console.cat.modulePricesHint')}>
      <ApiErrorNotice error={failure} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t('console.cat.modulePrices')}</caption>
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">{t('console.cat.module')}</th>
              <th className="px-3 py-2 font-semibold">{t('console.cat.unit')}</th>
              <th className="px-3 py-2 font-semibold">{t('console.cat.price')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {book.modules.map((m) => (
              <tr key={m.code}>
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2 text-muted">
                  {t(`console.cat.units.${m.unit}`, { defaultValue: m.unit })}
                  {m.metered ? ` · ${t('console.cat.metered')}` : ''}
                </td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <Input
                      aria-label={t('console.cat.priceOf', { name: m.name })}
                      inputMode="decimal"
                      className="max-w-32"
                      value={edits[m.code] ?? rupeesText(m.monthly)}
                      onChange={(e) => setEdits((s) => ({ ...s, [m.code]: e.target.value }))}
                    />
                  ) : (
                    inr(m.monthly)
                  )}
                </td>
                <td className="px-3 py-2">
                  {canEdit && edits[m.code] != null && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        setFailure(null);
                        try {
                          await save({
                            code: m.code,
                            monthly: parseRupees(edits[m.code]),
                            version: book.docVersion,
                          }).unwrap();
                          setEdits((s) => ({ ...s, [m.code]: undefined }));
                          toast({
                            tone: 'success',
                            title: t('console.cat.priceSaved', { name: m.name }),
                          });
                        } catch (err) {
                          setFailure(err);
                        }
                      }}
                    >
                      {t('console.cat.save')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrialSettings({ book, canEdit }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [f, setF] = useState({
    trialPlan: book.trialPlan,
    trialDays: String(book.trialDays),
    gstRate: String(book.gstRate),
    annualMonthsCharged: String(book.annualMonthsCharged),
  });
  const [failure, setFailure] = useState(null);
  const [save, state] = useUpdatePriceSettingsMutation();
  return (
    <Card title={t('console.cat.settings')}>
      <ApiErrorNotice error={failure} />
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <FormField label={t('console.cat.trialPlan')}>
          <Select
            value={f.trialPlan}
            onChange={(e) => setF((s) => ({ ...s, trialPlan: e.target.value }))}
            options={book.plans
              .filter((p) => p.isActive)
              .map((p) => ({ value: p.code, label: p.name }))}
          />
        </FormField>
        {['trialDays', 'gstRate', 'annualMonthsCharged'].map((k) => (
          <FormField key={k} label={t(`console.cat.${k}`)}>
            <Input
              type="number"
              value={f[k]}
              onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
            />
          </FormField>
        ))}
      </fieldset>
      {canEdit && (
        <Button
          className="mt-3"
          loading={state.isLoading}
          onClick={async () => {
            setFailure(null);
            try {
              await save({
                trialPlan: f.trialPlan,
                trialDays: Number(f.trialDays),
                gstRate: Number(f.gstRate),
                annualMonthsCharged: Number(f.annualMonthsCharged),
                version: book.docVersion,
              }).unwrap();
              toast({ tone: 'success', title: t('console.cat.settingsSaved') });
            } catch (err) {
              setFailure(err);
            }
          }}
        >
          {t('console.cat.save')}
        </Button>
      )}
    </Card>
  );
}

/**
 * Catalogue (console board "Catalogue", route /catalogue): the plans hospitals can buy, with the
 * modules each includes, its monthly price (or by quote) and limits; which plans are on sale and
 * shown on the pricing page; each module's price bought on its own; the trial plan and length.
 */
export default function CataloguePage() {
  useStrings(addConsoleStrings);
  const { t } = useTranslation();
  const can = usePlatformCan();
  const canEdit = can('platform:plan:update');
  const q = usePlatformPlansQuery();
  const [editing, setEditing] = useState(null); // plan code, 'NEW' or null
  return (
    <Page>
      <PageHeader
        title={t('console.cat.title')}
        description={t('console.cat.description')}
        actions={
          canEdit &&
          !editing && <Button onClick={() => setEditing('NEW')}>{t('console.cat.newPlan')}</Button>
        }
      />
      <QueryView query={q} rows={8}>
        {(book) => (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {t('console.cat.version', { v: book.version, by: book.updatedBy ?? '-' })}
            </p>
            {editing === 'NEW' && (
              <PlanEditor docVersion={book.docVersion} onClose={() => setEditing(null)} />
            )}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {book.plans.map((p) =>
                editing === p.code ? (
                  <PlanEditor
                    key={p.code}
                    plan={p}
                    docVersion={book.docVersion}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <Card key={p.code}>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
                        <span className="font-mono text-sm text-muted">{p.code}</span>
                        <StatusBadge
                          tone={p.isActive ? 'success' : 'neutral'}
                          label={t(p.isActive ? 'console.cat.onSaleBadge' : 'console.cat.offSale')}
                        />
                        {!p.isPublic && (
                          <StatusBadge tone="info" label={t('console.cat.private')} />
                        )}
                        {book.trialPlan === p.code && (
                          <StatusBadge tone="accent" label={t('console.cat.trialBadge')} />
                        )}
                      </div>
                      {p.description && <p className="text-sm">{p.description}</p>}
                      <p className="text-lg font-semibold">
                        {p.monthly == null
                          ? t('console.cat.quote')
                          : t('console.cat.perMonth', { amount: inr(p.monthly) })}
                      </p>
                      <ul className="flex flex-wrap gap-1">
                        {p.modules.map((m) => (
                          <li key={m} className="rounded-control bg-surface-2 px-2 py-0.5 text-sm">
                            {MODULES[m]?.name ?? m}
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm text-muted">
                        {t('console.cat.limitsLine', {
                          users: p.limits.users,
                          branches: p.limits.branches,
                          beds: p.limits.beds,
                          gb: p.limits.storageGb,
                        })}
                      </p>
                      <p className="text-sm text-muted">
                        {t('console.cat.hospitals', { count: p.hospitals })}
                      </p>
                      {canEdit && (
                        <div>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(p.code)}>
                            {t('console.cat.edit')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ),
              )}
            </div>
            <ModulePrices book={book} canEdit={canEdit} />
            <TrialSettings key={book.docVersion} book={book} canEdit={canEdit} />
          </div>
        )}
      </QueryView>
    </Page>
  );
}
