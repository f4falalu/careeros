import dagre from 'dagre'
import type { RFNode, RFEdge } from './types'
import { NODE_WIDTHS, NODE_HEIGHTS } from './types'

export function applyDagreLayout(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50, marginx: 20, marginy: 20 })

  nodes.forEach((n) => {
    const size = (n.data.nodeType === 'user' ? 'lg' : n.data.nodeType === 'goal' || n.data.nodeType === 'inference' ? 'sm' : 'md') as 'lg' | 'md' | 'sm'
    g.setNode(n.id, { width: NODE_WIDTHS[size], height: NODE_HEIGHTS[size] })
  })

  edges.forEach((e) => {
    g.setEdge(e.source, e.target)
  })

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    if (!pos) return n
    const size = (n.data.nodeType === 'user' ? 'lg' : n.data.nodeType === 'goal' || n.data.nodeType === 'inference' ? 'sm' : 'md') as 'lg' | 'md' | 'sm'
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTHS[size] / 2,
        y: pos.y - NODE_HEIGHTS[size] / 2,
      },
    }
  })
}
