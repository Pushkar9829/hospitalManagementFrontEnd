import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/*
 * PM-JAY cashless desk (api/src/modules/pmjay): HBP packages, beneficiary cases, pre-auth and
 * claim on the scheme's clocks. Money in paise; ISO dates.
 */
const TAGS = ['PmjCases', 'PmjCase', 'PmjPackages', 'PmjSettings', 'PmjStays'];
const post = (url, body = {}) => ({ url, method: 'POST', body });
const CASE = (id) => [{ type: 'PmjCase', id }, 'PmjCases', 'PmjStays'];

export const pmjayApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    pmjSummary: b.query({ query: () => '/pmjay/summary', providesTags: ['PmjCases'] }),
    pmjCases: b.query({
      query: (params = {}) => ({ url: '/pmjay/cases', params: cleanParams(params) }),
      providesTags: ['PmjCases'],
    }),
    pmjCase: b.query({
      query: (id) => `/pmjay/cases/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PmjCase', id }],
    }),
    pmjStays: b.query({
      query: (params = {}) => ({ url: '/pmjay/stays', params: cleanParams(params) }),
      providesTags: ['PmjStays'],
    }),
    pmjRegister: b.mutation({
      query: (body) => post('/pmjay/cases', body),
      invalidatesTags: ['PmjCases', 'PmjStays'],
    }),
    pmjSetPackages: b.mutation({
      query: ({ id, ...body }) => ({ url: `/pmjay/cases/${id}/packages`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => CASE(id),
    }),
    pmjAddDocument: b.mutation({
      query: ({ id, ...body }) => post(`/pmjay/cases/${id}/documents`, body),
      invalidatesTags: (_r, _e, { id }) => CASE(id),
    }),
    pmjStep: b.mutation({
      // step: preauth | preauth/decision | preauth/answer-query | claim | claim/decision |
      // claim/answer-query | payment | cancel | nhcx/mock-response
      query: ({ id, step, ...body }) => post(`/pmjay/cases/${id}/${step}`, body),
      invalidatesTags: (_r, _e, { id }) => CASE(id),
    }),
    pmjPackages: b.query({
      query: (params = {}) => ({ url: '/pmjay/packages', params: cleanParams(params) }),
      providesTags: ['PmjPackages'],
    }),
    pmjSavePackage: b.mutation({
      query: ({ id, ...body }) =>
        id
          ? { url: `/pmjay/packages/${id}`, method: 'PATCH', body }
          : post('/pmjay/packages', body),
      invalidatesTags: ['PmjPackages'],
    }),
    pmjSettings: b.query({ query: () => '/pmjay/settings', providesTags: ['PmjSettings'] }),
    pmjSaveSettings: b.mutation({
      query: (body) => ({ url: '/pmjay/settings', method: 'PUT', body }),
      invalidatesTags: ['PmjSettings'],
    }),
  }),
});

export const {
  usePmjSummaryQuery,
  usePmjCasesQuery,
  usePmjCaseQuery,
  usePmjStaysQuery,
  usePmjRegisterMutation,
  usePmjSetPackagesMutation,
  usePmjAddDocumentMutation,
  usePmjStepMutation,
  usePmjPackagesQuery,
  usePmjSavePackageMutation,
  usePmjSettingsQuery,
  usePmjSaveSettingsMutation,
} = pmjayApi;
