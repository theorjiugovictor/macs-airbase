# MACS Airbase WebSocket API — Lovable Frontend Integration Guide

> **Live endpoint:** `wss://macs-airbase.duckdns.org/ws`
> **Local dev:** `ws://localhost:8765`

---

## Table of Contents

1. [Connection](#1-connection)
2. [Message Types (Server → Client)](#2-message-types-server--client)
3. [Event Schema](#3-event-schema)
4. [Event Types Reference](#4-event-types-reference)
5. [Agent IDs & Domains](#5-agent-ids--domains)
6. [World State Object](#6-world-state-object)
7. [Deriving UI State](#7-deriving-ui-state-from-events)
8. [HTTP API (REST)](#8-http-api-rest)
9. [Scenarios](#9-scenarios)
10. [Reference Implementation (React)](#10-reference-implementation-react)
11. [TypeScript Types](#11-typescript-types)

---

## 1. Connection

MACS Airbase uses a **plain WebSocket** — no socket.io, no special handshake. Connect and start receiving.

```
wss://macs-airbase.duckdns.org/ws
```

### Connection Flow

```
Client                         Server
  │                              │
  │──── WebSocket connect ──────▶│
  │                              │
  │◀── { type: "history", ... } ─│   (full event backlog on connect)
  │                              │
  │◀── { Event }  ───────────────│   (real-time, one per message)
  │◀── { Event }  ───────────────│
  │◀── { Event }  ───────────────│
  │         ...                  │
```

### Reconnection

The server does **not** send pings. Implement client-side reconnect:

```javascript
// Reconnect with 2-second backoff on close
ws.onclose = () => setTimeout(connect, 2000)
```

---

## 2. Message Types (Server → Client)

The server sends exactly **two** message shapes:

### 2a. History (sent once on connect)

```json
{
  "type": "history",
  "events": [ Event, Event, ... ]
}
```

- Sent immediately after WebSocket open
- Contains up to **200** recent events
- Use this to hydrate your UI on first load or reconnect

### 2b. Live Event (sent continuously)

Every subsequent message is a **single Event object** (no wrapper):

```json
{
  "id": "EVT-00042",
  "timestamp": 1710412345.678,
  "source": "OPS",
  "event_type": "ACTION_TAKEN",
  "domain": "SORTIE",
  "severity": "HIGH",
  "source_layer": "AGENT",
  "source_mode": "gemini",
  "payload": { ... },
  "tags": ["sortie", "action"]
}
```

### How to Distinguish

```javascript
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data)

  if (data.type === 'history') {
    // data.events is an array of Event objects
    handleHistory(data.events)
  } else {
    // data IS a single Event object
    handleLiveEvent(data)
  }
}
```

---

## 3. Event Schema

Every event has this structure:

| Field          | Type     | Description |
|----------------|----------|-------------|
| `id`           | `string` | Unique sequential ID: `"EVT-00001"`, `"EVT-00042"` |
| `timestamp`    | `number` | Unix epoch seconds (float): `1710412345.678` |
| `source`       | `string` | Who emitted it: `"OPS"`, `"FUEL"`, `"SYSTEM"`, etc. |
| `event_type`   | `string` | What happened: `"ACTION_TAKEN"`, `"FUEL_LOW"`, etc. |
| `domain`       | `string` | Domain area: `"SORTIE"`, `"FUEL"`, `"ARMING"`, `"MAINTENANCE"`, `"THREAT"`, `"SYSTEM"` |
| `severity`     | `string` | One of: `"CRITICAL"`, `"HIGH"`, `"AMBER"`, `"MEDIUM"`, `"LOW"`, `"INFO"` |
| `source_layer` | `string` | Intelligence source: `"SENSOR"`, `"API"`, `"CROWD"`, `"AGENT"`, `"SYSTEM"` |
| `source_mode`  | `string` | LLM mode: `"mock"`, `"gemini"`, `"openrouter"`, `"claude"`, or `""` (system events) |
| `payload`      | `object` | Event-specific data (always has `message` string for agent events) |
| `tags`         | `string[]` | Freeform labels: `["fuel-low", "surge"]` |

### Severity Levels (ordered)

```
CRITICAL  →  RED, immediate action required
HIGH      →  Orange/yellow, urgent
AMBER     →  Yellow, elevated threat
MEDIUM    →  Cyan, noteworthy
LOW       →  Green, routine
INFO      →  Grey, informational
```

---

## 4. Event Types Reference

### System Events (source = "SYSTEM")

| event_type              | domain        | When fired | Key payload fields |
|-------------------------|---------------|------------|--------------------|
| `SCENARIO_START`        | `SYSTEM`      | Scenario begins | `scenario` (string), `description` (string) |
| `TASKING_ORDER`         | `SORTIE`      | HQ issues sortie demand | `sorties_required`, `window_minutes`, `aircraft_serviceable` |
| `FUEL_LOW`              | `FUEL`        | Fuel reserves drop | `fuel_level_pct`, `trucks_available`, `resupply_eta_hours` |
| `FUEL_RESUPPLY_UPDATE`  | `FUEL`        | Convoy status change | `new_eta_hours`, `blockage_location` |
| `AIRCRAFT_GROUNDED`     | `MAINTENANCE` | Aircraft fault detected | `aircraft_id`, `fault`, `repair_eta_minutes` |
| `MAINTENANCE_COMPLETE`  | `MAINTENANCE` | Aircraft repaired | `aircraft_id`, `status` |
| `ORDNANCE_DEMAND`       | `ARMING`      | Loadout swap required | `aircraft_count`, `current_loadout`, `required_loadout` |
| `RADAR_CONTACT`         | `THREAT`      | New track detected | `tracks`, `bearing`, `altitude_ft`, `speed_knots`, `iff`, `range_nm` |
| `THREAT_ESCALATION`     | `THREAT`      | Threat level increase | `threat_level`, `ew_detected`, `range_nm` |
| `THREAT_RESOLVED`       | `THREAT`      | Threat downgraded | `threat_level` |
| `SCRAMBLE_ORDER`        | `SORTIE`      | Immediate launch | `aircraft[]`, `vector_bearing`, `roe` |
| `DISPERSAL_ORDER`       | `SYSTEM`      | Base dispersal | `dispersal_points[]`, `primary_threat_bearing` |
| `EW_JAMMING`            | `THREAT`      | Electronic warfare detected | `coverage_degradation_pct` |
| `WORLD_STATE_UPDATE`    | `SYSTEM`      | Periodic state snapshot | `state` (full WorldState object — see §6) |

### Sensor Events (source_layer = "SENSOR")

Generated by the sensor simulator every 15-60 seconds:

| event_type              | domain        | When fired | Key payload fields |
|-------------------------|---------------|------------|--------------------|
| `AIRCRAFT_TELEMETRY`    | `SORTIE`      | Every 15s  | `aircraft[]`, `fleet_summary` |
| `RADAR_SWEEP`           | `THREAT`      | Every 20s  | `tracks`, `hostile_count`, `closest_nm`, `contacts[]` |
| `FUEL_TELEMETRY`        | `FUEL`        | Every 30s  | `storage_pct`, `trucks[]`, `burn_rate_lph` |
| `WEATHER_UPDATE`        | `SYSTEM`      | Every 60s  | `wind_kts`, `vis_km`, `ceiling_ft`, `precip`, `runway_condition` |
| `EW_SCAN`               | `THREAT`      | Every 25s  | `emitter_type`, `bearing`, `band`, `assessment` |
| `PERIMETER_ALERT`       | `THREAT`      | Every 15s  | `sector`, `sensor_type`, `confidence` |

#### AIRCRAFT_TELEMETRY Payload

Per-aircraft status with full lifecycle tracking:

```json
{
  "message": "Aircraft telemetry: Gripen-01 airborne hdg 090 FL250 fuel 72%; Gripen-02 SHELTER at Alpha-2 fuel 95%",
  "aircraft": [
    {
      "id": "Gripen-01",
      "phase": "AIRBORNE",
      "pad": "Alpha-1",
      "fuel_pct": 72.5,
      "loadout": "air-to-air",
      "pilot": "Pilot-A",
      "serviceable": true,
      "heading": 90,
      "altitude_ft": 25000,
      "speed_kts": 600,
      "flight_time_min": 12.0,
      "hours_since_inspection": 3.5
    }
  ],
  "fleet_summary": {
    "total": 6,
    "serviceable": 5,
    "airborne": 1,
    "grounded": 0,
    "fueling": 1,
    "arming": 1,
    "ready": 3
  }
}
```

**Aircraft Phases** (lifecycle order):
`SHELTER` → `PRE_FLIGHT` → `FUELING` → `ARMING` → `TAXI` → `TAKEOFF` → `AIRBORNE` → `RTB` → `LANDING` → `POST_FLIGHT` → `MAINTENANCE` / `GROUNDED`

### Agent Events (source = agent ID)

| event_type       | When fired | Description |
|------------------|------------|-------------|
| `AGENT_ONLINE`   | Agent starts | Lifecycle event — agent is now active |
| `AGENT_OFFLINE`  | Agent killed | Lifecycle event — agent went down |
| `ACTION_TAKEN`   | Every agent action | The main event type — agent describes what it's doing |

### ACTION_TAKEN Payload

This is the most common event. The `payload` always contains:

```json
{
  "message": "Deploying fuel truck Alpha to pad 3 — ETA 8 minutes. Coordinating with ARMING [EVT-00023].",
  "details": {
    "mock": true,
    "reacting_to": "ARMING"
  },
  "references": ["EVT-00023"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `payload.message` | `string` | Human-readable description of the action |
| `payload.details.mock` | `boolean?` | `true` if this was a scripted mock response |
| `payload.details.reacting_to` | `string?` | Which domain triggered this reaction |
| `payload.details.compensating_for` | `string?` | Which offline agent is being covered |
| `payload.references` | `string[]?` | Event IDs this action builds on |

---

## 5. Agent IDs & Domains

| Agent ID | Domain          | Role |
|----------|-----------------|------|
| `OPS`    | `SORTIE`        | Sortie scheduling, launch sequencing, crew coordination |
| `FUEL`   | `FUEL`          | JP-8 inventory, truck dispatch, resupply convoys |
| `ARMING` | `ARMING`        | Ordnance loading, IFF verification, weapons config |
| `MAINT`  | `MAINTENANCE`   | Pre/post-flight inspections, serviceability |
| `THREAT` | `THREAT`        | Radar tracks, threat level, EW detection, ROE |
| `SYSTEM` | `SYSTEM`        | Scenario engine, world state updates |

### Agent Status Derivation

There is no status API — derive it from events:

```
AGENT_ONLINE  → status = "online"
AGENT_OFFLINE → status = "offline"
ACTION_TAKEN  → status = "active"
```

Most recent event wins per agent.

---

## 6. World State Object

Periodically emitted as `WORLD_STATE_UPDATE` events (every ~15s when state changes).
Found in `event.payload.state`:

```json
{
  "scenario": "surge",
  "updated_at": 1710412345.678,
  "fuel": {
    "level_pct": 38,
    "trucks_available": 1,
    "trucks_total": 2,
    "resupply_eta_hours": 4.0
  },
  "sorties": {
    "aircraft_total": 6,
    "aircraft_serviceable": 5,
    "aircraft_airborne": 0,
    "readiness_pct": 83
  },
  "arming": {
    "ordnance_ready_pct": 100,
    "armed_aircraft": 4
  },
  "maintenance": {
    "queue": 0,
    "grounded": 0
  },
  "threat": {
    "level": "GREEN",
    "radar_tracks": 0,
    "ew_jamming": false,
    "comms_coverage_pct": 100
  },
  "base": {
    "bases_active": 1,
    "dispersal_active": false
  },
  "aircraft": {
    "Gripen-01": {
      "id": "Gripen-01",
      "phase": "AIRBORNE",
      "pad": "Alpha-1",
      "fuel_pct": 72.5,
      "loadout": "air-to-air",
      "pilot": "Pilot-A",
      "serviceable": true,
      "heading": 90,
      "altitude_ft": 25000,
      "speed_kts": 600,
      "flight_time_min": 12.0,
      "hours_since_inspection": 3.5
    },
    "Gripen-02": { "..." : "same shape" }
  }
}
```

### Threat Levels

| Level    | Meaning |
|----------|---------|
| `GREEN`  | No active threats |
| `AMBER`  | Potential threat, elevated readiness |
| `RED`    | Active hostile, scramble authorized |

---

## 7. Deriving UI State from Events

### Agent cards (status, action count, last seen)

```javascript
const agents = { OPS: {}, FUEL: {}, ARMING: {}, MAINT: {}, THREAT: {} }

function processEvent(event) {
  if (event.source === 'SYSTEM') return

  const agent = agents[event.source]
  if (!agent) return

  if (event.event_type === 'AGENT_OFFLINE') agent.status = 'offline'
  else if (event.event_type === 'AGENT_ONLINE') agent.status = 'online'
  else if (agent.status !== 'offline') agent.status = 'active'

  agent.lastSeen = event.timestamp
  if (event.event_type === 'ACTION_TAKEN') agent.actionCount++
}
```

### Current scenario name

```javascript
// Look for SCENARIO_START event
const scenarioEvent = events.find(e => e.event_type === 'SCENARIO_START')
const scenario = scenarioEvent?.payload?.scenario || 'unknown'
```

### Current threat level

```javascript
// Last THREAT-domain event with a threat_level in payload
const threatLevel = events
  .filter(e => e.domain === 'THREAT' && e.payload?.threat_level)
  .at(-1)?.payload.threat_level || 'GREEN'
```

### Severity counts

```javascript
const counts = { CRITICAL: 0, HIGH: 0, AMBER: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
events.forEach(e => { if (e.severity in counts) counts[e.severity]++ })
```

### Domain activity bar chart

```javascript
const domainCounts = {}
events
  .filter(e => e.event_type === 'ACTION_TAKEN')
  .forEach(e => { domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1 })
```

### World state gauges (fuel %, readiness %, etc.)

```javascript
// Get latest WORLD_STATE_UPDATE
const worldState = events
  .filter(e => e.event_type === 'WORLD_STATE_UPDATE')
  .at(-1)?.payload?.state || null

// Use: worldState.fuel.level_pct, worldState.sorties.readiness_pct, etc.
```

---

## 8. HTTP API (REST)

> **Live endpoint:** `https://macs-airbase.duckdns.org/api`
> **Local dev:** `http://localhost:8080`

All endpoints support CORS. All responses are JSON.

### 8a. GET /api/agents — Agent Status

Returns live status of all 5 SAU agents.

```bash
GET https://macs-airbase.duckdns.org/api/agents
```

**Response:**

```json
{
  "agents": {
    "OPS": {
      "status": "online",
      "alive": true,
      "last_active": 1710412345.678,
      "seconds_since_action": 8.2
    },
    "FUEL": {
      "status": "offline",
      "alive": false,
      "last_active": 1710412300.0,
      "seconds_since_action": 53.9
    }
  }
}
```

### 8b. POST /api/control — Kill / Revive Agent (Resilience Demo)

Kill an agent to simulate failure. Other agents detect the gap and compensate autonomously. Revive to bring it back.

**Kill an agent:**

```bash
POST https://macs-airbase.duckdns.org/api/control
Content-Type: application/json

{ "action": "kill_agent", "agent_id": "FUEL" }
```

**Response:**

```json
{ "ok": true, "killed": "FUEL" }
```

If already offline: `{ "ok": true, "note": "FUEL already offline" }`

**Revive an agent:**

```bash
POST https://macs-airbase.duckdns.org/api/control
Content-Type: application/json

{ "action": "revive_agent", "agent_id": "FUEL" }
```

**Response:**

```json
{ "ok": true, "revived": "FUEL" }
```

If already online: `{ "ok": true, "note": "FUEL already online" }`

**Valid agent IDs:** `OPS`, `FUEL`, `ARMING`, `MAINT`, `THREAT`

**What happens after kill/revive:**
1. The agent's reasoning loop stops/starts immediately
2. An `AGENT_OFFLINE` or `AGENT_ONLINE` event is posted to the bulletin board
3. That event broadcasts over WebSocket to all connected clients
4. Remaining agents detect the gap within their next tick (~12s) and start compensating

**Error (invalid agent):**

```json
{ "ok": false, "error": "Unknown agent: FOO", "valid": ["OPS", "FUEL", "ARMING", "MAINT", "THREAT"] }
```

### 8c. POST /api/control — Inject Event

Inject a custom event into the bulletin board (e.g. from a voice agent).

```bash
POST https://macs-airbase.duckdns.org/api/control
Content-Type: application/json

{
  "action": "inject_event",
  "event_type": "SCENARIO_EVENT",
  "domain": "THREAT",
  "severity": "HIGH",
  "message": "Voice report: hostile drone spotted over sector 4"
}
```

**Response:**

```json
{ "ok": true, "event_id": "EVT-00123" }
```

### 8d. GET /api/events — Query Events

```bash
GET https://macs-airbase.duckdns.org/api/events?limit=20&domain=THREAT&type=ACTION_TAKEN
```

| Param    | Default | Description |
|----------|---------|-------------|
| `limit`  | `20`    | Max events to return (capped at 200) |
| `domain` | —       | Filter by domain: `SORTIE`, `FUEL`, `ARMING`, `MAINTENANCE`, `THREAT`, `SYSTEM` |
| `type`   | —       | Filter by event_type: `ACTION_TAKEN`, `AGENT_OFFLINE`, etc. |

**Response:**

```json
{
  "events": [ Event, Event, ... ],
  "count": 20
}
```

### 8e. GET /api/status — World State Snapshot

Returns the current operational picture (same data as `WORLD_STATE_UPDATE` events).

```bash
GET https://macs-airbase.duckdns.org/api/status
```

**Response:** See [§6 World State Object](#6-world-state-object) for the full schema.

### 8f. GET /api/health — Health Check

```bash
GET https://macs-airbase.duckdns.org/api/health
```

**Response:**

```json
{
  "status": "ok",
  "agents_alive": 5,
  "agents_total": 5,
  "events": 342
}
```

### TypeScript — Control API Types

```typescript
// Kill / Revive
type ControlAction =
  | { action: 'kill_agent'; agent_id: AgentId }
  | { action: 'revive_agent'; agent_id: AgentId }
  | { action: 'inject_event'; event_type?: string; domain?: string; severity?: string; message: string }

interface ControlResponse {
  ok: boolean
  killed?: AgentId
  revived?: AgentId
  event_id?: string
  note?: string
  error?: string
  valid?: AgentId[]
}

interface AgentsResponse {
  agents: Record<AgentId, {
    status: string
    alive: boolean
    last_active: number | null
    seconds_since_action: number | null
  }>
}

interface HealthResponse {
  status: 'ok'
  agents_alive: number
  agents_total: number
  events: number
}
```

---

## 9. Scenarios

Three built-in scenarios. The backend runs one at a time.

| Key        | Name                        | Description |
|------------|-----------------------------|-------------|
| `surge`    | Sortie Surge                | High-tempo tasking, fuel low, ordnance reconfig, aircraft grounding |
| `scramble` | Combat Air Patrol Scramble  | Hostile radar contact → AMBER → RED → intercept launch |
| `disperse` | Emergency Base Dispersal    | Hostile forces → base splits to alternate road bases |

The scenario name is provided in the `SCENARIO_START` event payload.

---

## 10. Reference Implementation (React)

Minimal hook that gives you everything:

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'wss://macs-airbase.duckdns.org/ws'  // or ws://localhost:8765
const MAX_EVENTS = 300

export function useSwarm() {
  const [events, setEvents] = useState([])
  const [agents, setAgents] = useState({
    OPS:    { status: 'unknown', lastSeen: null, actionCount: 0 },
    FUEL:   { status: 'unknown', lastSeen: null, actionCount: 0 },
    ARMING: { status: 'unknown', lastSeen: null, actionCount: 0 },
    MAINT:  { status: 'unknown', lastSeen: null, actionCount: 0 },
    THREAT: { status: 'unknown', lastSeen: null, actionCount: 0 },
  })
  const [connected, setConnected] = useState(false)
  const [scenario, setScenario] = useState(null)
  const wsRef = useRef(null)

  const processEvent = useCallback((event) => {
    if (event.source !== 'SYSTEM') {
      setAgents(prev => {
        const id = event.source
        if (!prev[id]) return prev
        const prevStatus = prev[id].status
        const nextStatus =
          event.event_type === 'AGENT_OFFLINE' ? 'offline'
          : event.event_type === 'AGENT_ONLINE' ? 'online'
          : 'active'
        return {
          ...prev,
          [id]: {
            ...prev[id],
            status: (prevStatus === 'offline' && event.event_type !== 'AGENT_ONLINE')
              ? 'offline' : nextStatus,
            lastSeen: event.timestamp,
            actionCount: event.event_type === 'ACTION_TAKEN'
              ? prev[id].actionCount + 1 : prev[id].actionCount,
          },
        }
      })
    }
    if (event.event_type === 'SCENARIO_START') {
      setScenario(event.payload?.scenario || 'unknown')
    }
  }, [])

  useEffect(() => {
    let dead = false
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data)
        if (data.type === 'history') {
          setEvents(prev => {
            const seen = new Set(prev.map(e => e.id))
            const fresh = data.events.filter(e => !seen.has(e.id))
            return [...prev, ...fresh].slice(-MAX_EVENTS)
          })
          data.events.forEach(processEvent)
        } else {
          processEvent(data)
          setEvents(prev => {
            if (prev.some(e => e.id === data.id)) return prev
            const next = [...prev, data]
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
          })
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (!dead) setTimeout(connect, 2000)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => { dead = true; wsRef.current?.close() }
  }, [processEvent])

  return { events, agents, connected, scenario }
}
```

### Usage in a Component

```jsx
function Dashboard() {
  const { events, agents, connected, scenario } = useSwarm()

  const worldState = events
    .filter(e => e.event_type === 'WORLD_STATE_UPDATE')
    .at(-1)?.payload?.state

  const threatLevel = events
    .filter(e => e.domain === 'THREAT' && e.payload?.threat_level)
    .at(-1)?.payload.threat_level || 'GREEN'

  return (
    <div>
      <h1>MACS Airbase — {scenario}</h1>
      <p>Connected: {connected ? '✅' : '❌'}</p>
      <p>Threat: {threatLevel}</p>
      <p>Events: {events.length}</p>
      {/* Render agents, event feed, world state gauges, etc. */}
    </div>
  )
}
```

---

## 11. TypeScript Types

Copy these into your Lovable project:

```typescript
// ── Event ───────────────────────────────────────────────────────────────

interface MacsEvent {
  id: string                 // "EVT-00001"
  timestamp: number          // Unix epoch seconds (float)
  source: string             // "OPS" | "FUEL" | "ARMING" | "MAINT" | "THREAT" | "SYSTEM"
  event_type: string         // See §4
  domain: MacsDomain
  severity: MacsSeverity
  source_layer: SourceLayer
  source_mode: SourceMode
  payload: Record<string, any> & { message?: string }
  tags: string[]
}

type MacsDomain =
  | 'SORTIE' | 'FUEL' | 'ARMING' | 'MAINTENANCE' | 'THREAT' | 'SYSTEM'

type MacsSeverity =
  | 'CRITICAL' | 'HIGH' | 'AMBER' | 'MEDIUM' | 'LOW' | 'INFO'

type SourceLayer =
  | 'SENSOR' | 'API' | 'CROWD' | 'AGENT' | 'SYSTEM'

type SourceMode =
  | 'mock' | 'gemini' | 'openrouter' | 'claude' | ''

type AgentId = 'OPS' | 'FUEL' | 'ARMING' | 'MAINT' | 'THREAT'

// ── Agent State (derive from events) ────────────────────────────────────

interface AgentState {
  status: 'unknown' | 'online' | 'active' | 'offline'
  lastSeen: number | null
  actionCount: number
}

// ── World State (from WORLD_STATE_UPDATE payload.state) ──────────────

interface WorldState {
  scenario: string
  updated_at: number
  fuel: {
    level_pct: number        // 0-100
    trucks_available: number
    trucks_total: number
    resupply_eta_hours: number
  }
  sorties: {
    aircraft_total: number
    aircraft_serviceable: number
    aircraft_airborne: number
    readiness_pct: number    // 0-100
  }
  arming: {
    ordnance_ready_pct: number  // 0-100
    armed_aircraft: number
  }
  maintenance: {
    queue: number
    grounded: number
  }
  threat: {
    level: 'GREEN' | 'AMBER' | 'RED'
    radar_tracks: number
    ew_jamming: boolean
    comms_coverage_pct: number  // 0-100
  }
  base: {
    bases_active: number
    dispersal_active: boolean
  }
  aircraft: Record<string, AircraftState>
}

interface AircraftState {
  id: string               // "Gripen-01"
  phase: AircraftPhase
  pad: string              // "Alpha-1", "Bravo-2"
  fuel_pct: number         // 0-100
  loadout: string          // "air-to-air" | "multirole" | "CAS" | "SEAD"
  pilot: string            // "Pilot-A"
  serviceable: boolean
  heading: number          // 0-359 degrees
  altitude_ft: number      // 0 on ground, up to 35000
  speed_kts: number        // 0 on ground
  flight_time_min: number  // minutes since takeoff
  hours_since_inspection: number
}

type AircraftPhase =
  | 'SHELTER' | 'PRE_FLIGHT' | 'FUELING' | 'ARMING'
  | 'TAXI' | 'TAKEOFF' | 'AIRBORNE' | 'RTB'
  | 'LANDING' | 'POST_FLIGHT' | 'MAINTENANCE' | 'GROUNDED'

// ── WebSocket Messages ──────────────────────────────────────────────────

type WSMessage =
  | { type: 'history'; events: MacsEvent[] }
  | MacsEvent  // live event (no wrapper)
```

---

## Color Constants

Recommended color palette for UI consistency:

```typescript
const DOMAIN_COLOR: Record<MacsDomain, string> = {
  SORTIE:      '#3b82f6',  // blue
  FUEL:        '#f97316',  // orange
  ARMING:      '#ef4444',  // red
  MAINTENANCE: '#8b5cf6',  // purple
  THREAT:      '#06b6d4',  // cyan
  SYSTEM:      '#64748b',  // slate
}

const SEVERITY_COLOR: Record<MacsSeverity, string> = {
  CRITICAL: '#ef4444',  // red
  HIGH:     '#f59e0b',  // amber
  AMBER:    '#f59e0b',  // amber
  MEDIUM:   '#06b6d4',  // cyan
  LOW:      '#22c55e',  // green
  INFO:     '#4b5563',  // grey
}

const THREAT_COLOR: Record<string, string> = {
  GREEN: '#4ade80',
  AMBER: '#f59e0b',
  RED:   '#ef4444',
}

const DOMAIN_ICON: Record<MacsDomain, string> = {
  SORTIE:      '✈',
  FUEL:        '⛽',
  ARMING:      '🎯',
  MAINTENANCE: '🔧',
  THREAT:      '📡',
  SYSTEM:      '🌐',
}

const MODE_BADGE: Record<SourceMode, { label: string; color: string }> = {
  mock:       { label: 'MOCK',       color: '#9ca3af' },
  gemini:     { label: 'GEMINI',     color: '#60a5fa' },
  openrouter: { label: 'OPENROUTER', color: '#34d399' },
  claude:     { label: 'CLAUDE',     color: '#a78bfa' },
  '':         { label: '',           color: '' },
}
```
