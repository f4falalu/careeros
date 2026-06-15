'use client'
import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { KGNodeData } from './types'
import { NODE_TYPE_STYLES, NODE_WIDTHS, NODE_HEIGHTS, truncateLabel } from './types'

function KGNodeComponent({ data, selected }: NodeProps<KGNodeData>) {
  const style = NODE_TYPE_STYLES[data.nodeType] ?? { color: '#9ca3af', bg: '#f9fafb', size: 'md' as const }
  const size = style.size
  const w = NODE_WIDTHS[size]
  const h = NODE_HEIGHTS[size]
  const short = truncateLabel(data.label)

  const borderColor = selected ? style.color : data.hasError ? '#ef4444' : 'transparent'
  const ringColor = data.isPathHighlighted ? '#f59e0b' : selected ? style.color : undefined

  return (
    <div
      title={data.label}
      style={{
        width: w,
        height: h,
        backgroundColor: style.bg,
        border: `2px solid ${borderColor !== 'transparent' ? borderColor : '#e5e7eb'}`,
        boxShadow: ringColor ? `0 0 0 3px ${ringColor}66` : selected ? `0 0 0 2px ${style.color}44` : undefined,
        borderRadius: data.nodeType === 'user' ? 14 : 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s, opacity 0.15s',
        opacity: data.isSearchMatch === false ? 0.2 : 1,
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />

      {/* Type label */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: style.color,
          opacity: 0.8,
          lineHeight: 1,
          marginBottom: 3,
        }}
      >
        {data.nodeType}
      </span>

      {/* Main label */}
      <span
        style={{
          fontSize: size === 'lg' ? 13 : size === 'md' ? 11.5 : 10.5,
          fontWeight: data.nodeType === 'user' ? 700 : 600,
          color: '#111827',
          textAlign: 'center',
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}
      >
        {short}
      </span>

      {/* Loading spinner */}
      {data.isLoading && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            border: `1.5px solid ${style.color}`,
            borderTopColor: 'transparent',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}

      {/* Error ring */}
      {data.hasError && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#ef4444',
          }}
        />
      )}

      {/* Expanded indicator */}
      {data.isExpanded && (
        <span
          style={{
            position: 'absolute',
            bottom: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 12,
            height: 2,
            borderRadius: 1,
            backgroundColor: style.color,
            opacity: 0.5,
          }}
        />
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}

export const KGCustomNode = memo(KGNodeComponent)

export const nodeTypes = {
  kgNode: KGCustomNode,
}
