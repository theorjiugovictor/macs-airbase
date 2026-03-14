# MACS Airbase — Multi-Agent Command System for Smart Air Bases

Multi-agent swarm system for Swedish Air Force road base operations.
Built for the **Saab Smart Air Base Hackathon** (Hack Day: March 14, Stockholm · Finals: March 26, Linköping).

## Architecture

```
MACS Airbase uses stigmergy: agents coordinate exclusively through a shared append-only
bulletin board event log. No direct agent-to-agent communication.

Each SAU (Smart Air-base Unit) runs a PERCEIVE → REASON → ACT loop every ~5s.

         ┌─────────────────────────────────────┐
         │         BULLETIN BOARD              │
         │   (append-only event log, WS bcast) │
         └──────────────┬──────────────────────┘
                        │  all agents read/write
          ┌─────────────┼─────────────┐
          │             │             │
        OPS           FUEL         ARMING
     (SORTIE)        (FUEL)       (ARMING)
          │             │             │
        MAINT         THREAT
    (MAINTENANCE)    (THREAT)
```

## SAU Agents

| Agent  | Domain      | Responsibility |
|--------|-------------|----------------|
| OPS    | SORTIE      | Sortie scheduling, launch sequencing, crew coordination |
| FUEL   | FUEL        | JP-8 inventory, truck dispatch, resupply convoys |
| ARMING | ARMING      | Ordnance loading, IFF verification, weapons configuration |
| MAINT  | MAINTENANCE | Pre/post-flight inspections, serviceability, grounding |
| THREAT | THREAT      | Radar tracks, threat level, EW detection, ROE, safe corridors |

Each agent compensates for offline peers (cross-domain gap detection).

## Scenarios

| Key      | Name                       | Description |
|----------|----------------------------|-------------|
| surge    | Sortie Surge               | High-tempo tasking demand, fuel low, ordnance reconfig, threat track |
| scramble | Combat Air Patrol Scramble | Hostile radar contact → AMBER → RED → intercept |
| disperse | Emergency Base Dispersal   | Hostile forces force split to alternate road bases |

## Quick Start

### Mock mode (no API keys required)

```bash
cd backend
pip install -r requirements.txt
python main.py                          # surge scenario
python main.py --scenario scramble
python main.py --scenario disperse
python main.py --list-scenarios
```

```bash
cd frontend
npm install
npm run dev                             # http://localhost:3000
```

### Live mode (Gemini primary, Claude fallback)

```bash
export GOOGLE_API_KEY=your_key_here
cd backend && python main.py --scenario scramble
```

### Docker Compose

```bash
GOOGLE_API_KEY=your_key docker-compose up
# Dashboard: http://localhost:3000
# WebSocket: ws://localhost:8765
```

## CLI Controls (backend terminal)

```
kill FUEL        # simulate agent failure → triggers gap compensation
revive FUEL      # bring agent back online
kill OPS         # watch other agents cover OPS duties
state            # bulletin board stats + agent status
world            # operational picture snapshot
quit
```

## Key Design Patterns

- **Stigmergy**: Agents coordinate through the bulletin, not each other
- **Emergence**: Complex coordinated behaviour arises from simple per-agent rules
- **Resilience**: Kill any agent — peers detect the gap and compensate autonomously
- **Swap-ready**: BulletinBoard is Redis Streams compatible (swap `shared_state.py`)
- **LLM-agnostic**: Gemini primary, Claude fallback, mock mode for demos

## File Structure

```
macs-airbase/
├── backend/
│   ├── main.py           # entry point
│   ├── agent.py          # SAU base class (mock + LLM reasoning)
│   ├── agents/
│   │   ├── __init__.py   # SYSTEM_CONTEXT + build_agents()
│   │   ├── ops.py        # OPS — sortie operations
│   │   ├── fuel.py       # FUEL — fuel management
│   │   ├── arming.py     # ARMING — ordnance
│   │   ├── maint.py      # MAINT — maintenance
│   │   └── threat.py     # THREAT — threat assessment
│   ├── shared_state.py   # BulletinBoard, Event dataclass
│   ├── ws_server.py      # WebSocket server (port 8765)
│   ├── scenarios.py      # surge / scramble / disperse
│   ├── world_state.py    # WorldStateManager (operational picture)
│   ├── personas.py       # build_agents() alias
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx       # dashboard (agent cards, event feed, emergence graph)
    │   ├── useSwarm.js   # WebSocket hook
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    ├── vite.config.js
    └── index.html
```
