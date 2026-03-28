import { create } from "zustand";

export const useDashboardStore = create((set) => ({
  officers: [],
  incidents: [],
  selectedIncident: null,
  connectedOfficerCount: 0,

  setOfficers: (officers) => set({ officers }),

  updateOfficerLocation: (
    officer_id,
    latitude,
    longitude,
    availability_status,
    timestamp
  ) =>
    set((state) => ({
      officers: state.officers.map((o) =>
        o.officer_id === officer_id
          ? {
              ...o,
              last_latitude: latitude,
              last_longitude: longitude,
              availability_status,
              last_updated: timestamp,
            }
          : o
      ),
    })),

  addOfficerOnline: (officerData) =>
    set((state) => {
      const idx = state.officers.findIndex(
        (o) => o.officer_id === officerData.officer_id
      );
      if (idx === -1) {
        return { officers: [...state.officers, officerData] };
      }
      const next = [...state.officers];
      next[idx] = { ...next[idx], ...officerData };
      return { officers: next };
    }),

  removeOfficerOffline: (officer_id) =>
    set((state) => ({
      officers: state.officers.filter((o) => o.officer_id !== officer_id),
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
