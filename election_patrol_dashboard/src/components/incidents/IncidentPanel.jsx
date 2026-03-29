import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { Inbox, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import * as incidentsApi from "../../api/incidentsApi";
import { useAuthStore } from "../../store/authStore";
import { useDashboardStore } from "../../store/dashboardStore";

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  background: "#0f1f3d",
  color: "#fff",
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)",
};

const tabRowStyle = {
  display: "flex",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
};

const tabBtn = (active) => ({
  flex: 1,
  padding: "0.65rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  background: active ? "rgba(255,255,255,0.12)" : "transparent",
  color: "#fff",
  borderBottom: active ? "2px solid #64b5f6" : "2px solid transparent",
});

const scrollStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "0.75rem",
  display: "flex",
  flexDirection: "column",
};

const cardStyle = {
  background: "rgba(0,0,0,0.2)",
  borderRadius: 8,
  padding: "0.75rem",
  marginBottom: "0.65rem",
  border: "1px solid rgba(255,255,255,0.06)",
};

function formatIncidentType(type) {
  if (!type) return "";
  return String(type)
    .split("_")
    .map(
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function severityLeftBorder(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "high") return "4px solid #c62828";
  if (s === "medium") return "4px solid #ef6c00";
  return "4px solid #2e7d32";
}

function severityBadgeStyle(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "high")
    return { background: "#c62828", color: "#fff" };
  if (s === "medium")
    return { background: "#ef6c00", color: "#fff" };
  return { background: "#2e7d32", color: "#fff" };
}

function statusBadgeStyle(st) {
  const s = String(st || "").toLowerCase();
  if (s === "pending")
    return { background: "#f9a825", color: "#1a1a1a" };
  if (s === "responding")
    return { background: "#1565c0", color: "#fff" };
  return { background: "#2e7d32", color: "#fff" };
}

function parseDate(value) {
  if (value == null) return null;
  if (value instanceof Date && isValid(value)) return value;
  if (typeof value === "string") {
    try {
      const d = parseISO(value);
      return isValid(d) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toastError(err) {
  const d = err.response?.data?.detail;
  const msg =
    typeof d === "string"
      ? d
      : Array.isArray(d)
        ? d.map((x) => x.msg || JSON.stringify(x)).join(", ")
        : err.message || "Request failed";
  toast.error(msg);
}

export default function IncidentPanel() {
  const incidents = useDashboardStore((s) => s.incidents);
  const updateIncidentStatus = useDashboardStore(
    (s) => s.updateIncidentStatus
  );

  const [resolvingId, setResolvingId] = useState(null);

  const activeIncidents = useMemo(
    () =>
      incidents.filter((i) =>
        ["pending", "responding"].includes(String(i.status || "").toLowerCase())
      ),
    [incidents]
  );

  const activeCount = activeIncidents.length;

  async function handleResolve(incident_id) {
    setResolvingId(incident_id);
    try {
      await incidentsApi.resolveIncident(incident_id);
      updateIncidentStatus(incident_id, "resolved");
      toast.success("Incident resolved");
    } catch (err) {
      toastError(err);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div style={panelStyle}>
      <div style={{
        padding: "0.75rem 1rem",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        fontWeight: 700,
        fontSize: "0.85rem",
        background: "rgba(255,255,255,0.03)"
      }}>
        Active Incidents ({activeCount})
      </div>

      <div style={scrollStyle}>
        {activeIncidents.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              minHeight: 140,
              padding: "1rem",
              color: "#81c784",
            }}
          >
            <Inbox size={42} strokeWidth={1.5} aria-hidden />
            <span style={{ fontWeight: 600, textAlign: "center" }}>
              No active incidents
            </span>
          </div>
        ) : (
          activeIncidents.map((inc) => {
            const created = parseDate(inc.created_at);
            const distLabel = created
              ? `${formatDistanceToNow(created, { addSuffix: true })}`
              : "—";
            const assigned = inc.assigned_officers?.length ?? 0;
            const busy = resolvingId === inc.incident_id;

            return (
              <div
                key={inc.incident_id}
                style={{
                  ...cardStyle,
                  borderLeft: severityLeftBorder(inc.severity),
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {formatIncidentType(inc.incident_type)}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 4,
                      textTransform: "capitalize",
                      ...severityBadgeStyle(inc.severity),
                    }}
                  >
                    {inc.severity}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 4,
                      textTransform: "capitalize",
                      ...statusBadgeStyle(inc.status),
                    }}
                  >
                    {inc.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                  {distLabel}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
                  Assigned officers: {assigned}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleResolve(inc.incident_id)}
                  style={{
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 6,
                    background: busy ? "#546e7a" : "#c62828",
                    color: "#fff",
                    cursor: busy ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {busy ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: "spin 0.8s linear infinite" }}
                      />
                      Resolving…
                    </>
                  ) : (
                    "Resolve"
                  )}
                </button>
              </div>
            );
          })
        )}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}

const labelBlock = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  marginBottom: 4,
  opacity: 0.9,
};

const inputFull = {
  width: "100%",
  padding: "0.5rem 0.55rem",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  fontSize: "0.875rem",
  boxSizing: "border-box",
};
