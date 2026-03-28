import { useMemo, useState } from "react";
import {
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { format, isValid, parseISO } from "date-fns";
import { Loader2, MapPin } from "lucide-react";

import { useDashboardStore } from "../../store/dashboardStore";
import { GOOGLE_MAPS_API_KEY } from "../../utils/constants";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 5;

const MARKER_FREE =
  "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
const MARKER_BUSY =
  "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
const MARKER_ASSIGNED =
  "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
const MARKER_INCIDENT =
  "http://maps.google.com/mapfiles/ms/icons/orange-dot.png";

/** Dark basemap (options below also disable clutter controls per spec). */
const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3a" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#304a7d" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#255763" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2c6675" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#255763" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }],
  },
];

const MAP_OPTIONS = {
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  styles: DARK_MAP_STYLES,
};

function officerIconUrl(availability_status) {
  const s = String(availability_status || "").toLowerCase();
  if (s === "busy") return MARKER_BUSY;
  if (s === "assigned") return MARKER_ASSIGNED;
  return MARKER_FREE;
}

function formatIncidentType(incident_type) {
  if (!incident_type) return "";
  return String(incident_type)
    .split("_")
    .map(
      (w) =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function severityColor(severity) {
  switch (String(severity || "").toLowerCase()) {
    case "high":
      return "#c62828";
    case "medium":
      return "#ef6c00";
    case "low":
      return "#2e7d32";
    default:
      return "#757575";
  }
}

function availabilityBadgeStyle(status) {
  const s = String(status || "").toLowerCase();
  if (s === "busy")
    return { background: "#f9a825", color: "#1a1a1a" };
  if (s === "assigned")
    return { background: "#c62828", color: "#fff" };
  return { background: "#2e7d32", color: "#fff" };
}

function parseDateSafe(value) {
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

function formatOfficerUpdated(value) {
  const d = parseDateSafe(value);
  if (!d) return "—";
  return format(d, "HH:mm:ss");
}

function formatIncidentWhen(value) {
  const d = parseDateSafe(value);
  if (!d) return "—";
  return format(d, "HH:mm dd/MM/yyyy");
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const loadingWrapStyle = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.75rem",
  background: "#0a1628",
  color: "#e8eaed",
};

const legendStyle = {
  position: "absolute",
  left: 12,
  bottom: 12,
  zIndex: 2,
  background: "rgba(10, 22, 40, 0.94)",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
  pointerEvents: "none",
};

export default function ControlRoomMap() {
  const officers = useDashboardStore((s) => s.officers);
  const incidents = useDashboardStore((s) => s.incidents);

  const [active, setActive] = useState(null);
  /** { type: 'officer', id } | { type: 'incident', id } */

  const { isLoaded, loadError } = useJsApiLoader({
    id: "election-patrol-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
  });

  const officersWithLoc = useMemo(
    () =>
      officers.filter(
        (o) =>
          o.last_latitude != null &&
          o.last_longitude != null &&
          !Number.isNaN(Number(o.last_latitude)) &&
          !Number.isNaN(Number(o.last_longitude))
      ),
    [officers]
  );

  const incidentsWithLoc = useMemo(
    () =>
      incidents.filter(
        (i) =>
          i.latitude != null &&
          i.longitude != null &&
          !Number.isNaN(Number(i.latitude)) &&
          !Number.isNaN(Number(i.longitude))
      ),
    [incidents]
  );

  if (loadError) {
    console.warn("[ControlRoomMap] Maps script failed to load");
  }

  if (!isLoaded || !GOOGLE_MAPS_API_KEY) {
    return (
      <div style={loadingWrapStyle}>
        <Loader2
          size={36}
          style={{ animation: "control-room-spin 0.9s linear infinite" }}
          aria-hidden
        />
        <span>Loading map...</span>
        <style>{`
          @keyframes control-room-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        options={MAP_OPTIONS}
      >
        {officersWithLoc.map((o) => (
          <Marker
            key={`officer-${o.officer_id}`}
            position={{
              lat: Number(o.last_latitude),
              lng: Number(o.last_longitude),
            }}
            icon={{ url: officerIconUrl(o.availability_status) }}
            onClick={() =>
              setActive({ type: "officer", id: o.officer_id })
            }
          >
            {active?.type === "officer" && active.id === o.officer_id ? (
              <InfoWindow onCloseClick={() => setActive(null)}>
                <div style={{ color: "#111", minWidth: 200, paddingRight: 4 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {o.username}{" "}
                    <span style={{ fontWeight: 500, color: "#444" }}>
                      · {o.rank}
                    </span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        textTransform: "capitalize",
                        ...availabilityBadgeStyle(o.availability_status),
                      }}
                    >
                      {o.availability_status || "free"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    <strong>Updated:</strong>{" "}
                    {formatOfficerUpdated(o.last_updated)}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace" }}>
                    {Number(o.last_latitude).toFixed(4)},{" "}
                    {Number(o.last_longitude).toFixed(4)}
                  </div>
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ))}

        {incidentsWithLoc.map((inc) => (
          <Marker
            key={`incident-${inc.incident_id}`}
            position={{
              lat: Number(inc.latitude),
              lng: Number(inc.longitude),
            }}
            icon={{ url: MARKER_INCIDENT }}
            onClick={() =>
              setActive({ type: "incident", id: inc.incident_id })
            }
          >
            {active?.type === "incident" &&
            active.id === inc.incident_id ? (
              <InfoWindow onCloseClick={() => setActive(null)}>
                <div style={{ color: "#111", minWidth: 220, paddingRight: 4 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {formatIncidentType(inc.incident_type)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: severityColor(inc.severity),
                      marginBottom: 8,
                      textTransform: "capitalize",
                    }}
                  >
                    Severity: {inc.severity}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <strong>Time:</strong> {formatIncidentWhen(inc.created_at)}
                  </div>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "#ede7f6",
                        color: "#4527a0",
                        textTransform: "capitalize",
                      }}
                    >
                      {inc.status}
                    </span>
                  </div>
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ))}
      </GoogleMap>

      {officersWithLoc.length === 0 && incidentsWithLoc.length === 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "rgba(10, 22, 40, 0.78)",
            color: "#e8eaed",
            zIndex: 3,
            pointerEvents: "none",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <MapPin size={44} strokeWidth={1.5} aria-hidden />
          <span style={{ fontWeight: 600, maxWidth: 260 }}>
            No officers or incidents to show on the map yet
          </span>
        </div>
      ) : null}

      <div style={legendStyle}>
        <div>🟢 Free Officer</div>
        <div>🟡 Busy Officer</div>
        <div>🔴 Assigned Officer</div>
        <div>🟠 Active Incident</div>
      </div>
    </div>
  );
}
