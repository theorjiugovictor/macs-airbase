/**
 * useField — Bidirectional WebSocket hook for field app.
 *
 * Connects to MACS bulletin board, authenticates with role,
 * receives role-filtered events, and sends field reports.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

function _wsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (
    typeof window !== "undefined" &&
    !window.location.host.startsWith("localhost")
  ) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return "ws://localhost:8765";
}
const WS_URL = _wsUrl();
const MAX_EVENTS = 100;
const RECONNECT_MS = 3000;

export function useField(authInfo) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState(null);
  const [callsign, setCallsign] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [lastReportId, setLastReportId] = useState(null);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  // Store authInfo in a ref so connect() never depends on it
  const authRef = useRef(authInfo);
  authRef.current = authInfo;

  const pendingRef = useRef([]);
  const flushTimerRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // Batch live events — flush to state at most every 300ms to avoid render thrashing
    const flushPending = () => {
      flushTimerRef.current = null;
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setEvents((prev) => {
        const next = [...prev, ...batch];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
    };

    const queueEvent = (evt) => {
      pendingRef.current.push(evt);
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushPending, 300);
      }
    };

    ws.onopen = () => {
      setConnected(true);
      setAuthError(null);
      // Authenticate with role + callsign (read from ref, not closure)
      const auth = authRef.current;
      if (auth?.role) {
        ws.send(
          JSON.stringify({
            type: "auth",
            role: auth.role,
            callsign: auth.callsign || "FIELD",
          }),
        );
      }
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.type === "auth_ok") {
          setRole(data.role);
          setCallsign(data.callsign);
          setAuthError(null);
          return;
        }

        if (data.type === "auth_error") {
          setAuthError(data.message);
          return;
        }

        if (data.type === "report_ok") {
          setLastReportId(data.event_id);
          return;
        }

        if (data.type === "report_error") {
          // Could show a toast here
          console.warn("Report error:", data.message);
          return;
        }

        if (data.type === "pong" || data.type === "error") return;

        // History replay
        if (data.type === "history") {
          setEvents(data.events || []);
          return;
        }

        // Live event — batched for performance
        if (data.id) {
          queueEvent(data);
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, RECONNECT_MS);
    };

    ws.onerror = () => ws.close();
  }, []); // stable — reads authInfo from ref

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      clearTimeout(flushTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendReport = useCallback((report) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "field_report",
          ...report,
        }),
      );
    }
  }, []);

  // Filter: only show events relevant to field — memoized to avoid re-render cascades
  const fieldEvents = useMemo(
    () =>
      events.filter((e) => {
        // Always show critical/high
        if (e.severity === "CRITICAL" || e.severity === "HIGH") return true;
        // Show field reports
        if (e.event_type === "FIELD_REPORT") return true;
        // Show actions (agent outputs)
        if (e.event_type === "ACTION_TAKEN") return true;
        // Show sensor alerts
        if (e.source_layer === "SENSOR" && e.severity !== "INFO") return true;
        // Show scenario events
        if (e.source === "SYSTEM" && e.event_type !== "WORLD_STATE_UPDATE")
          return true;
        return false;
      }),
    [events],
  );

  return {
    events: fieldEvents,
    allEvents: events,
    connected,
    role,
    callsign,
    authError,
    lastReportId,
    sendReport,
  };
}
