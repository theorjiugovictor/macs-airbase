/**
 * useAlerts — Push notifications + audio ping for critical events.
 *
 * - Requests Notification permission once (on mount)
 * - Fires an OS-level push notification for CRITICAL / HIGH events
 * - Plays a short synthesised ping via Web Audio API (no file needed)
 *
 * Usage:
 *   const { notify } = useAlerts()
 *   // call notify(event) for each new live event you want to alert on
 */

import { useRef, useEffect, useCallback, useState } from 'react'

// ── Web Audio ping generator ────────────────────────────────────────────

let _audioCtx = null

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioCtx
}

/**
 * Play a pronounced alert tone.
 * @param {'critical'|'high'|'info'} level — controls pitch & pattern
 */
function playPing(level = 'high') {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime

    if (level === 'critical') {
      // CRITICAL: Urgent triple-beep klaxon — loud, attention-grabbing
      const freqs = [880, 0, 880, 0, 1100]  // beep-pause-beep-pause-higher beep
      const beepLen = 0.15
      const gapLen = 0.08
      let t = now
      for (const freq of freqs) {
        if (freq === 0) { t += gapLen; continue }
        // Main tone
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'  // harsher, more urgent than sine
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.45, t)
        gain.gain.setValueAtTime(0.45, t + beepLen * 0.7)
        gain.gain.exponentialRampToValueAtTime(0.001, t + beepLen)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + beepLen + 0.02)
        // Harmonic layer for richness
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.value = freq * 1.5  // fifth harmonic
        gain2.gain.setValueAtTime(0.15, t)
        gain2.gain.exponentialRampToValueAtTime(0.001, t + beepLen)
        osc2.connect(gain2).connect(ctx.destination)
        osc2.start(t)
        osc2.stop(t + beepLen + 0.02)
        t += beepLen + gapLen
      }
    } else {
      // HIGH: Two-tone alert chime — clear, distinct
      const tones = [660, 880]  // ascending two-note chime
      let t = now
      for (const freq of tones) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'  // warm but audible
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.4, t)
        gain.gain.setValueAtTime(0.35, t + 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.28)
        t += 0.2
      }
    }
  } catch {
    // Audio not available — silently ignore
  }
}

// ── Browser Notification helper ─────────────────────────────────────────

function showNotification(event) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const sev = event.severity || 'INFO'
  const domain = event.domain || ''
  const source = event.source || ''
  const msg = event.payload?.message || event.event_type || ''

  const title = `${sev === 'CRITICAL' ? '🔴' : '🟡'} ${domain} — ${source}`
  const body = msg.length > 150 ? msg.slice(0, 147) + '...' : msg

  try {
    const n = new Notification(title, {
      body,
      icon: '/field/img/favicon.png',
      badge: '/field/img/favicon.png',
      tag: event.id || `macs-${Date.now()}`,   // collapse duplicate alerts
      renotify: true,
      requireInteraction: sev === 'CRITICAL',   // CRITICAL stays until dismissed
      silent: true,                              // we play our own sound
    })
    // Auto-close HIGH after 6s (CRITICAL stays)
    if (sev !== 'CRITICAL') {
      setTimeout(() => n.close(), 6000)
    }
  } catch {
    // Notification failed — silently ignore
  }
}

// ── Severity check ──────────────────────────────────────────────────────

function isAlertWorthy(event) {
  if (!event || !event.severity) return false
  const sev = event.severity.toUpperCase()
  return sev === 'CRITICAL' || sev === 'HIGH' || sev === 'AMBER'
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useAlerts() {
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const seenRef = useRef(new Set())

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(p => setPermissionState(p))
    }
  }, [])

  // Unlock AudioContext on first user gesture (iOS/Chrome autoplay policy)
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getAudioCtx()
        if (ctx.state === 'suspended') ctx.resume()
      } catch { /* ignore */ }
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('click', unlock)
    }
    window.addEventListener('touchstart', unlock, { once: true })
    window.addEventListener('click', unlock, { once: true })
    return () => {
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('click', unlock)
    }
  }, [])

  /**
   * Fire notification + ping for a single event.
   * Deduplicated — calling twice with same event.id is safe.
   */
  const notify = useCallback((event) => {
    if (!event || !event.id) return
    if (seenRef.current.has(event.id)) return
    seenRef.current.add(event.id)

    // Keep the seen set bounded
    if (seenRef.current.size > 500) {
      const arr = [...seenRef.current]
      seenRef.current = new Set(arr.slice(-250))
    }

    if (!isAlertWorthy(event)) return

    const level = event.severity?.toUpperCase() === 'CRITICAL' ? 'critical' : 'high'
    playPing(level)
    showNotification(event)
  }, [])

  return { notify, permissionState }
}
