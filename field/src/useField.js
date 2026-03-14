/**
 * useField — Bidirectional WebSocket hook for field app.
 *
 * Connects to MACS bulletin board, authenticates with role,
 * receives role-filtered events, and sends field reports.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

function _wsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  if (typeof window !== 'undefined' && !window.location.host.startsWith('localhost')) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }
  return 'ws://localhost:8765'
}
const WS_URL = _wsUrl()
const MAX_EVENTS = 100
const RECONNECT_MS = 3000

export function useField(authInfo) {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const [role, setRole] = useState(null)
  const [callsign, setCallsign] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [lastReportId, setLastReportId] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setAuthError(null)
      // Authenticate with role + callsign
      if (authInfo?.role) {
        ws.send(JSON.stringify({
          type: 'auth',
          role: authInfo.role,
          callsign: authInfo.callsign || 'FIELD',
        }))
      }
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)

        if (data.type === 'auth_ok') {
          setRole(data.role)
          setCallsign(data.callsign)
          setAuthError(null)
          return
        }

        if (data.type === 'auth_error') {
          setAuthError(data.message)
          return
        }

        if (data.type === 'report_ok') {
          setLastReportId(data.event_id)
          return
        }

        if (data.type === 'report_error') {
          // Could show a toast here
          console.warn('Report error:', data.message)
          return
        }

        if (data.type === 'pong' || data.type === 'error') return

        // History replay
        if (data.type === 'history') {
          setEvents(data.events || [])
          return
        }

        // Live event
        if (data.id) {
          setEvents(prev => {
            const next = [...prev, data]
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
          })
        }
      } catch (e) {
        console.error('Parse error:', e)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectRef.current = setTimeout(connect, RECONNECT_MS)
    }

    ws.onerror = () => ws.close()
  }, [authInfo])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendReport = useCallback((report) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'field_report',
        ...report,
      }))
    }
  }, [])

  // Filter: only show events relevant to field (actions directed to us, field reports, critical alerts)
  const fieldEvents = events.filter(e => {
    // Always show critical/high
    if (e.severity === 'CRITICAL' || e.severity === 'HIGH') return true
    // Show field reports
    if (e.event_type === 'FIELD_REPORT') return true
    // Show actions (agent outputs)
    if (e.event_type === 'ACTION_TAKEN') return true
    // Show sensor alerts
    if (e.source_layer === 'SENSOR' && e.severity !== 'INFO') return true
    // Show scenario events
    if (e.source === 'SYSTEM' && e.event_type !== 'WORLD_STATE_UPDATE') return true
    return false
  })

  return {
    events: fieldEvents,
    allEvents: events,
    connected,
    role,
    callsign,
    authError,
    lastReportId,
    sendReport,
  }
}
