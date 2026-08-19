import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  Position,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node, Edge, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PipelineNode } from '@/components/pipeline/PipelineNode';
import { MergeNode } from '@/components/pipeline/MergeNode';
import { AddNode } from '@/components/pipeline/AddNode';
import { SmoothEdge } from '@/components/pipeline/SmoothEdge';
import { NodeDetailPanel } from '@/components/pipeline/NodeDetailPanel';
import { usePipelineState } from '@/hooks/usePipelineState';
import { applyDagreLayout } from '@/utils/pipelineLayout';
import type { NodeStatus, EdgeDecision } from '@/types/pipeline';

// ─── Sidebar ─────────────────────────────────────────────────────────────────

// ─── Custom Checkbox ─────────────────────────────────────────────────────────

function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="group flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-md cursor-pointer hover:bg-white/[0.04] transition-colors">
      <button
        role="checkbox"
        aria-checked={checked}
        onClick={onChange}
        className={`
          flex items-center justify-center w-4 h-4 rounded border transition-all duration-150
          ${checked
            ? 'bg-indigo-500 border-indigo-500 shadow-sm shadow-indigo-500/30'
            : 'border-white/25 bg-white/[0.04] group-hover:border-white/40'
          }
        `}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6l2.5 2.5 4.5-5" />
          </svg>
        )}
      </button>
      <span className={`text-[13px] transition-colors ${checked ? 'text-white/90' : 'text-white/60 group-hover:text-white/80'}`}>
        {label}
      </span>
    </label>
  );
}

// ─── Collapsible Filter Section ──────────────────────────────────────────────

function FilterSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-1.5 group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45 group-hover:text-white/60 transition-colors">
          {title}
        </span>
        <svg
          className={`w-3 h-3 text-white/30 group-hover:text-white/50 transition-all duration-200 ${open ? '' : '-rotate-90'}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface RunCardData {
  label: string;
  status: 'running' | 'completed' | 'failed';
  active: boolean;
}

const RUNS: RunCardData[] = [
  { label: 'Run #001 — Loan Doc', status: 'running', active: true },
  { label: 'Run #002 — Policy Rev', status: 'completed', active: false },
  { label: 'Run #003 — Disclosure', status: 'failed', active: false },
];

const STATUS_DOT_COLOR: Record<string, string> = {
  running: 'bg-indigo-400',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-400',
};

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  // Local checkbox state (filter state — purely UI for now)
  const [statusFilters, setStatusFilters] = useState<Record<string, boolean>>({});
  const [docTypeFilters, setDocTypeFilters] = useState<Record<string, boolean>>({});
  const [playbookFilters, setPlaybookFilters] = useState<Record<string, boolean>>({});

  const toggle = (setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, key: string) => {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className={`h-full border-r border-white/[0.06] bg-[#0f1320] transition-all duration-200 flex flex-col ${
        collapsed ? 'w-12' : 'w-72'
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-center h-10 w-full border-b border-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/[0.03] transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {collapsed ? null : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search runs..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 py-2 text-[13px] text-white/80 placeholder-white/30 transition-all focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white/[0.05] hover:border-white/[0.15]"
            />
          </div>

          {/* Filters */}
          <FilterSection title="Status">
            {['Running', 'Completed', 'Failed', 'Paused'].map((s) => (
              <CustomCheckbox
                key={s}
                label={s}
                checked={!!statusFilters[s]}
                onChange={() => toggle(setStatusFilters, s)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Document Type">
            {['Loan Agreement', 'Disclosure', 'Policy Manual', 'Amendment'].map((t) => (
              <CustomCheckbox
                key={t}
                label={t}
                checked={!!docTypeFilters[t]}
                onChange={() => toggle(setDocTypeFilters, t)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Playbook">
            {['Microfinance v1', 'Consumer Lending', 'Regulatory Check'].map((p) => (
              <CustomCheckbox
                key={p}
                label={p}
                checked={!!playbookFilters[p]}
                onChange={() => toggle(setPlaybookFilters, p)}
              />
            ))}
          </FilterSection>

          {/* Recent Runs */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45 block mb-2.5">
              Recent Runs
            </span>
            <div className="space-y-2">
              {RUNS.map((run) => (
                <div
                  key={run.label}
                  className={`
                    group rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150
                    ${run.active
                      ? 'border-indigo-500/40 bg-indigo-500/[0.08] border-l-[3px] border-l-indigo-500'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                    }
                  `}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLOR[run.status] ?? 'bg-white/30'} ${run.status === 'running' ? 'animate-pulse' : ''}`} />
                    <span className={`text-[13px] font-medium truncate ${run.active ? 'text-white/90' : 'text-white/55 group-hover:text-white/75'}`}>
                      {run.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

type OverlayMode = 'none' | 'history' | 'cost';

function TopBar({ runStatus, connectionLost, overlayMode, onOverlayChange, totalCost }: {
  runStatus: string;
  connectionLost: boolean;
  overlayMode: OverlayMode;
  onOverlayChange: (mode: OverlayMode) => void;
  totalCost: string | null;
}) {
  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-white/[0.06] bg-[#0c0f1a]/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white/90">Run #001</span>
        <span className="text-white/20">·</span>
        <span className="text-sm text-white/40">Loan Agreement Analysis</span>
        {connectionLost && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Reconnecting...
          </span>
        )}
        {!connectionLost && runStatus && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
            runStatus === 'running' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
            runStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
            runStatus === 'failed' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
            'bg-amber-500/20 text-amber-300 border-amber-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              runStatus === 'running' ? 'bg-indigo-400 animate-pulse' :
              runStatus === 'completed' ? 'bg-emerald-400' :
              runStatus === 'failed' ? 'bg-rose-400' : 'bg-amber-400'
            }`} />
            {runStatus}
          </span>
        )}
        {/* Cost mode total */}
        {overlayMode === 'cost' && totalCost && (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-mono text-violet-300 border border-violet-500/25">
            Σ {totalCost}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Overlay mode toggle */}
        <div className="flex rounded-md border border-white/[0.08] overflow-hidden">
          {(['none', 'history', 'cost'] as OverlayMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onOverlayChange(mode)}
              className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                overlayMode === mode
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
              }`}
            >
              {mode === 'none' ? 'Status' : mode}
            </button>
          ))}
        </div>

        <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/20">
          Start pipeline
        </button>
      </div>
    </div>
  );
}

// ─── Node/Edge builders ──────────────────────────────────────────────────────

/**
 * Build the pipeline graph with proper DAG structure.
 * Parallel branches (match_rules / match_rules_against_sources) are expressed
 * via edges, and dagre lays them out side-by-side automatically.
 *
 * Graph topology:
 *   start → ingest → extract_text → classify_document → chunk → embed → extract_claims
 *     extract_claims → match_rules
 *     extract_claims → match_rules_against_sources
 *   match_rules → merge_findings
 *   match_rules_against_sources → merge_findings
 *   merge_findings → score_confidence → route_to_queue → human_review → finalize
 */

interface NodeDef {
  id: string;
  label: string;
  icon: string;
  type: 'stageNode' | 'mergeNode' | 'addNode';
}

const GRAPH_NODES: NodeDef[] = [
  { id: 'start', label: 'Start', icon: 'play', type: 'stageNode' },
  { id: 'ingest', label: 'Ingest', icon: 'download', type: 'stageNode' },
  { id: 'extract_text', label: 'Extract Text', icon: 'document', type: 'stageNode' },
  { id: 'classify_document', label: 'Classify', icon: 'brain', type: 'stageNode' },
  { id: 'chunk', label: 'Chunk', icon: 'document', type: 'stageNode' },
  { id: 'embed', label: 'Embed', icon: 'document', type: 'stageNode' },
  { id: 'extract_claims', label: 'Extract Claims', icon: 'search', type: 'stageNode' },
  // Parallel branch
  { id: 'match_rules', label: 'Match Rules', icon: 'search', type: 'stageNode' },
  { id: 'match_rules_against_sources', label: 'Match Sources', icon: 'search', type: 'stageNode' },
  // Convergence
  { id: 'merge_findings', label: 'Merge Findings', icon: 'merge', type: 'mergeNode' },
  { id: 'score_confidence', label: 'Score', icon: 'brain', type: 'stageNode' },
  { id: 'route_to_queue', label: 'Route to Queue', icon: 'shield', type: 'stageNode' },
  { id: 'human_review', label: 'Human Review', icon: 'shield', type: 'stageNode' },
  { id: 'finalize', label: 'Finalize', icon: 'play', type: 'stageNode' },
];

/** Edges defining the DAG structure (source → target) */
const GRAPH_EDGES: Array<[string, string]> = [
  ['start', 'ingest'],
  ['ingest', 'extract_text'],
  ['extract_text', 'classify_document'],
  ['classify_document', 'chunk'],
  ['chunk', 'embed'],
  ['embed', 'extract_claims'],
  // Parallel fan-out from extract_claims
  ['extract_claims', 'match_rules'],
  ['extract_claims', 'match_rules_against_sources'],
  // Converge into merge
  ['match_rules', 'merge_findings'],
  ['match_rules_against_sources', 'merge_findings'],
  // Continue linear
  ['merge_findings', 'score_confidence'],
  ['score_confidence', 'route_to_queue'],
  ['route_to_queue', 'human_review'],
  ['human_review', 'finalize'],
];

function buildNodes(nodeStatuses: Record<string, NodeStatus>): Node[] {
  return GRAPH_NODES.map((def) => {
    const status: NodeStatus =
      def.id === 'start'
        ? (nodeStatuses['ingest'] === 'complete' || nodeStatuses['ingest'] === 'processing')
          ? 'complete'
          : 'ready'
        : (nodeStatuses[def.id] ?? 'ready');

    return {
      id: def.id,
      type: def.type,
      // Position will be overwritten by dagre layout — placeholder
      position: { x: 0, y: 0 },
      data: { label: def.label, status, icon: def.icon },
      draggable: true,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });
}

function buildEdges(
  nodeStatuses: Record<string, NodeStatus>,
  edgeDecisions: Record<string, EdgeDecision>
): Edge[] {
  const edges: Edge[] = GRAPH_EDGES.map(([src, tgt]) => {
    const edgeId = `e-${src}-${tgt}`;
    const decision = edgeDecisions[edgeId] ?? undefined;
    return {
      id: edgeId,
      source: src,
      target: tgt,
      type: 'smoothEdge',
      data: { sourceStatus: nodeStatuses[src] ?? 'ready', decision },
    };
  });

  // Add escalation edges (visual — from failed/escalated nodes to route_to_queue)
  for (const [nodeName, status] of Object.entries(nodeStatuses)) {
    if (status === 'escalated' && nodeName !== 'route_to_queue') {
      edges.push({
        id: `e-escalate-${nodeName}-rtq`,
        source: nodeName,
        target: 'route_to_queue',
        type: 'smoothEdge',
        data: { sourceStatus: 'escalated', decision: 'escalate' as EdgeDecision },
      });
    }
  }

  return edges;
}

// ─── Mock overlay data ───────────────────────────────────────────────────────

// History mode: how many times each node has been touched by incremental updates
const MOCK_HISTORY_COUNTS: Record<string, number> = {
  ingest: 3,
  extract_text: 2,
  classify_document: 1,
  chunk: 2,
  embed: 1,
  extract_claims: 4,
  match_rules: 2,
  match_rules_against_sources: 1,
  merge_findings: 3,
  score_confidence: 1,
  route_to_queue: 2,
  human_review: 0,
  finalize: 0,
};

// Cost mode: per-node time and cost
const MOCK_COST_DATA: Record<string, { time: string; cost: string }> = {
  ingest: { time: '1.2s', cost: '$0.00' },
  extract_text: { time: '3.4s', cost: '$0.02' },
  classify_document: { time: '0.8s', cost: '$0.01' },
  chunk: { time: '0.3s', cost: '$0.00' },
  embed: { time: '2.1s', cost: '$0.04' },
  extract_claims: { time: '4.7s', cost: '$0.08' },
  match_rules: { time: '1.9s', cost: '$0.03' },
  match_rules_against_sources: { time: '2.3s', cost: '$0.05' },
  merge_findings: { time: '0.5s', cost: '$0.00' },
  score_confidence: { time: '1.1s', cost: '$0.02' },
  route_to_queue: { time: '0.2s', cost: '$0.00' },
  human_review: { time: '—', cost: '—' },
  finalize: { time: '—', cost: '—' },
};

const MOCK_TOTAL_COST = '$0.25 · 18.5s';

// ─── Main Component ──────────────────────────────────────────────────────────

export function PipelineCanvas() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState('');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none');

  // Poll real state (or mock when VITE_MOCK_API=true)
  const { nodeStatuses, edgeDecisions, recentTransitions, runState, connectionLost } = usePipelineState('run-001');

  const nodeTypes = useMemo(() => ({
    stageNode: PipelineNode,
    mergeNode: MergeNode,
    addNode: AddNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    smoothEdge: SmoothEdge,
  }), []);

  // Track which nodes just transitioned for animation
  const transitionedNodeIds = useMemo(
    () => new Set(recentTransitions.map((t) => t.nodeId)),
    [recentTransitions]
  );

  // Build edges from graph structure (pure derivation)
  const edges = useMemo(() => buildEdges(nodeStatuses, edgeDecisions), [nodeStatuses, edgeDecisions]);

  // --- Node state management ---
  // We maintain nodes in useState so drag changes persist.
  // On mount (and when topology changes), we compute layout positions.
  // On data-only changes (status, overlay), we update data without resetting positions.

  const [nodes, setNodes] = useState<Node[]>(() => {
    const raw = buildNodes(nodeStatuses);
    const laid = applyDagreLayout(raw, edges, { nodesep: 100, ranksep: 120 });
    return laid.map((node) => ({
      ...node,
      data: {
        ...node.data,
        overlayMode,
        historyCount: MOCK_HISTORY_COUNTS[node.id] ?? 0,
        costData: MOCK_COST_DATA[node.id] ?? null,
      },
    }));
  });

  // Track whether this is the initial mount
  const isInitialMount = useRef(true);

  // Update node data when pipeline status or overlay mode changes.
  // Preserves user-dragged positions by only updating `data`, not `position`.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const status: NodeStatus =
          node.id === 'start'
            ? (nodeStatuses['ingest'] === 'complete' || nodeStatuses['ingest'] === 'processing')
              ? 'complete'
              : 'ready'
            : (nodeStatuses[node.id] ?? 'ready');

        const nodeDef = GRAPH_NODES.find((n) => n.id === node.id);
        return {
          ...node,
          data: {
            label: nodeDef?.label ?? node.id,
            status,
            icon: nodeDef?.icon ?? 'document',
            justTransitioned: transitionedNodeIds.has(node.id),
            overlayMode,
            historyCount: MOCK_HISTORY_COUNTS[node.id] ?? 0,
            costData: MOCK_COST_DATA[node.id] ?? null,
          },
        };
      })
    );
  }, [nodeStatuses, transitionedNodeIds, overlayMode]);

  // Handle node changes (drag, selection, etc.) — this is what makes
  // dragging work in React Flow's controlled mode.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.id === 'start') return;
    setSelectedNodeId(node.id);
    setSelectedNodeLabel((node.data as { label?: string }).label ?? node.id);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-white overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          runStatus={runState?.run_status ?? 'running'}
          connectionLost={connectionLost}
          overlayMode={overlayMode}
          onOverlayChange={setOverlayMode}
          totalCost={overlayMode === 'cost' ? MOCK_TOTAL_COST : null}
        />

        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            className="!bg-transparent"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(255,255,255,0.04)"
            />
            <Controls
              className="!bg-[#141927] !border-white/[0.08] !rounded-lg !shadow-xl [&>button]:!bg-transparent [&>button]:!text-white/50 [&>button]:!border-white/[0.06] [&>button:hover]:!bg-white/[0.05] [&>button:hover]:!text-white/80"
              position="bottom-right"
            />
          </ReactFlow>

          {/* Detail panel overlay — NOT inside ReactFlow so it persists across mode changes */}
          <NodeDetailPanel
            nodeId={selectedNodeId}
            nodeLabel={selectedNodeLabel}
            onClose={handleClosePanel}
          />
        </div>
      </div>
    </div>
  );
}

export default PipelineCanvas;
