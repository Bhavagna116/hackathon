import { create } from "zustand";

export const useAuthStore = create((set) => ({
  officer: null,
  token: "",
  isAuthenticated: false,

  login: (officer, token) => {
    localStorage.setItem("patrol_token", token);
    set({ officer, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("patrol_token");
    set({ officer: null, token: "", isAuthenticated: false });
  },

  initAuth: () => {
    const token = localStorage.getItem("patrol_token") ?? "";
    set({
      token,
      isAuthenticated: Boolean(token),
    });
  },
}));
