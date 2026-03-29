import { useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Users } from "lucide-react";
import toast from "react-hot-toast";

import * as officersApi from "../../api/officersApi";
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

const headerStyle = {
  padding: "0.65rem 0.75rem",
  fontWeight: 700,
  fontSize: "0.85rem",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
};

const badgeStyle = {
  fontSize: "0.7rem",
  fontWeight: 600,
  background: "rgba(255,255,255,0.15)",
  padding: "2px 8px",
  borderRadius: 999,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const filterBtn = (on) => ({
  padding: "0.3rem 0.55rem",
  fontSize: "0.7rem",
  fontWeight: 600,
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6,
  cursor: "pointer",
  background: on ? "rgba(100,181,246,0.35)" : "transparent",
  color: "#fff",
});

const listScrollStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "14px 1fr auto",
  gap: "0.5rem",
  alignItems: "start",
  padding: "0.55rem 0.75rem",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: "0.78rem",
};

function statusDotColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "busy") return "#f9a825";
  if (s === "assigned") return "#c62828";
  return "#2e7d32";
}

function parseLastUpdated(value) {
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

function formatCoords(lat, lng) {
  if (lat == null || lng == null) return "No location";
  const la = Number(lat);
  const ln = Number(lng);
  if (Number.isNaN(la) || Number.isNaN(ln)) return "No location";
  return `${la.toFixed(4)}, ${ln.toFixed(4)}`;
}

/**
 * Merge initial GET /officers/all rows with live dashboardStore.officers.
 * Store values win on overlapping keys so WebSocket updates stay authoritative.
 */
function mergeOfficers(fetchedList, liveList) {
  const map = new Map();
  for (const o of fetchedList) {
    map.set(o.unique_id, { ...o });
  }
  for (const o of liveList) {
    const id = o.unique_id;
    const prev = map.get(id);
    if (prev) {
      map.set(id, { ...prev, ...o });
    } else {
      map.set(id, { ...o });
    }
  }
  return Array.from(map.values());
}

export default function OfficerList() {
  const liveOfficers = useDashboardStore((s) => s.officers);
  const [fetchedOfficers, setFetchedOfficers] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await officersApi.getAllOfficers();
        if (!cancelled) {
          if (Array.isArray(data)) {
            setFetchedOfficers(data);
            const store = useDashboardStore.getState();
            data.forEach((o) => store.addOfficerOnline(o));
          } else {
            setFetchedOfficers([]);
          }
        }
      } catch (err) {
        const d = err.response?.data?.detail;
        toast.error(
          typeof d === "string" ? d : "Could not load officers"
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(
    () => mergeOfficers(fetchedOfficers, liveOfficers),
    [fetchedOfficers, liveOfficers]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return merged;
    return merged.filter(
      (o) =>
        String(o.availability_status || "free").toLowerCase() === filter
    );
  }, [merged, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      String(a.username || "").localeCompare(String(b.username || ""))
    );
  }, [filtered]);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Patrol Officers</span>
        <span style={badgeStyle}>{merged.length}</span>
      </div>
      <div style={filterRowStyle}>
        {[
          ["all", "All"],
          ["free", "Free"],
          ["assigned", "Assigned"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={filterBtn(filter === key)}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={listScrollStyle}>
        {sorted.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "1.25rem",
              minHeight: 120,
              textAlign: "center",
              opacity: 0.9,
              fontSize: "0.85rem",
            }}
          >
            <Users size={40} strokeWidth={1.5} aria-hidden />
            <span style={{ fontWeight: 600 }}>No officers in this view</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              Try another filter or wait for officers to appear on the map.
            </span>
          </div>
        ) : (
          sorted.map((o) => {
            const st = String(o.availability_status || "free").toLowerCase();
            const lu = parseLastUpdated(o.last_updated);
            const timeLabel = lu ? format(lu, "HH:mm:ss") : "Never";

            return (
              <div key={o.unique_id} style={rowStyle}>
                <span
                  title={st}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    marginTop: 4,
                    background: statusDotColor(st),
                    boxShadow: `0 0 6px ${statusDotColor(st)}55`,
                    animation:
                      st === "free"
                        ? "pulse 1.5s ease-in-out infinite"
                        : undefined,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {o.username}
                    <span style={{ fontWeight: 500, opacity: 0.85 }}>
                      {" "}
                      · {o.rank}
                    </span>
                  </div>
                  <div style={{ opacity: 0.7, fontFamily: "monospace", marginTop: 2 }}>
                    ID: {o.unique_id}
                  </div>
                  <div style={{ opacity: 0.8, marginTop: 2 }}>{timeLabel}</div>
                  <div
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      opacity: 0.75,
                      marginTop: 2,
                    }}
                  >
                    {formatCoords(o.last_latitude, o.last_longitude)}
                  </div>
                </div>
                {o.mobile_number ? (
                  <a
                    href={`tel:${o.mobile_number}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(46,125,50,0.2)",
                      color: "#81c784",
                      padding: "6px 10px",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      border: "1px solid rgba(46,125,50,0.4)",
                      marginTop: 2,
                    }}
                    title={`Call ${o.username}`}
                  >
                    Call
                  </a>
                ) : <div />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
