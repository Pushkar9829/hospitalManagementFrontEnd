import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/*
 * IPD, nursing and the insurance desk (docs/modules/IPD.md): apps/api/src/modules/ipd.
 * Lists are { items, total, page, limit }; money in paise; ISO dates.
 */

const post = (url, body = {}) => ({ url, method: 'POST', body });
const STAY = (id) => [{ type: 'IpdAdmission', id }, 'IpdAdmissions', 'IpdBeds'];

export const ipdApi = baseApi
  .enhanceEndpoints({
    addTagTypes: [
      'IpdBeds',
      'IpdRequests',
      'IpdAdmissions',
      'IpdAdmission',
      'IpdClinical',
      'IpdPreauths',
      'IpdSettings',
      'IpdReports',
      'IpdCleaning',
    ],
  })
  .injectEndpoints({
    endpoints: (b) => ({
      // Beds
      bedBoard: b.query({
        query: (params = {}) => ({ url: '/ipd/beds', params: cleanParams(params) }),
        providesTags: ['IpdBeds'],
      }),
      suggestBeds: b.query({
        query: (requestId) => ({ url: '/ipd/beds/suggest', params: { requestId } }),
        providesTags: ['IpdBeds'],
      }),
      blockBed: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/beds/${id}/block`, body),
        invalidatesTags: ['IpdBeds'],
      }),
      unblockBed: b.mutation({
        query: ({ id }) => post(`/ipd/beds/${id}/unblock`),
        invalidatesTags: ['IpdBeds'],
      }),
      cleaningTasks: b.query({
        query: (params = {}) => ({ url: '/ipd/cleaning', params: cleanParams(params) }),
        providesTags: ['IpdCleaning'],
      }),
      cleaningDone: b.mutation({
        query: ({ id }) => post(`/ipd/cleaning/${id}/done`),
        invalidatesTags: ['IpdCleaning', 'IpdBeds'],
      }),

      ipdLookups: b.query({ query: () => '/ipd/lookups', providesTags: ['IpdSettings'] }),

      // Requests
      admissionRequests: b.query({
        query: (params = {}) => ({ url: '/ipd/admission-requests', params: cleanParams(params) }),
        providesTags: ['IpdRequests'],
      }),
      createRequest: b.mutation({
        query: (body) => post('/ipd/admission-requests', body),
        invalidatesTags: ['IpdRequests'],
      }),
      estimateRequest: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admission-requests/${id}/estimate`, body),
        invalidatesTags: ['IpdRequests'],
      }),
      signEstimate: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admission-requests/${id}/sign-estimate`, body),
        invalidatesTags: ['IpdRequests'],
      }),
      reserveBed: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admission-requests/${id}/reserve`, body),
        invalidatesTags: ['IpdRequests', 'IpdBeds'],
      }),
      cancelRequest: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admission-requests/${id}/cancel`, body),
        invalidatesTags: ['IpdRequests', 'IpdBeds'],
      }),

      // Admissions
      admit: b.mutation({
        query: (body) => post('/ipd/admissions', body),
        invalidatesTags: ['IpdRequests', 'IpdBeds', 'IpdAdmissions'],
      }),
      admissions: b.query({
        query: (params = {}) => ({ url: '/ipd/admissions', params: cleanParams(params) }),
        providesTags: ['IpdAdmissions'],
      }),
      admission: b.query({
        query: (id) => `/ipd/admissions/${id}`,
        providesTags: (_r, _e, id) => [{ type: 'IpdAdmission', id }],
      }),
      transfer: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/transfer`, body),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      addCharge: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/charges`, body),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      planDischarge: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/plan-discharge`, body),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      saveSummary: b.mutation({
        query: ({ id, ...body }) => ({
          url: `/ipd/admissions/${id}/discharge-summary`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      signSummary: b.mutation({
        query: ({ id }) => post(`/ipd/admissions/${id}/discharge-summary/sign`),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      summaryAddendum: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/discharge-summary/addenda`, body),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      adviseDischarge: b.mutation({
        query: ({ id }) => post(`/ipd/admissions/${id}/advise-discharge`),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      finalBill: b.mutation({
        query: ({ id }) => post(`/ipd/admissions/${id}/final-bill`),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),
      discharge: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/discharge`, body),
        invalidatesTags: (_r, _e, { id }) => STAY(id),
      }),

      // Rounds and nursing
      notes: b.query({
        query: ({ id, kind }) => ({
          url: `/ipd/admissions/${id}/notes`,
          params: cleanParams({ kind }),
        }),
        providesTags: ['IpdClinical'],
      }),
      addDoctorNote: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/notes`, body),
        invalidatesTags: ['IpdClinical', 'IpdAdmissions'],
      }),
      addNursingNote: b.mutation({
        query: ({ id, ...body }) => post(`/nursing/admissions/${id}/notes`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      medOrders: b.query({
        query: ({ id, status }) => ({
          url: `/ipd/admissions/${id}/med-orders`,
          params: cleanParams({ status }),
        }),
        providesTags: ['IpdClinical'],
      }),
      orderMedicine: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/med-orders`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      verifyOrder: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/med-orders/${id}/verify`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      stopOrder: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/med-orders/${id}/stop`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      nursingWards: b.query({ query: () => '/nursing/wards', providesTags: ['IpdBeds'] }),
      wardCensus: b.query({
        query: (wardId) => `/nursing/wards/${wardId}/census`,
        providesTags: ['IpdClinical', 'IpdBeds'],
      }),
      mar: b.query({
        query: ({ id, date }) => ({
          url: `/nursing/admissions/${id}/mar`,
          params: cleanParams({ date }),
        }),
        providesTags: ['IpdClinical'],
      }),
      administer: b.mutation({
        query: ({ id, ...body }) => post(`/nursing/mar/${id}/administer`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      vitals: b.query({
        query: (id) => `/nursing/admissions/${id}/vitals`,
        providesTags: ['IpdClinical'],
      }),
      recordVitals: b.mutation({
        query: ({ id, ...body }) => post(`/nursing/admissions/${id}/vitals`, body),
        invalidatesTags: ['IpdClinical'],
      }),
      io: b.query({ query: (id) => `/nursing/admissions/${id}/io`, providesTags: ['IpdClinical'] }),
      recordIo: b.mutation({
        query: ({ id, ...body }) => post(`/nursing/admissions/${id}/io`, body),
        invalidatesTags: ['IpdClinical'],
      }),

      // Insurance desk
      preauths: b.query({
        query: (params = {}) => ({ url: '/ipd/preauths', params: cleanParams(params) }),
        providesTags: ['IpdPreauths'],
      }),
      preauth: b.query({ query: (id) => `/ipd/preauths/${id}`, providesTags: ['IpdPreauths'] }),
      sendPreauth: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/admissions/${id}/preauth`, body),
        invalidatesTags: ['IpdPreauths'],
      }),
      preauthReply: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/preauths/${id}/reply`, body),
        invalidatesTags: ['IpdPreauths', 'IpdAdmissions'],
      }),
      answerQuery: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/preauths/${id}/answer-query`, body),
        invalidatesTags: ['IpdPreauths'],
      }),
      enhancement: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/preauths/${id}/enhancements`, body),
        invalidatesTags: ['IpdPreauths'],
      }),
      sendFinal: b.mutation({
        query: ({ id }) => post(`/ipd/preauths/${id}/final`),
        invalidatesTags: ['IpdPreauths'],
      }),
      fileClaim: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/preauths/${id}/claim`, body),
        invalidatesTags: ['IpdPreauths'],
      }),
      settleClaim: b.mutation({
        query: ({ id, ...body }) => post(`/ipd/preauths/${id}/settle`, body),
        invalidatesTags: ['IpdPreauths'],
      }),

      // Settings and reports
      ipdSettings: b.query({ query: () => '/ipd/settings', providesTags: ['IpdSettings'] }),
      saveIpdSettings: b.mutation({
        query: (body) => ({ url: '/ipd/settings', method: 'PUT', body }),
        invalidatesTags: ['IpdSettings'],
      }),
      ipdCensus: b.query({
        query: () => '/reports/ipd-census',
        providesTags: ['IpdReports', 'IpdBeds'],
      }),
      ipdIndicators: b.query({
        query: (params = {}) => ({ url: '/reports/ipd-indicators', params: cleanParams(params) }),
        providesTags: ['IpdReports'],
      }),
    }),
  });

export const {
  useIpdLookupsQuery,
  useBedBoardQuery,
  useSuggestBedsQuery,
  useBlockBedMutation,
  useUnblockBedMutation,
  useCleaningTasksQuery,
  useCleaningDoneMutation,
  useAdmissionRequestsQuery,
  useCreateRequestMutation,
  useEstimateRequestMutation,
  useSignEstimateMutation,
  useReserveBedMutation,
  useCancelRequestMutation,
  useAdmitMutation,
  useAdmissionsQuery,
  useAdmissionQuery,
  useTransferMutation,
  useAddChargeMutation,
  usePlanDischargeMutation,
  useSaveSummaryMutation,
  useSignSummaryMutation,
  useSummaryAddendumMutation,
  useAdviseDischargeMutation,
  useFinalBillMutation,
  useDischargeMutation,
  useNotesQuery,
  useAddDoctorNoteMutation,
  useAddNursingNoteMutation,
  useMedOrdersQuery,
  useOrderMedicineMutation,
  useVerifyOrderMutation,
  useStopOrderMutation,
  useNursingWardsQuery,
  useWardCensusQuery,
  useMarQuery,
  useAdministerMutation,
  useVitalsQuery,
  useRecordVitalsMutation,
  useIoQuery,
  useRecordIoMutation,
  usePreauthsQuery,
  usePreauthQuery,
  useSendPreauthMutation,
  usePreauthReplyMutation,
  useAnswerQueryMutation,
  useEnhancementMutation,
  useSendFinalMutation,
  useFileClaimMutation,
  useSettleClaimMutation,
  useIpdSettingsQuery,
  useSaveIpdSettingsMutation,
  useIpdCensusQuery,
  useIpdIndicatorsQuery,
} = ipdApi;
