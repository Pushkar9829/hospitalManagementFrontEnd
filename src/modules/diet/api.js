import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Diet and kitchen (apps/api/src/modules/diet). */

const TAGS = [
  'DietSettings',
  'DietOrders',
  'DietProduction',
  'DietTrays',
  'DietMissed',
  'DietNotes',
];
const LIVE = ['DietOrders', 'DietProduction', 'DietTrays', 'DietMissed'];

export const dietApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    dietSettings: b.query({ query: () => '/diet/settings', providesTags: ['DietSettings'] }),
    saveDietSettings: b.mutation({
      query: (body) => ({ url: '/diet/settings', method: 'PUT', body }),
      invalidatesTags: ['DietSettings', ...LIVE],
    }),
    dietOrders: b.query({
      query: (params = {}) => ({ url: '/diet/orders', params: cleanParams(params) }),
      providesTags: ['DietOrders'],
    }),
    setDiet: b.mutation({
      query: ({ admissionId, ...body }) => ({
        url: `/diet/orders/${admissionId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: LIVE,
    }),
    setNbm: b.mutation({
      query: ({ admissionId, ...body }) => ({
        url: `/diet/orders/${admissionId}/nbm`,
        method: 'POST',
        body,
      }),
      invalidatesTags: LIVE,
    }),
    clearNbm: b.mutation({
      query: (admissionId) => ({ url: `/diet/orders/${admissionId}/nbm`, method: 'DELETE' }),
      invalidatesTags: LIVE,
    }),
    production: b.query({
      query: (params) => ({ url: '/diet/production', params: cleanParams(params) }),
      providesTags: ['DietProduction'],
    }),
    prepareMeal: b.mutation({
      query: (body) => ({ url: '/diet/production/prepare', method: 'POST', body }),
      invalidatesTags: LIVE,
    }),
    dietTrays: b.query({
      query: (params) => ({ url: '/diet/trays', params: cleanParams(params) }),
      providesTags: ['DietTrays'],
    }),
    deliverTrays: b.mutation({
      query: (body) => ({ url: '/diet/trays/deliver', method: 'POST', body }),
      invalidatesTags: LIVE,
    }),
    missTray: b.mutation({
      query: ({ id, reason }) => ({
        url: `/diet/trays/${id}/missed`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: LIVE,
    }),
    mealBilling: b.query({
      query: (date) => ({ url: '/diet/billing', params: { date } }),
      providesTags: ['DietMissed'],
    }),
    missedMeals: b.query({
      query: (date) => ({ url: '/diet/missed', params: cleanParams({ date }) }),
      providesTags: ['DietMissed'],
    }),
    dietNotes: b.query({ query: (id) => `/diet/notes/${id}`, providesTags: ['DietNotes'] }),
    addDietNote: b.mutation({
      query: ({ admissionId, ...body }) => ({
        url: `/diet/notes/${admissionId}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['DietNotes'],
    }),
  }),
});

export const {
  useDietSettingsQuery,
  useSaveDietSettingsMutation,
  useDietOrdersQuery,
  useSetDietMutation,
  useSetNbmMutation,
  useClearNbmMutation,
  useProductionQuery,
  usePrepareMealMutation,
  useDietTraysQuery,
  useDeliverTraysMutation,
  useMissTrayMutation,
  useMissedMealsQuery,
  useMealBillingQuery,
  useDietNotesQuery,
  useAddDietNoteMutation,
} = dietApi;

export const TRAY_TONE = {
  PREPARED: 'info',
  DELIVERED: 'success',
  MISSED: 'critical',
  NBM: 'warning',
};
