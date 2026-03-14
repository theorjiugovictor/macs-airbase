# 🎤 MACS Airbase — Pitch Script
**Multi-Agent Command System for Smart Air Bases**
*~3 minutes*

---

## HOOK (15 sec)

> "Imagine a Gripen squadron dispersed across three Swedish road bases. Fuel is running low at Road Base Alpha. A hostile radar contact just appeared on bearing 045. And your maintenance chief just grounded aircraft 39-3 for a hydraulic fault. Who coordinates all of this?
>
> **Nobody.** That's the point."

---

## THE PROBLEM (30 sec)

> "Today's air base operations rely on a centralised command structure — a single ops room, human coordinators, sequential decision-making. That works in peacetime. But in a dispersed road base scenario — which is the *core* of Swedish air defence doctrine — you lose that central node. Comms get jammed. Staff get overwhelmed. Decisions bottleneck.
>
> The question Saab posed is: **how do you make an air base smart enough to coordinate itself?**"

---

## OUR ANSWER (45 sec)

> "We built **MACS** — a Multi-Agent Command System where five AI agents run the base *together*, with no central coordinator.
>
> Each agent owns one domain: **OPS** handles sortie scheduling, **FUEL** manages JP-8 inventory and truck dispatch, **ARMING** handles ordnance loading and IFF, **MAINT** tracks aircraft serviceability, and **THREAT** monitors radar tracks and electronic warfare.
>
> They coordinate through **stigmergy** — the same principle ant colonies use. Every agent reads from and writes to a shared bulletin board. No agent talks directly to another. Complex, coordinated behaviour *emerges* from simple individual rules.
>
> When THREAT detects a hostile contact, it posts to the bulletin. OPS sees it and sequences a scramble. FUEL dispatches a truck. ARMING begins weapons config. MAINT clears the jet. **No one told them to coordinate. They just did.**"

---

## RESILIENCE — THE KILLER FEATURE (30 sec)

> "Now here's what makes this *actually* useful for defence: **kill any agent, and the system adapts.**
>
> Take out the FUEL agent — simulating a comms failure or a destroyed fuel point. The remaining agents detect the gap within seconds and start compensating autonomously. OPS adjusts sortie plans for fuel constraints. MAINT flags fuel-dependent checks.
>
> This isn't graceful degradation. This is **emergent resilience**. The system has no single point of failure because there is no single point of control."

---

## THE FIELD APP (30 sec)

> "But smart bases still have humans. So we built a **field PWA** — a mobile app that ground crew actually use at the flight line.
>
> Role-based login — you see only what matters to your job. **Push-to-talk voice reports** that get transcribed and injected into the agent loop. Real-time push notifications with audio alerts when something critical happens. Expandable event cards so you can drill into any agent decision.
>
> The agents aren't replacing humans. They're giving humans **superhuman situational awareness**."

---

## LIVE DEMO CALLOUT (15 sec)

> "This is running **right now** at **macs-airbase.duckdns.org**. Production deployed on Google Cloud with auto-HTTPS. Five Gemini-powered agents reasoning in real time across three scenarios: Sortie Surge, Combat Air Patrol Scramble, and Emergency Base Dispersal.
>
> Pull it up on your phone — you'll get push notifications."

---

## CLOSE (15 sec)

> "Saab asked for a smart air base. We built a base that **thinks for itself**, coordinates without a coordinator, survives agent failures, and keeps humans in the loop.
>
> **MACS Airbase — emergent intelligence for dispersed operations.**
>
> Thank you."

---

## 🔑 Key Talking Points for Q&A

| Question | Answer |
|---|---|
| **Why stigmergy over direct messaging?** | No message routing = no single point of failure. Scales to N agents. Same pattern as Redis Streams — production-ready swap. |
| **What LLM?** | Gemini 2.5 Flash via OpenRouter. LLM-agnostic — mock mode runs with zero API keys. |
| **How do agents "detect" a dead peer?** | Each agent's PERCEIVE step scans the bulletin for peer heartbeats. No heartbeat within threshold → gap compensation kicks in. |
| **What about voice?** | ElevenLabs integration via HTTP API. Field crew speak → STT transcription → injected as events into the bulletin board. |
| **Could this run on-prem / air-gapped?** | Yes. Swap Gemini for a local LLM (Mistral, LLaMA). The architecture is model-agnostic. BulletinBoard swaps to Redis Streams with one file change. |

---

**Deliver time: ~3 minutes.** Open on the phone demo during Q&A — let them see agents reasoning live. The resilience demo (kill/revive from CLI) is your mic-drop moment if they ask for it. Good luck. 🎯
