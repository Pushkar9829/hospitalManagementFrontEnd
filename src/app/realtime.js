import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { baseApi } from './baseApi.js';

/**
 * Live screens (UI rule 9): one Socket.IO connection per signed-in tab. A server event only says
 * "this changed"; the screen refetches through the API, so nothing private travels over the
 * socket. After a reconnect every live list refetches, because events may have been missed.
 */
const EVENT_TAGS = {
  'queue:update': ['OpdQueue', 'OpdAppointments', 'OpdSlots', 'OpdVisits'],
  'frontoffice:update': ['FrontOffice'],
  'bed:update': [
    'FacCleaning',
    'IpdBeds',
    'IpdRequests',
    'IpdAdmissions',
    'IpdAdmission',
    'IpdCleaning',
    'IpdPreauths',
  ],
  'ward:update': ['IpdClinical', 'IpdBeds'],
  'lab:update': [
    'LabItems',
    'LabItem',
    'LabCollection',
    'LabSamples',
    'LabCalls',
    'LabCounts',
    'LabQc',
    'LabMicro',
    'LabHisto',
  ],
  'stock:update': [
    'InvStock',
    'InvBatches',
    'InvLedger',
    'InvReports',
    'InvReorder',
    'InvPos',
    'InvGrns',
    'InvIndents',
  ],
  'pharmacy:update': ['PhrQueue', 'PhrRx', 'PhrSales', 'PhrReturns', 'PhrRegisters', 'InvStock'],
  'rad:update': ['RadStudies', 'RadStudy', 'RadCounts', 'RadSlots', 'RadFormF'],
  'diet:update': ['DietOrders', 'DietProduction', 'DietTrays', 'DietMissed'],
  'facility:update': [
    'FacRounds',
    'FacLinen',
    'FacLaundry',
    'FacPorters',
    'FacAssets',
    'FacAsset',
    'FacDue',
    'FacTickets',
    'FacWaste',
  ],
};
const ALL_LIVE = [...new Set(Object.values(EVENT_TAGS).flat())];

/**
 * Websocket where the API is reached directly (own domain, development). Behind a rewrite that
 * cannot carry websockets (Vercel to Render), set VITE_SOCKET_TRANSPORT=polling.
 */
const TRANSPORTS =
  import.meta.env.VITE_SOCKET_TRANSPORT === 'polling' ? ['polling'] : ['websocket'];

export function useRealtime(enabled = true) {
  const dispatch = useDispatch();
  useEffect(() => {
    // Tests and the preview layer have no socket server.
    if (!enabled || import.meta.env.MODE === 'test') return undefined;
    // The socket client loads after sign-in, not with the first page (initial-JS budget).
    let socket = null;
    let closed = false;
    import('socket.io-client').then(({ io }) => {
      if (closed) return;
      socket = io({
        path: '/socket.io',
        withCredentials: true,
        transports: TRANSPORTS,
        // Read by the API behind a Host-rewriting proxy; browsers send it with polling only.
        extraHeaders: { 'x-hms-host': globalThis.location?.host ?? '' },
      });
      for (const [event, tags] of Object.entries(EVENT_TAGS))
        socket.on(event, () => dispatch(baseApi.util.invalidateTags(tags)));
      let connectedBefore = false;
      socket.on('connect', () => {
        if (connectedBefore) dispatch(baseApi.util.invalidateTags(ALL_LIVE));
        connectedBefore = true;
      });
    });
    return () => {
      closed = true;
      socket?.disconnect();
    };
  }, [dispatch, enabled]);
}
