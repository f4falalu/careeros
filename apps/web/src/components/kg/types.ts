import type { Node, Edge } from 'reactflow'
import type { KGNode, KGEdge } from '@/lib/api'

export type { KGNode, KGEdge }

export interface KGNodeData {
  nodeType: string
  label: string
  metadata: Record<string, unknown>
  isExpanded: boolean
  isLoading: boolean
  hasError: boolean
  isPathHighlighted: boolean
  isSearchMatch: boolean | null
  isPulsing: boolean
  isEntering: boolean
  hasNoConnections: boolean
}

export interface KGEdgeData {
  relationship: string
  confidence: number
  evidence: unknown[]
  isPathHighlighted: boolean
  isNew: boolean
}

export type RFNode = Node<KGNodeData>
export type RFEdge = Edge<KGEdgeData>

export const NODE_TYPE_STYLES: Record<string, { color: string; bg: string; size: 'lg' | 'md' | 'sm' }> = {
  user:       { color: '#6366f1', bg: '#eef2ff', size: 'lg' },
  skill:      { color: '#10b981', bg: '#ecfdf5', size: 'md' },
  project:    { color: '#3b82f6', bg: '#eff6ff', size: 'md' },
  experience: { color: '#8b5cf6', bg: '#f5f3ff', size: 'md' },
  company:    { color: '#6b7280', bg: '#f9fafb', size: 'md' },
  opportunity:{ color: '#f59e0b', bg: '#fffbeb', size: 'md' },
  goal:       { color: '#eab308', bg: '#fefce8', size: 'sm' },
  inference:  { color: '#06b6d4', bg: '#ecfeff', size: 'sm' },
}

export const NODE_WIDTHS = { lg: 140, md: 120, sm: 100 }
export const NODE_HEIGHTS = { lg: 60, md: 50, sm: 42 }

export function truncateLabel(label: string, max = 38): string {
  return label.length > max ? label.slice(0, max) + '…' : label
}

export function getEntityPath(nodeType: string, nodeId: string): string | null {
  const map: Record<string, string> = {
    project:     `/profile?tab=projects`,
    experience:  `/profile?tab=experience`,
    opportunity: `/opportunities/${nodeId}`,
    company:     `/companies/${nodeId}`,
    resume:      `/resume`,
    vvp:         `/vvp/${nodeId}`,
    interview:   `/interviews`,
  }
  return map[nodeType] ?? null
}
