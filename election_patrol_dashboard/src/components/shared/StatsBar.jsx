import { useMemo } from "react";
import { AlertTriangle, Users, Zap } from "lucide-react";

import { useDashboardStore } from "../../store/dashboardStore";

const barStyle = {
  flexShrink: 0,
  width: "100%",
  background: "#0d1b2e",
  borderBottom: "1px solid #1e3a5f",
  padding: "0.55rem 1rem",
  boxSizing: "border-box",
};

const rowStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const cardStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "0.65rem",
  flex: "1 1 0",
  minWidth: "8rem",
  background: "#1a2f4e",
  borderRadius: 8,
  padding: "0.6rem 0.75rem",
  color: "#e8eaed",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: "0.68rem",
  fontWeight: 600,
  opacity: 0.92,
  lineHeight: 1.25,
};

const numStyle = {
  fontSize: "1.35rem",
  fontWeight: 800,
  lineHeight: 1.1,
};

export default function StatsBar() {
  const officers = useDashboardStore((s) => s.officers);
  const incidents = useDashboardStore((s) => s.incidents);
  const connectedOfficerCount = useDashboardStore(
    (s) => s.connectedOfficerCount
  );

  const {
    freeCount,
    assignedCount,
    busyCount,
    activeIncidentCount,
  } = useMemo(() => {
    let free = 0;
    let assigned = 0;
    let busy = 0;
    for (const o of officers) {
      const st = String(o.availability_status || "free").toLowerCase();
      if (st === "assigned") assigned += 1;
      else if (st === "busy") busy += 1;
      else free += 1;
    }
    const activeIncidents = incidents.filter((i) =>
      ["pending", "responding"].includes(
        String(i.status || "").toLowerCase()
      )
    ).length;
    return {
      freeCount: free,
      assignedCount: assigned,
      busyCount: busy,
      activeIncidentCount: activeIncidents,
    };
  }, [officers, incidents]);

  return (
    <div style={barStyle}>
      <div style={rowStyle}>
        <div style={cardStyle}>
          <Users size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="stat-number" style={numStyle}>
              {freeCount}
            </div>
            <div style={labelStyle}>🟢 Free Officers</div>
          </div>
        </div>
        <div style={cardStyle}>
          <Users size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="stat-number" style={numStyle}>
              {assignedCount}
            </div>
            <div style={labelStyle}>🔴 Assigned Officers</div>
          </div>
        </div>
        <div style={cardStyle}>
          <AlertTriangle size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="stat-number" style={numStyle}>
              {busyCount}
            </div>
            <div style={labelStyle}>🟡 Busy Officers</div>
          </div>
        </div>
        <div style={cardStyle}>
          <AlertTriangle size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="stat-number" style={numStyle}>
              {activeIncidentCount}
            </div>
            <div style={labelStyle}>🚨 Active Incidents</div>
          </div>
        </div>
        <div style={cardStyle}>
          <Zap size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="stat-number" style={numStyle}>
              {connectedOfficerCount}
            </div>
            <div style={labelStyle}>⚡ Live Connections</div>
          </div>
        </div>
      </div>
    </div>
  );
}
