import { create } from "zustand";

export const useAuthStore = create((set) => ({
  officer: null,
  isAuthenticated: false,

  setOfficer: (officer) =>
    set({
      officer,
      isAuthenticated: !!officer,
    }),

  logout: () => {
    localStorage.removeItem("patrol_token");
    localStorage.removeItem("patrol_officer");
    set({ officer: null, isAuthenticated: false });
  },
}));
