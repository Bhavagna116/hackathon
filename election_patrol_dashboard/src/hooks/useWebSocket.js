import { useEffect, useRef, useState } from "react";

import { useDashboardStore } from "../store/dashboardStore";
import { WS_URL } from "../utils/constants";

const PING_MS = 30_000;
const MAX_RECONNECT_RETRIES = 5;

function backoffMs(attemptIndex) {
  return 3000 * 2 ** attemptIndex;
}

function handleWsMessage(raw, setLastMessage) {
  try {
    const data = JSON.parse(raw);
    if (data === null || typeof data !== "object") return;

    const store = useDashboardStore.getState();
    const event = data.event;

    switch (event) {
      case "initial_snapshot":
        store.setOfficers(data.officers ?? []);
        store.setIncidents(data.active_incidents ?? []);
        store.setConnectedCount(data.connected_officer_count ?? 0);
        break;
      case "location_update":
        store.updateOfficerLocation(
          data.unique_id,
          data.latitude,
          data.longitude,
          data.availability_status,
          data.timestamp
        );
        break;
      case "officer_connected":
        store.addOfficerOnline(data);
        break;
      case "officer_disconnected":
        store.removeOfficerOffline(data.unique_id);
        break;
      default:
        break;
    }

    setLastMessage(data);
  } catch {
    // Malformed JSON or handler edge cases must not crash the hook
  }
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);

  const wsRef = useRef(null);
  const pingRef = useRef(null);
  const reconnectRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    intentionalCloseRef.current = false;
    retryAttemptRef.current = 0;

    const clearPing = () => {
      if (pingRef.current != null) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    };

    const clearReconnect = () => {
      if (reconnectRef.current != null) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      clearReconnect();
      if (intentionalCloseRef.current) return;
      if (retryAttemptRef.current >= MAX_RECONNECT_RETRIES) {
        console.warn("[useWebSocket] max reconnect attempts reached");
        return;
      }
      const attempt = retryAttemptRef.current;
      const delay = backoffMs(attempt);
      retryAttemptRef.current += 1;
      setReconnectCount(retryAttemptRef.current);
      reconnectRef.current = window.setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, delay);
    };

    function connect() {
      clearReconnect();

      const url = `${WS_URL}/websocket/dashboard`;

      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        console.warn("[useWebSocket] WebSocket constructor failed");
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        retryAttemptRef.current = 0;
        setReconnectCount(0);
        setIsConnected(true);
        clearPing();
        pingRef.current = window.setInterval(() => {
          const current = wsRef.current;
          if (current && current.readyState === WebSocket.OPEN) {
            try {
              current.send(JSON.stringify({ type: "ping" }));
            } catch {
              console.warn("[useWebSocket] ping send failed");
            }
          }
        }, PING_MS);
      };

      ws.onmessage = (evt) => {
        try {
          handleWsMessage(String(evt.data), setLastMessage);
        } catch {
          // Defensive — never crash on message path
        }
      };

      ws.onerror = () => {
        console.warn("[useWebSocket] connection error");
      };

      ws.onclose = () => {
        setIsConnected(false);
        clearPing();
        wsRef.current = null;
        if (intentionalCloseRef.current) return;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      intentionalCloseRef.current = true;
      clearPing();
      clearReconnect();
      const w = wsRef.current;
      wsRef.current = null;
      if (w) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
      setIsConnected(false);
    };
  }, []);

  return { isConnected, reconnectCount, lastMessage };
}
