/**
 * MACS Field App — Mobile field intelligence terminal.
 * Design: Military command HUD. JetBrains Mono. Dense. No decorative elements.
 * Icons: @heroicons/react/24/solid exclusively.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useField } from './useField'
import macsLogo from '../../assets/img/macs_logo_white.png'
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
  ArrowLeftIcon,
  XMarkIcon,
  FunnelIcon,
  Bars3Icon,
  MicrophoneIcon,
  WrenchIcon,
  ViewfinderCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'

// ── Design tokens (mirrors CSS vars) ──────────────────────────────────────

const C = {
  cyan:    '#06b6d4',
  red:     '#ef4444',
  amber:   '#f59e0b',
  green:   '#22c55e',
  grey:    '#4b5563',
  surface: 'hsl(220,50%,5%)',
  card:    'hsl(220,40%,8%)',
  hover:   'hsl(220,35%,12%)',
  border:  'rgba(255,255,255,0.05)',
  borderM: 'rgba(255,255,255,0.10)',
}

const SEVERITY_COLOR = {
  CRITICAL: C.red,
  HIGH:     C.amber,
  AMBER:    C.amber,
  MEDIUM:   C.cyan,
  LOW:      C.green,
  INFO:     C.grey,
}

const DOMAIN_ICONS = {
  SORTIE:      PaperAirplaneIcon,
  FUEL:        BeakerIcon,
  ARMING:      BoltIcon,
  MAINTENANCE: WrenchScrewdriverIcon,
  THREAT:      EyeIcon,
  SYSTEM:      GlobeAltIcon,
}

const ROLES = [
  { id: 'pad_crew',  label: 'PAD CREW',   Icon: WrenchScrewdriverIcon, desc: 'Fuel, arming & maintenance at pads' },
  { id: 'convoy',   label: 'CONVOY',      Icon: TruckIcon,              desc: 'Fuel supply chain & transport' },
  { id: 'security', label: 'SECURITY',    Icon: ShieldCheckIcon,        desc: 'Perimeter watch & threat reports' },
  { id: 'pilot',    label: 'PILOT',       Icon: PaperAirplaneIcon,      desc: 'Flight ops & recovery' },
  { id: 'hq',       label: 'HQ LIAISON',  Icon: SignalIcon,             desc: 'Command authority & intel' },
]

const QUICK_REPORTS = {
  pad_crew: [
    { Icon: BeakerIcon,              label: 'REFUEL DONE',   domain: 'FUEL',        severity: 'LOW',
      template: 'Refueling complete on [aircraft] at [pad].',                        prompt: 'Aircraft / pad?' },
    { Icon: BoltIcon,                label: 'ARMED',         domain: 'ARMING',      severity: 'LOW',
      template: 'Arming complete, weapons safe on [aircraft].',                      prompt: 'Aircraft ID, loadout?' },
    { Icon: WrenchIcon,              label: 'FAULT',         domain: 'MAINTENANCE', severity: 'HIGH',
      template: 'Fault detected: [describe fault] on [aircraft] at [pad].',          prompt: 'Fault? Aircraft?' },
    { Icon: CheckCircleIcon,         label: 'INSP OK',       domain: 'MAINTENANCE', severity: 'LOW',
      template: 'Pre-flight inspection complete. [aircraft] serviceable at [pad].',  prompt: 'Aircraft ID?' },
    { Icon: ExclamationTriangleIcon, label: 'SPILL',         domain: 'FUEL',        severity: 'HIGH',
      template: 'Fuel spill at [pad/location]. ~[X] litres. Cleanup required.',      prompt: 'Location, volume?' },
    { Icon: ArrowPathIcon,           label: 'LOADOUT SWAP',  domain: 'ARMING',      severity: 'MEDIUM',
      template: 'Loadout reconfig on [aircraft]: [from] → [to]. ETA [X] min.',       prompt: 'Aircraft, old→new, ETA?' },
  ],
  convoy: [
    { Icon: TruckIcon,               label: 'ETA UPDATE',    domain: 'FUEL',        severity: 'MEDIUM',
      template: 'Convoy en route. Position [location]. ETA [X] min.',                prompt: 'Position, ETA?' },
    { Icon: NoSymbolIcon,            label: 'ROAD BLOCKED',  domain: 'FUEL',        severity: 'HIGH',
      template: 'Road blocked at [location]. Cause: [debris/enemy]. Rerouting via [alt].',  prompt: 'Where? Cause? Alt route?' },
    { Icon: ExclamationTriangleIcon, label: 'UNDER FIRE',    domain: 'FUEL',        severity: 'CRITICAL',
      template: 'Convoy under fire at [location]! [X] vehicles. Requesting [support].',     prompt: 'Location, threat, support needed?' },
    { Icon: CheckCircleIcon,         label: 'DELIVERED',     domain: 'FUEL',        severity: 'LOW',
      template: 'Fuel delivery complete. [X] litres JP-8 to [location].',            prompt: 'Litres, destination?' },
    { Icon: WrenchIcon,              label: 'TRUCK DOWN',    domain: 'FUEL',        severity: 'HIGH',
      template: 'Vehicle breakdown at [location]. Truck [ID]. Fault: [describe].',   prompt: 'Truck ID, location, fault?' },
  ],
  security: [
    { Icon: EyeIcon,                 label: 'MOVEMENT',      domain: 'THREAT',      severity: 'HIGH',
      template: 'Movement in sector [X]. [N] personnel/vehicles. Bearing [deg].',    prompt: 'Sector, count, direction?' },
    { Icon: BoltIcon,                label: 'CONTACT',       domain: 'THREAT',      severity: 'CRITICAL',
      template: 'Contact! Hostile activity at sector [X]. Type: [infantry/vehicle/drone].', prompt: 'Sector, threat type, action?' },
    { Icon: CheckCircleIcon,         label: 'ALL CLEAR',     domain: 'THREAT',      severity: 'LOW',
      template: 'Sector [X] clear. Patrol complete, no threats observed.',           prompt: 'Sector?' },
    { Icon: SpeakerWaveIcon,         label: 'ACOUSTIC',      domain: 'THREAT',      severity: 'AMBER',
      template: 'Acoustic contact in sector [X]. Type: [engine/rotor/blast]. Bearing [deg].', prompt: 'Sector, type, bearing?' },
    { Icon: ViewfinderCircleIcon,    label: 'DRONE',         domain: 'THREAT',      severity: 'HIGH',
      template: 'Drone activity over sector [X]. Alt ~[X]m. Direction: [bearing].',  prompt: 'Sector, altitude, direction?' },
  ],
  pilot: [
    { Icon: PaperAirplaneIcon,       label: 'READY',         domain: 'SORTIE',      severity: 'LOW',
      template: '[Aircraft] ready for taxi at [pad]. Systems green, pilot [callsign].', prompt: 'Aircraft, pad, callsign?' },
    { Icon: SparklesIcon,            label: 'BIRD STRIKE',   domain: 'SORTIE',      severity: 'HIGH',
      template: 'Bird strike on [aircraft] during [phase]. Damage: [assessment].',   prompt: 'Aircraft, phase, damage?' },
    { Icon: ViewfinderCircleIcon,    label: 'WPN EXP',       domain: 'SORTIE',      severity: 'MEDIUM',
      template: 'Weapons expended on [aircraft]. Remaining: [count]. RTB.',          prompt: 'Expended, remaining?' },
    { Icon: ExclamationTriangleIcon, label: 'EMERGENCY',     domain: 'SORTIE',      severity: 'CRITICAL',
      template: 'MAYDAY — [aircraft] declaring emergency. Nature: [describe]. Fuel: [X]%.',  prompt: 'Aircraft, nature, fuel, position?' },
    { Icon: ArrowPathIcon,           label: 'RECOVERED',     domain: 'SORTIE',      severity: 'LOW',
      template: '[Aircraft] recovered at [pad]. Flight [X] min. Status: [serviceable/inspect].', prompt: 'Aircraft, pad, time, status?' },
  ],
  hq: [
    { Icon: ClipboardDocumentListIcon, label: 'TASKING',     domain: 'SORTIE',      severity: 'HIGH',
      template: 'Tasking from COMJFAC: [mission]. [X] sorties req within [Y] min.', prompt: 'Mission, sorties, window?' },
    { Icon: SignalIcon,              label: 'INTEL',         domain: 'THREAT',      severity: 'MEDIUM',
      template: 'Intel update: [source] reports [threat] in [area]. Assessment: [impact].', prompt: 'Source, intel, area, impact?' },
    { Icon: ScaleIcon,               label: 'ROE CHANGE',    domain: 'SORTIE',      severity: 'HIGH',
      template: 'ROE update: [old] → [new]. Effective immediately. Reason: [context].', prompt: 'Old ROE, new ROE, reason?' },
    { Icon: ArrowPathIcon,           label: 'REDIRECT',      domain: 'SORTIE',      severity: 'HIGH',
      template: 'Redirect [aircraft/sortie] to [tasking/area]. Priority: [level].',  prompt: 'What, where, priority?' },
  ],
}

// ── Speech-to-Text Hook ───────────────────────────────────────────────────

function useSpeechToText() {
  const [listening, setListening]   = useState(false)
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported]   = useState(false)
  const recRef = useRef(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    setSupported(true)
    const rec = new SR()
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = 'en-US'
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setTranscript(text)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    recRef.current = rec
  }, [])

  const start = useCallback(() => {
    if (recRef.current && !listening) { setTranscript(''); recRef.current.start(); setListening(true) }
  }, [listening])

  const stop = useCallback(() => {
    if (recRef.current && listening) { recRef.current.stop(); setListening(false) }
  }, [listening])

  const reset = useCallback(() => setTranscript(''), [])

  return { listening, transcript, supported, start, stop, reset }
}

// ── Shared micro-components ──────────────────────────────────────────────

function Badge({ text, color }) {
  return (
    <span style={{
      fontSize: 8, padding: '1px 5px', fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color, background: `${color}18`,
      border: `1px solid ${color}28`,
    }}>{text}</span>
  )
}

function StatusDot({ on }) {
  return (
    <span style={{
      display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
      background: on ? C.green : C.red,
      animation: on ? 'pulseDot 2s infinite' : 'none',
      flexShrink: 0,
    }} />
  )
}

// ── Role Selection ────────────────────────────────────────────────────────

function RoleSelect({ onSelect }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      padding: '24px 16px', justifyContent: 'center', gap: 6,
      background: C.surface,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img
          src="/field/img/macs_logo_white.png"
          alt="MACS Airbase"
          style={{ height: 48, objectFit: 'contain', marginBottom: 4 }}
        />
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
          Multi-Agent Command System &mdash; Field App
        </div>
        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>
          Select your role to begin
        </div>
      </div>

      {ROLES.map(r => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 14px',
            background: C.card, border: `1px solid ${C.borderM}`,
            color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <r.Icon style={{ width: 16, height: 16, color: C.cyan, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-primary)' }}>
              {r.label}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{r.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Report Sheet (bottom overlay) ─────────────────────────────────────────

function ReportSheet({ qr, onSend, onClose }) {
  const [text, setText] = useState(qr.template)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const sevColor = SEVERITY_COLOR[qr.severity] || C.grey

  const handleSend = () => {
    if (!text.trim()) return
    onSend({ domain: qr.domain, message: text.trim(), severity: qr.severity, tags: ['quick-report'] })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', zIndex: 100,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', background: C.card,
          borderTop: `1px solid ${C.borderM}`,
          padding: '14px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          animation: 'slideUp 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <qr.Icon style={{ width: 14, height: 14, color: C.cyan }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-primary)' }}>
              {qr.label}
            </span>
            <Badge text={qr.severity} color={sevColor} />
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
          >
            <XMarkIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.05em' }}>
          {qr.prompt}
        </div>

        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          style={{
            width: '100%', padding: '10px',
            background: C.surface, border: `1px solid ${C.borderM}`,
            color: 'var(--text-primary)', fontSize: 10, lineHeight: 1.6,
            resize: 'none', outline: 'none',
          }}
        />

        <button
          onClick={handleSend}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', marginTop: 8, padding: '12px',
            background: `${C.cyan}20`, border: `1px solid ${C.cyan}50`,
            color: C.cyan, fontWeight: 700, fontSize: 10,
            letterSpacing: '0.15em', cursor: 'pointer',
          }}
        >
          <PaperAirplaneIcon style={{ width: 13, height: 13 }} />
          TRANSMIT
        </button>
      </div>
    </div>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────

function EventCard({ event, compact }) {
  const sevColor   = SEVERITY_COLOR[event.severity] || C.grey
  const DomainIcon = DOMAIN_ICONS[event.domain] || GlobeAltIcon
  const ts         = new Date(event.timestamp * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const msg          = event.payload?.message || event.event_type
  const isDirected   = (event.directed_to || []).length > 0
  const isFieldReport = event.event_type === 'FIELD_REPORT'
  const isSensor     = event.source_layer === 'SENSOR'
  const isAgent      = event.event_type === 'ACTION_TAKEN'
  const isCritical   = event.severity === 'CRITICAL'

  if (compact) {
    return (
      <div style={{
        padding: '9px 10px',
        background: isCritical ? `${C.red}08` : C.card,
        borderLeft: `2px solid ${sevColor}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <DomainIcon style={{ width: 11, height: 11, color: C.cyan, flexShrink: 0 }} />
          <Badge text={event.severity} color={sevColor} />
          {isDirected && <Badge text="FOR YOU" color={C.amber} />}
          <span style={{
            fontSize: 9, color: 'var(--text-dim)',
            marginLeft: 'auto', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
          }}>{ts}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{msg}</div>
        {(isFieldReport && event.payload?.reporter_callsign) && (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>
            — {event.payload.reporter_callsign} / {event.payload.reporter_role}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      padding: '8px 10px',
      background: isCritical ? `${C.red}08` : C.card,
      borderLeft: `2px solid ${sevColor}`,
      border: isDirected ? `1px solid ${C.amber}25` : `1px solid ${C.border}`,
      borderLeft: `2px solid ${sevColor}`,
      animation: 'slideUp 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <DomainIcon style={{ width: 12, height: 12, color: C.cyan, flexShrink: 0 }} />
          {isFieldReport && <Badge text="FIELD"  color={C.amber} />}
          {isSensor      && <Badge text="SENSOR" color={C.cyan}  />}
          {isAgent       && <Badge text={event.source || 'AGENT'} color={C.cyan} />}
          {isDirected    && <Badge text="FOR YOU" color={C.amber} />}
          <Badge text={event.severity} color={sevColor} />
        </div>
        <span style={{
          fontSize: 9, color: 'var(--text-dim)',
          fontVariantNumeric: 'tabular-nums',
          animation: isCritical ? 'threatBlink 1.2s infinite' : 'none',
        }}>{ts}</span>
      </div>

      <div style={{
        fontSize: 10, lineHeight: 1.55,
        color: isAgent ? 'var(--text-primary)' : 'var(--text-muted)',
      }}>
        {msg}
      </div>

      {isFieldReport && event.payload?.reporter_callsign && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.05em' }}>
          — {event.payload.reporter_callsign} / {event.payload.reporter_role}
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const [role, setRole] = useState(null)
  if (!role) return <RoleSelect onSelect={setRole} />
  return <FieldDashboard role={role} onBack={() => setRole(null)} />
}

// ── Field Dashboard ───────────────────────────────────────────────────────

function FieldDashboard({ role, onBack }) {
  const { events, connected, sendReport, lastReportId } = useField(null)
  const [activeSheet, setActiveSheet]   = useState(null)
  const [feedMode, setFeedMode]         = useState('smart')
  const [reportFeedback, setReportFeedback] = useState(null)
  const feedRef = useRef(null)

  const { listening, transcript, supported: sttSupported, start: sttStart, stop: sttStop, reset: sttReset } = useSpeechToText()
  const [pttDomain, setPttDomain] = useState('')

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

  const handlePttSend = useCallback(() => {
    sttStop()
    if (transcript.trim()) {
      sendReport({
        domain:   pttDomain || guessDomain(transcript, role),
        message:  transcript.trim(),
        severity: guessSeverity(transcript),
        tags:     ['voice-report'],
      })
      sttReset()
    }
  }, [transcript, pttDomain, role, sendReport, sttStop, sttReset])

  const quickReports = QUICK_REPORTS[role] || []

  const { forYou, digest } = useMemo(() => {
    const forYou   = events.filter(e => (e.directed_to || []).length > 0)
    const critHigh = events
      .filter(e => (e.severity === 'CRITICAL' || e.severity === 'HIGH') && !(e.directed_to || []).length)
      .slice(-5)
    const latestPerAgent = {}
    events.forEach(e => { if (e.event_type === 'ACTION_TAKEN') latestPerAgent[e.source] = e })
    const agentDigest = Object.values(latestPerAgent)
    const seen = new Set()
    const digest = []
    const add = arr => arr.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); digest.push(e) } })
    add(forYou); add(critHigh); add(agentDigest)
    digest.sort((a, b) => b.timestamp - a.timestamp)
    return { forYou, digest }
  }, [events])

  const feedEvents  = feedMode === 'smart' ? digest : events.slice(-60)

  const threatLevel = useMemo(() => {
    const t = events.filter(e => e.domain === 'THREAT' && e.payload?.threat_level).slice(-1)
    return t.length ? t[0].payload.threat_level : 'GREEN'
  }, [events])

  const threatColor = threatLevel === 'RED' ? C.red : threatLevel === 'AMBER' ? C.amber : '#4ade80'
  const roleInfo    = ROLES.find(r => r.id === role)

  const tabBtn = (mode, label, count) => (
    <button
      onClick={() => setFeedMode(mode)}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '7px 0', border: 'none', cursor: 'pointer',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        background: feedMode === mode ? C.card : 'transparent',
        color: feedMode === mode ? 'var(--text-primary)' : 'var(--text-dim)',
        borderBottom: feedMode === mode ? `1px solid ${C.cyan}` : '1px solid transparent',
      }}
    >
      {mode === 'smart' ? <FunnelIcon style={{ width: 11, height: 11 }} /> : <Bars3Icon style={{ width: 11, height: 11 }} />}
      {label}
      {count > 0 && (
        <span style={{
          fontSize: 8, padding: '0 4px', fontWeight: 800,
          background: C.amber, color: '#000',
        }}>{count}</span>
      )}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: C.surface }}>

      {/* ── Header ── */}
      <header style={{
        padding: '8px 12px', flexShrink: 0,
        background: C.card, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onBack}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', padding: 2,
              }}
            >
              <ArrowLeftIcon style={{ width: 13, height: 13 }} />
            </button>
            <img src={macsLogo} alt="MACS" style={{ height: 18, width: 'auto' }} />
            <span style={{
              fontSize: 8, padding: '2px 6px', fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase',
              color: threatColor, background: `${threatColor}12`,
              border: `1px solid ${threatColor}30`,
              animation: threatLevel === 'RED' ? 'threatBlink 1s infinite' : 'none',
            }}>{threatLevel}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {reportFeedback && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 9, color: C.green, letterSpacing: '0.08em',
                animation: 'fadeIn 0.2s ease',
              }}>
                <CheckCircleIcon style={{ width: 11, height: 11 }} />
                SENT
              </span>
            )}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 8, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.1em',
              color: connected ? C.green : C.red,
              background: connected ? `${C.green}10` : `${C.red}10`,
              border: `1px solid ${connected ? C.green : C.red}25`,
            }}>
              <StatusDot on={connected} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
          {roleInfo && <roleInfo.Icon style={{ width: 11, height: 11, color: C.cyan }} />}
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
            {roleInfo?.label}
          </span>
        </div>
      </header>

      {/* ── Feed Toggle ── */}
      <div style={{
        display: 'flex', flexShrink: 0,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        {tabBtn('smart', 'KEY UPDATES', forYou.length)}
        {tabBtn('all',   `ALL  (${events.length})`, 0)}
      </div>

      {/* ── Event Feed ── */}
      <div
        ref={feedRef}
        style={{
          flex: 1, overflowY: 'auto',
          padding: feedMode === 'all' ? 0 : '6px 8px',
          display: 'flex', flexDirection: 'column',
          gap: feedMode === 'all' ? 0 : 4,
        }}
      >
        {feedEvents.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            color: 'var(--text-dim)', padding: 40, fontSize: 9,
            letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            <SignalIcon style={{ width: 14, height: 14 }} />
            {connected ? 'Awaiting activity...' : 'Connecting...'}
            {feedMode === 'smart' && connected && events.length > 0 && (
              <span style={{ fontSize: 8 }}>No directed or critical events.</span>
            )}
          </div>
        ) : (
          feedEvents.map(e => (
            <EventCard key={e.id} event={e} compact={feedMode === 'all'} />
          ))
        )}
      </div>

      {/* ── Bottom Panel ── */}
      <div
        className="safe-bottom"
        style={{
          flexShrink: 0,
          background: C.card, borderTop: `1px solid ${C.border}`,
          padding: '8px 8px',
        }}
      >
        {/* PTT active state */}
        {listening && (
          <div style={{
            marginBottom: 8, padding: '10px 12px',
            background: `${C.red}08`, border: `1px solid ${C.red}30`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 9, color: C.red, fontWeight: 700, letterSpacing: '0.12em',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: C.red,
                  animation: 'pulseDot 0.8s infinite',
                  display: 'inline-block',
                }} />
                LISTENING
              </span>
              <select
                value={pttDomain}
                onChange={e => setPttDomain(e.target.value)}
                style={{
                  padding: '3px 6px', background: C.surface,
                  border: `1px solid ${C.borderM}`, color: 'var(--text-muted)',
                  fontSize: 9, letterSpacing: '0.08em',
                }}
              >
                <option value="">AUTO-DOMAIN</option>
                {['FUEL','ARMING','MAINTENANCE','SORTIE','THREAT'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            {transcript && (
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
                fontStyle: 'italic', marginBottom: 8,
              }}>"{transcript}"</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handlePttSend}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '10px', background: `${C.cyan}18`, border: `1px solid ${C.cyan}40`,
                  color: C.cyan, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', cursor: 'pointer',
                }}
              >
                <PaperAirplaneIcon style={{ width: 13, height: 13 }} />
                TRANSMIT
              </button>
              <button
                onClick={() => { sttStop(); sttReset() }}
                style={{
                  padding: '10px 14px', background: C.surface,
                  border: `1px solid ${C.borderM}`, color: 'var(--text-dim)', cursor: 'pointer',
                }}
              >
                <XMarkIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}

        {/* Quick report grid */}
        {!listening && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4, marginBottom: 6,
          }}>
            {quickReports.map((qr, i) => (
              <button
                key={i}
                onClick={() => setActiveSheet(qr)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4,
                  padding: '11px 4px',
                  background: C.surface, border: `1px solid ${C.borderM}`,
                  color: 'var(--text-muted)', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', cursor: 'pointer', textAlign: 'center',
                  lineHeight: 1.3, textTransform: 'uppercase',
                }}
              >
                <qr.Icon style={{ width: 14, height: 14, color: C.cyan }} />
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* PTT / fallback */}
        {!listening && sttSupported && (
          <button
            onTouchStart={e => { e.preventDefault(); sttStart() }}
            onMouseDown={sttStart}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '13px',
              background: C.surface, border: `1px solid ${C.borderM}`,
              color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.15em', cursor: 'pointer', userSelect: 'none',
            }}
          >
            <MicrophoneIcon style={{ width: 15, height: 15, color: C.cyan }} />
            HOLD TO TALK
          </button>
        )}

        {!listening && !sttSupported && (
          <TextReportBar sendReport={sendReport} role={role} />
        )}
      </div>

      {activeSheet && (
        <ReportSheet qr={activeSheet} onSend={sendReport} onClose={() => setActiveSheet(null)} />
      )}
    </div>
  )
}

// ── Text Report Bar (STT fallback) ────────────────────────────────────────

function TextReportBar({ sendReport, role }) {
  const [text, setText]     = useState('')
  const [domain, setDomain] = useState('')

  const handleSend = () => {
    if (!text.trim()) return
    sendReport({
      domain:   domain || guessDomain(text, role),
      message:  text.trim(),
      severity: guessSeverity(text),
      tags:     ['text-report'],
    })
    setText('')
  }

  const inputStyle = {
    padding: '10px 8px',
    background: 'var(--surface-primary)', border: `1px solid ${C.borderM}`,
    color: 'var(--text-primary)', fontSize: 10, outline: 'none',
    letterSpacing: '0.05em',
  }

  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <select
        value={domain}
        onChange={e => setDomain(e.target.value)}
        style={{ ...inputStyle, width: 90 }}
      >
        <option value="">AUTO</option>
        {['FUEL','ARMING','MAINTENANCE','SORTIE','THREAT'].map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="TYPE REPORT..."
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        style={{ ...inputStyle, flex: 1 }}
      />
      <button
        onClick={handleSend}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '10px 14px',
          background: `${C.cyan}18`, border: `1px solid ${C.cyan}40`,
          color: C.cyan, cursor: 'pointer',
        }}
      >
        <PaperAirplaneIcon style={{ width: 13, height: 13 }} />
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function guessDomain(text, role) {
  const t = text.toLowerCase()
  if (t.match(/fuel|truck|convoy|jp-8|tanker|spill|delivery/))            return 'FUEL'
  if (t.match(/arm|weapon|ordnance|loadout|amraam|iris|bomb|munition/))   return 'ARMING'
  if (t.match(/maint|fault|inspect|repair|ground|hydraulic|engine/))      return 'MAINTENANCE'
  if (t.match(/threat|hostile|contact|radar|drone|movement|perimeter/))   return 'THREAT'
  if (t.match(/sortie|scramble|taxi|takeoff|landing|aircraft|pilot/))     return 'SORTIE'
  return { pad_crew: 'MAINTENANCE', convoy: 'FUEL', security: 'THREAT', pilot: 'SORTIE', hq: 'SORTIE' }[role] || 'SYSTEM'
}

function guessSeverity(text) {
  const t = text.toLowerCase()
  if (t.match(/mayday|emergency|under fire|critical|hostile|contact!/)) return 'CRITICAL'
  if (t.match(/fault|blocked|down|spill|strike|urgent/))                return 'HIGH'
  if (t.match(/update|en route|eta|reconfig/))                          return 'MEDIUM'
  return 'LOW'
}
