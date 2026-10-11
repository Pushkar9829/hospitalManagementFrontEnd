import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, Card, DataTable, FormField, Input, Select, useToast } from '@hms/ui';
import { ApiErrorNotice } from '../../../components/ApiErrorNotice.jsx';
import { useCan } from '../../../lib/useCan.js';
import { inr } from '../../../lib/money.js';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useMealBillingQuery, useSaveDietSettingsMutation } from '../api.js';

const TEXTURES = ['REGULAR', 'SOFT', 'MINCED', 'LIQUID', 'TUBE'];
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** Diet master: each diet type's energy, restrictions and the menu at every meal. */
export function MenuTab({ settings }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('diet:settings:update');
  const [diets, setDiets] = useState(() =>
    settings.diets.map((d) => ({
      ...d,
      calories: d.calories ?? '',
      restrictions: d.restrictions ?? '',
      menu: d.menu ?? {},
    })),
  );
  const [save, saving] = useSaveDietSettingsMutation();
  const [failure, setFailure] = useState(null);
  const set = (i, patch) => setDiets(diets.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <Card title={t('diet.master.tab')} description={t('diet.master.hint')}>
      <div className="flex flex-col gap-4">
        {diets.map((d, i) => (
          <fieldset key={i} className="flex flex-col gap-2 rounded-control border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-ink">
              {d.name || t('diet.master.type')}{' '}
              <span className="font-mono text-xs text-muted">{d.code}</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-4">
              {!settings.diets.some((x) => x.code === d.code) && (
                <>
                  <FormField label={t('diet.master.code')}>
                    <Input
                      value={d.code}
                      onChange={(e) => set(i, { code: e.target.value.toUpperCase() })}
                      disabled={!edit}
                    />
                  </FormField>
                  <FormField label={t('diet.master.name')}>
                    <Input
                      value={d.name}
                      onChange={(e) => set(i, { name: e.target.value })}
                      disabled={!edit}
                    />
                  </FormField>
                  <FormField label={t('diet.master.texture')}>
                    <Select
                      value={d.texture}
                      onChange={(e) => set(i, { texture: e.target.value })}
                      disabled={!edit}
                    >
                      {TEXTURES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </>
              )}
              <FormField label={t('diet.master.calories')}>
                <Input
                  inputMode="numeric"
                  value={d.calories}
                  onChange={(e) => set(i, { calories: e.target.value })}
                  disabled={!edit}
                />
              </FormField>
              <FormField label={t('diet.master.restrictions')} className="sm:col-span-3">
                <Input
                  value={d.restrictions}
                  onChange={(e) => set(i, { restrictions: e.target.value })}
                  disabled={!edit}
                />
              </FormField>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {settings.meals.map((m) => (
                <FormField key={m.code} label={m.name}>
                  <Input
                    value={d.menu[m.code] ?? ''}
                    onChange={(e) => set(i, { menu: { ...d.menu, [m.code]: e.target.value } })}
                    disabled={!edit}
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
        ))}
        <ApiErrorNotice error={failure} />
        {edit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() =>
                setDiets([
                  ...diets,
                  {
                    code: '',
                    name: '',
                    texture: 'REGULAR',
                    calories: '',
                    restrictions: '',
                    menu: {},
                    active: true,
                  },
                ])
              }
            >
              {t('diet.master.add')}
            </Button>
            <Button
              loading={saving.isLoading}
              onClick={async () => {
                setFailure(null);
                try {
                  await save({
                    diets: diets.map((d) => ({
                      code: d.code,
                      name: d.name,
                      texture: d.texture,
                      notes: d.notes || undefined,
                      active: d.active !== false,
                      calories: d.calories === '' ? undefined : Number(d.calories),
                      restrictions: d.restrictions || undefined,
                      menu: Object.fromEntries(Object.entries(d.menu).filter(([, v]) => v?.trim())),
                    })),
                  }).unwrap();
                  toast({ tone: 'success', title: t('diet.master.saved') });
                } catch (e) {
                  setFailure(e);
                }
              }}
            >
              {t('diet.master.save')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Meals charged to running bills on a day, by stay. */
export function BillingTab() {
  const { t } = useTranslation();
  const [date, setDate] = useState(istToday());
  const q = useMealBillingQuery(date);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('diet.bill.hint')}</p>
      <FormField label={t('diet.bill.date')} className="max-w-xs">
        <Input
          type="date"
          value={date}
          max={istToday()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </FormField>
      <QueryView query={q} rows={3}>
        {(d) => (
          <Card
            padding={false}
            title={t('diet.bill.total', { amount: inr(d.total) })}
            description={t('diet.bill.rates', {
              meal: inr(d.mealRate),
              attendant: inr(d.attendantRate),
            })}
          >
            <DataTable
              caption={t('diet.bill.tab')}
              data={d.items.map((x) => ({ ...x, id: x.admissionId }))}
              empty={t('diet.bill.none')}
              columns={[
                {
                  id: 'bed',
                  header: t('diet.bill.bed'),
                  cell: ({ row }) => <span className="font-mono">{row.original.bed}</span>,
                },
                {
                  id: 'patient',
                  header: t('diet.bill.patient'),
                  cell: ({ row }) => row.original.patient,
                },
                {
                  id: 'meals',
                  header: t('diet.bill.meals'),
                  cell: ({ row }) => row.original.meals,
                },
                {
                  id: 'att',
                  header: t('diet.bill.attendant'),
                  cell: ({ row }) => row.original.attendantMeals,
                },
                {
                  id: 'amount',
                  header: t('diet.bill.amount'),
                  cell: ({ row }) => <span className="tabular">{inr(row.original.amount)}</span>,
                },
              ]}
            />
          </Card>
        )}
      </QueryView>
    </div>
  );
}
