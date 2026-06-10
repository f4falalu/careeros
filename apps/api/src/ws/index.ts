import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { IncomingMessage } from 'http'
import Redis from 'ioredis'
import { config } from '../config.js'

export function createWsHub(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', `http://localhost`)
    const token = url.searchParams.get('token')

    if (token !== config.appSecret) {
      ws.close(4001, 'Unauthorized')
      return
    }

    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })

  // Subscribe to Redis for task updates, broadcast to all connected clients
  const sub = new Redis(config.redisUrl)
  sub.subscribe('ws:task-update', (err) => {
    if (err) console.error('[ws] Redis subscribe error:', err)
  })

  sub.on('message', (_channel: string, message: string) => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  })

  sub.on('error', (err) => {
    console.error('[ws] Redis pub/sub error:', err)
  })

  return wss
}
