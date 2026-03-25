/**
 * MACS Field App — Mobile-first field intelligence app.
 * Design: Military tactical HUD. JetBrains Mono. Heroicons only.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useField } from './useField'
import { useAlerts } from './useAlerts'
import { useVoiceAgent } from './useVoiceAgent'
import About from './About'

// Stable auth info — avoids re-creating object every render (prevents WS reconnect loop)
function useStableAuth(role, callsign) {
  const ref = useRef({ role, callsign })
  if (ref.current.role !== role || ref.current.callsign !== callsign) {
    ref.current = { role, callsign }
  }
  return ref.current
}

import {
  PaperAirplaneIcon,
  BeakerIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  EyeIcon,
  GlobeAltIcon,
  TruckIcon,
  ShieldCheckIcon,
  SignalIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  NoSymbolIcon,
  SpeakerWaveIcon,
  ClipboardDocumentListIcon,
  ScaleIcon,
  MicrophoneIcon,
  ArrowLeftIcon,
  XMarkIcon,
  FunnelIcon,
  ListBulletIcon,
  ExclamationCircleIcon,
  CursorArrowRaysIcon,
  ArrowRightEndOnRectangleIcon,
  BellIcon,
  BellSlashIcon,
  PlusIcon,
  MapPinIcon,
  ClockIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid'

// ── Design tokens ───────────────────────────────────────────────────────────

const C = {
  surfacePrimary: 'hsl(220, 50%, 5%)',
  surfaceCard: 'hsl(220, 40%, 8%)',
  surfaceHover: 'hsl(220, 35%, 12%)',
  textPrimary: 'hsl(210, 20%, 90%)',
  textMuted: 'hsl(215, 15%, 60%)',
  textDim: 'hsl(215, 10%, 40%)',
  accent: '#06b6d4',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#22c55e',
  grey: '#4b5563',
}

// ── Constants ───────────────────────────────────────────────────────────────

// All domains share the same accent cyan — no per-domain color differentiation
const DOMAIN_COLOR = {
  SORTIE: C.accent, FUEL: C.accent, ARMING: C.accent,
  MAINTENANCE: C.accent, THREAT: C.accent, SYSTEM: C.accent,
}

const SEVERITY_COLOR = {
  CRITICAL: C.red, HIGH: C.amber, AMBER: C.amber,
  MEDIUM: C.accent, LOW: C.green, INFO: C.grey,
}

const DOMAIN_ICONS = {
  SORTIE: PaperAirplaneIcon,
  FUEL: BeakerIcon,
  ARMING: BoltIcon,
  MAINTENANCE: WrenchScrewdriverIcon,
  THREAT: EyeIcon,
  SYSTEM: GlobeAltIcon,
}

const ROLES = [
  { id: 'mission_control', label: 'Mission Control', Icon: ClipboardDocumentListIcon, desc: 'Create & manage active missions' },
  { id: 'pilot',     label: 'Pilot',       Icon: PaperAirplaneIcon,     desc: 'Flight ops & recovery' },
  { id: 'hq',        label: 'HQ Liaison',  Icon: GlobeAltIcon,          desc: 'Command authority & intel' },
  { id: 'security',  label: 'Security',    Icon: ShieldCheckIcon,       desc: 'Perimeter watch & threat reports' },
  { id: 'convoy',    label: 'Convoy',      Icon: TruckIcon,             desc: 'Fuel supply chain & transport' },
  { id: 'pad_crew',  label: 'Pad Crew',    Icon: WrenchScrewdriverIcon, desc: 'Fuel, arming & maintenance at pads' },
]

const QUICK_REPORTS = {
  pad_crew: [
    { Icon: BeakerIcon,          label: 'Refuel Done',    domain: 'FUEL',        severity: 'LOW',
      template: 'Refueling complete on [aircraft] at [pad].', prompt: 'Which aircraft / pad?' },
    { Icon: BoltIcon,            label: 'Armed',          domain: 'ARMING',      severity: 'LOW',
      template: 'Arming complete, weapons safe on [aircraft].', prompt: 'Aircraft ID, loadout config?' },
    { Icon: WrenchScrewdriverIcon, label: 'Fault Found',  domain: 'MAINTENANCE', severity: 'HIGH',
      template: 'Fault detected: [describe fault] on [aircraft] at [pad].', prompt: 'What fault? Which aircraft?' },
    { Icon: CheckCircleIcon,     label: 'Inspection OK',  domain: 'MAINTENANCE', severity: 'LOW',
      template: 'Pre-flight inspection complete. [aircraft] serviceable at [pad].', prompt: 'Aircraft ID?' },
    { Icon: ExclamationTriangleIcon, label: 'Spill',      domain: 'FUEL',        severity: 'HIGH',
      template: 'Fuel spill at [pad/location]. Cleanup required. Estimated [X] litres.', prompt: 'Location, estimated size?' },
    { Icon: ArrowPathIcon,       label: 'Loadout Swap',   domain: 'ARMING',      severity: 'MEDIUM',
      template: 'Loadout reconfiguration on [aircraft]: [from] → [to]. ETA [X] min.', prompt: 'Aircraft, old → new loadout, ETA?' },
  ],
  convoy: [
    { Icon: TruckIcon,           label: 'ETA Update',     domain: 'FUEL',        severity: 'MEDIUM',
      template: 'Convoy en route. Current position [location]. ETA [X] minutes.', prompt: 'Position, ETA to base?' },
    { Icon: NoSymbolIcon,        label: 'Road Blocked',   domain: 'FUEL',        severity: 'HIGH',
      template: 'Road blocked at [location]. Cause: [debris/bridge/enemy]. Rerouting via [alt route].', prompt: 'Where blocked? Cause? Alt route?' },
    { Icon: ExclamationTriangleIcon, label: 'Under Fire', domain: 'FUEL',        severity: 'CRITICAL',
      template: 'Convoy under fire at [location]! [X] vehicles, requesting [support type].', prompt: 'Location, threat type, what support?' },
    { Icon: CheckCircleIcon,     label: 'Delivered',      domain: 'FUEL',        severity: 'LOW',
      template: 'Fuel delivery complete. [X] litres JP-8 delivered to [location].', prompt: 'Litres delivered? To where?' },
    { Icon: WrenchScrewdriverIcon, label: 'Truck Down',   domain: 'FUEL',        severity: 'HIGH',
      template: 'Vehicle breakdown at [location]. Truck [ID]. Fault: [describe]. Need recovery.', prompt: 'Which truck? Where? What fault?' },
  ],
  security: [
    { Icon: EyeIcon,             label: 'Movement',       domain: 'THREAT',      severity: 'HIGH',
      template: 'Movement spotted in sector [X]. [count] personnel/vehicles. Direction: [bearing].', prompt: 'Sector, count, direction?' },
    { Icon: BoltIcon,            label: 'Contact',        domain: 'THREAT',      severity: 'CRITICAL',
      template: 'Contact! Hostile activity at sector [X]. Type: [infantry/vehicle/drone]. Engaging/observing.', prompt: 'Sector, threat type, your action?' },
    { Icon: CheckCircleIcon,     label: 'All Clear',      domain: 'THREAT',      severity: 'LOW',
      template: 'Sector [X] clear. Patrol complete, no threats observed.', prompt: 'Which sector?' },
    { Icon: SpeakerWaveIcon,     label: 'Acoustic',       domain: 'THREAT',      severity: 'AMBER',
      template: 'Unusual acoustic signature in sector [X]. Type: [engine/rotor/blast]. Bearing [deg].', prompt: 'Sector, sound type, bearing?' },
    { Icon: CursorArrowRaysIcon, label: 'Drone',          domain: 'THREAT',      severity: 'HIGH',
      template: 'Possible drone activity over sector [X]. Altitude ~[X]m. Moving [direction].', prompt: 'Sector, altitude, direction?' },
  ],
  pilot: [
    { Icon: PaperAirplaneIcon,   label: 'Ready',          domain: 'SORTIE',      severity: 'LOW',
      template: '[Aircraft] ready for taxi at [pad]. Systems green, pilot [callsign] aboard.', prompt: 'Aircraft, pad, your callsign?' },
    { Icon: ExclamationCircleIcon, label: 'Bird Strike',  domain: 'SORTIE',      severity: 'HIGH',
      template: 'Bird strike on [aircraft] during [phase]. Inspecting [area]. Damage: [assessment].', prompt: 'Aircraft, phase, damage assessment?' },
    { Icon: BoltIcon,            label: 'Weapons Exp.',   domain: 'SORTIE',      severity: 'MEDIUM',
      template: 'Weapons expended on [aircraft]. Rounds/missiles remaining: [count]. RTB.', prompt: 'What expended? Remaining?' },
    { Icon: ExclamationTriangleIcon, label: 'Emergency',  domain: 'SORTIE',      severity: 'CRITICAL',
      template: 'MAYDAY — [aircraft] declaring emergency. Nature: [describe]. Fuel: [X]%. Position: [location].', prompt: 'Aircraft, nature of emergency, fuel, position?' },
    { Icon: ArrowRightEndOnRectangleIcon, label: 'Recovered', domain: 'SORTIE', severity: 'LOW',
      template: '[Aircraft] recovered at [pad]. Flight time [X] min. Status: [serviceable/needs inspection].', prompt: 'Aircraft, pad, flight time, status?' },
  ],
  hq: [
    { Icon: ClipboardDocumentListIcon, label: 'Tasking',  domain: 'SORTIE',      severity: 'HIGH',
      template: 'New tasking from COMJFAC: [describe mission]. [X] sorties required within [Y] minutes.', prompt: 'Mission type, sorties needed, time window?' },
    { Icon: SignalIcon,          label: 'Intel',          domain: 'THREAT',      severity: 'MEDIUM',
      template: 'Intel update: [source] reports [describe threat/situation] in [area]. Assessment: [impact].', prompt: 'Source, what intel, which area, impact?' },
    { Icon: ScaleIcon,           label: 'ROE Change',     domain: 'SORTIE',      severity: 'HIGH',
      template: 'ROE update: [old ROE] → [new ROE]. Effective immediately. Reason: [context].', prompt: 'Old ROE, new ROE, reason?' },
    { Icon: ArrowPathIcon,       label: 'Redirect',       domain: 'SORTIE',      severity: 'HIGH',
      template: 'Redirect [aircraft/sortie] to [new tasking/area]. Priority: [level]. Reason: [context].', prompt: 'What to redirect, where, why?' },
  ],
}

// ── StatusDot ────────────────────────────────────────────────────────────────

function StatusDot({ color, pulse }) {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: color, flexShrink: 0,
      animation: pulse ? 'pulse 1s infinite' : 'none',
    }} />
  )
}

// ── Role Selection ───────────────────────────────────────────────────────────

function RoleSelect({ onSelect, onAbout }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      padding: '20px 16px', justifyContent: 'center', gap: 8,
      background: C.surfacePrimary,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <img
          src="/field/img/macs_logo_white.png"
          alt="MACS Airbase"
          style={{ height: 40, objectFit: 'contain', marginBottom: 8 }}
        />
        <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4 }}>
          Multi-Agent Command System
        </div>
        <div style={{ color: C.textDim, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>
          Select Role to Begin
        </div>
      </div>

      {ROLES.map(r => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 14px',
            background: C.surfaceCard, border: `1px solid rgba(255,255,255,0.07)`,
            color: C.textPrimary, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <r.Icon style={{ width: 20, height: 20, color: C.accent, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {r.label}
            </div>
            <div style={{ color: C.textMuted, fontSize: 9, marginTop: 2 }}>{r.desc}</div>
          </div>
        </button>
      ))}

      <button
        onClick={onAbout}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px', marginTop: 4,
          background: 'transparent', border: `1px solid rgba(255,255,255,0.04)`,
          color: C.textDim, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <InformationCircleIcon style={{ width: 20, height: 20, color: C.textDim, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            About
          </div>
          <div style={{ color: C.textDim, fontSize: 9, marginTop: 2 }}>Meet the team</div>
        </div>
      </button>
    </div>
  )
}

// ── Quick Report Edit Sheet ──────────────────────────────────────────────────

function ReportSheet({ qr, onSend, onClose }) {
  const [text, setText] = useState(qr.template)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSend = () => {
    if (!text.trim()) return
    onSend({ domain: qr.domain, message: text.trim(), severity: qr.severity, tags: ['quick-report'] })
    onClose()
  }

  const sevColor = SEVERITY_COLOR[qr.severity] || C.grey

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
      animation: 'fadeIn 0.15s ease',
    }} onClick={onClose}>
      <div style={{
        width: '100%', background: C.surfaceCard,
        borderTop: `1px solid rgba(255,255,255,0.08)`,
        padding: '14px 14px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        animation: 'slideUp 0.2s ease',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <qr.Icon style={{ width: 16, height: 16, color: C.accent }} />
            <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {qr.label}
            </span>
            <span style={{
              fontSize: 8, padding: '1px 5px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              background: `${sevColor}22`, color: sevColor,
            }}>{qr.severity}</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', padding: 4,
          }}>
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ fontSize: 9, color: C.textDim, marginBottom: 8, letterSpacing: '0.05em' }}>
          {qr.prompt}
        </div>

        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
          rows={3}
          style={{
            width: '100%', padding: '10px', background: C.surfacePrimary,
            border: `1px solid rgba(255,255,255,0.08)`, color: C.textPrimary,
            fontSize: 11, lineHeight: 1.5, resize: 'none', outline: 'none',
            fontFamily: 'inherit',
          }}
        />

        <button onClick={handleSend} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', marginTop: 10, padding: '13px',
          background: `${C.accent}22`, border: `1px solid ${C.accent}66`,
          color: C.accent, fontWeight: 700, fontSize: 11,
          letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          <PaperAirplaneIcon style={{ width: 14, height: 14 }} />
          Send Report
        </button>
      </div>
    </div>
  )
}

// ── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, compact }) {
  const [expanded, setExpanded] = useState(false)
  const sevColor = SEVERITY_COLOR[event.severity] || C.grey
  const DomainIcon = DOMAIN_ICONS[event.domain] || GlobeAltIcon
  const ts = new Date(event.timestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const msg = event.payload?.message || event.event_type
  const isDirected = (event.directed_to || []).length > 0
  const isFieldReport = event.event_type === 'FIELD_REPORT'
  const isSensor = event.source_layer === 'SENSOR'
  const isAgent = event.event_type === 'ACTION_TAKEN'

  if (compact) {
    return (
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: expanded ? '10px 10px' : '20px 10px',
          background: C.surfaceCard,
          borderLeft: `2px solid ${sevColor}`,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
          fontSize: 10, color: C.textMuted, lineHeight: 1.5,
          cursor: 'pointer',
          ...(expanded ? {} : {
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: 6,
          }),
        }}
      >
        {expanded ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <DomainIcon style={{ width: 12, height: 12, color: C.accent }} />
                <span style={{ color: C.accent, fontWeight: 700, fontSize: 9,
                  letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {event.source}
                </span>
                <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: `${sevColor}22`, color: sevColor }}>{event.severity}</span>
              </div>
              <span style={{ color: C.textDim, fontSize: 9 }}>{ts}</span>
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.5 }}>{msg}</div>
            {isFieldReport && event.payload?.reporter_callsign && (
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>
                — {event.payload.reporter_callsign} ({event.payload.reporter_role})
              </div>
            )}
          </>
        ) : (
          <>
            <DomainIcon style={{ width: 12, height: 12, color: C.accent, flexShrink: 0 }} />
            <span style={{ color: C.accent, fontWeight: 700, marginRight: 2, fontSize: 9,
              letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              {event.source}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.slice(0, 120)}</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{
      padding: '10px 12px',
      background: event.severity === 'CRITICAL'
        ? `${C.red}08`
        : isDirected ? `${C.amber}08` : C.surfaceCard,
      border: `1px solid ${isDirected ? `${C.amber}33` : 'rgba(255,255,255,0.07)'}`,
      borderLeft: `2px solid ${sevColor}`,
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <DomainIcon style={{ width: 12, height: 12, color: C.accent }} />
          {isFieldReport && (
            <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              background: `${C.amber}22`, color: C.amber }}>FIELD</span>
          )}
          {isSensor && (
            <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              background: `${C.accent}22`, color: C.accent }}>SENSOR</span>
          )}
          {isAgent && (
            <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              background: `${C.accent}22`, color: C.accent }}>{event.source}</span>
          )}
          {isDirected && (
            <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              background: `${C.amber}22`, color: C.amber }}>FOR YOU</span>
          )}
          <span style={{ fontSize: 8, padding: '1px 5px', fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: `${sevColor}22`, color: sevColor }}>{event.severity}</span>
        </div>
        <span style={{ color: C.textDim, fontSize: 9, fontFamily: 'inherit' }}>{ts}</span>
      </div>
      <div style={{ fontSize: 10, lineHeight: 1.5, color: isAgent ? C.textPrimary : C.textMuted }}>
        {msg}
      </div>
      {isFieldReport && event.payload?.reporter_callsign && (
        <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>
          — {event.payload.reporter_callsign} ({event.payload.reporter_role})
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedRole, setSelectedRole] = useState(null)
  const [callsign, setCallsign] = useState(null)

  const handleSelect = (roleId) => {
    setSelectedRole(roleId)
    setCallsign(`${roleId.toUpperCase()}-${Math.floor(Math.random() * 90 + 10)}`)
  }

  if (!selectedRole) return <RoleSelect onSelect={handleSelect} onAbout={() => setSelectedRole('about')} />
  if (selectedRole === 'about') return <About onBack={() => setSelectedRole(null)} />
  if (selectedRole === 'mission_control') {
    return <MissionControlDashboard role={selectedRole} callsign={callsign} onBack={() => setSelectedRole(null)} />
  }
  return <FieldDashboard role={selectedRole} callsign={callsign} onBack={() => setSelectedRole(null)} />
}

// ── Mission Control Dashboard (wrapper) ──────────────────────────────────────

function MissionControlDashboard({ role, callsign, onBack }) {
  const authInfo = useStableAuth(role, callsign)
  const { events, connected, missions, sendMission } = useField(authInfo)
  const { notify } = useAlerts()
  const [muted, setMuted] = useState(false)
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (muted) { prevCountRef.current = events.length; return }
    const newEvents = events.slice(prevCountRef.current)
    prevCountRef.current = events.length
    newEvents.forEach(e => notify(e))
  }, [events, muted, notify])

  return (
    <MissionControlPage
      missions={missions}
      sendMission={sendMission}
      events={events}
      connected={connected}
      callsign={callsign}
      onBack={onBack}
      muted={muted}
      setMuted={setMuted}
    />
  )
}

// ── Field Dashboard ───────────────────────────────────────────────────────────

function FieldDashboard({ role, callsign, onBack }) {
  const authInfo = useStableAuth(role, callsign)
  const { events, connected, sendReport, sendVoiceEvent, lastReportId, missions, sendMission } = useField(authInfo)
  const { notify } = useAlerts()
  const [activeSheet, setActiveSheet] = useState(null)
  const [feedMode, setFeedMode] = useState('smart')
  const [reportFeedback, setReportFeedback] = useState(null)
  const [muted, setMuted] = useState(false)
  const feedRef = useRef(null)
  const prevCountRef = useRef(0)
  const postedVoiceRef = useRef(new Map())
  const roleInfo = ROLES.find(r => r.id === role)

  const {
    configured: voiceConfigured,
    status: voiceStatus,
    isSpeaking,
    mode: voiceMode,
    messages: voiceMessages,
    tentativeReply,
    error: voiceError,
    micMuted,
    permissionState: voicePermissionState,
    start: voiceStart,
    pressToTalk,
    releaseToTalk,
  } = useVoiceAgent({ role, roleLabel: roleInfo?.label, callsign })
  const voiceConnected = voiceStatus === 'connected'
  const recentVoiceMessages = voiceMessages.slice(-2)

  // Fire alerts for NEW events (not history replay)
  useEffect(() => {
    if (muted) { prevCountRef.current = events.length; return }
    const newEvents = events.slice(prevCountRef.current)
    prevCountRef.current = events.length
    newEvents.forEach(e => notify(e))
  }, [events, muted, notify])

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [events, feedMode])

  useEffect(() => {
    if (lastReportId) {
      setReportFeedback(lastReportId)
      const t = setTimeout(() => setReportFeedback(null), 3000)
      return () => clearTimeout(t)
    }
  }, [lastReportId])

  useEffect(() => {
    voiceMessages.forEach((message) => {
      const text = message?.text?.trim()
      if (!text) return

      const previous = postedVoiceRef.current.get(message.id)
      if (previous === text) return

      const sent = sendVoiceEvent({
        speaker: message.role === 'baseops' ? 'baseops' : role,
        message: text,
        domain: guessVoiceDomain(text),
        severity: guessSeverity(text),
        tags: [message.role === 'baseops' ? 'baseops-voice' : `${role}-voice`],
      })

      if (sent) {
        postedVoiceRef.current.set(message.id, text)
      }
    })
  }, [sendVoiceEvent, voiceMessages])

  const quickReports = QUICK_REPORTS[role] || []

  const { forYou, digest, allFiltered } = useMemo(() => {
    const forYou = events.filter(e => (e.directed_to || []).length > 0)
    const critHigh = events.filter(e =>
      (e.severity === 'CRITICAL' || e.severity === 'HIGH') && !(e.directed_to || []).length
    ).slice(-5)
    const recentVoice = events.filter(e =>
      e.event_type === 'VOICE_COMMAND' || e.event_type === 'VOICE_SUMMARY'
    ).slice(-4)
    const latestPerAgent = {}
    events.forEach(e => { if (e.event_type === 'ACTION_TAKEN') latestPerAgent[e.source] = e })
    const seen = new Set(); const digest = []
    const addUnique = (arr) => arr.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); digest.push(e) } })
    addUnique(forYou); addUnique(critHigh); addUnique(recentVoice); addUnique(Object.values(latestPerAgent))
    digest.sort((a, b) => b.timestamp - a.timestamp)
    return { forYou, digest, allFiltered: events }
  }, [events])

  const feedEvents = feedMode === 'smart' ? digest : allFiltered.slice(-60)

  const threatLevel = useMemo(() => {
    const t = events.filter(e => e.domain === 'THREAT' && e.payload?.threat_level).slice(-1)
    return t.length > 0 ? t[0].payload.threat_level : 'GREEN'
  }, [events])

  const threatColor = threatLevel === 'RED' ? C.red : threatLevel === 'AMBER' ? C.amber : '#4ade80'

  const tabStyle = (active) => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '8px 0', border: 'none', cursor: 'pointer',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
    fontFamily: 'inherit',
    background: active ? C.surfaceCard : 'transparent',
    color: active ? C.textPrimary : C.textDim,
    borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
  })

  const handleVoiceButtonClick = () => {
    if (!voiceConnected) {
      voiceStart()
    }
  }

  const handleVoicePressStart = (event) => {
    if (!voiceConnected) return
    event?.preventDefault?.()
    pressToTalk()
  }

  const handleVoicePressEnd = (event) => {
    if (!voiceConnected) return
    event?.preventDefault?.()
    releaseToTalk()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: C.surfacePrimary }}>

      {/* Header */}
      <header style={{
        padding: '8px 12px', borderBottom: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfaceCard, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onBack} style={{
              display: 'flex', alignItems: 'center', background: 'none', border: 'none',
              color: C.textDim, cursor: 'pointer', padding: 2,
            }}>
              <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            <img src="/field/img/macs_logo_white.png" alt="MACS" style={{ height: 18, objectFit: 'contain' }} />
            <span style={{
              fontSize: 8, padding: '2px 7px', fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              background: `${threatColor}22`, color: threatColor,
              border: `1px solid ${threatColor}44`,
            }}>{threatLevel}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={() => setMuted(m => !m)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: muted ? C.red : C.green,
            }} title={muted ? 'Alerts muted' : 'Alerts on'}>
              {muted
                ? <BellSlashIcon style={{ width: 14, height: 14 }} />
                : <BellIcon style={{ width: 14, height: 14 }} />}
            </button>
            {reportFeedback && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9,
                color: C.green, letterSpacing: '0.1em' }}>
                <CheckCircleIcon style={{ width: 10, height: 10 }} /> SENT
              </span>
            )}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '2px 7px',
              fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: connected ? `${C.green}15` : `${C.red}15`,
              color: connected ? C.green : C.red,
              border: `1px solid ${connected ? C.green : C.red}44`,
            }}>
              <StatusDot color={connected ? C.green : C.red} pulse={connected} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          {roleInfo && <roleInfo.Icon style={{ width: 12, height: 12, color: C.accent }} />}
          <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {roleInfo?.label}
          </span>
          <span style={{ fontSize: 9, color: C.textDim }}>
            {callsign}
          </span>
        </div>
      </header>

      {/* Feed mode toggle */}
      <div style={{
        display: 'flex', borderBottom: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfacePrimary, flexShrink: 0,
      }}>
        <button onClick={() => setFeedMode('smart')} style={tabStyle(feedMode === 'smart')}>
          <FunnelIcon style={{ width: 10, height: 10 }} />
          Key Updates
          {forYou.length > 0 && (
            <span style={{
              background: C.amber, color: '#000', padding: '0 4px',
              fontSize: 8, fontWeight: 800, minWidth: 14, textAlign: 'center',
            }}>{forYou.length}</span>
          )}
        </button>
        <button onClick={() => setFeedMode('all')} style={tabStyle(feedMode === 'all')}>
          <ListBulletIcon style={{ width: 10, height: 10 }} />
          All Activity ({events.length})
        </button>
      </div>

      {/* Pinned missions banner */}
      <MissionBanner missions={missions} />

      {/* Event Feed */}
      <div ref={feedRef} style={{
        flex: 1, overflowY: 'auto', padding: feedMode === 'all' ? 0 : '6px 8px',
        display: 'flex', flexDirection: 'column', gap: feedMode === 'all' ? 0 : 5,
      }}>
        {feedEvents.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, color: C.textDim,
            textAlign: 'center', padding: 40, fontSize: 10,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            <PaperAirplaneIcon style={{ width: 20, height: 20, opacity: 0.4 }} />
            {connected ? 'Waiting for activity...' : 'Connecting...'}
            {feedMode === 'smart' && connected && events.length > 0 && (
              <div style={{ fontSize: 9, color: C.textDim }}>No directed or critical events yet.</div>
            )}
          </div>
        ) : (
          feedEvents.map(e => <EventCard key={e.id} event={e} compact={feedMode === 'all'} />)
        )}
      </div>

      {/* Bottom Panel */}
      <div style={{
        flexShrink: 0, borderTop: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfaceCard, padding: '8px 10px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          <span style={{
            fontSize: 10,
            color: C.textPrimary,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            MACS Voice
          </span>
          <span style={{ fontSize: 9, color: C.textDim }}>
            {voiceConnected
              ? (isSpeaking ? 'Agent speaking' : `Session live • ${voiceMode}`)
              : 'Tap mic to connect'}
          </span>
        </div>

        {(voicePermissionState === 'denied' || voiceError || recentVoiceMessages.length > 0 || tentativeReply) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
            padding: '10px 12px',
            border: `1px solid rgba(255,255,255,0.08)`,
            background: C.surfacePrimary,
          }}>
            {voicePermissionState === 'denied' && (
              <div style={{ fontSize: 10, color: C.red, lineHeight: 1.5 }}>
                Microphone access is blocked. Allow mic access for this site and reconnect.
              </div>
            )}
            {voiceError && (
              <div style={{ fontSize: 10, color: C.red, lineHeight: 1.5 }}>
                {voiceError}
              </div>
            )}
            {recentVoiceMessages.map(message => (
              <div
                key={message.id}
                style={{
                  padding: '8px 10px',
                  background: C.surfaceCard,
                  borderLeft: `2px solid ${message.role === 'baseops' ? C.accent : C.grey}`,
                }}
              >
                <div style={{
                  fontSize: 8,
                  color: message.role === 'baseops' ? C.accent : C.textDim,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}>
                  {message.role === 'baseops' ? 'Baseops' : 'You'}
                </div>
                <div style={{ fontSize: 10, color: C.textPrimary, lineHeight: 1.5 }}>
                  {message.text}
                </div>
              </div>
            ))}
            {tentativeReply && (
              <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5, fontStyle: 'italic' }}>
                {tentativeReply}
              </div>
            )}
          </div>
        )}

        {/* Quick report grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 6 }}>
          {quickReports.map((qr, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(qr)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 4, padding: '10px 6px',
                background: C.surfacePrimary, border: `1px solid rgba(255,255,255,0.07)`,
                color: C.textMuted, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', lineHeight: 1.3, textAlign: 'center',
                fontFamily: 'inherit',
              }}
            >
              <qr.Icon style={{ width: 16, height: 16, color: C.accent }} />
              {qr.label}
            </button>
          ))}
        </div>

        {/* Voice PTT button */}
        <button
          onClick={handleVoiceButtonClick}
          onMouseDown={handleVoicePressStart}
          onMouseUp={handleVoicePressEnd}
          onMouseLeave={handleVoicePressEnd}
          onTouchStart={handleVoicePressStart}
          onTouchEnd={handleVoicePressEnd}
          onTouchCancel={handleVoicePressEnd}
          disabled={!voiceConfigured && !voiceConnected}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '14px',
            border: `1px solid ${
              !voiceConfigured && !voiceConnected
                ? 'rgba(255,255,255,0.1)'
                : voiceConnected
                  ? (micMuted ? `${C.accent}55` : `${C.red}55`)
                  : `${C.accent}55`
            }`,
            background: voiceConnected
              ? (micMuted ? C.surfacePrimary : `${C.red}12`)
              : (!voiceConfigured && !voiceConnected ? C.surfacePrimary : `${C.accent}12`),
            color: voiceConnected ? C.textPrimary : (!voiceConfigured && !voiceConnected ? C.textDim : C.accent),
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            cursor: (!voiceConfigured && !voiceConnected) ? 'not-allowed' : 'pointer',
            userSelect: 'none', fontFamily: 'inherit',
            opacity: (!voiceConfigured && !voiceConnected) ? 0.7 : 1,
          }}
        >
          <MicrophoneIcon style={{
            width: 16,
            height: 16,
            color: voiceConnected ? (micMuted ? C.accent : C.red) : (!voiceConfigured && !voiceConnected ? C.textDim : C.accent),
          }} />
          {!voiceConnected ? 'Start Voice' : (micMuted ? 'Hold to Talk' : 'Release to Transmit')}
        </button>

        {!voiceConfigured && !voiceConnected && (
          <div style={{ marginTop: 6 }}>
            <TextReportBar sendReport={sendReport} role={role} />
          </div>
        )}
      </div>

      {activeSheet && (
        <ReportSheet qr={activeSheet} onSend={sendReport} onClose={() => setActiveSheet(null)} />
      )}
    </div>
  )
}

// ── Pinned Missions Banner ────────────────────────────────────────────────────

function MissionBanner({ missions }) {
  const active = (missions || []).filter(m => m.status === 'active')
  if (active.length === 0) return null

  return (
    <div style={{
      padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4,
      background: `${C.accent}08`, borderBottom: `1px solid ${C.accent}22`, flexShrink: 0,
    }}>
      <div style={{
        fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: C.accent, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <MapPinIcon style={{ width: 10, height: 10 }} />
        Active Missions ({active.length})
      </div>
      {active.map(m => {
        const remaining = m.duration_min
          ? Math.max(0, Math.round(m.duration_min - (Date.now() / 1000 - m.start_time) / 60))
          : null
        const priColor = m.priority === 'CRITICAL' ? C.red : m.priority === 'HIGH' ? C.amber : C.accent
        return (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
            background: C.surfaceCard, border: `1px solid rgba(255,255,255,0.06)`,
            borderLeft: `2px solid ${priColor}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.textPrimary,
                letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.name}</div>
              {m.description && (
                <div style={{
                  fontSize: 9, color: C.textMuted, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{m.description}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {m.domain && (
                <span style={{
                  fontSize: 7, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', background: `${C.accent}22`, color: C.accent,
                }}>{m.domain}</span>
              )}
              <span style={{
                fontSize: 7, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', background: `${priColor}22`, color: priColor,
              }}>{m.priority}</span>
              {remaining !== null && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  fontSize: 8, color: remaining <= 5 ? C.amber : C.textDim,
                }}>
                  <ClockIcon style={{ width: 9, height: 9 }} />
                  {remaining}m
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Mission Control Page ─────────────────────────────────────────────────────

function MissionControlPage({ missions, sendMission, events, connected, callsign, onBack, muted, setMuted }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState('')
  const [priority, setPriority] = useState('HIGH')
  const [duration, setDuration] = useState('30')
  const [feedback, setFeedback] = useState(null)
  const feedRef = useRef(null)

  const activeMissions = (missions || []).filter(m => m.status === 'active')

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [events])

  const handleCreate = () => {
    if (!name.trim()) return
    sendMission({
      action: 'create',
      name: name.trim(),
      description: description.trim(),
      domain: domain || undefined,
      priority,
      duration_min: parseInt(duration) || 30,
    })
    setName(''); setDescription(''); setDomain(''); setPriority('HIGH'); setDuration('30')
    setShowForm(false)
    setFeedback('Mission created')
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleCancel = (missionId) => {
    sendMission({ action: 'cancel', mission_id: missionId })
    setFeedback('Mission cancelled')
    setTimeout(() => setFeedback(null), 3000)
  }

  const inputStyle = {
    width: '100%', padding: '10px 8px', background: C.surfacePrimary,
    border: `1px solid rgba(255,255,255,0.08)`, color: C.textPrimary,
    fontSize: 10, fontFamily: 'inherit', outline: 'none',
  }

  const threatLevel = useMemo(() => {
    const t = events.filter(e => e.domain === 'THREAT' && e.payload?.threat_level).slice(-1)
    return t.length > 0 ? t[0].payload.threat_level : 'GREEN'
  }, [events])
  const threatColor = threatLevel === 'RED' ? C.red : threatLevel === 'AMBER' ? C.amber : '#4ade80'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: C.surfacePrimary }}>

      {/* Header */}
      <header style={{
        padding: '8px 12px', borderBottom: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfaceCard, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onBack} style={{
              display: 'flex', alignItems: 'center', background: 'none', border: 'none',
              color: C.textDim, cursor: 'pointer', padding: 2,
            }}>
              <ArrowLeftIcon style={{ width: 14, height: 14 }} />
            </button>
            <img src="/field/img/macs_logo_white.png" alt="MACS" style={{ height: 18, objectFit: 'contain' }} />
            <span style={{
              fontSize: 8, padding: '2px 7px', fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              background: `${threatColor}22`, color: threatColor,
              border: `1px solid ${threatColor}44`,
            }}>{threatLevel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={() => setMuted(m => !m)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: muted ? C.red : C.green,
            }}>
              {muted
                ? <BellSlashIcon style={{ width: 14, height: 14 }} />
                : <BellIcon style={{ width: 14, height: 14 }} />}
            </button>
            {feedback && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9,
                color: C.green, letterSpacing: '0.1em' }}>
                <CheckCircleIcon style={{ width: 10, height: 10 }} /> {feedback}
              </span>
            )}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, padding: '2px 7px',
              fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: connected ? `${C.green}15` : `${C.red}15`,
              color: connected ? C.green : C.red,
              border: `1px solid ${connected ? C.green : C.red}44`,
            }}>
              <StatusDot color={connected ? C.green : C.red} pulse={connected} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <ClipboardDocumentListIcon style={{ width: 12, height: 12, color: C.accent }} />
          <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Mission Control
          </span>
          <span style={{ fontSize: 9, color: C.textDim }}>{callsign}</span>
        </div>
      </header>

      {/* Active missions list */}
      <div style={{
        flexShrink: 0, maxHeight: '35vh', overflowY: 'auto',
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 10px', background: C.surfaceCard,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: C.accent,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <MapPinIcon style={{ width: 11, height: 11 }} />
            Active Missions ({activeMissions.length})
          </span>
          <button onClick={() => setShowForm(f => !f)} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
            background: showForm ? `${C.red}15` : `${C.accent}15`,
            border: `1px solid ${showForm ? C.red : C.accent}55`,
            color: showForm ? C.red : C.accent,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {showForm ? <XMarkIcon style={{ width: 10, height: 10 }} /> : <PlusIcon style={{ width: 10, height: 10 }} />}
            {showForm ? 'Cancel' : 'New Mission'}
          </button>
        </div>

        {/* Create mission form */}
        {showForm && (
          <div style={{
            padding: '10px', background: `${C.accent}06`,
            borderBottom: `1px solid rgba(255,255,255,0.05)`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <input
              type="text" placeholder="Mission name (e.g. Surge Sortie Alpha)"
              value={name} onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Description / standing orders..."
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} style={{ ...inputStyle, resize: 'none', lineHeight: 1.4 }}
            />
            <div style={{ display: 'flex', gap: 5 }}>
              <select value={domain} onChange={e => setDomain(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">All Domains</option>
                {['SORTIE', 'FUEL', 'ARMING', 'MAINTENANCE', 'THREAT'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
              </select>
              <input
                type="number" placeholder="Min" value={duration}
                onChange={e => setDuration(e.target.value)}
                style={{ ...inputStyle, width: 55, textAlign: 'center' }}
              />
              <span style={{ fontSize: 9, color: C.textDim, alignSelf: 'center', flexShrink: 0 }}>min</span>
            </div>
            <button onClick={handleCreate} disabled={!name.trim()} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px', background: name.trim() ? `${C.accent}22` : C.surfacePrimary,
              border: `1px solid ${name.trim() ? C.accent : 'rgba(255,255,255,0.08)'}66`,
              color: name.trim() ? C.accent : C.textDim,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>
              <PaperAirplaneIcon style={{ width: 12, height: 12 }} />
              Issue Mission
            </button>
          </div>
        )}

        {/* Active mission cards */}
        {activeMissions.length === 0 && !showForm ? (
          <div style={{
            padding: '20px', textAlign: 'center', fontSize: 10,
            color: C.textDim, letterSpacing: '0.08em',
          }}>No active missions. Tap + New Mission to create one.</div>
        ) : (
          activeMissions.map(m => {
            const remaining = m.duration_min
              ? Math.max(0, Math.round(m.duration_min - (Date.now() / 1000 - m.start_time) / 60))
              : null
            const priColor = m.priority === 'CRITICAL' ? C.red : m.priority === 'HIGH' ? C.amber : C.accent
            return (
              <div key={m.id} style={{
                padding: '8px 10px', borderBottom: `1px solid rgba(255,255,255,0.04)`,
                borderLeft: `2px solid ${priColor}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.textPrimary }}>{m.name}</span>
                      {m.domain && (
                        <span style={{
                          fontSize: 7, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', background: `${C.accent}22`, color: C.accent,
                        }}>{m.domain}</span>
                      )}
                      <span style={{
                        fontSize: 7, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', background: `${priColor}22`, color: priColor,
                      }}>{m.priority}</span>
                      {remaining !== null && (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 2,
                          fontSize: 8, color: remaining <= 5 ? C.amber : C.textDim,
                        }}>
                          <ClockIcon style={{ width: 9, height: 9 }} />
                          {remaining}m left
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                        {m.description}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleCancel(m.id)} style={{
                    padding: '4px 8px', background: `${C.red}15`, border: `1px solid ${C.red}44`,
                    color: C.red, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                    marginLeft: 8,
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Feed: all events (mission control sees everything) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderBottom: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfaceCard, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: C.textMuted,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <ListBulletIcon style={{ width: 10, height: 10 }} />
          Live Feed ({events.length})
        </span>
      </div>

      <div ref={feedRef} style={{
        flex: 1, overflowY: 'auto', padding: 0,
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {events.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, color: C.textDim,
            textAlign: 'center', padding: 40, fontSize: 10,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            <PaperAirplaneIcon style={{ width: 20, height: 20, opacity: 0.4 }} />
            {connected ? 'Waiting for activity...' : 'Connecting...'}
          </div>
        ) : (
          events.slice(-80).map(e => <EventCard key={e.id} event={e} compact />)
        )}
      </div>
    </div>
  )
}

// ── Text Report Bar ───────────────────────────────────────────────────────────

function TextReportBar({ sendReport, role }) {
  const [text, setText] = useState('')
  const [domain, setDomain] = useState('')

  const handleSend = () => {
    if (!text.trim()) return
    sendReport({ domain: domain || guessDomain(text, role), message: text.trim(),
      severity: guessSeverity(text), tags: ['text-report'] })
    setText('')
  }

  const inputBase = {
    padding: '11px 8px', background: C.surfacePrimary,
    border: `1px solid rgba(255,255,255,0.08)`, color: C.textPrimary,
    fontSize: 10, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <select value={domain} onChange={e => setDomain(e.target.value)} style={{ ...inputBase, width: 80 }}>
        <option value="">Auto</option>
        {['FUEL', 'ARMING', 'MAINTENANCE', 'SORTIE', 'THREAT'].map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <input
        type="text" placeholder="Type report..."
        value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
        style={{ ...inputBase, flex: 1 }}
      />
      <button onClick={handleSend} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '11px 14px', background: `${C.accent}22`,
        border: `1px solid ${C.accent}66`, color: C.accent, cursor: 'pointer',
      }}>
        <PaperAirplaneIcon style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function guessDomain(text, role) {
  const t = text.toLowerCase()
  if (t.match(/fuel|truck|convoy|jp-8|tanker|spill|delivery/)) return 'FUEL'
  if (t.match(/arm|weapon|ordnance|loadout|amraam|iris|bomb|munition/)) return 'ARMING'
  if (t.match(/maint|fault|inspect|repair|ground|hydraulic|engine/)) return 'MAINTENANCE'
  if (t.match(/threat|hostile|contact|radar|drone|movement|perimeter|sector/)) return 'THREAT'
  if (t.match(/sortie|scramble|taxi|takeoff|landing|aircraft|pilot|ready/)) return 'SORTIE'
  const roleDefaults = { pad_crew: 'MAINTENANCE', convoy: 'FUEL', security: 'THREAT', pilot: 'SORTIE', hq: 'SORTIE' }
  return roleDefaults[role] || 'SYSTEM'
}

function guessVoiceDomain(text) {
  const t = text.toLowerCase()
  if (t.match(/fuel|truck|convoy|jp-8|tanker|spill|delivery/)) return 'FUEL'
  if (t.match(/arm|weapon|ordnance|loadout|amraam|iris|bomb|munition/)) return 'ARMING'
  if (t.match(/maint|fault|inspect|repair|ground|hydraulic|engine/)) return 'MAINTENANCE'
  if (t.match(/threat|hostile|contact|radar|drone|movement|perimeter|sector/)) return 'THREAT'
  if (t.match(/sortie|scramble|taxi|takeoff|landing|aircraft|pilot|ready/)) return 'SORTIE'
  return 'SYSTEM'
}

function guessSeverity(text) {
  const t = text.toLowerCase()
  if (t.match(/mayday|emergency|under fire|critical|hostile|contact!/)) return 'CRITICAL'
  if (t.match(/fault|blocked|down|spill|strike|urgent/)) return 'HIGH'
  if (t.match(/update|en route|eta|reconfig/)) return 'MEDIUM'
  return 'LOW'
}
