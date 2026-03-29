import { useEffect } from "react";
import { io } from "socket.io-client";
import { useDashboardStore } from "../store/dashboardStore";

// The Node.js Socket.io server runs on port 3000 locally
const NODE_SOCKET_URL = import.meta.env.VITE_NODE_SOCKET_URL ?? "http://localhost:3000";

export function useNodeSocket() {
  useEffect(() => {
    // Connect to the external Node Socket!
    const socket = io(NODE_SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("[NodeSocket] Connected to Socket.io telemetry stream!");
    });

    // Node broadly dispatches map tracking data natively upon trace injection
    socket.on("locationUpdate", (data) => {
      const store = useDashboardStore.getState();
      
      // Node socket emits unique_id, latitude, longitude, availability_status, timestamp
      store.updateOfficerLocation(
        data.unique_id,
        data.latitude,
        data.longitude,
        data.availability_status,
        data.timestamp
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
