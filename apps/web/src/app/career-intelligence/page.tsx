'use client'
import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ReactFlowProvider } from 'reactflow'
import { useQuery } from '@tanstack/react-query'
import { Map, Zap, FileText, Lightbulb, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { KGExplorer } from '@/components/kg/KGExplorer'
import { SkillsTab } from '@/components/kg/tabs/SkillsTab'
import { EvidenceTab } from '@/components/kg/tabs/EvidenceTab'
import { InsightsTab } from '@/components/kg/tabs/InsightsTab'
import { PathsTab } from '@/components/kg/tabs/PathsTab'

type Tab = 'map' | 'skills' | 'evidence' | 'insights' | 'paths'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'map',      label: 'Career Map',  icon: Map },
  { id: 'skills',   label: 'Skills',      icon: Zap },
  { id: 'evidence', label: 'Evidence',    icon: FileText },
  { id: 'insights', label: 'Insights',    icon: Lightbulb },
  { id: 'paths',    label: 'Paths',       icon: GitBranch },
]

export default function CareerIntelligencePage() {
  const searchParams = useSearchParams()
  // pathTo may be an opportunity entityId (from match badge link)
  const pathToEntityId = searchParams.get('pathTo') ?? undefined
  // search pre-populates the explorer's search box (from Copilot entity chips)
  const initialSearch = searchParams.get('search') ?? undefined

  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [jumpToNodeId, setJumpToNodeId] = useState<string | undefined>(undefined)
  const [resolvedPathTo, setResolvedPathTo] = useState<string | undefined>(undefined)

  // Resolve entityId → graph node id
  const { data: subgraphForResolution } = useQuery({
    queryKey: ['kg-subgraph-root'],
    queryFn: () => api.graph.subgraph({ depth: 1 }),
    staleTime: 60_000,
    enabled: !!pathToEntityId,
  })

  useEffect(() => {
    if (!pathToEntityId || !subgraphForResolution) return
    const matched = subgraphForResolution.nodes.find(
      (n) => n.entityId === pathToEntityId || n.id === pathToEntityId,
    )
    if (matched) setResolvedPathTo(matched.id)
  }, [pathToEntityId, subgraphForResolution])

  // When Skills/Insights tab wants to explore a node in the graph
  const handleExploreNode = useCallback((nodeId: string) => {
    setJumpToNodeId(nodeId)
    setActiveTab('map')
    setTimeout(() => setJumpToNodeId(undefined), 500)
  }, [])

  // When Paths tab requests path animation, switch to map tab
  const handleAnimatePath = useCallback((_path: string[]) => {
    setActiveTab('map')
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in">
      {/* Page header + tab bar */}
      <div className="flex-none border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="px-6 pt-4 pb-0 flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-text)]">Career Intelligence</h1>
            <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
              Your Living Career Graph — explore connections, evidence, and insights
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-0.5 px-5 mt-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'border-[var(--color-text)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              <Icon size={13} strokeWidth={activeTab === id ? 2 : 1.5} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Career Map tab — full height React Flow canvas */}
        <div className={cn('h-full', activeTab !== 'map' && 'hidden')}>
          <ReactFlowProvider>
            <KGExplorer
              initialPathTo={resolvedPathTo}
              jumpToNodeId={jumpToNodeId}
              initialSearch={initialSearch}
            />
          </ReactFlowProvider>
        </div>

        {/* Scrollable tabs */}
        {activeTab !== 'map' && (
          <div className="h-full overflow-y-auto">
            {activeTab === 'skills' && (
              <SkillsTab onExploreNode={handleExploreNode} />
            )}
            {activeTab === 'evidence' && (
              <EvidenceTab />
            )}
            {activeTab === 'insights' && (
              <InsightsTab onExploreNode={handleExploreNode} />
            )}
            {activeTab === 'paths' && (
              <PathsTab onAnimatePath={handleAnimatePath} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
