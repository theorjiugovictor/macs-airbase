import { useState } from 'react'
import { useConversation } from '@elevenlabs/react'

const DEFAULT_AGENT_ID = 'agent_5001kknvd7a2ebcvvq9mrc85c5h4'

const AGENT_ID = (import.meta.env.VITE_ELEVENLABS_AGENT_ID || DEFAULT_AGENT_ID).trim()
const CONNECTION_TYPE = (import.meta.env.VITE_ELEVENLABS_CONNECTION_TYPE || 'webrtc').trim()
const SERVER_LOCATION = (import.meta.env.VITE_ELEVENLABS_SERVER_LOCATION || 'global').trim()
const TOKEN_ENDPOINT = (import.meta.env.VITE_ELEVENLABS_TOKEN_ENDPOINT || '').trim()
const SIGNED_URL_ENDPOINT = (import.meta.env.VITE_ELEVENLABS_SIGNED_URL_ENDPOINT || '').trim()

function normalizeVoiceText(value) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeVoiceText(item))
      .filter(Boolean)
      .join(' ')
  }

  if (value && typeof value === 'object') {
    const candidates = [
      value.text,
      value.message,
      value.transcript,
      value.user_transcript,
      value.agent_response,
      value.corrected_agent_response,
      value.content,
    ]

    for (const candidate of candidates) {
      const normalized = normalizeVoiceText(candidate)
      if (normalized) return normalized
    }

    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }

  return ''
}

function upsertMessage(prev, next) {
  const index = prev.findIndex(message => message.id === next.id)
  if (index === -1) {
    return [...prev, next].slice(-6)
  }
  return prev.map((message, i) => (i === index ? { ...message, ...next } : message))
}

async function readAuthValue(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const data = await response.json()
    return (
      data.token ||
      data.conversation_token ||
      data.conversationToken ||
      data.signed_url ||
      data.signedUrl ||
      data.url ||
      ''
    )
  }

  return (await response.text()).trim()
}

async function resolveSessionConfig() {
  if (CONNECTION_TYPE === 'webrtc' && TOKEN_ENDPOINT) {
    const response = await fetch(TOKEN_ENDPOINT, { credentials: 'include' })
    if (!response.ok) {
      throw new Error(`Token request failed with ${response.status}`)
    }
    const conversationToken = await readAuthValue(response)
    if (!conversationToken) {
      throw new Error('Token endpoint returned an empty conversation token')
    }
    return { conversationToken }
  }

  if (CONNECTION_TYPE === 'websocket' && SIGNED_URL_ENDPOINT) {
    const response = await fetch(SIGNED_URL_ENDPOINT, { credentials: 'include' })
    if (!response.ok) {
      throw new Error(`Signed URL request failed with ${response.status}`)
    }
    const signedUrl = await readAuthValue(response)
    if (!signedUrl) {
      throw new Error('Signed URL endpoint returned an empty value')
    }
    return { signedUrl }
  }

  if (!AGENT_ID) {
    throw new Error(
      'Set VITE_ELEVENLABS_AGENT_ID for a public agent or configure a private auth endpoint.'
    )
  }

  return { agentId: AGENT_ID }
}

function buildFieldAddress(roleLabel, callsign) {
  if (callsign) return callsign
  if (roleLabel) return roleLabel
  return 'field unit'
}

function buildFirstMessage(roleLabel, callsign) {
  const address = buildFieldAddress(roleLabel, callsign)
  return `${address}, MACS Voice online. State your report.`
}

function buildRoleContext(roleLabel, callsign) {
  const address = buildFieldAddress(roleLabel, callsign)
  return [
    `Current field user role: ${roleLabel || 'field unit'}.`,
    `Current field callsign: ${callsign || 'unknown'}.`,
    `Address this user as ${address}.`,
    'Do not call this user Commander or Befalhavare unless they explicitly request that title.',
  ].join(' ')
}

export function useVoiceAgent({ role, roleLabel, callsign } = {}) {
  const [messages, setMessages] = useState([])
  const [tentativeReply, setTentativeReply] = useState('')
  const [error, setError] = useState('')
  const [micMuted, setMicMuted] = useState(true)
  const [mode, setMode] = useState('listening')
  const [permissionState, setPermissionState] = useState('idle')

  const configured = Boolean(AGENT_ID || TOKEN_ENDPOINT || SIGNED_URL_ENDPOINT)

  const conversation = useConversation({
    micMuted,
    volume: 1,
    serverLocation: SERVER_LOCATION,
    onConnect: () => {
      setError('')
      setTentativeReply('')
      setMicMuted(true)
    },
    onDisconnect: () => {
      setMicMuted(true)
      setTentativeReply('')
    },
    onError: (nextError) => {
      const message = typeof nextError?.message === 'string'
        ? nextError.message
        : 'Voice session failed.'
      setError(message)
      setMicMuted(true)
    },
    onModeChange: (nextMode) => {
      setMode(nextMode)
    },
    onMessage: (message) => {
      if (message.type === 'user_transcript') {
        const transcript = normalizeVoiceText(
          message.user_transcription_event.user_transcript
        )
        if (!transcript) return

        setMessages(prev => upsertMessage(prev, {
          id: `user-${message.user_transcription_event.event_id}`,
          role: role || 'field',
          text: transcript,
        }))
        return
      }

      if (message.type === 'tentative_user_transcript') {
        const transcript = normalizeVoiceText(
          message.tentative_user_transcription_event.user_transcript
        )
        if (!transcript) return

        setMessages(prev => upsertMessage(prev, {
          id: `user-${message.tentative_user_transcription_event.event_id}`,
          role: role || 'field',
          text: transcript,
        }))
        return
      }

      if (message.type === 'agent_response') {
        const response = normalizeVoiceText(
          message.agent_response_event.agent_response
        )
        if (!response) return

        setTentativeReply('')
        setMessages(prev => upsertMessage(prev, {
          id: `agent-${message.agent_response_event.event_id}`,
          role: 'baseops',
          text: response,
        }))
        return
      }

      if (message.type === 'agent_chat_response_part') {
        const part = normalizeVoiceText(message.text_response_part.text)
        if (!part) return

        setMessages(prev => {
          const id = `agent-${message.text_response_part.event_id}`
          const existing = prev.find((entry) => entry.id === id)
          const nextText = message.text_response_part.type === 'delta' && existing
            ? `${existing.text}${part}`
            : part

          return upsertMessage(prev, {
            id,
            role: 'baseops',
            text: nextText,
          })
        })
        return
      }

      if (message.type === 'agent_response_correction') {
        const corrected = normalizeVoiceText(
          message.agent_response_correction_event.corrected_agent_response
        )
        if (!corrected) return

        setMessages(prev => upsertMessage(prev, {
          id: `agent-${message.agent_response_correction_event.event_id}`,
          role: 'baseops',
          text: corrected,
        }))
        return
      }

      if (message.type === 'internal_tentative_agent_response') {
        setTentativeReply(
          normalizeVoiceText(
            message.tentative_agent_response_internal_event.tentative_agent_response
          ) || ''
        )
      }
    },
  })

  const start = async () => {
    if (!configured) {
      setError(
        'Voice is not configured. Set VITE_ELEVENLABS_AGENT_ID or a private agent auth endpoint.'
      )
      return
    }

    try {
      setError('')
      setPermissionState('requesting')

      const sessionConfig = await resolveSessionConfig()
      const sessionOverrides = sessionConfig.overrides || {}
      await conversation.startSession({
        ...sessionConfig,
        connectionType: CONNECTION_TYPE,
        userId: callsign || role || 'field-user',
        overrides: {
          ...sessionOverrides,
          agent: {
            ...(sessionOverrides.agent || {}),
            firstMessage: buildFirstMessage(roleLabel, callsign),
          },
        },
      })
      conversation.sendContextualUpdate(buildRoleContext(roleLabel, callsign))
      setPermissionState('granted')
      setMicMuted(true)
    } catch (nextError) {
      const message = typeof nextError?.message === 'string'
        ? nextError.message
        : 'Unable to start voice session.'

      if (message.toLowerCase().includes('microphone') || message.toLowerCase().includes('permission')) {
        setPermissionState('denied')
      }
      setError(message)
      setMicMuted(true)
    }
  }

  const stop = async () => {
    try {
      await conversation.endSession()
    } finally {
      setMicMuted(true)
      setTentativeReply('')
    }
  }

  const pressToTalk = () => {
    if (conversation.status !== 'connected') return
    setMicMuted(false)
    conversation.sendUserActivity()
  }

  const releaseToTalk = () => {
    if (conversation.status !== 'connected') return
    setMicMuted(true)
  }

  return {
    configured,
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    mode,
    messages,
    tentativeReply,
    error,
    micMuted,
    permissionState,
    start,
    stop,
    pressToTalk,
    releaseToTalk,
  }
}
