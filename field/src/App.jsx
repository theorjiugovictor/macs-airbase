/**
 * MACS Field App — Mobile-first field intelligence app.
 *
 * Features:
 *   - Role-based authentication
 *   - Quick-tap reports (one thumb operable)
 *   - Live AI-directed actions feed
 *   - Threat level indicator
 *   - Custom report with text input
 *
 * All icons via lucide-react (MIT) — no emoji.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useField } from './useField'
import {
  Plane, PlaneLanding, Droplets, Crosshair, Wrench, Radar, Globe,
  Truck, Shield, Radio, Eye, Zap, CheckCircle2, AlertTriangle,
  RefreshCw, Ban, Volume2, ClipboardList, Scale, MessageSquare,
  Send, Circle, Feather, Target,
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

// Quick report buttons per role
const QUICK_REPORTS = {
  pad_crew: [
    { Icon: Droplets, label: 'Refuel Done', domain: 'FUEL', message: 'Refueling complete.', severity: 'LOW' },
    { Icon: Crosshair, label: 'Armed', domain: 'ARMING', message: 'Arming complete, weapons safe.', severity: 'LOW' },
    { Icon: Wrench, label: 'Fault Found', domain: 'MAINTENANCE', message: 'Fault detected during inspection.', severity: 'HIGH' },
    { Icon: CheckCircle2, label: 'Inspection OK', domain: 'MAINTENANCE', message: 'Pre-flight inspection complete. Aircraft serviceable.', severity: 'LOW' },
    { Icon: AlertTriangle, label: 'Spill', domain: 'FUEL', message: 'Fuel spill at pad. Cleanup required.', severity: 'HIGH' },
    { Icon: RefreshCw, label: 'Loadout Swap', domain: 'ARMING', message: 'Loadout reconfiguration in progress.', severity: 'MEDIUM' },
  ],
  convoy: [
    { Icon: Truck, label: 'ETA Update', domain: 'FUEL', message: 'Convoy en route.', severity: 'MEDIUM' },
    { Icon: Ban, label: 'Road Blocked', domain: 'FUEL', message: 'Road blocked. Rerouting.', severity: 'HIGH' },
    { Icon: AlertTriangle, label: 'Under Fire', domain: 'FUEL', message: 'Convoy under fire! Requesting support.', severity: 'CRITICAL' },
    { Icon: CheckCircle2, label: 'Delivered', domain: 'FUEL', message: 'Fuel delivery complete.', severity: 'LOW' },
    { Icon: Wrench, label: 'Truck Down', domain: 'FUEL', message: 'Vehicle breakdown. Need recovery.', severity: 'HIGH' },
  ],
  security: [
    { Icon: Eye, label: 'Movement', domain: 'THREAT', message: 'Movement spotted on perimeter.', severity: 'HIGH' },
    { Icon: Zap, label: 'Contact', domain: 'THREAT', message: 'Contact! Hostile activity at perimeter.', severity: 'CRITICAL' },
    { Icon: CheckCircle2, label: 'All Clear', domain: 'THREAT', message: 'Sector clear. No threats observed.', severity: 'LOW' },
    { Icon: Volume2, label: 'Acoustic', domain: 'THREAT', message: 'Unusual acoustic signature detected.', severity: 'AMBER' },
    { Icon: Target, label: 'Drone', domain: 'THREAT', message: 'Possible drone activity overhead.', severity: 'HIGH' },
  ],
  pilot: [
    { Icon: Plane, label: 'Ready', domain: 'SORTIE', message: 'Aircraft ready for taxi.', severity: 'LOW' },
    { Icon: Feather, label: 'Bird Strike', domain: 'SORTIE', message: 'Bird strike on approach. Inspecting damage.', severity: 'HIGH' },
    { Icon: Crosshair, label: 'Weapons Exp.', domain: 'SORTIE', message: 'Weapons expended. RTB.', severity: 'MEDIUM' },
    { Icon: AlertTriangle, label: 'Emergency', domain: 'SORTIE', message: 'Declaring emergency.', severity: 'CRITICAL' },
    { Icon: PlaneLanding, label: 'Recovered', domain: 'SORTIE', message: 'Aircraft recovered at pad.', severity: 'LOW' },
  ],
  hq: [
    { Icon: ClipboardList, label: 'Tasking', domain: 'SORTIE', message: 'New tasking order from COMJFAC.', severity: 'HIGH' },
    { Icon: Radio, label: 'Intel', domain: 'THREAT', message: 'Intelligence update from higher HQ.', severity: 'MEDIUM' },
    { Icon: Scale, label: 'ROE Change', domain: 'SORTIE', message: 'ROE update issued.', severity: 'HIGH' },
    { Icon: RefreshCw, label: 'Redirect', domain: 'SORTIE', message: 'Redirect sortie to new tasking.', severity: 'HIGH' },
  ],
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
          onClick={() => onSelect(r.id, `${r.id.toUpperCase()}-${String(Math.floor(Math.random() * 9) + 1).padStart(1, '0')}`)}
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

// ── Event Card ─────────────────────────────────────────────────────────────

function EventCard({ event }) {
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

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: event.severity === 'CRITICAL' ? '#1c0a0a' : '#111827',
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
              background: badge.bg, color: badge.color,
              fontWeight: 600,
            }}>{badge.text}</span>
          )}
          {isDirected && (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: '#f59e0b22', color: '#f59e0b',
              fontWeight: 600,
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
  const [token, setToken] = useState(null)

  const handleRoleSelect = (roleId, callsign) => {
    setSelectedRole(roleId)
    const simpleToken = btoa(JSON.stringify({ role: roleId, callsign, exp: Date.now() / 1000 + 86400 }))
    setToken(simpleToken)
  }

  if (!selectedRole) {
    return <RoleSelect onSelect={handleRoleSelect} />
  }

  return <FieldDashboard role={selectedRole} token={token} />
}


function FieldDashboard({ role, token }) {
  const { events, connected, role: authRole, callsign, sendReport, lastReportId } = useField(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customMsg, setCustomMsg] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [customSeverity, setCustomSeverity] = useState('MEDIUM')
  const [reportFeedback, setReportFeedback] = useState(null)
  const feedRef = useRef(null)

  const activeRole = role

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events])

  // Flash feedback on report sent
  useEffect(() => {
    if (lastReportId) {
      setReportFeedback(lastReportId)
      const t = setTimeout(() => setReportFeedback(null), 3000)
      return () => clearTimeout(t)
    }
  }, [lastReportId])

  const quickReports = QUICK_REPORTS[activeRole] || []

  const handleQuickReport = (qr) => {
    sendReport({
      domain: qr.domain,
      message: qr.message,
      severity: qr.severity,
      tags: ['quick-report'],
    })
  }

  const handleCustomReport = () => {
    if (!customMsg.trim() || !customDomain) return
    sendReport({
      domain: customDomain,
      message: customMsg.trim(),
      severity: customSeverity,
      tags: ['custom-report'],
    })
    setCustomMsg('')
    setShowCustom(false)
  }

  // Threat level from events
  const threatLevel = useMemo(() => {
    const threat = events
      .filter(e => e.domain === 'THREAT' && e.payload?.threat_level)
      .slice(-1)
    return threat.length > 0 ? threat[0].payload.threat_level : 'GREEN'
  }, [events])

  const threatColor = threatLevel === 'RED' ? '#ef4444' : threatLevel === 'AMBER' ? '#f59e0b' : '#4ade80'

  const roleInfo = ROLES.find(r => r.id === activeRole)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1f2937',
        background: '#0d1117',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plane size={16} />
            <span style={{ fontSize: 16, fontWeight: 800 }}>MACS</span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 9999,
              background: `${threatColor}22`, color: threatColor,
              border: `1px solid ${threatColor}44`,
              fontWeight: 600,
            }}>
              {threatLevel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {roleInfo?.label}
          </span>
          {reportFeedback && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: '#4ade80', marginLeft: 'auto',
            }}>
              <CheckCircle2 size={12} /> Sent {reportFeedback}
            </span>
          )}
        </div>
      </header>

      {/* Event Feed */}
      <div ref={feedRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {events.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: '#4b5563', textAlign: 'center', padding: 40, fontSize: 13,
          }}>
            <Plane size={16} />
            {connected ? 'Waiting for activity...' : 'Connecting...'}
          </div>
        ) : (
          events.slice(-50).map(e => <EventCard key={e.id} event={e} />)
        )}
      </div>

      {/* Quick Report Buttons */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid #1f2937',
        background: '#0d1117', padding: '8px 10px',
      }}>
        {showCustom ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={customDomain}
                onChange={e => setCustomDomain(e.target.value)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 6,
                  background: '#111827', border: '1px solid #1f2937',
                  color: '#e5e7eb', fontSize: 13,
                }}
              >
                <option value="">Domain...</option>
                {['FUEL', 'ARMING', 'MAINTENANCE', 'SORTIE', 'THREAT'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={customSeverity}
                onChange={e => setCustomSeverity(e.target.value)}
                style={{
                  width: 100, padding: '10px 8px', borderRadius: 6,
                  background: '#111827', border: '1px solid #1f2937',
                  color: '#e5e7eb', fontSize: 13,
                }}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Type your report..."
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomReport()}
                autoFocus
                style={{
                  flex: 1, padding: '12px 10px', borderRadius: 6,
                  background: '#111827', border: '1px solid #1f2937',
                  color: '#e5e7eb', fontSize: 14, outline: 'none',
                }}
              />
              <button
                onClick={handleCustomReport}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '12px 16px', borderRadius: 6,
                  background: '#3b82f6', border: 'none',
                  color: 'white', cursor: 'pointer',
                }}
              ><Send size={18} /></button>
            </div>
            <button
              onClick={() => setShowCustom(false)}
              style={{
                padding: '8px', borderRadius: 6,
                background: 'transparent', border: '1px solid #1f2937',
                color: '#6b7280', fontSize: 12, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 6,
            }}>
              {quickReports.map((qr, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickReport(qr)}
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
            <button
              onClick={() => setShowCustom(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '12px', borderRadius: 8,
                background: '#1f2937', border: '1px solid #374151',
                color: '#9ca3af', fontSize: 13, cursor: 'pointer',
              }}
            >
              <MessageSquare size={14} /> Custom Report...
            </button>
          </>
        )}
      </div>
    </div>
  )
}
