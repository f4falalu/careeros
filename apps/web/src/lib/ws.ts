'use client'
import { useEffect, useRef } from 'react'
import type { AgentTask } from '@/types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'
const APP_SECRET = process.env.NEXT_PUBLIC_APP_SECRET ?? ''

export function useAgentTaskStream(onTask: (task: AgentTask) => void) {
  const cbRef = useRef(onTask)
  cbRef.current = onTask

  useEffect(() => {
    let ws: WebSocket
    let retryTimer: ReturnType<typeof setTimeout>
    let unmounted = false

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(APP_SECRET)}`)

      ws.onmessage = (e) => {
        try {
          const task = JSON.parse(e.data as string) as AgentTask
          cbRef.current(task)
        } catch {
          // ignore non-JSON frames
        }
      }

      ws.onclose = () => {
        if (!unmounted) {
          retryTimer = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      unmounted = true
      clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
