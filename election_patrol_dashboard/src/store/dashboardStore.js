import { create } from "zustand";
import { io } from "socket.io-client";
import { NODE_SOCKET_URL } from "../utils/constants";

export const useDashboardStore = create((set, get) => ({
  officers: [],
  incidents: [],
  selectedIncident: null,
  connectedOfficerCount: 0,
  socket: null,

  initSocket: () => {
    if (get().socket) return;
    const s = io(NODE_SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });

    s.on("connect", () => {
      console.log("[NodeSocket] Connected!");
    });

    s.on("disconnect", () => {
      console.log("[NodeSocket] Disconnected");
    });

    s.on("error", (error) => {
      console.error("[NodeSocket] Error:", error);
    });

    s.on("locationUpdate", (data) => {
      get().updateOfficerLocation(
        data.unique_id,
        data.latitude,
        data.longitude,
        data.availability_status,
        data.timestamp
      );
    });

    set({ socket: s });
  },

  emitDispatch: (targetUserId, incident) => {
    const s = get().socket;
    if (s && s.connected) {
      console.log(`[NodeSocket] Dispatching alert to ${targetUserId}:`, incident);
      s.emit("dispatchAlert", { targetUserId, incident });
    } else {
      console.warn(`[NodeSocket] Cannot dispatch - socket not connected`);
    }
  },

  setOfficers: (officers) => set({ officers }),

  updateOfficerLocation: (
    unique_id,
    latitude,
    longitude,
    availability_status,
    timestamp
  ) =>
    set((state) => {
      const idx = state.officers.findIndex((o) => o.unique_id === unique_id);
      if (idx === -1) {
        return {
          officers: [
            ...state.officers,
            {
              unique_id,
              username: "Patrol Officer",
              rank: "Tracking",
              last_latitude: latitude,
              last_longitude: longitude,
              availability_status,
              last_updated: timestamp,
            },
          ],
        };
      }
      return {
        officers: state.officers.map((o) =>
          o.unique_id === unique_id
            ? {
                ...o,
                last_latitude: latitude,
                last_longitude: longitude,
                availability_status,
                last_updated: timestamp,
              }
            : o
        ),
      };
    }),

  addOfficerOnline: (officerData) =>
    set((state) => {
      const idx = state.officers.findIndex(
        (o) => o.unique_id === officerData.unique_id
      );
      if (idx === -1) {
        return { officers: [...state.officers, officerData] };
      }
      const next = [...state.officers];
      next[idx] = { ...next[idx], ...officerData };
      return { officers: next };
    }),

  removeOfficerOffline: (unique_id) =>
    set((state) => ({
      officers: state.officers.filter((o) => o.unique_id !== unique_id),
    })),

  setIncidents: (incidents) => set({ incidents }),

  addIncident: (incident) =>
    set((state) => ({ incidents: [...state.incidents, incident] })),

  updateIncidentStatus: (incident_id, status) =>
    set((state) => ({
      incidents: state.incidents.map((i) =>
        i.incident_id === incident_id ? { ...i, status } : i
      ),
    })),

  setSelectedIncident: (incident) => set({ selectedIncident: incident }),

  setConnectedCount: (count) => set({ connectedOfficerCount: count }),
}));
