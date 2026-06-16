'use client'
import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { BaseEdge, EdgeLabelRenderer, getStraightPath } from 'reactflow'
import type { EdgeProps } from 'reactflow'
import type { KGEdgeData } from './types'

function KGEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps<KGEdgeData>) {
  const [hovered, setHovered] = useState(false)
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const conf = data?.confidence ?? 1
  const isPathHighlighted = data?.isPathHighlighted ?? false
  const isNew = data?.isNew ?? false

  const edgeStyle = {
    ...style,
    stroke: isPathHighlighted ? '#f59e0b' : '#d1d5db',
    strokeWidth: isPathHighlighted ? 2.5 : 1.5,
    opacity: conf * 0.7 + 0.3,
    transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s',
  }

  return (
    <>
      {/* Invisible wide hit area for hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'default' }}
      />

      {/* Fix 5 (Req 25): stroke-dashoffset draw animation for new edges */}
      {isNew ? (
        <motion.path
          id={id}
          d={edgePath}
          fill="none"
          strokeLinecap="round"
          className="react-flow__edge-path"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={edgeStyle}
        />
      ) : (
        <BaseEdge id={id} path={edgePath} style={edgeStyle} />
      )}

      {hovered && data?.relationship && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#6b7280',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                padding: '1px 5px',
                whiteSpace: 'nowrap',
                letterSpacing: '0.03em',
              }}
            >
              {data.relationship}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const KGCustomEdge = memo(KGEdgeComponent)

export const edgeTypes = {
  kgEdge: KGCustomEdge,
}
