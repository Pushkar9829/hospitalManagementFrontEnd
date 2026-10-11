import { baseApi } from '../../app/baseApi.js';
import { cleanParams } from '../../lib/params.js';

/* Patient portal (apps/api/src/modules/portal): its own cookie session, no staff sign-in. */

const TAGS = [
  'PortalMe',
  'PortalBills',
  'PortalStay',
  'PortalReports',
  'PortalAppointments',
  'PortalSlots',
];
const ALL = TAGS;

export const portalApi = baseApi.enhanceEndpoints({ addTagTypes: TAGS }).injectEndpoints({
  endpoints: (b) => ({
    portalRequestOtp: b.mutation({
      query: (mobile) => ({ url: '/portal/auth/otp', method: 'POST', body: { mobile } }),
    }),
    portalVerifyOtp: b.mutation({
      query: (body) => ({ url: '/portal/auth/verify', method: 'POST', body }),
      invalidatesTags: ALL,
    }),
    portalLogout: b.mutation({
      query: () => ({ url: '/portal/auth/logout', method: 'POST' }),
      invalidatesTags: ALL,
    }),
    portalMe: b.query({ query: () => '/portal/me', providesTags: ['PortalMe'] }),
    portalReports: b.query({
      query: (patientId) => `/portal/patients/${patientId}/reports`,
      providesTags: ['PortalReports'],
    }),
    portalBills: b.query({ query: () => '/portal/bills', providesTags: ['PortalBills'] }),
    portalStay: b.query({ query: () => '/portal/stay', providesTags: ['PortalStay'] }),
    portalSlots: b.query({
      query: (params) => ({ url: '/portal/slots', params: cleanParams(params) }),
      providesTags: ['PortalSlots'],
    }),
    portalAppointments: b.query({
      query: () => '/portal/appointments',
      providesTags: ['PortalAppointments'],
    }),
    portalBook: b.mutation({
      query: (body) => ({ url: '/portal/appointments', method: 'POST', body }),
      invalidatesTags: ['PortalAppointments', 'PortalSlots', 'PortalMe'],
    }),
    portalCancel: b.mutation({
      query: (id) => ({ url: `/portal/appointments/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['PortalAppointments', 'PortalSlots', 'PortalMe'],
    }),
  }),
});

export const {
  usePortalRequestOtpMutation,
  usePortalVerifyOtpMutation,
  usePortalLogoutMutation,
  usePortalMeQuery,
  usePortalReportsQuery,
  usePortalBillsQuery,
  usePortalStayQuery,
  usePortalSlotsQuery,
  usePortalAppointmentsQuery,
  usePortalBookMutation,
  usePortalCancelMutation,
} = portalApi;
