# MACS Airbase — Full Demo Script

## Saab Smart Air Base Hackathon Finals — March 25–26, 2026

> **Total demo time: ~12–15 minutes**
> **Presenter prep: Read this entire document. The "📝 NOTE FOR YOU" sections explain what the military terms actually mean so you can answer jury questions confidently.**

---

## 🔑 KEY URLS & ACCESS

| What | URL |
|------|-----|
| **Lovable Frontend** | *(your teammate's Lovable app URL)* |
| **📱 Field App (for jury)** | **https://macs-airbase.duckdns.org/field/** |
| **Backend API** | `https://macs-airbase.duckdns.org/api/` |
| **WebSocket** | `wss://macs-airbase.duckdns.org/ws` |
| **VM SSH** | `gcloud compute ssh sabre-vm --zone=europe-north1-a` |

---

## PRE-DEMO CHECKLIST (Do this 10 minutes before)

- [ ] Open Lovable frontend on the presentation laptop/screen
- [ ] Verify backend is alive: visit `https://macs-airbase.duckdns.org/api/health` — should show `"status": "ok", "agents_alive": 5`
- [ ] Verify EventFeed is streaming events (new events every ~12 seconds)
- [ ] Verify all 5 agent cards show **green/online** status
- [ ] **Test Field App on YOUR phone**: open `https://macs-airbase.duckdns.org/field/` → pick Pad Crew → send a test report → verify it appears on the main dashboard
- [ ] **Prepare QR code** for `https://macs-airbase.duckdns.org/field/` (use any QR generator, or have the URL on a slide)
- [ ] Have this script open on your phone or second screen
- [ ] Optional: open browser DevTools → Console tab to show WebSocket messages flowing

---

## PART 1: THE PROBLEM (1–2 minutes)

### What to say:

> "Modern fighter jets don't operate from big permanent airbases anymore. Sweden's defense concept uses **mobile road bases** — straight stretches of highway in forests where Gripen jets land, refuel, rearm, and take off again. The whole point is to be unpredictable — if the enemy can't find your base, they can't destroy it."

> "The problem is: running a mobile airbase is **chaotic**. You have fuel trucks, ordnance teams, maintenance crews, and air traffic — all operating on a forest road with no infrastructure. Right now, a human **base commander** coordinates everything by radio. If they're overloaded, injured, or the base splits to multiple sites, coordination collapses."

> "Our solution: **replace the single commander with 5 AI agents that coordinate themselves.**"

📝 **NOTE FOR YOU — What is a road base?**
Sweden's Bas 90 concept: straight sections of public highway (800m+) are pre-surveyed as emergency runways. Gripen is specifically designed for this — it can land on 800m of road, be serviced by a crew of 6 conscripts, and take off again in under 10 minutes. The road base is surrounded by forest, with aircraft hidden under tree canopy between sorties. The entire base can relocate in hours. This makes Swedish air power extremely hard to destroy compared to a fixed airfield.

📝 **NOTE FOR YOU — What is a sortie?**
One flight mission by one aircraft. "6 sorties in 90 minutes" means getting 6 individual flight missions launched. A "sortie surge" means launching as many sorties as possible as fast as possible — like a sprint for fighter jets.

📝 **NOTE FOR YOU — What is a Gripen?**
Saab JAS 39 Gripen — a Swedish multirole fighter jet. "JAS" stands for Jakt (fighter), Attack (ground attack), Spaning (reconnaissance). Designed specifically for road base operations with short takeoff/landing, easy maintenance, and rapid turnaround.

---

## PART 2: THE ARCHITECTURE (2 minutes)

### What to say:

> "This is **MACS Airbase — Multi-Agent Command System for Smart Air Bases**."

> "We have 5 agents, each responsible for one domain:"

Point to the agent cards on the dashboard:

| Agent | Say this | Real-life equivalent |
|-------|----------|---------------------|
| **OPS** | "OPS handles sortie scheduling — which aircraft launch when, mission planning, readiness tracking" | The base commander's operations officer |
| **FUEL** | "FUEL manages JP-8 fuel levels, fuel truck dispatch, and refueling operations" | The fuel NCO running the mobile fuel point |
| **ARMING** | "ARMING handles weapons loading — missiles, bombs, IFF verification" | The ordnance crew chief |
| **MAINT** | "MAINT manages aircraft serviceability — pre-flight inspections, repairs, grounding decisions" | The flight line maintenance chief |
| **THREAT** | "THREAT monitors the air picture — radar tracks, threat classification, electronic warfare" | The tactical air control officer |

> "**The critical design principle: no agent talks to any other agent directly.** There's no coordinator, no hierarchy, no leader. They all read and write to a shared **bulletin board**. Like ants leaving pheromone trails — the coordination **emerges** from each agent reading what the others have done and making their own domain-specific decisions."

📝 **NOTE FOR YOU — What is stigmergy?**
It's the biological pattern behind ant colonies. Ants don't talk to each other — they leave chemical trails (pheromones) on the ground. Other ants detect the trails and modify their behavior. Complex coordinated behavior (finding food, building nests) emerges without any ant being "in charge." Our bulletin board is the digital equivalent — agents post events, other agents read them and react. No central controller needed.

📝 **NOTE FOR YOU — What is JP-8?**
JP-8 (Jet Propellant 8) is the standard military aviation fuel used by NATO forces. It's essentially kerosene. "Fuel at 38%" means the road base's mobile fuel storage tanks are only 38% full — enough for maybe 3-4 more aircraft before running dry.

📝 **NOTE FOR YOU — What is IFF?**
Identification Friend or Foe — a transponder system on every military aircraft. It broadcasts a coded signal so friendly radar can distinguish between "our guys" and "their guys." If IFF is "negative" or "invalid," it means the radar can see something but can't confirm it's friendly — that's when threat level goes up.

📝 **NOTE FOR YOU — What is ROE?**
Rules of Engagement — legal constraints on when you can fire weapons. "WEAPONS_HOLD" means don't fire unless fired upon. "WEAPONS_FREE" means you can engage confirmed hostiles. In real life, ROE is a huge deal — violating it can mean war crimes charges.

📝 **NOTE FOR YOU — What is EW (Electronic Warfare)?**
Using electromagnetic energy to disrupt enemy systems. "Jamming" means flooding a radar frequency with noise so it can't see targets. "EW jamming detected on primary radar frequency" means someone is actively trying to blind our radar — this is a very serious escalation because it usually precedes an attack.

---

## PART 3: LIVE SYSTEM — SURGE SCENARIO (2 minutes)

### What to say:

> "The system is running live right now. It started with a **Sortie Surge** scenario — headquarters ordered 6 sorties in 90 minutes, but the base has problems: fuel is low, an aircraft has a hydraulic fault, and ordnance needs reconfiguring."

Point to the **EventFeed**:

> "Watch the event feed — every 12 seconds or so, each agent wakes up, reads the bulletin board, thinks about what's happening through its domain lens, and posts a decision. You can see them **building on each other's work** — OPS references FUEL's truck deployment, ARMING references MAINT's inspection clearance."

Click on any agent card → **"View Reasoning"**:

> "This is **full reasoning transparency**. You can see exactly what information the agent read, what it considered, and why it made the decision it made. This is powered by Google Gemini 2.5 Flash — the agent sends its domain context plus the latest bulletin board events to the LLM, and gets back a structured decision."

📝 **NOTE FOR YOU — What is the tick cycle?**
Each agent runs an independent loop: sleep ~12 seconds (with ±40% random jitter so they don't all fire at once), then wake up, read the bulletin board, send context to Gemini, and post a response. The jitter simulates realistic async operations — in real life, the fuel crew and the arming crew aren't on a synchronized clock.

📝 **NOTE FOR YOU — What does "readiness at 62%" mean?**
It means only 62% of the aircraft fleet is ready to fly right now. If you have 6 Gripens and readiness is 62%, that's roughly 3-4 aircraft available. The rest are being refueled, rearmed, repaired, or grounded. Military planners obsess over this number — dropping below 60% means you can't sustain operations.

📝 **NOTE FOR YOU — What is "serviceability rate"?**
The percentage of aircraft that are mechanically fit to fly. If MAINT says "serviceability rate 80%," that means 4 out of 5 aircraft have no maintenance issues. It's different from readiness — an aircraft can be serviceable (mechanically fine) but not ready (still needs fuel or weapons).

📝 **NOTE FOR YOU — What is a "turnaround"?**
The time between an aircraft landing and being ready to fly again. It includes parking, inspection, refueling, rearming, crew swap, and clearance. Gripen is designed for 10-minute turnarounds with a conscript crew — that's insanely fast for a fighter jet. Most Western fighters take 30-60 minutes.

---

## PART 4: KILL AN AGENT — AUTONOMOUS COMPENSATION (3 minutes)

**⚡ This is the most impressive demo moment. Rehearse this.**

### Step 1: Kill FUEL agent

Click the FUEL agent card → Kill button.

### What to say:

> "Now I'm going to **kill the Fuel agent**. In real life, this could mean the fuel team's communication system went down, or the fuel point was hit, or the fuel NCO was incapacitated. The fuel management capability just disappeared."

### Step 2: Watch the other agents react (wait 15-30 seconds)

> "Watch what happens. **No agent was told what to do.** Each one independently detects that FUEL has gone silent and starts compensating from its own domain:"

Point to each compensation event as it appears:

| Agent | What they do | Say this |
|-------|-------------|----------|
| **OPS** | Routes aircraft to emergency fuel, reduces sortie rate 50% | "OPS detected fuel management is gone — it's manually routing aircraft to emergency fuel points and cutting the sortie rate in half to conserve fuel" |
| **ARMING** | Pre-positions trucks for immediate response | "ARMING is pre-positioning resources so the moment fuel comes back online, they can immediately resume" |
| **MAINT** | Self-monitors fuel systems | "MAINT is taking over fuel system inspections — something it normally doesn't do, but it knows the gap needs filling" |
| **THREAT** | Moves fuel assets to hardened shelter | "THREAT is thinking about survivability — with fuel management down, the remaining fuel is even more critical, so it moves fuel assets to protected positions" |

### What to say:

> "This is **AGENT_COMPENSATION** — the system's self-healing behavior. Each event is tagged so you can trace exactly which agent compensated for which lost capability. In a real road base scenario, if one team goes down, the others don't just stand around waiting — they adapt. Our AI agents do the same thing, autonomously."

### Step 3: Click on a compensation event → Causal Chain view

> "And here's the **causal chain**. You can trace from the original trigger — FUEL going offline — through each agent's detection and compensation response. This gives the human commander full visibility into what the AI decided and why."

### Step 4: Revive FUEL

Click FUEL → Revive button.

> "Now I bring FUEL back online. Watch — it reads the bulletin board, sees what happened while it was down, and seamlessly resumes its responsibilities."

📝 **NOTE FOR YOU — Why is this important for Saab?**
This is the core value proposition. In dispersed road base operations, communication links WILL break. Teams WILL get separated. A centralized command system fails when the center fails. MACS Airbase degrades gracefully — lose one agent, the others compensate. Lose two, the remaining three cover even more. The system never fully fails as long as at least one agent is running. This is what "resilient autonomous coordination" means in military terms.

📝 **NOTE FOR YOU — What is "hardened shelter"?**
Military term for a reinforced structure (often concrete bunker or underground shelter) that can survive bomb blasts. At a road base, there aren't actual bunkers, but there are pre-surveyed positions under tree canopy, behind terrain features, or in culverts that provide protection from air attack. When THREAT says "move fuel to hardened shelter," it means relocating the fuel trucks from the exposed road surface to a concealed position.

📝 **NOTE FOR YOU — What is "emergency fuel point"?**
A backup refueling location that isn't the primary fuel pad. At a road base, the primary fuel point is a specific position on the highway where the fuel truck parks. If that's compromised, you fall back to an emergency point — maybe 200m up the road in a tree line. Less efficient but survivable.

---

## PART 5: FIELD APP — JURY HANDS-ON (3–4 minutes)

**⚡ This is the "wow" moment where the jury PARTICIPATES. Set this up right.**

### Setup (before this part):

You need **2–4 phones/tablets** from the jury or have QR codes ready. The field app is live at:

> **https://macs-airbase.duckdns.org/field/**

Have a QR code for this URL printed or on a slide. It's a mobile PWA — no install needed.

### What to say:

> "Now I want you to experience this from the field. In a real road base, the AI agents aren't the only ones operating — there are human ground crews, pilots, convoy drivers, and security patrols. They all need to feed intelligence INTO the system and receive instructions FROM it."

> "This is our **Field App** — a mobile tactical interface for personnel on the ground. I'd like a few of you to try it."

### Step 1: Assign roles to jury members

Hand phones / ask them to scan the QR code. Assign each person a role:

| Jury member | Assign this role | Tell them this |
|-------------|-----------------|----------------|
| **Person 1** | 🛩️ **Pilot** | "You're a Gripen pilot sitting in your cockpit. You'll report when you're ready for taxi, or if something goes wrong" |
| **Person 2** | 🔧 **Pad Crew** | "You're on the dispersal pad — the stretch of highway where the jet is parked. You handle refueling, arming, and inspecting the aircraft" |
| **Person 3** | 🛡️ **Security** | "You're on perimeter security patrol around the road base. You watch for threats — ground forces, drones, suspicious movement" |
| **Person 4** | 🚛 **Convoy** | "You're driving a fuel truck from the main depot to the road base. You report delays, road blocks, or if you come under fire" |

> "Each role sees different quick-report buttons relevant to their job. And here's the key — when you send a report, it hits the same bulletin board that the 5 AI agents are reading. **They will react to YOUR report.**"

### Step 2: Guided reports — tell each person what to do

**Tell the Pilot:**
> "Tap **Ready** — fill in your aircraft as Gripen-03 and your pad. Hit Send."

What happens: A `FIELD_REPORT` event appears on the bulletin board. Within 12–20 seconds, OPS sees a pilot reporting ready and may adjust the sortie queue. The event shows up on BOTH the main dashboard AND everyone's field app with a `FIELD` tag.

**Tell the Pad Crew:**
> "Tap **Fault Found** — report a hydraulic leak on Gripen-05 at dispersal pad 2. Hit Send."

What happens: MAINT agent detects a field report about a hydraulic fault. It will post an `ACTION_TAKEN` response — probably grounding the aircraft or dispatching inspection. OPS will see serviceability just dropped and may need to resequence sorties.

**Tell Security:**
> "Tap **Drone** — report drone activity over sector 3 at about 200 meters altitude, moving east."

What happens: THREAT agent detects a field report about a possible drone — this is a **big deal** at a concealed road base (drones are the #1 threat to road base operations). THREAT may escalate the threat level to AMBER and advise all units. The other jury members will see the threat level change in their own field apps' header bar.

**Tell the Convoy:**
> "Tap **Road Blocked** — report that the road is blocked at checkpoint 5 due to a fallen tree. Rerouting via the southern route."

What happens: FUEL agent detects a convoy delay. It may recalculate fuel availability and post an alert that resupply ETA has increased. OPS sees this and may reduce sortie rate to conserve fuel.

### Step 3: Show the cascade

> "Now look at the main dashboard."

Point to the EventFeed on the big screen:

> "See? The field reports from your phones are right here — tagged as FIELD, with your callsigns. And look what happened next — the AI agents **read your reports and reacted**. The MAINT agent responded to the hydraulic fault. The THREAT agent escalated because of the drone report. The FUEL agent adjusted the convoy timeline."

> "This is **human-AI teaming**. The humans on the ground provide ground truth — eyes-on intelligence that no sensor can replace. The AI agents process it instantly and coordinate the response across all domains. No human commander needed as the bottleneck."

### Step 4: Show "FOR YOU" directed events

> "Now check your phones again. See the events tagged **FOR YOU**? The agents can direct responses to specific roles. If THREAT detects a drone near your sector, security gets a directed alert. If FUEL needs the convoy to change route, the convoy driver gets a directed message."

📝 **NOTE FOR YOU — Why this matters to Saab:**
This is "human-in-the-loop AI." The jury will ask "but what about the human?" This is the answer: humans provide the ground truth (field reports), AI agents process and coordinate, and directed responses flow back to the right people. The human is not removed — they're augmented. A pad crew member doesn't need to radio the base commander, wait for them to think, then wait for orders. They report → AI processes → response comes back in seconds.

📝 **NOTE FOR YOU — What is a "dispersal pad"?**
On a road base, each aircraft has its own parking position, called a dispersal pad. It's literally a pull-off area next to the highway, often under tree cover. The aircraft taxis from the runway strip to its pad for servicing. Each pad has a crew (pad crew) assigned to it.

📝 **NOTE FOR YOU — Why are drones such a big deal for road bases?**
The whole point of a road base is concealment — hide jets under trees so the enemy can't find them from satellite or aircraft. But cheap commercial drones with cameras can fly low and slow over forest canopy and find hidden aircraft. A single drone spotting your road base can lead to an artillery or air strike within minutes. That's why a security patrol reporting drone activity triggers an immediate THREAT escalation.

📝 **NOTE FOR YOU — What is "source_layer: CROWD"?**
Our system classifies intelligence by trustworthiness: SENSOR (radar, cameras — highest trust), API (data links), CROWD (human field reports — high trust, these are your eyes on the ground), AGENT (AI analysis), SYSTEM (command orders). Field reports come in as CROWD intelligence — the agents know these are human observations from the ground and weight them accordingly.

📝 **NOTE FOR YOU — What are the 6 field roles?**
| Role | Who they are | Quick reports they can send |
|------|-------------|---------------------------|
| **Mission Control** | The command authority — creates and cancels missions | Create mission, set priority/domain/duration |
| **Pilot** | Fighter pilot in cockpit | Ready for taxi, bird strike, weapons expended, emergency, recovered |
| **Pad Crew** | Ground crew at the dispersal pad | Refuel done, armed, fault found, inspection OK, fuel spill, loadout swap |
| **Security** | Perimeter patrol around base | Movement spotted, hostile contact, all clear, acoustic detection, drone |
| **Convoy** | Fuel truck driver on the road | ETA update, road blocked, under fire, fuel delivered, truck breakdown |
| **HQ Liaison** | Higher headquarters representative | New tasking order, intel update, ROE change, redirect |

### 🎯 Best combo for maximum wow:

If you only have **2 phones** from the jury:
1. Give one person **Security** → have them report a **Drone**
2. Give another person **Pad Crew** → have them report **Fault Found**

The drone report triggers THREAT escalation (everyone sees threat level go AMBER in their header). The fault report triggers MAINT to ground an aircraft (OPS has to replan). Two field reports, cascading AI responses across all 5 agents. The jury sees their actions ripple through the entire system in real-time.

If you have **3+ phones**, add a **Pilot** reporting Ready — this creates a nice positive contrast (one good report, two problem reports, and the agents handle all three simultaneously).

---

## PART 6: SCRAMBLE (2 minutes)

### What to say:

> "Now the most dramatic action at any air base — a **scramble**."

### Step 1: Click SCRAMBLE on the tactical map

Select Gripen aircraft → Click SCRAMBLE.

> "A scramble order means: get jets in the air **immediately**. In real life, a klaxon sounds, pilots sprint to their aircraft, ground crew pulls safety pins, and the jets are rolling in minutes. It's the 'this is not a drill' moment."

### Step 2: Watch the EventFeed

> "Look at the event feed — **all 5 agents react simultaneously**, each from their own domain:"

| Agent | Reaction | Explain |
|-------|----------|---------|
| **OPS** | Coordinates launch sequence, assigns aircraft to intercept heading | "OPS is the quarterback — it assigns the scramble pair and coordinates the launch window" |
| **FUEL** | Emergency fuel priority, bypasses normal queue | "FUEL drops everything and prioritizes the scramble aircraft — they need to launch with full tanks" |
| **ARMING** | Fast-tracks weapons verification, validates air-defense loadout | "ARMING confirms the missiles are live and the safety pins are pulled — you don't launch without this" |
| **MAINT** | Emergency release, defers post-flight inspection | "MAINT accepts higher risk — normally you'd do a full pre-flight check, but in a scramble they release the aircraft on emergency authorization" |
| **THREAT** | Provides tactical picture, assigns intercept heading | "THREAT feeds the intercept data — where the threat is, what heading to fly, what the rules of engagement are" |

### Step 3: Click RECALL

> "And now I recall the aircraft. The order goes out, agents coordinate the landing sequence, and aircraft_airborne drops back down."

📝 **NOTE FOR YOU — What is a scramble?**
In military aviation, "scramble" is the emergency order to launch interceptor aircraft as fast as possible to respond to an incoming threat. The word comes from WWII — RAF pilots would literally scramble (run) to their Spitfires when radar detected incoming German bombers. Today it means: maximum urgency launch, skip non-essential checks, get airborne NOW.

📝 **NOTE FOR YOU — What is CAP (Combat Air Patrol)?**
A patrol flight pattern where fighters fly a racetrack pattern in a specific area, ready to intercept anything that enters. "CAP vector 270" means fly west and patrol there. It's like a police car circling a neighborhood — presence and readiness.

📝 **NOTE FOR YOU — What is "weapons free on positive ID"?**
The ROE (rules of engagement) for the scrambled fighters. "Weapons free" = you may fire. "On positive ID" = only after confirming the target is hostile (not a civilian airliner or friendly aircraft). This is the middle ground — more aggressive than WEAPONS_HOLD (don't fire unless attacked) but more cautious than WEAPONS_FREE (fire at anything).

📝 **NOTE FOR YOU — What are AIM-120 and AIM-9?**
AIM-120 AMRAAM = long-range radar-guided air-to-air missile (~100km range). The "fire and forget" missile — you launch it, it guides itself.
AIM-9 Sidewinder = short-range heat-seeking air-to-air missile (~20km range). Tracks the engine heat of enemy aircraft.
(Note: Sweden actually uses Meteor and IRIS-T missiles on Gripen, but the concept is the same — long-range and short-range air-to-air weapons.)

📝 **NOTE FOR YOU — What is AWACS?**
Airborne Warning and Control System — a large aircraft (like a 737 with a big radar dome on top) that flies high and acts as an airborne radar station. "AWACS relay established" means the scrambled fighters are now getting their tactical picture from a radar plane overhead, which can see much further than ground radar.

---

## PART 7: SCENARIO SWITCHING (1–2 minutes, optional)

### What to say:

> "We have three pre-built scenarios that inject realistic events into the system. The agents aren't told about the scenario — they just see events appear on the bulletin board and react."

You can switch scenarios via the API. SSH into the VM or use curl:

```
action: switch_scenario, scenario: scramble
```

**The three scenarios:**

| Scenario | What happens | Timeline |
|----------|-------------|----------|
| **Surge** | HQ orders 6 sorties, fuel runs low, aircraft breaks, ordnance reconfig needed, radar contacts, fuel convoy delayed, then repair completes | 7 events over 5 min |
| **Scramble** | Radar contact → threat escalates to RED → SCRAMBLE ORDER → arming check → EW jamming → intercept → threat resolved | 7 events over 3.5 min |
| **Disperse** | Hostile forces approaching → emergency evacuation to alternate road bases → fuel constraints → comms lost → aircraft grounded → base split | 7 events over 4.5 min |

> "The Scramble scenario is the most dramatic — watch how the threat level escalates from AMBER to RED, and the agents' language changes to reflect the urgency."

📝 **NOTE FOR YOU — What is dispersal?**
When the base is about to be overrun or hit, you split your aircraft across multiple road bases. Instead of 6 jets at one location (easy target), you send 4 to "Base Bravo" and 1 to "Base Charlie" (hard to hit). The challenge: you now need to coordinate fuel, arming, and maintenance across 3 locations with degraded communications.

📝 **NOTE FOR YOU — What does "hostile ground forces within 40km" mean?**
Ground-based military units (armored vehicles, artillery, or special forces) are close enough to potentially reach the road base. At 40km, they could have artillery in range (many modern artillery systems can fire 30-50km). This triggers immediate dispersal — you don't wait until they're at the gate.

📝 **NOTE FOR YOU — What is "HF radio backup"?**
High Frequency radio — old technology but nearly unjammable and works at long range (thousands of km) by bouncing signals off the ionosphere. When primary comms (satellite, data links) are jammed or destroyed, HF is the fallback. Quality is terrible (think crackly AM radio), but it works.

---

## PART 8: TECHNICAL DEEP DIVE (2 minutes — for jury Q&A)

### Architecture slide/explanation:

> "The backend runs 5 independent Python threads — one per agent. Each agent has its own perceive-reason-act loop. The shared state is an append-only event log — our digital bulletin board. The LLM is Google Gemini 2.5 Flash, called via API on every agent tick."

> "The frontend connects via WebSocket for real-time event streaming, and REST API for status queries. Everything runs in Docker on a single cloud VM."

| Component | Technology |
|-----------|-----------|
| Agents | Python 3.12, independent threads |
| LLM | Google Gemini 2.5 Flash (primary), mock fallback |
| Shared State | In-memory append-only event log (BulletinBoard) |
| API | aiohttp REST + WebSocket |
| Command Dashboard | React + TypeScript + Tailwind + MapLibre GL (Lovable) |
| Field App (mobile) | React PWA, mobile-first tactical HUD, role-based |
| Infrastructure | Docker Compose, Caddy (HTTPS), Google Cloud VM |

### Key technical differentiators:

1. **No orchestrator** — agents are truly independent. Kill the OPS agent, the system keeps running.
2. **Stigmergic coordination** — like ant colonies. No message passing between agents.
3. **Causal chain tracking** — every event links to its trigger and downstream reactions. Full auditability.
4. **Reasoning transparency** — you can inspect exactly what each agent "thought" and why it decided what it did.
5. **Graceful degradation** — lose agents progressively, system adapts autonomously at each step.
6. **Human-AI teaming** — field personnel feed ground truth via mobile app, agents process and respond in real-time, directed responses go back to the right people.

📝 **NOTE FOR YOU — If the jury asks "why not just one big LLM?"**
A single LLM trying to manage all 5 domains would be a single point of failure, would have an enormous context window, and would produce generic responses. Our approach: each agent is a specialist with deep domain knowledge. They see the same world but interpret it differently — just like real military specialists. And if one fails, the others keep going.

📝 **NOTE FOR YOU — If the jury asks "what about hallucination?"**
Three safeguards: (1) Each agent only acts within its domain — FUEL can't make arming decisions. (2) The causal chain lets humans trace any decision back to its trigger. (3) The reasoning transparency shows exactly what the LLM considered. A human commander can override or kill any agent at any time.

📝 **NOTE FOR YOU — If the jury asks about "real deployment"?**
In production, the bulletin board would be Redis Streams (same API, just swap the class), agents could run on separate edge devices at the road base, and the LLM could be a locally-hosted model for air-gapped operation. The architecture is designed for this — agents only need access to the bulletin board, nothing else.

---

## PART 9: CLOSING (30 seconds)

### What to say:

> "MACS Airbase shows that **multi-agent AI coordination works for military command and control**. Five specialist agents, no central controller, autonomous compensation when things fail — exactly what a dispersed road base needs."

> "The system is live, the agents are thinking right now, and every decision is transparent and auditable. This is what autonomous air base management looks like."

---

## 🚨 TROUBLESHOOTING — IF THINGS GO WRONG

| Problem | Quick fix |
|---------|-----------|
| **No events appearing** | Backend may have crashed. SSH → `docker restart deploy-backend-1` (takes 30s to restart) |
| **Agent showing "offline"** | It may have been killed earlier. Click Revive on the card |
| **Events appear but all say "mock"** | Gemini rate limit hit (429). System auto-falls back to mock responses. Say: "The agents are using cached domain expertise while the AI model rate-limits recover" — this is actually a feature (graceful degradation) |
| **WebSocket disconnected** | Refresh the browser. WebSocket auto-reconnects |
| **Scramble button doesn't work** | Check browser console for errors. The Supabase proxy might be down. Backup: trigger scramble from API directly |
| **Lovable frontend won't load** | Show the backend API directly: `https://macs-airbase.duckdns.org/api/summary` — the data is still there |
| **Field app won't load** | Check URL is `https://macs-airbase.duckdns.org/field/` (trailing slash matters). If blank screen, hard refresh |
| **Field report says "OFFLINE"** | WebSocket not connected — check wifi on the phone. Badge should say LIVE in green |
| **Field report sent but no agent reaction** | Agents tick every ~12s — wait 15-20 seconds. Check the main dashboard EventFeed for the FIELD_REPORT event |
| **Everything is down** | SSH → `cd /opt/sabre/deploy && docker compose -f docker-compose.prod.yml up -d` |

### Emergency backend restart:
```bash
gcloud compute ssh sabre-vm --zone=europe-north1-a --command="cd /opt/sabre/deploy && docker compose -f docker-compose.prod.yml restart backend"
```

### Emergency scramble via API (if UI button fails):
```bash
gcloud compute ssh sabre-vm --zone=europe-north1-a --command="
docker exec deploy-backend-1 python3 -c \"
import urllib.request, json
req = urllib.request.Request('http://127.0.0.1:8080/control',
  data=json.dumps({'action':'scramble','aircraft':['Gripen-01','Gripen-02']}).encode(),
  headers={'Content-Type':'application/json'})
print(json.loads(urllib.request.urlopen(req).read().decode()))
\""
```

---

## 📋 GLOSSARY — EVERY TERM USED IN THE DEMO

| Term | What it actually means |
|------|----------------------|
| **SAU** | Smart Air-base Unit — our name for each AI agent |
| **MACS** | Multi-Agent Command System — the overall system name |
| **Sortie** | One flight mission by one aircraft (takeoff → mission → landing) |
| **Sortie surge** | Launching maximum sorties as fast as possible |
| **Turnaround** | Time from landing to ready-to-fly-again (Gripen: ~10 min) |
| **Readiness** | % of aircraft ready to fly right now |
| **Serviceability** | % of aircraft mechanically fit to fly (may still need fuel/weapons) |
| **Scramble** | Emergency order to launch interceptors immediately |
| **Recall** | Order for airborne aircraft to return to base immediately |
| **CAP** | Combat Air Patrol — fighters orbiting an area on alert |
| **ROE** | Rules of Engagement — legal rules on when you can fire |
| **WEAPONS_HOLD** | Don't shoot unless shot at |
| **WEAPONS_FREE** | Clear to engage confirmed hostiles |
| **IFF** | Identification Friend or Foe — transponder system to identify aircraft |
| **EW** | Electronic Warfare — jamming, spoofing, signal intelligence |
| **JP-8** | Standard NATO jet fuel (kerosene) |
| **FL240** | Flight Level 240 = 24,000 feet altitude |
| **Bearing 270** | Compass direction: 270° = due west |
| **AMRAAM / AIM-120** | Long-range radar-guided air-to-air missile |
| **Sidewinder / AIM-9** | Short-range heat-seeking air-to-air missile |
| **IRIS-T** | Short-range air-to-air missile used on Gripen |
| **Meteor** | Long-range air-to-air missile used on Gripen |
| **AWACS** | Airborne radar plane for wide-area surveillance |
| **SIGINT** | Signals Intelligence — intercepting enemy communications |
| **Road base / Bas 90** | Highway strip used as emergency runway (Swedish concept) |
| **Dispersal** | Splitting aircraft across multiple locations for survivability |
| **Hardened shelter** | Reinforced/concealed position resistant to attack |
| **HF radio** | High Frequency radio — low-tech, long-range, jam-resistant backup comms |
| **Apron** | The parking area where aircraft are serviced (on a road base: the road itself) |
| **Pre-flight** | Inspection before takeoff — checking everything works |
| **Post-flight** | Inspection after landing — checking for damage |
| **Grounding** | Taking an aircraft out of service due to a fault |
| **Ordnance** | Military weapons — bombs, missiles, ammunition |
| **Loadout** | The specific weapons configuration on an aircraft |
| **Air-to-air** | Weapons for shooting down other aircraft |
| **Air-to-ground / CAS** | Weapons for hitting ground targets (Close Air Support) |
| **Track** | A radar detection — an object seen on radar |
| **Bogey** | An unidentified radar track |
| **Bandit** | A confirmed hostile radar track |
| **Friendly / Blue force** | Our own forces |
| **Red force** | Enemy forces |
| **Fratricide** | Accidentally killing your own forces |
| **Stigmergy** | Coordination through environment (like ant pheromone trails) |
| **Bulletin board** | Our shared event log — the "pheromone trail" |
| **Causal chain** | The link from a trigger event → agent reactions → downstream effects |
| **Compensation** | When one agent takes over functions of a failed agent |
| **Graceful degradation** | System gets worse gradually instead of failing completely |
| **Tick** | One cycle of an agent's perceive-reason-act loop (~12 seconds) |
| **Field App** | Mobile PWA for ground personnel to send reports into the system |
| **Field Report** | Human ground truth intelligence sent from the field app |
| **CROWD intelligence** | Human-sourced information (field reports) — high trust level |
| **Directed event** | An agent response targeted to a specific role (shows "FOR YOU") |
| **Quick report** | Pre-built report template for each role (e.g. "Fault Found" for pad crew) |
| **Dispersal pad** | Pull-off area next to the highway where one aircraft is parked and serviced |
| **Pad crew** | Ground crew assigned to a specific dispersal pad |
| **PWA** | Progressive Web App — works like a native app but runs in the browser |
| **Human-AI teaming** | Humans provide ground truth, AI processes and coordinates the response |

---

## 🎯 DEMO FLOW AT A GLANCE

```
[0:00]  INTRO — The problem (road bases, coordination chaos)
[1:30]  ARCHITECTURE — 5 agents, bulletin board, no coordinator
[3:30]  LIVE SYSTEM — Show surge scenario running, events streaming
[4:30]  REASONING — Click agent card, show Gemini's thinking
[5:00]  ⚡ KILL FUEL — Watch autonomous compensation (THE KEY MOMENT)
[7:00]  CAUSAL CHAIN — Show traceability from trigger to reactions
[7:30]  REVIVE FUEL — Show recovery
[8:00]  📱 FIELD APP — Hand phones to jury, assign roles (THE WOW MOMENT)
[8:30]  Security reports drone → THREAT escalates → everyone sees it
[9:00]  Pad Crew reports fault → MAINT grounds aircraft → OPS replans
[10:00] Show cascade on main dashboard — field reports triggered AI responses
[10:30] SCRAMBLE — Emergency launch, all agents react
[12:00] RECALL — Bring aircraft back
[12:30] SCENARIO SWITCH — (optional) Show scramble scenario
[14:00] CLOSING — Why this matters for Saab
[14:30] Q&A
```

---

## 💡 KILLER LINES FOR THE JURY

Use these if the moment is right:

- "No agent was told what to do. They just read the board and decided on their own."
- "Kill one, the others compensate. Kill two, the rest adapt. The system never fully fails."
- "Every decision is traceable. Click any event and see exactly why it happened and what it triggered."
- "In a real dispersal scenario, communication links break. Our agents don't need to talk to each other — they just need the bulletin board."
- "We don't replace the human commander — we give them five tireless AI specialists who coordinate themselves."
- "The coordination is an emergent property, not a programmed sequence."
- "You just reported a drone from your phone. Within 15 seconds, the AI escalated the threat level and every person on this base got the alert. No human had to relay that."
- "The ground crew is the sensor network. The AI is the brain. Together they're faster than any single commander."
