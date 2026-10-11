import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/** What a bill change can touch: the bill, its lists, the patient's timeline and approvals. */
const BILL_WRITE = ['Bills', 'Payments', 'Patients', 'Shift', 'Approvals', 'ApprovalCount'];

/**
 * Billing engine (docs/modules/BILLING.md): draft bills priced from the patient's price list
 * (rule R1), finalise with the next number (open shift needed, R10), payments split across
 * modes with an Idempotency-Key, discounts and cancellations through approval (202), deposits,
 * refunds to the original mode, cashier shifts. Amounts in request bodies are rupees; responses
 * are paise.
 */
export const billingApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    settlements: b.query({
      query: (date) => ({ url: '/billing/settlements', params: { date } }),
      providesTags: ['Cashbook'],
    }),
    recordSettlement: b.mutation({
      query: (body) => ({ url: '/billing/settlements', method: 'POST', body }),
      invalidatesTags: ['Cashbook'],
    }),
    bankDeposits: b.query({ query: () => '/billing/bank-deposits', providesTags: ['Cashbook'] }),
    createBankDeposit: b.mutation({
      query: (body) => ({ url: '/billing/bank-deposits', method: 'POST', body }),
      invalidatesTags: ['Cashbook'],
    }),
    setBankDepositStatus: b.mutation({
      query: ({ id, ...body }) => ({
        url: `/billing/bank-deposits/${id}/status`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Cashbook'],
    }),
    dayState: b.query({
      query: (date) => `/billing/days/${date}`,
      providesTags: ['Cashbook', 'Shift'],
    }),
    lockDay: b.mutation({
      query: (date) => ({ url: `/billing/days/${date}/lock`, method: 'POST' }),
      invalidatesTags: ['Cashbook', 'Shift'],
    }),
    creditPayers: b.query({ query: () => '/billing/credit-payers', providesTags: ['Corporates'] }),
    corporates: b.query({ query: () => '/billing/corporates', providesTags: ['Corporates'] }),
    corporate: b.query({
      query: (id) => `/billing/corporates/${id}`,
      providesTags: ['Corporates'],
    }),
    corporateStatement: b.query({
      query: (id) => `/billing/corporates/${id}/statement`,
      providesTags: ['Corporates'],
    }),
    corporateAgeing: b.query({
      query: () => '/billing/corporates/ageing',
      providesTags: ['Corporates'],
    }),
    setCorporateHold: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/corporates/${id}/hold`, method: 'POST', body }),
      invalidatesTags: ['Corporates'],
    }),
    corporateInvoices: b.query({
      query: (params) => ({ url: '/billing/corporate-invoices', params: cleanParams(params) }),
      providesTags: ['Corporates'],
    }),
    issueCorporateInvoice: b.mutation({
      query: (body) => ({ url: '/billing/corporate-invoices', method: 'POST', body }),
      invalidatesTags: ['Corporates', 'Bills'],
    }),
    corporatePayment: b.mutation({
      query: ({ id, ...body }) => ({
        url: `/billing/corporate-invoices/${id}/payments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Corporates', 'Bills'],
    }),
    lettersOfCredit: b.query({
      query: (params) => ({ url: '/billing/letters-of-credit', params: cleanParams(params) }),
      providesTags: ['Corporates'],
    }),
    addLetterOfCredit: b.mutation({
      query: (body) => ({ url: '/billing/letters-of-credit', method: 'POST', body }),
      invalidatesTags: ['Corporates'],
    }),
    cancelLetterOfCredit: b.mutation({
      query: ({ id, ...body }) => ({
        url: `/billing/letters-of-credit/${id}/cancel`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Corporates'],
    }),
    billingSettings: b.query({
      query: () => '/billing/settings',
      providesTags: ['BillingSettings'],
    }),
    updateBillingSettings: b.mutation({
      query: (body) => ({ url: '/billing/settings', method: 'PUT', body }),
      invalidatesTags: ['BillingSettings'],
    }),
    billingAnalytics: b.query({
      query: (params) => ({ url: '/billing/analytics', params: cleanParams(params) }),
      providesTags: ['Bills', 'Payments'],
    }),
    bills: b.query({
      query: (params) => ({ url: '/billing/bills', params: cleanParams(params) }),
      providesTags: ['Bills'],
    }),
    bill: b.query({
      query: (id) => `/billing/bills/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Bills', id }],
    }),
    createBill: b.mutation({
      query: (body) => ({ url: '/billing/bills', method: 'POST', body }),
      invalidatesTags: ['Bills'],
    }),
    replaceLines: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/bills/${id}/lines`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => ['Bills', { type: 'Bills', id }],
    }),
    finalizeBill: b.mutation({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/billing/bills/${id}/finalize`,
        method: 'POST',
        body,
        idempotencyKey,
      }),
      invalidatesTags: (_r, _e, { id }) => [...BILL_WRITE, { type: 'Bills', id }],
    }),
    requestDiscount: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/bills/${id}/discount`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [...BILL_WRITE, { type: 'Bills', id }],
    }),
    requestCancel: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/bills/${id}/cancel`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [...BILL_WRITE, 'Refunds', { type: 'Bills', id }],
    }),
    payments: b.query({
      query: (params) => ({ url: '/billing/payments', params: cleanParams(params) }),
      providesTags: ['Payments'],
    }),
    /** One receipt; `idempotencyKey` is kept by the caller per user action (a retry reuses it). */
    receivePayment: b.mutation({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/billing/payments',
        method: 'POST',
        body,
        idempotencyKey,
      }),
      invalidatesTags: [...BILL_WRITE, 'Deposits'],
    }),
    deposits: b.query({
      query: (params) => ({ url: '/billing/deposits', params: cleanParams(params) }),
      providesTags: ['Deposits'],
    }),
    takeDeposit: b.mutation({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/billing/deposits',
        method: 'POST',
        body,
        idempotencyKey,
      }),
      invalidatesTags: ['Deposits', 'Shift', 'Patients'],
    }),
    refunds: b.query({
      query: (params) => ({ url: '/billing/refunds', params: cleanParams(params) }),
      providesTags: ['Refunds'],
    }),
    payRefund: b.mutation({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/billing/refunds/${id}/pay`,
        method: 'POST',
        body,
        idempotencyKey,
      }),
      invalidatesTags: ['Refunds', 'Bills', 'Shift'],
    }),
    currentShift: b.query({
      query: () => '/billing/shifts/current',
      providesTags: ['Shift'],
    }),
    shifts: b.query({
      query: (params) => ({ url: '/billing/shifts', params: cleanParams(params) }),
      providesTags: ['Shifts'],
    }),
    openShift: b.mutation({
      query: (body) => ({ url: '/billing/shifts', method: 'POST', body }),
      invalidatesTags: ['Shift', 'Shifts'],
    }),
    closeShift: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/shifts/${id}/close`, method: 'POST', body }),
      invalidatesTags: ['Shift', 'Shifts'],
    }),
    verifyShift: b.mutation({
      query: ({ id, ...body }) => ({ url: `/billing/shifts/${id}/verify`, method: 'POST', body }),
      invalidatesTags: ['Shifts'],
    }),
  }),
});

export const {
  useBillingAnalyticsQuery,
  useSettlementsQuery,
  useRecordSettlementMutation,
  useBankDepositsQuery,
  useCreateBankDepositMutation,
  useSetBankDepositStatusMutation,
  useDayStateQuery,
  useLockDayMutation,
  useCreditPayersQuery,
  useCorporatesQuery,
  useCorporateQuery,
  useCorporateStatementQuery,
  useCorporateAgeingQuery,
  useSetCorporateHoldMutation,
  useCorporateInvoicesQuery,
  useIssueCorporateInvoiceMutation,
  useCorporatePaymentMutation,
  useLettersOfCreditQuery,
  useAddLetterOfCreditMutation,
  useCancelLetterOfCreditMutation,
  useBillingSettingsQuery,
  useUpdateBillingSettingsMutation,
  useBillsQuery,
  useBillQuery,
  useCreateBillMutation,
  useReplaceLinesMutation,
  useFinalizeBillMutation,
  useRequestDiscountMutation,
  useRequestCancelMutation,
  usePaymentsQuery,
  useReceivePaymentMutation,
  useDepositsQuery,
  useTakeDepositMutation,
  useRefundsQuery,
  usePayRefundMutation,
  useCurrentShiftQuery,
  useShiftsQuery,
  useOpenShiftMutation,
  useCloseShiftMutation,
  useVerifyShiftMutation,
} = billingApi;
