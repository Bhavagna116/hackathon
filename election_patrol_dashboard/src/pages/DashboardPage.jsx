import { useEffect, useState } from "react";

import ControlRoomMap from "../components/map/ControlRoomMap";
import IncidentPanel from "../components/incidents/IncidentPanel";
import OfficerList from "../components/officers/OfficerList";
import Navbar from "../components/shared/Navbar";
import StatsBar from "../components/shared/StatsBar";
import { useWebSocket } from "../hooks/useWebSocket";
import { useNodeSocket } from "../hooks/useNodeSocket";
import { BASE_URL } from "../utils/constants";
import { format } from "date-fns";

const shellStyle = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  maxHeight: "100vh",
  background: "#0a1628",
  color: "#e8eaed",
  overflow: "hidden",
  boxSizing: "border-box",
};

const navbarWrapStyle = {
  flexShrink: 0,
};

const statusBarStyle = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem 1.5rem",
  padding: "0.5rem 1.25rem",
  background: "rgba(0,0,0,0.2)",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: "0.875rem",
};

const dotStyle = (connected) => ({
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: connected ? "#2e7d32" : "#c62828",
  display: "inline-block",
  marginRight: 6,
  verticalAlign: "middle",
  boxShadow: connected
    ? "0 0 6px rgba(46,125,50,0.7)"
    : "0 0 6px rgba(198,40,40,0.6)",
});

const statsWrapStyle = {
  flexShrink: 0,
};

const mainRowStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "row",
  minHeight: 0,
  overflow: "hidden",
};

const mapColStyle = {
  flex: "0 0 75%",
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sideColStyle = {
  flex: "0 0 25%",
  minWidth: 0,
  minHeight: 0,
  padding: "0.5rem",
  boxSizing: "border-box",
  borderLeft: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.15)",
  fontSize: "0.9rem",
  color: "rgba(232,234,237,0.85)",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  overflow: "hidden",
};

const sidePanelHalfStyle = {
  flex: "1 1 50%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export default function DashboardPage() {
  const { isConnected } = useWebSocket();
  useNodeSocket(); // Boots up the secondary listener for instant GPS node routing

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={shellStyle}>
      <div style={navbarWrapStyle}>
        <Navbar />
      </div>
      <div style={statusBarStyle}>
        <span>
          <span style={dotStyle(isConnected)} aria-hidden />
          WebSocket: {isConnected ? "Connected" : "Disconnected"}
        </span>
        <span>
          Time: <strong>{format(now, "HH:mm:ss")}</strong>
        </span>
        <span title="API base URL">
          Backend:{" "}
          <strong style={{ wordBreak: "break-all" }}>{BASE_URL}</strong>
        </span>
      </div>
      <div style={statsWrapStyle}>
        <StatsBar />
      </div>
      <div style={mainRowStyle}>
        <div style={mapColStyle}>
          <ControlRoomMap />
        </div>
        <div style={sideColStyle}>
          <div style={sidePanelHalfStyle}>
            <IncidentPanel />
          </div>
          <div style={sidePanelHalfStyle}>
            <OfficerList />
          </div>
        </div>
      </div>
    </div>
  );
}
