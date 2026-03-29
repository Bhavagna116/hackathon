import { useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { format, isValid, parseISO } from "date-fns";
import { Loader2, MapPin, Moon, Plus, Sun } from "lucide-react";
import toast from "react-hot-toast";

import { createIncident } from "../../api/incidentsApi";
import { getNearbyOfficers } from "../../api/officersApi";
import { useAuthStore } from "../../store/authStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { GOOGLE_MAPS_API_KEY } from "../../utils/constants";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 5;
const NEARBY_OFFICER_RADIUS_KM = 10;

const MARKER_FREE = "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
const MARKER_BUSY = "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
const MARKER_ASSIGNED = "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
const MARKER_INCIDENT = "http://maps.google.com/mapfiles/ms/icons/orange-dot.png";
const MARKER_BOOTH = "/voting_finger.png";

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

const plusButtonStyle = {
  position: "absolute",
  left: 12,
  top: 12,
  zIndex: 10,
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "#2196f3",
  color: "#fff",
  border: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s ease",
};

const searchBoxStyle = {
  position: "absolute",
  left: 70,
  top: 12,
  zIndex: 10,
  background: "#fff",
  borderRadius: 8,
  padding: "4px 8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: 250,
};

const searchInputStyle = {
  border: "none",
  outline: "none",
  padding: "8px",
  fontSize: 14,
  flex: 1,
};

function officerIconUrl(availabilityStatus) {
  const status = String(availabilityStatus || "").toLowerCase();
  if (status === "busy") return MARKER_BUSY;
  if (status === "assigned") return MARKER_ASSIGNED;
  return MARKER_FREE;
}

function formatIncidentType(value) {
  if (!value) return "";
  return String(value)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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
  const value = String(status || "").toLowerCase();
  if (value === "busy") return { background: "#f9a825", color: "#1a1a1a" };
  if (value === "assigned") return { background: "#c62828", color: "#fff" };
  return { background: "#2e7d32", color: "#fff" };
}

function parseDateSafe(value) {
  if (value == null) return null;
  if (value instanceof Date && isValid(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = parseISO(value);
      return isValid(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function formatOfficerUpdated(value) {
  const parsed = parseDateSafe(value);
  if (!parsed) return "--";
  return format(parsed, "HH:mm:ss");
}

function formatIncidentWhen(value) {
  const parsed = parseDateSafe(value);
  if (!parsed) return "--";
  return format(parsed, "HH:mm dd/MM/yyyy");
}

function formatDistance(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return null;
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

function playAlertSound() {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, context.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.5); // A4
    gain.gain.setValueAtTime(0.3, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.5);
  } catch (err) {
    console.warn("Could not play alert sound:", err);
  }
}

function BoothInfoWindow({

  booth,
  isAlerting,
  onAllow,
  onDeny,
  onDelete,
  onAlert,
}) {
  return (
    <div style={{ color: "#111", minWidth: 260, paddingRight: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#1565c0" }}>
        Polling Booth {booth.isConfirmed ? "" : "(Pending Approval)"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {booth.name}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8 }}>
        {booth.address}
      </div>

      {!booth.isConfirmed ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onAllow}
            style={{
              flex: 1,
              padding: "6px",
              background: "#2e7d32",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Allow
          </button>
          <button
            type="button"
            onClick={onDeny}
            style={{
              flex: 1,
              padding: "6px",
              background: "#c62828",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Deny
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              onClick={onDelete}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: "0.75rem",
                fontWeight: 700,
                background: "#c62828",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              type="button"
              disabled={isAlerting}
              onClick={onAlert}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: "0.75rem",
                fontWeight: 700,
                background: isAlerting ? "#9e9e9e" : "#ff9800",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: isAlerting ? "wait" : "pointer",
              }}
            >
              {isAlerting ? "ALERTING..." : "ALERT"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ControlRoomMap() {
  const officers = useDashboardStore((state) => state.officers);
  const incidents = useDashboardStore((state) => state.incidents);
  const officerProfile = useAuthStore((state) => state.officer);

  const [active, setActive] = useState(null);
  const [mapTheme, setMapTheme] = useState("dark");
  const [showSearch, setShowSearch] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [booths, setBooths] = useState([]);
  const [isAlerting, setIsAlerting] = useState(false);
  const [nearbyOfficerState, setNearbyOfficerState] = useState({});

  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "election-patrol-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
  });

  const officersWithLoc = useMemo(
    () =>
      officers.filter(
        (officer) =>
          officer.last_latitude != null &&
          officer.last_longitude != null &&
          !Number.isNaN(Number(officer.last_latitude)) &&
          !Number.isNaN(Number(officer.last_longitude))
      ),
    [officers]
  );

  const incidentsWithLoc = useMemo(
    () =>
      incidents.filter(
        (incident) =>
          incident.latitude != null &&
          incident.longitude != null &&
          !Number.isNaN(Number(incident.latitude)) &&
          !Number.isNaN(Number(incident.longitude))
      ),
    [incidents]
  );

  function handleBoothPin() {
    const lat = parseFloat(latInput.trim());
    const lng = parseFloat(lngInput.trim());

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      alert("Please enter valid numeric latitude and longitude.");
      return;
    }

    const booth = {
      id: `booth-${Date.now()}`,
      name: `Booth (${lat.toFixed(2)}, ${lng.toFixed(2)})`,
      lat,
      lng,
      isConfirmed: false,
      address: `Coordinates: ${lat}, ${lng}`,
    };

    setBooths((prev) => [...prev, booth]);
    setLatInput("");
    setLngInput("");
    setShowSearch(false);

    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(15);
    }
  }

  function handleAllowBooth(id) {
    setBooths((prev) => prev.map((booth) => (booth.id === id ? { ...booth, isConfirmed: true } : booth)));
    setActive(null);
  }

  function handleDenyBooth(id) {
    setBooths((prev) => prev.filter((booth) => booth.id !== id));
    setActive(null);
  }

  function handleDeleteBooth(id) {
    setBooths((prev) => prev.filter((booth) => booth.id !== id));
    setActive(null);
  }

  async function fetchNearbyPolice(booth, { silent = false } = {}) {
    if (!booth) return [];

    setNearbyOfficerState((prev) => ({
      ...prev,
      [booth.id]: {
        officers: prev[booth.id]?.officers || [],
        loading: true,
        error: "",
      },
    }));

    try {
      const response = await getNearbyOfficers(
        booth.lat,
        booth.lng,
        NEARBY_OFFICER_RADIUS_KM
      );
      const officersFound = Array.isArray(response.data) ? response.data : [];

      setNearbyOfficerState((prev) => ({
        ...prev,
        [booth.id]: {
          officers: officersFound,
          loading: false,
          error: "",
        },
      }));

      if (!silent) {
        toast.success(
          officersFound.length
            ? `Nearby police found: ${officersFound.length}`
            : "No nearby police found in the search radius"
        );
      }

      return officersFound;
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        "Unable to search nearby police";

      setNearbyOfficerState((prev) => ({
        ...prev,
        [booth.id]: {
          officers: prev[booth.id]?.officers || [],
          loading: false,
          error: String(message),
        },
      }));

      if (!silent) {
        toast.error(String(message));
      }

      return [];
    }
  }

  async function handleAlertBooth(booth) {
    if (isAlerting) return;
    setIsAlerting(true);

    const reporter = officerProfile?.username || "Admin Dashboard";
    const nearbyOfficers = await fetchNearbyPolice(booth, { silent: true });

    const promise = createIncident({
      incident_type: "booth_capture",
      latitude: booth.lat,
      longitude: booth.lng,
      severity: "high",
      reported_by: reporter,
    });

    toast.promise(promise, {
      loading: `Alerting nearby police around ${booth.name}...`,
      success: (response) => {
        setIsAlerting(false);
        setActive(null);
        playAlertSound();


        const assignedDetails = Array.isArray(response.data?.assigned_officer_details)
          ? response.data.assigned_officer_details
          : [];
        const nearbyFound = Array.isArray(response.data?.nearby_officers)
          ? response.data.nearby_officers
          : nearbyOfficers;
        const emailedTo = Array.isArray(response.data?.emailed_to)
          ? response.data.emailed_to
          : [];

        setNearbyOfficerState((prev) => ({
          ...prev,
          [booth.id]: {
            officers: nearbyFound,
            loading: false,
            error: "",
          },
        }));

        const assignedNames = assignedDetails
          .map((officer) => officer.username)
          .filter(Boolean)
          .join(", ");

        const emailsJoined = emailedTo.join(", ");

        if (assignedNames && emailsJoined) {
          return `Alert sent. Assigned: ${assignedNames}. Emailed: ${emailsJoined}`;
        }
        if (assignedNames) {
          return `Alert sent. Assigned: ${assignedNames}`;
        }
        if (emailsJoined) {
          return `Alert sent. Emailed: ${emailsJoined}`;
        }

        return `Alert sent. Nearby found: ${nearbyFound.length}. Emailed: ${emailedTo.length}`;

      },
      error: (error) => {
        setIsAlerting(false);
        return `Alert failed: ${error.message || "Network Error"}`;
      },
    });
  }

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
        <style>{`@keyframes control-room-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <button
        type="button"
        style={plusButtonStyle}
        onClick={() => setShowSearch((prev) => !prev)}
        title="Add Booth"
      >
        <Plus size={24} />
      </button>

      <button
        type="button"
        style={{ ...plusButtonStyle, top: 68 }}
        onClick={() => setMapTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        title="Toggle Map Theme"
      >
        {mapTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {showSearch ? (
        <div
          style={{ ...searchBoxStyle, width: 320, flexDirection: "column", gap: 8, padding: 12 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <input
              style={{ ...searchInputStyle, width: "50%", background: "#f5f5f5", borderRadius: 4 }}
              placeholder="Latitude"
              type="number"
              step="any"
              value={latInput}
              onChange={(event) => setLatInput(event.target.value)}
            />
            <input
              style={{ ...searchInputStyle, width: "50%", background: "#f5f5f5", borderRadius: 4 }}
              placeholder="Longitude"
              type="number"
              step="any"
              value={lngInput}
              onChange={(event) => setLngInput(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleBoothPin}
            style={{
              width: "100%",
              padding: "8px",
              background: "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Pin Booth
          </button>
        </div>
      ) : null}

      <GoogleMap
        onLoad={(map) => {
          mapRef.current = map;
        }}
        mapContainerStyle={mapContainerStyle}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        options={{
          ...MAP_OPTIONS,
          styles: mapTheme === "dark" ? DARK_MAP_STYLES : [],
        }}
      >
        {officersWithLoc.map((officer) => (
          <Marker
            key={`officer-${officer.unique_id}`}
            position={{
              lat: Number(officer.last_latitude),
              lng: Number(officer.last_longitude),
            }}
            icon={{ url: officerIconUrl(officer.availability_status) }}
            onClick={() => setActive({ type: "officer", id: officer.unique_id })}
          >
            {active?.type === "officer" && active.id === officer.unique_id ? (
              <InfoWindow onCloseClick={() => setActive(null)}>
                <div style={{ color: "#111", minWidth: 200, paddingRight: 4 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {officer.username}{" "}
                    <span style={{ fontWeight: 500, color: "#444" }}>? {officer.rank}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 6, fontFamily: "monospace" }}>
                    ID: {officer.unique_id}
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
                        ...availabilityBadgeStyle(officer.availability_status),
                      }}
                    >
                      {officer.availability_status || "free"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    <strong>Updated:</strong> {formatOfficerUpdated(officer.last_updated)}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}>
                    {Number(officer.last_latitude).toFixed(4)}, {Number(officer.last_longitude).toFixed(4)}
                  </div>
                  {officer.mobile_number ? (
                    <a
                      href={`tel:${officer.mobile_number}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        background: "#2e7d32",
                        color: "#fff",
                        padding: "6px 12px",
                        borderRadius: 6,
                        textDecoration: "none",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Call Officer
                    </a>
                  ) : null}
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ))}

        {incidentsWithLoc.map((incident) => (
          <Marker
            key={`incident-${incident.incident_id}`}
            position={{ lat: Number(incident.latitude), lng: Number(incident.longitude) }}
            icon={{ url: MARKER_INCIDENT }}
            onClick={() => setActive({ type: "incident", id: incident.incident_id })}
          >
            {active?.type === "incident" && active.id === incident.incident_id ? (
              <InfoWindow onCloseClick={() => setActive(null)}>
                <div style={{ color: "#111", minWidth: 220, paddingRight: 4 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {formatIncidentType(incident.incident_type)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: severityColor(incident.severity),
                      marginBottom: 8,
                      textTransform: "capitalize",
                    }}
                  >
                    Severity: {incident.severity}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <strong>Time:</strong> {formatIncidentWhen(incident.created_at)}
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
                      {incident.status}
                    </span>
                  </div>
                </div>
              </InfoWindow>
            ) : null}
          </Marker>
        ))}

        {booths.map((booth) => {
          return (
            <Marker
              key={booth.id}
              position={{ lat: booth.lat, lng: booth.lng }}
              opacity={booth.isConfirmed ? 1 : 0.4}
              icon={{
                url: MARKER_BOOTH,
                scaledSize: new window.google.maps.Size(40, 40),
              }}
              onClick={() => setActive({ type: "booth", id: booth.id })}
            >
              {active?.type === "booth" && active.id === booth.id ? (
                <InfoWindow onCloseClick={() => setActive(null)}>
                  <BoothInfoWindow
                    booth={booth}
                    isAlerting={isAlerting}
                    onAllow={() => handleAllowBooth(booth.id)}
                    onDeny={() => handleDenyBooth(booth.id)}
                    onDelete={() => handleDeleteBooth(booth.id)}
                    onAlert={() => handleAlertBooth(booth)}
                  />
                </InfoWindow>
              ) : null}
            </Marker>
          );
        })}
      </GoogleMap>

      {officersWithLoc.length === 0 && incidentsWithLoc.length === 0 && booths.length === 0 ? (
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
            No officers, incidents or booths on the map
          </span>
        </div>
      ) : null}

      <div style={legendStyle}>
        <div>Free Officer</div>
        <div>Assigned Officer</div>
        <div>Active Incident</div>
        <div>Polling Booth</div>
      </div>
    </div>
  );
}
