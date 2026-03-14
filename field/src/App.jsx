/**
 * MACS Field App — Mobile-first field intelligence app.
 *
 * v3 — Redesigned UX:
 *   1. Back button to return to role selection
 *   2. Quick reports open an editable sheet with pre-filled detail
 *   3. Always-visible PTT mic button (Web Speech API STT)
 *   4. Smart feed: digest mode (latest per agent) vs. full timeline,
 *      FOR YOU events pinned at top
 *
 * All icons via lucide-react (MIT).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useField } from './useField'
import {
  Plane, PlaneLanding, Droplets, Crosshair, Wrench, Radar, Globe,
  Truck, Shield, Radio, Eye, Zap, CheckCircle2, AlertTriangle,
  RefreshCw, Ban, Volume2, ClipboardList, Scale, MessageSquare,
  Send, Circle, Feather, Target, Mic, MicOff, ArrowLeft, X,
  Filter, List, ChevronDown,
} from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────

const DOMAIN_COLOR = {
  SORTIE: '#3b82f6', FUEL: '#f97316', ARMING: '#ef4444',
  MAINTENANCE: '#8b5cf6', THREAT: '#06b6d4', SYSTEM: '#64748b',
}

const SEVERITY_COLOR = {
  CRITICAL: '#ef4444', HIGH: '#f59e0b', AMBER: '#f59e0b',
  MEDIUM: '#06b6d4', LOW: '#22c55e', INFO: '#4b5563',
}

const DOMAIN_ICONS = {
  SORTIE: Plane, FUEL: Droplets, ARMING: Crosshair,
  MAINTENANCE: Wrench, THREAT: Radar, SYSTEM: Globe,
}

const ROLES = [
  { id: 'pad_crew', label: 'Pad Crew', Icon: Wrench, desc: 'Fuel, arming & maintenance at pads' },
  { id: 'convoy', label: 'Convoy', Icon: Truck, desc: 'Fuel supply chain & transport' },
  { id: 'security', label: 'Security', Icon: Shield, desc: 'Perimeter watch & threat reports' },
  { id: 'pilot', label: 'Pilot', Icon: Plane, desc: 'Flight ops & recovery' },
  { id: 'hq', label: 'HQ Liaison', Icon: Radio, desc: 'Command authority & intel' },
]

// Quick reports now have a `prompt` — hint text shown in the edit sheet
const QUICK_REPORTS = {
  pad_crew: [
    { Icon: Droplets, label: 'Refuel Done', domain: 'FUEL', severity: 'LOW',
      template: 'Refueling complete on [aircraft] at [pad].', prompt: 'Which aircraft / pad?' },
    { Icon: Crosshair, label: 'Armed', domain: 'ARMING', severity: 'LOW',
      template: 'Arming complete, weapons safe on [aircraft].', prompt: 'Aircraft ID, loadout config?' },
    { Icon: Wrench, label: 'Fault Found', domain: 'MAINTENANCE', severity: 'HIGH',
      template: 'Fault detected: [describe fault] on [aircraft] at [pad].', prompt: 'What fault? Which aircraft?' },
    { Icon: CheckCircle2, label: 'Inspection OK', domain: 'MAINTENANCE', severity: 'LOW',
      template: 'Pre-flight inspection complete. [aircraft] serviceable at [pad].', prompt: 'Aircraft ID?' },
    { Icon: AlertTriangle, label: 'Spill', domain: 'FUEL', severity: 'HIGH',
      template: 'Fuel spill at [pad/location]. Cleanup required. Estimated [X] litres.', prompt: 'Location, estimated size?' },
    { Icon: RefreshCw, label: 'Loadout Swap', domain: 'ARMING', severity: 'MEDIUM',
      template: 'Loadout reconfiguration on [aircraft]: [from] → [to]. ETA [X] min.', prompt: 'Aircraft, old → new loadout, ETA?' },
  ],
  convoy: [
    { Icon: Truck, label: 'ETA Update', domain: 'FUEL', severity: 'MEDIUM',
      template: 'Convoy en route. Current position [location]. ETA [X] minutes.', prompt: 'Position, ETA to base?' },
    { Icon: Ban, label: 'Road Blocked', domain: 'FUEL', severity: 'HIGH',
      template: 'Road blocked at [location]. Cause: [debris/bridge/enemy]. Rerouting via [alt route].', prompt: 'Where blocked? Cause? Alt route?' },
    { Icon: AlertTriangle, label: 'Under Fire', domain: 'FUEL', severity: 'CRITICAL',
      template: 'Convoy under fire at [location]! [X] vehicles, requesting [support type].', prompt: 'Location, threat type, what support?' },
    { Icon: CheckCircle2, label: 'Delivered', domain: 'FUEL', severity: 'LOW',
      template: 'Fuel delivery complete. [X] litres JP-8 delivered to [location].', prompt: 'Litres delivered? To where?' },
    { Icon: Wrench, label: 'Truck Down', domain: 'FUEL', severity: 'HIGH',
      template: 'Vehicle breakdown at [location]. Truck [ID]. Fault: [describe]. Need recovery.', prompt: 'Which truck? Where? What fault?' },
  ],
  security: [
    { Icon: Eye, label: 'Movement', domain: 'THREAT', severity: 'HIGH',
      template: 'Movement spotted in sector [X]. [count] personnel/vehicles. Direction: [bearing].', prompt: 'Sector, count, direction?' },
    { Icon: Zap, label: 'Contact', domain: 'THREAT', severity: 'CRITICAL',
      template: 'Contact! Hostile activity at sector [X]. Type: [infantry/vehicle/drone]. Engaging/observing.', prompt: 'Sector, threat type, your action?' },
    { Icon: CheckCircle2, label: 'All Clear', domain: 'THREAT', severity: 'LOW',
      template: 'Sector [X] clear. Patrol complete, no threats observed.', prompt: 'Which sector?' },
    { Icon: Volume2, label: 'Acoustic', domain: 'THREAT', severity: 'AMBER',
      template: 'Unusual acoustic signature in sector [X]. Type: [engine/rotor/blast]. Bearing [deg].', prompt: 'Sector, sound type, bearing?' },
    { Icon: Target, label: 'Drone', domain: 'THREAT', severity: 'HIGH',
      template: 'Possible drone activity over sector [X]. Altitude ~[X]m. Moving [direction].', prompt: 'Sector, altitude, direction?' },
  ],
  pilot: [
    { Icon: Plane, label: 'Ready', domain: 'SORTIE', severity: 'LOW',
      template: '[Aircraft] ready for taxi at [pad]. Systems green, pilot [callsign] aboard.', prompt: 'Aircraft, pad, your callsign?' },
    { Icon: Feather, label: 'Bird Strike', domain: 'SORTIE', severity: 'HIGH',
      template: 'Bird strike on [aircraft] during [phase]. Inspecting [area]. Damage: [assessment].', prompt: 'Aircraft, phase, damage assessment?' },
    { Icon: Crosshair, label: 'Weapons Exp.', domain: 'SORTIE', severity: 'MEDIUM',
      template: 'Weapons expended on [aircraft]. Rounds/missiles remaining: [count]. RTB.', prompt: 'What expended? Remaining?' },
    { Icon: AlertTriangle, label: 'Emergency', domain: 'SORTIE', severity: 'CRITICAL',
      template: 'MAYDAY — [aircraft] declaring emergency. Nature: [describe]. Fuel: [X]%. Position: [location].', prompt: 'Aircraft, nature of emergency, fuel, position?' },
    { Icon: PlaneLanding, label: 'Recovered', domain: 'SORTIE', severity: 'LOW',
      template: '[Aircraft] recovered at [pad]. Flight time [X] min. Status: [serviceable/needs inspection].', prompt: 'Aircraft, pad, flight time, status?' },
  ],
  hq: [
    { Icon: ClipboardList, label: 'Tasking', domain: 'SORTIE', severity: 'HIGH',
      template: 'New tasking from COMJFAC: [describe mission]. [X] sorties required within [Y] minutes.', prompt: 'Mission type, sorties needed, time window?' },
    { Icon: Radio, label: 'Intel', domain: 'THREAT', severity: 'MEDIUM',
      template: 'Intel update: [source] reports [describe threat/situation] in [area]. Assessment: [impact].', prompt: 'Source, what intel, which area, impact?' },
    { Icon: Scale, label: 'ROE Change', domain: 'SORTIE', severity: 'HIGH',
      template: 'ROE update: [old ROE] → [new ROE]. Effective immediately. Reason: [context].', prompt: 'Old ROE, new ROE, reason?' },
    { Icon: RefreshCw, label: 'Redirect', domain: 'SORTIE', severity: 'HIGH',
      template: 'Redirect [aircraft/sortie] to [new tasking/area]. Priority: [level]. Reason: [context].', prompt: 'What to redirect, where, why?' },
  ],
}

// ── Speech-to-Text Hook ──────────────────────────────────────────────────

function useSpeechToText() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(false)
  const recRef = useRef(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      setSupported(true)
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.onresult = (e) => {
        let text = ''
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript
        }
        setTranscript(text)
      }
      rec.onerror = () => setListening(false)
      rec.onend = () => setListening(false)
      recRef.current = rec
    }
  }, [])

  const start = useCallback(() => {
    if (recRef.current && !listening) {
      setTranscript('')
      recRef.current.start()
      setListening(true)
    }
  }, [listening])

  const stop = useCallback(() => {
    if (recRef.current && listening) {
      recRef.current.stop()
      setListening(false)
    }
  }, [listening])

  const reset = useCallback(() => setTranscript(''), [])

  return { listening, transcript, supported, start, stop, reset }
}

// ── Role Selection Screen ──────────────────────────────────────────────────

function RoleSelect({ onSelect }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      padding: 20, justifyContent: 'center', gap: 12,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Plane size={26} />
          <span style={{ fontSize: 28, fontWeight: 800 }}>MACS FIELD</span>
        </div>
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
          Select your role to begin
        </div>
      </div>
      {ROLES.map(r => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 18px', borderRadius: 10,
            background: '#111827', border: '1px solid #1f2937',
            color: '#e5e7eb', fontSize: 15, cursor: 'pointer',
            textAlign: 'left', transition: 'background 0.15s',
          }}
        >
          <r.Icon size={28} />
          <div>
            <div style={{ fontWeight: 700 }}>{r.label}</div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>{r.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Quick Report Edit Sheet ─────────────────────────────────────────────

function ReportSheet({ qr, onSend, onClose }) {
  const [text, setText] = useState(qr.template)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSend = () => {
    if (!text.trim()) return
    onSend({ domain: qr.domain, message: text.trim(), severity: qr.severity, tags: ['quick-report'] })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
      animation: 'fadeIn 0.15s ease',
    }} onClick={onClose}>
      <div style={{
        width: '100%', background: '#111827',
        borderTop: '1px solid #1f2937',
        borderRadius: '16px 16px 0 0',
        padding: '16px 14px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        animation: 'slideUp 0.2s ease',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <qr.Icon size={18} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{qr.label}</span>
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: `${SEVERITY_COLOR[qr.severity]}22`,
              color: SEVERITY_COLOR[qr.severity], fontWeight: 600,
            }}>{qr.severity}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4,
          }}><X size={18} /></button>
        </div>
        {/* Hint */}
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{qr.prompt}</div>
        {/* Editable message */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '12px', borderRadius: 8,
            background: '#0d1117', border: '1px solid #1f2937',
            color: '#e5e7eb', fontSize: 14, lineHeight: 1.5,
            resize: 'none', outline: 'none',
          }}
        />
        <button onClick={handleSend} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', marginTop: 10, padding: '14px',
          borderRadius: 10, background: '#3b82f6', border: 'none',
          color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>
          <Send size={16} /> Send Report
        </button>
      </div>
    </div>
  )
}

// ── Event Card ─────────────────────────────────────────────────────────────

function EventCard({ event, compact }) {
  const color = SEVERITY_COLOR[event.severity] || '#6b7280'
  const domainColor = DOMAIN_COLOR[event.domain] || '#64748b'
  const DomainIcon = DOMAIN_ICONS[event.domain] || Circle
  const ts = new Date(event.timestamp * 1000).toLocaleTimeString()
  const msg = event.payload?.message || event.event_type
  const isDirected = (event.directed_to || []).length > 0
  const isFieldReport = event.event_type === 'FIELD_REPORT'
  const isSensor = event.source_layer === 'SENSOR'
  const isAgent = event.event_type === 'ACTION_TAKEN'

  let badge = null
  if (isFieldReport) badge = { text: 'FIELD', bg: '#f5920b22', color: '#f59e0b' }
  else if (isSensor) badge = { text: 'SENSOR', bg: '#06b6d422', color: '#06b6d4' }
  else if (isAgent) badge = { text: event.source, bg: `${domainColor}22`, color: domainColor }

  // Compact mode: single line
  if (compact) {
    return (
      <div style={{
        padding: '8px 10px', borderRadius: 6,
        background: '#111827', borderLeft: `3px solid ${color}`,
        fontSize: 12, color: '#9ca3af', lineHeight: 1.4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <DomainIcon size={11} color={domainColor} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
        <span style={{ color: domainColor, fontWeight: 600, marginRight: 4 }}>{event.source}</span>
        {msg.slice(0, 120)}
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: event.severity === 'CRITICAL' ? '#1c0a0a' : isDirected ? '#15130a' : '#111827',
      border: `1px solid ${isDirected ? '#f59e0b44' : '#1f2937'}`,
      borderLeft: `3px solid ${color}`,
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DomainIcon size={14} color={domainColor} />
          {badge && (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: badge.bg, color: badge.color, fontWeight: 600,
            }}>{badge.text}</span>
          )}
          {isDirected && (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: '#f59e0b22', color: '#f59e0b', fontWeight: 600,
            }}>FOR YOU</span>
          )}
        </div>
        <span style={{ color: '#4b5563', fontSize: 10 }}>{ts}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: isAgent ? '#e5e7eb' : '#9ca3af' }}>
        {msg}
      </div>
      {isFieldReport && event.payload?.reporter_callsign && (
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
          — {event.payload.reporter_callsign} ({event.payload.reporter_role})
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const [selectedRole, setSelectedRole] = useState(null)

  if (!selectedRole) {
    return <RoleSelect onSelect={setSelectedRole} />
  }

  return <FieldDashboard role={selectedRole} onBack={() => setSelectedRole(null)} />
}


function FieldDashboard({ role, onBack }) {
  const { events, connected, sendReport, lastReportId } = useField(null)
  const [activeSheet, setActiveSheet] = useState(null)     // quick report sheet
  const [feedMode, setFeedMode] = useState('smart')        // 'smart' | 'all'
  const [reportFeedback, setReportFeedback] = useState(null)
  const feedRef = useRef(null)

  // ── PTT / Speech-to-text ──
  const { listening, transcript, supported: sttSupported, start: sttStart, stop: sttStop, reset: sttReset } = useSpeechToText()
  const [pttDomain, setPttDomain] = useState('')

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [events, feedMode])

  // Flash feedback on report sent
  useEffect(() => {
    if (lastReportId) {
      setReportFeedback(lastReportId)
      const t = setTimeout(() => setReportFeedback(null), 3000)
      return () => clearTimeout(t)
    }
  }, [lastReportId])

  // When PTT stops and we have transcript, send it
  const handlePttSend = useCallback(() => {
    sttStop()
    if (transcript.trim()) {
      const domain = pttDomain || guessDomain(transcript, role)
      sendReport({
        domain,
        message: transcript.trim(),
        severity: guessSeverity(transcript),
        tags: ['voice-report'],
      })
      sttReset()
    }
  }, [transcript, pttDomain, role, sendReport, sttStop, sttReset])

  const quickReports = QUICK_REPORTS[role] || []

  // ── Smart Feed Logic ──
  // Smart mode: FOR YOU events first, then latest action per agent, then recent CRITICAL/HIGH
  const { forYou, digest, allFiltered } = useMemo(() => {
    const forYou = events.filter(e => (e.directed_to || []).length > 0)
    const critHigh = events.filter(e =>
      (e.severity === 'CRITICAL' || e.severity === 'HIGH') &&
      !(e.directed_to || []).length
    ).slice(-5)

    // Latest action per agent
    const latestPerAgent = {}
    events.forEach(e => {
      if (e.event_type === 'ACTION_TAKEN') latestPerAgent[e.source] = e
    })
    const agentDigest = Object.values(latestPerAgent)

    // Merge, deduplicate, sort by time
    const seen = new Set()
    const digest = []
    const addUnique = (arr) => {
      arr.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); digest.push(e) } })
    }
    addUnique(forYou)
    addUnique(critHigh)
    addUnique(agentDigest)
    digest.sort((a, b) => b.timestamp - a.timestamp)

    return { forYou, digest, allFiltered: events }
  }, [events])

  const feedEvents = feedMode === 'smart' ? digest : allFiltered.slice(-60)

  const threatLevel = useMemo(() => {
    const t = events.filter(e => e.domain === 'THREAT' && e.payload?.threat_level).slice(-1)
    return t.length > 0 ? t[0].payload.threat_level : 'GREEN'
  }, [events])

  const threatColor = threatLevel === 'RED' ? '#ef4444' : threatLevel === 'AMBER' ? '#f59e0b' : '#4ade80'
  const roleInfo = ROLES.find(r => r.id === role)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <header style={{
        padding: '10px 16px', borderBottom: '1px solid #1f2937',
        background: '#0d1117', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Back button */}
            <button onClick={onBack} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
              padding: 4, marginLeft: -4,
            }}><ArrowLeft size={18} /></button>
            <Plane size={16} />
            <span style={{ fontSize: 16, fontWeight: 800 }}>MACS</span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 9999,
              background: `${threatColor}22`, color: threatColor,
              border: `1px solid ${threatColor}44`, fontWeight: 600,
            }}>{threatLevel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, padding: '2px 8px', borderRadius: 9999,
              background: connected ? '#05291622' : '#1c101722',
              color: connected ? '#4ade80' : '#f87171',
              border: `1px solid ${connected ? '#16653444' : '#7f1d1d44'}`,
            }}>
              <Circle size={6} fill="currentColor" strokeWidth={0} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {roleInfo && <roleInfo.Icon size={16} />}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{roleInfo?.label}</span>
          {reportFeedback && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: '#4ade80', marginLeft: 'auto',
            }}><CheckCircle2 size={12} /> Sent</span>
          )}
        </div>
      </header>

      {/* ── Feed Toggle ── */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid #1f2937',
        background: '#0d1117', flexShrink: 0,
      }}>
        <button onClick={() => setFeedMode('smart')} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          background: feedMode === 'smart' ? '#111827' : 'transparent',
          color: feedMode === 'smart' ? '#e5e7eb' : '#6b7280',
          borderBottom: feedMode === 'smart' ? '2px solid #3b82f6' : '2px solid transparent',
        }}><Filter size={12} /> Key Updates {forYou.length > 0 && <span style={{
          background: '#f59e0b', color: '#000', borderRadius: 9999,
          padding: '0 5px', fontSize: 9, fontWeight: 800,
        }}>{forYou.length}</span>}</button>
        <button onClick={() => setFeedMode('all')} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          background: feedMode === 'all' ? '#111827' : 'transparent',
          color: feedMode === 'all' ? '#e5e7eb' : '#6b7280',
          borderBottom: feedMode === 'all' ? '2px solid #3b82f6' : '2px solid transparent',
        }}><List size={12} /> All Activity ({events.length})</button>
      </div>

      {/* ── Event Feed ── */}
      <div ref={feedRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {feedEvents.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            color: '#4b5563', textAlign: 'center', padding: 40, fontSize: 13,
          }}>
            <Plane size={20} />
            {connected ? 'Waiting for activity...' : 'Connecting...'}
            {feedMode === 'smart' && connected && events.length > 0 && (
              <div style={{ fontSize: 11 }}>No directed or critical events yet.</div>
            )}
          </div>
        ) : (
          feedEvents.map(e => (
            <EventCard key={e.id} event={e} compact={feedMode === 'all'} />
          ))
        )}
      </div>

      {/* ── Bottom Panel: Quick Reports + PTT ── */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid #1f2937',
        background: '#0d1117', padding: '8px 10px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}>
        {/* PTT bar (always visible) */}
        {listening ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
            padding: '10px 12px', borderRadius: 10,
            background: '#1c101744', border: '1px solid #ef444444',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Circle size={8} fill="#ef4444" strokeWidth={0} style={{ animation: 'pulse 1s infinite' }} />
                Listening...
              </span>
              {!pttDomain && (
                <select value={pttDomain} onChange={e => setPttDomain(e.target.value)} style={{
                  padding: '4px 6px', borderRadius: 4, background: '#111827',
                  border: '1px solid #1f2937', color: '#e5e7eb', fontSize: 11,
                }}>
                  <option value="">Auto-domain</option>
                  {['FUEL', 'ARMING', 'MAINTENANCE', 'SORTIE', 'THREAT'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
            {transcript && (
              <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{transcript}"
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePttSend} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '12px', borderRadius: 8, background: '#3b82f6', border: 'none',
                color: 'white', fontWeight: 700, cursor: 'pointer',
              }}><Send size={14} /> Send</button>
              <button onClick={() => { sttStop(); sttReset() }} style={{
                padding: '12px 16px', borderRadius: 8,
                background: '#1f2937', border: '1px solid #374151',
                color: '#9ca3af', cursor: 'pointer',
              }}><X size={16} /></button>
            </div>
          </div>
        ) : null}

        {/* Quick report grid */}
        {!listening && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6, marginBottom: 6,
          }}>
            {quickReports.map((qr, i) => (
              <button
                key={i}
                onClick={() => setActiveSheet(qr)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4,
                  padding: '12px 6px', borderRadius: 8,
                  background: '#111827', border: '1px solid #1f2937',
                  color: '#e5e7eb', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.15s',
                  lineHeight: 1.3, textAlign: 'center',
                }}
              >
                <qr.Icon size={18} strokeWidth={1.8} />
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* PTT mic button — always visible */}
        {!listening && sttSupported && (
          <button
            onTouchStart={e => { e.preventDefault(); sttStart() }}
            onMouseDown={sttStart}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '16px',
              borderRadius: 12, border: '2px solid #374151',
              background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
              color: '#e5e7eb', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', userSelect: 'none',
              transition: 'all 0.15s',
            }}
          >
            <Mic size={20} /> Hold to Talk
          </button>
        )}

        {/* Fallback for no STT: text input */}
        {!listening && !sttSupported && (
          <TextReportBar sendReport={sendReport} role={role} />
        )}
      </div>

      {/* Quick report edit sheet overlay */}
      {activeSheet && (
        <ReportSheet qr={activeSheet} onSend={sendReport} onClose={() => setActiveSheet(null)} />
      )}
    </div>
  )
}


// ── Text report bar (fallback when STT is unavailable) ───────────────────

function TextReportBar({ sendReport, role }) {
  const [text, setText] = useState('')
  const [domain, setDomain] = useState('')

  const handleSend = () => {
    if (!text.trim()) return
    sendReport({
      domain: domain || guessDomain(text, role),
      message: text.trim(),
      severity: guessSeverity(text),
      tags: ['text-report'],
    })
    setText('')
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select value={domain} onChange={e => setDomain(e.target.value)} style={{
        width: 80, padding: '12px 6px', borderRadius: 8,
        background: '#111827', border: '1px solid #1f2937',
        color: '#e5e7eb', fontSize: 11,
      }}>
        <option value="">Auto</option>
        {['FUEL', 'ARMING', 'MAINTENANCE', 'SORTIE', 'THREAT'].map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <input
        type="text" placeholder="Type report..."
        value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        style={{
          flex: 1, padding: '12px 10px', borderRadius: 8,
          background: '#111827', border: '1px solid #1f2937',
          color: '#e5e7eb', fontSize: 14, outline: 'none',
        }}
      />
      <button onClick={handleSend} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 16px', borderRadius: 8,
        background: '#3b82f6', border: 'none', color: 'white', cursor: 'pointer',
      }}><Send size={18} /></button>
    </div>
  )
}


// ── Helpers ─────────────────────────────────────────────────────────────

function guessDomain(text, role) {
  const t = text.toLowerCase()
  if (t.match(/fuel|truck|convoy|jp-8|tanker|spill|delivery/)) return 'FUEL'
  if (t.match(/arm|weapon|ordnance|loadout|amraam|iris|bomb|munition/)) return 'ARMING'
  if (t.match(/maint|fault|inspect|repair|ground|hydraulic|engine/)) return 'MAINTENANCE'
  if (t.match(/threat|hostile|contact|radar|drone|movement|perimeter|sector/)) return 'THREAT'
  if (t.match(/sortie|scramble|taxi|takeoff|landing|aircraft|pilot|ready/)) return 'SORTIE'
  // Default by role
  const roleDefaults = {
    pad_crew: 'MAINTENANCE', convoy: 'FUEL', security: 'THREAT',
    pilot: 'SORTIE', hq: 'SORTIE',
  }
  return roleDefaults[role] || 'SYSTEM'
}

function guessSeverity(text) {
  const t = text.toLowerCase()
  if (t.match(/mayday|emergency|under fire|critical|hostile|contact!/)) return 'CRITICAL'
  if (t.match(/fault|blocked|down|spill|strike|urgent/)) return 'HIGH'
  if (t.match(/update|en route|eta|reconfig/)) return 'MEDIUM'
  return 'LOW'
}
