/**
 * MACS About Page — Team info in military tactical HUD style.
 */

import { ArrowLeftIcon } from '@heroicons/react/24/solid'

const C = {
  surfacePrimary: 'hsl(220, 50%, 5%)',
  surfaceCard: 'hsl(220, 40%, 8%)',
  surfaceHover: 'hsl(220, 35%, 12%)',
  textPrimary: 'hsl(210, 20%, 90%)',
  textMuted: 'hsl(215, 15%, 60%)',
  textDim: 'hsl(215, 10%, 40%)',
  accent: '#06b6d4',
}

const TEAM = [
  {
    name: 'Jady Pamella',
    linkedin: 'https://www.linkedin.com/in/jadypamella/',
    github: 'https://github.com/jadypamella',
    photo: '/field/img/team/jady.jpg',
    initials: 'JP',
  },
  {
    name: 'Prince Victor',
    linkedin: 'https://www.linkedin.com/in/theorjiugovictor/',
    github: 'https://github.com/theorjiugovictor',
    photo: '/field/img/team/prince.jpg',
    initials: 'PV',
  },
  {
    name: 'Ludvig Elverskog',
    linkedin: 'https://www.linkedin.com/in/ludde-elverskog/',
    github: 'https://github.com/gutamuw',
    photo: '/field/img/team/ludvig.jpg',
    initials: 'LE',
  },
  {
    name: 'Supun Chathurana',
    linkedin: 'https://www.linkedin.com/in/supun-chathuranga-190372148/',
    github: 'https://github.com/IamSupun',
    photo: '/field/img/team/supun.jpg',
    initials: 'SC',
  },
  {
    name: 'Riyad Mehdiyev',
    linkedin: 'https://www.linkedin.com/in/riyad-mehdiyev/',
    github: 'https://github.com/RiyadMehdi7',
    photo: '/field/img/team/riyad.jpg',
    initials: 'RM',
  },
]

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  )
}

function Avatar({ member }) {
  const [imgError, setImgError] = useState(false)

  if (!imgError) {
    return (
      <img
        src={member.photo}
        alt={member.name}
        onError={() => setImgError(true)}
        style={{
          width: 64, height: 64, borderRadius: '50%',
          objectFit: 'cover',
          border: `2px solid ${C.accent}44`,
        }}
      />
    )
  }

  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: `${C.accent}22`,
      border: `2px solid ${C.accent}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color: C.accent,
      letterSpacing: '0.05em',
    }}>
      {member.initials}
    </div>
  )
}

import { useState } from 'react'

export default function About({ onBack }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: C.surfacePrimary, overflowY: 'auto',
    }}>
      {/* Header */}
      <header style={{
        padding: '8px 12px', borderBottom: `1px solid rgba(255,255,255,0.05)`,
        background: C.surfaceCard, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', background: 'none', border: 'none',
          color: C.textDim, cursor: 'pointer', padding: 2,
        }}>
          <ArrowLeftIcon style={{ width: 14, height: 14 }} />
        </button>
        <img src="/field/img/macs_logo_white.png" alt="MACS" style={{ height: 18, objectFit: 'contain' }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: C.textMuted,
        }}>
          About
        </span>
      </header>

      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Project description */}
        <div style={{
          background: C.surfaceCard, border: `1px solid rgba(255,255,255,0.07)`,
          padding: '16px',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: C.accent, marginBottom: 10,
          }}>
            // MISSION BRIEF
          </div>
          <p style={{
            color: C.textMuted, fontSize: 11, lineHeight: 1.7, margin: 0,
          }}>
            MACS (Multi-Agent Command System) is an AI-powered field intelligence platform
            built for airbase operations. It coordinates autonomous agents across domains —
            sortie planning, fuel management, arming, maintenance, threat assessment,
            and logistics — providing real-time situational awareness via a tactical
            voice interface and live event feed.
          </p>
        </div>

        {/* Team section */}
        <div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: C.accent, marginBottom: 12,
          }}>
            // TEAM
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TEAM.map(member => (
              <div
                key={member.name}
                style={{
                  background: C.surfaceCard, border: `1px solid rgba(255,255,255,0.07)`,
                  padding: '14px', display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <Avatar member={member} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 12, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: C.textPrimary, marginBottom: 8,
                  }}>
                    {member.name}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', textDecoration: 'none',
                        padding: '4px 8px',
                        background: `${C.accent}15`,
                        border: `1px solid ${C.accent}33`,
                        color: C.accent,
                      }}
                    >
                      <LinkedInIcon />
                      LinkedIn
                    </a>
                    <a
                      href={member.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', textDecoration: 'none',
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid rgba(255,255,255,0.12)`,
                        color: C.textMuted,
                      }}
                    >
                      <GitHubIcon />
                      GitHub
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Built at */}
        <div style={{
          textAlign: 'center', padding: '12px 0',
          borderTop: `1px solid rgba(255,255,255,0.05)`,
        }}>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Built at Anthropic Hackathon · 2025
          </div>
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>
            Powered by Claude · ElevenLabs · React
          </div>
        </div>
      </div>
    </div>
  )
}
