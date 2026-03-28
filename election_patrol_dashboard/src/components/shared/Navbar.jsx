import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Shield } from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useDashboardStore } from "../../store/dashboardStore";

const barStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "0.75rem",
  padding: "0.75rem 1.25rem",
  background: "#0a1628",
  color: "#fff",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const brandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontWeight: 700,
  fontSize: "clamp(0.95rem, 2vw, 1.1rem)",
};

const rightStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  fontSize: "0.875rem",
};

const logoutStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.75rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#0a1628",
  background: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

export default function Navbar() {
  const navigate = useNavigate();
  const officer = useAuthStore((s) => s.officer);
  const logout = useAuthStore((s) => s.logout);
  const incidents = useDashboardStore((s) => s.incidents);

  const hasActiveIncidents = useMemo(
    () =>
      incidents.some((i) =>
        ["pending", "responding"].includes(
          String(i.status || "").toLowerCase()
        )
      ),
    [incidents]
  );

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const username = officer?.username ?? "—";
  const rank = officer?.rank ?? "";

  return (
    <header style={barStyle}>
      <div style={brandStyle}>
        <Shield size={28} strokeWidth={1.75} aria-hidden />
        {hasActiveIncidents ? (
          <span className="nav-alert-dot" aria-hidden title="Active incidents" />
        ) : null}
        <span>Election Patrol Control Room</span>
      </div>
      <div style={rightStyle}>
        <span>
          <strong>{username}</strong>
          {rank ? (
            <span style={{ opacity: 0.85 }}> · {rank}</span>
          ) : null}
        </span>
        <button type="button" style={logoutStyle} onClick={handleLogout}>
          <LogOut size={16} aria-hidden />
          Logout
        </button>
      </div>
    </header>
  );
}
