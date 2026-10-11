import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Facility (apps/api/src/modules/facility) and the IPD bed-cleaning tasks it works from. */

const TAGS = [
  'FacSettings',
  'FacRounds',
  'FacSchedules',
  'FacLinen',
  'FacLaundry',
  'FacPorters',
  'FacAssets',
  'FacAsset',
  'FacDue',
  'FacTickets',
  'FacWaste',
  'FacCleaning',
];
const post = (url, body = {}) => ({ url, method: 'POST', body });

export const facilityApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    facSettings: b.query({ query: () => '/facility/settings', providesTags: ['FacSettings'] }),
    saveFacSettings: b.mutation({
      query: (body) => ({ url: '/facility/settings', method: 'PUT', body }),
      invalidatesTags: ['FacSettings', 'FacLinen'],
    }),
    bedCleaning: b.query({
      query: (status = 'OPEN') => ({ url: '/ipd/cleaning', params: { status } }),
      providesTags: ['FacCleaning'],
    }),
    facCleaningDone: b.mutation({
      query: (id) => post(`/ipd/cleaning/${id}/done`),
      invalidatesTags: ['FacCleaning'],
    }),
    hkRounds: b.query({
      query: (date) => ({ url: '/facility/hk-tasks', params: cleanParams({ date }) }),
      providesTags: ['FacRounds'],
    }),
    hkSchedules: b.query({ query: () => '/facility/hk-schedules', providesTags: ['FacSchedules'] }),
    createSchedule: b.mutation({
      query: (body) => post('/facility/hk-schedules', body),
      invalidatesTags: ['FacSchedules', 'FacRounds'],
    }),
    roundDone: b.mutation({
      query: ({ id, ...body }) => post(`/facility/hk-tasks/${id}/done`, body),
      invalidatesTags: ['FacRounds'],
    }),
    roundVerify: b.mutation({
      query: (id) => post(`/facility/hk-tasks/${id}/verify`),
      invalidatesTags: ['FacRounds'],
    }),
    linen: b.query({ query: () => '/facility/linen', providesTags: ['FacLinen'] }),
    issueLinen: b.mutation({
      query: (body) => post('/facility/linen/issue', body),
      invalidatesTags: ['FacLinen'],
    }),
    laundry: b.query({
      query: (status) => ({ url: '/facility/laundry', params: cleanParams({ status }) }),
      providesTags: ['FacLaundry'],
    }),
    sendLaundry: b.mutation({
      query: (body) => post('/facility/laundry', body),
      invalidatesTags: ['FacLaundry', 'FacLinen'],
    }),
    receiveLaundry: b.mutation({
      query: ({ id, lines }) => post(`/facility/laundry/${id}/receive`, { lines }),
      invalidatesTags: ['FacLaundry', 'FacLinen'],
    }),
    condemnLinen: b.mutation({
      query: (body) => post('/facility/linen/condemn', body),
      invalidatesTags: ['FacLinen'],
    }),
    porters: b.query({
      query: (status) => ({ url: '/facility/porters', params: cleanParams({ status }) }),
      providesTags: ['FacPorters'],
    }),
    requestPorter: b.mutation({
      query: (body) => post('/facility/porters', body),
      invalidatesTags: ['FacPorters'],
    }),
    movePorter: b.mutation({
      query: ({ id, action, porter }) => post(`/facility/porters/${id}/${action}`, { porter }),
      invalidatesTags: ['FacPorters'],
    }),
    assets: b.query({
      query: (params = {}) => ({ url: '/facility/assets', params: cleanParams(params) }),
      providesTags: ['FacAssets'],
    }),
    asset: b.query({ query: (id) => `/facility/assets/${id}`, providesTags: ['FacAsset'] }),
    assetsDue: b.query({ query: () => '/facility/assets/due', providesTags: ['FacDue'] }),
    createAsset: b.mutation({
      query: (body) => post('/facility/assets', body),
      invalidatesTags: ['FacAssets', 'FacDue'],
    }),
    recordPm: b.mutation({
      query: ({ id, ...body }) => post(`/facility/assets/${id}/pm`, body),
      invalidatesTags: ['FacAssets', 'FacAsset', 'FacDue'],
    }),
    assetStatus: b.mutation({
      query: ({ id, ...body }) => post(`/facility/assets/${id}/status`, body),
      invalidatesTags: ['FacAssets', 'FacAsset'],
    }),
    tickets: b.query({
      query: (params = {}) => ({ url: '/facility/tickets', params: cleanParams(params) }),
      providesTags: ['FacTickets'],
    }),
    raiseTicket: b.mutation({
      query: (body) => post('/facility/tickets', body),
      invalidatesTags: ['FacTickets', 'FacAssets', 'FacAsset'],
    }),
    ticketAction: b.mutation({
      query: ({ id, ...body }) => post(`/facility/tickets/${id}/action`, body),
      invalidatesTags: ['FacTickets', 'FacAssets', 'FacAsset'],
    }),
    waste: b.query({
      query: (date) => ({ url: '/facility/waste', params: cleanParams({ date }) }),
      providesTags: ['FacWaste'],
    }),
    recordWaste: b.mutation({
      query: (body) => post('/facility/waste', body),
      invalidatesTags: ['FacWaste'],
    }),
    wasteHandover: b.mutation({
      query: (body) => post('/facility/waste/handover', body),
      invalidatesTags: ['FacWaste'],
    }),
    wasteReport: b.query({
      query: (month) => ({ url: '/facility/waste/report', params: { month } }),
      providesTags: ['FacWaste'],
    }),
  }),
});

export const {
  useFacSettingsQuery,
  useSaveFacSettingsMutation,
  useBedCleaningQuery,
  useFacCleaningDoneMutation,
  useHkRoundsQuery,
  useHkSchedulesQuery,
  useCreateScheduleMutation,
  useRoundDoneMutation,
  useRoundVerifyMutation,
  useLinenQuery,
  useIssueLinenMutation,
  useLaundryQuery,
  useSendLaundryMutation,
  useReceiveLaundryMutation,
  useCondemnLinenMutation,
  usePortersQuery,
  useRequestPorterMutation,
  useMovePorterMutation,
  useAssetsQuery,
  useAssetQuery,
  useAssetsDueQuery,
  useCreateAssetMutation,
  useRecordPmMutation,
  useAssetStatusMutation,
  useTicketsQuery,
  useRaiseTicketMutation,
  useTicketActionMutation,
  useWasteQuery,
  useRecordWasteMutation,
  useWasteHandoverMutation,
  useWasteReportQuery,
} = facilityApi;

export const TICKET_TONE = {
  OPEN: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  REOPENED: 'critical',
};
export const PRIORITY_TONE = {
  URGENT: 'critical',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'neutral',
};
export const ASSET_TONE = {
  IN_SERVICE: 'success',
  OUT_OF_SERVICE: 'critical',
  CONDEMNED: 'neutral',
};
export const PORTER_TONE = {
  REQUESTED: 'warning',
  ASSIGNED: 'info',
  PICKED: 'info',
  DONE: 'success',
  CANCELLED: 'neutral',
};
