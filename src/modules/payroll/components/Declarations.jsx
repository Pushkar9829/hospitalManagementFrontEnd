import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, DataTable, StatusBadge, useToast } from '@hms/ui';
import { useCan } from '../../../lib/useCan.js';
import { inr } from '../../../lib/money.js';
import { FormDialog } from '../../dx-kit/FormDialog.jsx';
import { QueryView } from '../../dx-kit/QueryView.jsx';
import { useReviewDeclarationMutation, useTaxDeclarationsQuery } from '../../hr/api.js';

const TONE = { SUBMITTED: 'info', VERIFIED: 'success', REJECTED: 'critical' };

/** Employees' income-tax declarations for the year, verified or rejected by payroll. */
export function DeclarationsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const can = useCan();
  const edit = can('payroll:run:create');
  const q = useTaxDeclarationsQuery({});
  const [review] = useReviewDeclarationMutation();
  const [rejecting, setRejecting] = useState(null);
  const rupees = (v) => (v ? inr(v * 100) : '–');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{t('pay.decl.hint')}</p>
      <QueryView query={q} rows={3}>
        {(d) => (
          <DataTable
            caption={t('pay.decl.tab')}
            data={d.items}
            empty={t('pay.decl.none')}
            columns={[
              {
                id: 'emp',
                header: t('pay.decl.employee'),
                cell: ({ row }) => (
                  <span>
                    {row.original.employee?.name}{' '}
                    <span className="font-mono text-sm text-muted">
                      {row.original.employee?.empNo}
                    </span>
                  </span>
                ),
              },
              {
                id: 'regime',
                header: t('pay.decl.regime'),
                cell: ({ row }) => t(`me.tax.regimes.${row.original.regime}`),
              },
              {
                id: 'rent',
                header: t('pay.decl.rent'),
                cell: ({ row }) => rupees(row.original.rentMonthly),
              },
              {
                id: 'c',
                header: t('pay.decl.d80C'),
                cell: ({ row }) => rupees(row.original.deductions80C),
              },
              {
                id: 'd',
                header: t('pay.decl.d80D'),
                cell: ({ row }) => rupees(row.original.deductions80D),
              },
              {
                id: 'status',
                header: t('common.status'),
                cell: ({ row }) => (
                  <StatusBadge
                    tone={TONE[row.original.status]}
                    label={t(`me.tax.status.${row.original.status}`)}
                  />
                ),
              },
              edit && {
                id: 'act',
                header: '',
                cell: ({ row }) =>
                  row.original.status === 'SUBMITTED' ? (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await review({
                            id: row.original.id,
                            version: row.original.version,
                            outcome: 'VERIFIED',
                          }).unwrap();
                          toast({ tone: 'success', title: t('pay.decl.done') });
                        }}
                      >
                        {t('pay.decl.verify')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(row.original)}>
                        {t('pay.decl.reject')}
                      </Button>
                    </span>
                  ) : null,
              },
            ].filter(Boolean)}
          />
        )}
      </QueryView>
      <FormDialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={rejecting ? t('pay.decl.rejectTitle', { name: rejecting.employee?.name }) : ''}
        destructive
        schema={z.object({ note: z.string().trim().min(3).max(200) })}
        defaultValues={{ note: '' }}
        fields={[{ name: 'note', label: t('pay.decl.note'), type: 'textarea', required: true }]}
        submitLabel={t('pay.decl.reject')}
        onSubmit={(v) =>
          review({
            id: rejecting.id,
            version: rejecting.version,
            outcome: 'REJECTED',
            note: v.note,
          }).unwrap()
        }
        onDone={() => toast({ tone: 'success', title: t('pay.decl.done') })}
      />
    </div>
  );
}
