import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Finance (apps/api/src/modules/finance): chart, vouchers, statements, GST, period close. Paise. */

const FIN = ['FinAccounts', 'FinVouchers', 'FinStatements', 'FinPeriod', 'FinLedgers'];

export const financeApi = baseApi.enhanceEndpoints({ addTagTypes: FIN }).injectEndpoints({
  endpoints: (b) => ({
    finAccounts: b.query({ query: () => '/finance/accounts', providesTags: ['FinAccounts'] }),
    createAccount: b.mutation({
      query: (body) => ({ url: '/finance/accounts', method: 'POST', body }),
      invalidatesTags: ['FinAccounts'],
    }),
    vouchers: b.query({
      query: (params = {}) => ({ url: '/finance/vouchers', params: cleanParams(params) }),
      providesTags: ['FinVouchers'],
    }),
    createVoucher: b.mutation({
      query: (body) => ({ url: '/finance/vouchers', method: 'POST', body }),
      invalidatesTags: ['FinVouchers', 'FinStatements'],
    }),
    trialBalance: b.query({
      query: (params = {}) => ({ url: '/finance/trial-balance', params: cleanParams(params) }),
      providesTags: ['FinStatements'],
    }),
    profitLoss: b.query({
      query: (params = {}) => ({ url: '/finance/profit-loss', params: cleanParams(params) }),
      providesTags: ['FinStatements'],
    }),
    balanceSheet: b.query({
      query: (params = {}) => ({ url: '/finance/balance-sheet', params: cleanParams(params) }),
      providesTags: ['FinStatements'],
    }),
    ledger: b.query({
      query: ({ id, ...params }) => ({ url: `/finance/ledger/${id}`, params: cleanParams(params) }),
      providesTags: ['FinStatements'],
    }),
    gst: b.query({
      query: (month) => ({ url: '/finance/gst', params: { month } }),
      providesTags: ['FinStatements'],
    }),
    period: b.query({ query: () => '/finance/period', providesTags: ['FinPeriod'] }),
    lockPeriod: b.mutation({
      query: (body) => ({ url: '/finance/period/lock', method: 'POST', body }),
      invalidatesTags: ['FinPeriod'],
    }),
    reopenPeriod: b.mutation({
      query: (body) => ({ url: '/finance/period/reopen', method: 'POST', body }),
      invalidatesTags: ['FinPeriod'],
    }),
    // Sub-ledgers: payables, receivables, budgets, petty cash, doctor payouts.
    finLedger: b.query({
      query: ({ path, params }) => ({ url: `/finance/${path}`, params: cleanParams(params ?? {}) }),
      providesTags: ['FinLedgers'],
    }),
    finLedgerWrite: b.mutation({
      query: ({ method = 'POST', path, body }) => ({ url: `/finance/${path}`, method, body }),
      invalidatesTags: ['FinLedgers', 'FinVouchers', 'FinStatements'],
    }),
  }),
});

export const {
  useFinAccountsQuery,
  useCreateAccountMutation,
  useVouchersQuery,
  useCreateVoucherMutation,
  useTrialBalanceQuery,
  useProfitLossQuery,
  useBalanceSheetQuery,
  useLedgerQuery,
  useGstQuery,
  usePeriodQuery,
  useLockPeriodMutation,
  useReopenPeriodMutation,
  useFinLedgerQuery,
  useFinLedgerWriteMutation,
} = financeApi;

export const VOUCHER_TONE = {
  POSTED: 'success',
  PENDING_APPROVAL: 'warning',
  REJECTED: 'critical',
  REVERSED: 'neutral',
};
