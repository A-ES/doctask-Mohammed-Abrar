import { useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  Position,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { PipelineNode } from '@/components/pipeline/PipelineNode';
import { MergeNode } from '@/components/pipeline/MergeNode';
import { AddNode } from '@/components/pipeline/AddNode';
import { SmoothEdge } from '@/components/pipeline/SmoothEdge';
import { usePipelineState } from '@/hooks/usePipelineState';
import type { NodeStatus, EdgeDecision } from '@/types/pipeline';

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
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
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <input
              type="text"
              placeholder="Search runs..."
              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Status</h3>
            <div className="space-y-1.5">
              {['Running', 'Completed', 'Failed', 'Paused'].map((status) => (
                <label key={status} className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30 h-3.5 w-3.5" />
                  {status}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Document Type</h3>
            <div className="space-y-1.5">
              {['Loan Agreement', 'Disclosure', 'Policy Manual', 'Amendment'].map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30 h-3.5 w-3.5" />
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Playbook</h3>
            <div className="space-y-1.5">
              {['Microfinance v1', 'Consumer Lending', 'Regulatory Check'].map((pb) => (
                <label key={pb} className="flex items-center gap-2 text-sm text-white/60 hover:text-white/80 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30 h-3.5 w-3.5" />
                  {pb}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Recent Runs</h3>
            <div className="space-y-2">
              {['Run #001 — Loan Doc', 'Run #002 — Policy Rev', 'Run #003 — Disclosure'].map((run, i) => (
                <div
                  key={run}
                  className={`rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    i === 0
                      ? 'border-indigo-500/30 bg-indigo-500/[0.06] text-white/90'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/70'
                  }`}
                >
                  {run}
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

function TopBar({ runStatus, connectionLost }: { runStatus: string; connectionLost: boolean }) {
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
      </div>
      <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/20">
        Start pipeline
      </button>
    </div>
  );
}

// ─── Node/Edge builders ──────────────────────────────────────────────────────

const NODE_ICONS: Record<string, string> = {
  ingest: 'download',
  extract_text: 'document',
  classify_document: 'brain',
  chunk: 'document',
  embed: 'document',
  extract_claims: 'search',
  match_rules: 'search',
  match_rules_against_sources: 'search',
  merge_findings: 'merge',
  score_confidence: 'brain',
  route_to_queue: 'shield',
  human_review: 'shield',
  finalize: 'play',
};

const NODE_LABELS: Record<string, string> = {
  ingest: 'Ingest',
  extract_text: 'Extract Text',
  classify_document: 'Classify',
  chunk: 'Chunk',
  embed: 'Embed',
  extract_claims: 'Extract Claims',
  match_rules: 'Match Rules',
  match_rules_against_sources: 'Match Sources',
  merge_findings: 'Merge Findings',
  score_confidence: 'Score',
  route_to_queue: 'Route to Queue',
  human_review: 'Human Review',
  finalize: 'Finalize',
};

// Layout: 3 ingest nodes fan out, then linear sequence
function buildNodes(nodeStatuses: Record<string, NodeStatus>): Node[] {
  const nodes: Node[] = [];

  // Start trigger node
  nodes.push({
    id: 'start',
    type: 'stageNode',
    position: { x: 400, y: 0 },
    data: { label: 'Start', status: (nodeStatuses['ingest'] === 'complete' || nodeStatuses['ingest'] === 'processing') ? 'complete' : 'ready' as NodeStatus, icon: 'play' },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });

  // Ingest (single node now — the real pipeline has one ingest)
  nodes.push({
    id: 'ingest',
    type: 'stageNode',
    position: { x: 400, y: 110 },
    data: { label: 'Ingest', status: nodeStatuses['ingest'] ?? 'ready', icon: 'download' },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });

  // Sequential nodes after ingest
  const sequentialNodes: string[] = [
    'extract_text', 'classify_document', 'chunk', 'embed',
    'extract_claims', 'match_rules', 'match_rules_against_sources',
    'merge_findings', 'score_confidence', 'route_to_queue',
    'human_review', 'finalize',
  ];

  let y = 220;

  for (const nodeName of sequentialNodes) {
    // Add "+" affordance node between stages (every 3 nodes for key transition points)
    const isTransitionPoint = ['extract_claims', 'route_to_queue', 'finalize'].includes(nodeName);
    if (isTransitionPoint) {
      nodes.push({
        id: `add-before-${nodeName}`,
        type: 'addNode',
        position: { x: 400, y },
        data: { label: '+', status: 'ready' as NodeStatus, icon: '' },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
      y += 70;
    }

    nodes.push({
      id: nodeName,
      type: nodeName === 'merge_findings' ? 'mergeNode' : 'stageNode',
      position: { x: 400, y },
      data: {
        label: NODE_LABELS[nodeName] ?? nodeName,
        status: nodeStatuses[nodeName] ?? 'ready',
        icon: NODE_ICONS[nodeName] ?? 'document',
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });

    y += 100;
  }

  return nodes;
}

function buildEdges(
  nodeStatuses: Record<string, NodeStatus>,
  edgeDecisions: Record<string, EdgeDecision>
): Edge[] {
  const edges: Edge[] = [];

  // Start → ingest
  edges.push({
    id: 'e-start-ingest',
    source: 'start',
    target: 'ingest',
    type: 'smoothEdge',
    data: { sourceStatus: nodeStatuses['ingest'] === 'complete' ? 'complete' : 'ready' },
  });

  // Sequential edges
  const allNodes = [
    'ingest', 'extract_text', 'classify_document', 'chunk', 'embed',
    'extract_claims', 'match_rules', 'match_rules_against_sources',
    'merge_findings', 'score_confidence', 'route_to_queue',
    'human_review', 'finalize',
  ];

  for (let i = 0; i < allNodes.length - 1; i++) {
    const src = allNodes[i];
    const tgt = allNodes[i + 1];
    const edgeId = `e-${src}-${tgt}`;

    // Check if there's a routing decision for this edge
    const decision = edgeDecisions[edgeId] ?? undefined;

    // Handle "+" add nodes between stages
    const isTransitionTarget = ['extract_claims', 'route_to_queue', 'finalize'].includes(tgt);
    if (isTransitionTarget) {
      const addId = `add-before-${tgt}`;
      edges.push({
        id: `e-${src}-${addId}`,
        source: src,
        target: addId,
        type: 'smoothEdge',
        data: { sourceStatus: nodeStatuses[src], decision },
      });
      edges.push({
        id: `e-${addId}-${tgt}`,
        source: addId,
        target: tgt,
        type: 'smoothEdge',
        data: { sourceStatus: nodeStatuses[src] },
      });
    } else {
      edges.push({
        id: edgeId,
        source: src,
        target: tgt,
        type: 'smoothEdge',
        data: { sourceStatus: nodeStatuses[src], decision },
      });
    }
  }

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

// ─── Main Component ──────────────────────────────────────────────────────────

export function PipelineCanvas() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Poll real state (or mock when VITE_MOCK_API=true)
  const { nodeStatuses, edgeDecisions, runState, connectionLost } = usePipelineState('run-001');

  const nodeTypes = useMemo(() => ({
    stageNode: PipelineNode,
    mergeNode: MergeNode,
    addNode: AddNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    smoothEdge: SmoothEdge,
  }), []);

  const nodes = useMemo(() => buildNodes(nodeStatuses), [nodeStatuses]);
  const edges = useMemo(() => buildEdges(nodeStatuses, edgeDecisions), [nodeStatuses, edgeDecisions]);

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-white overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar runStatus={runState?.run_status ?? 'running'} connectionLost={connectionLost} />

        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            edgesFocusable={false}
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
        </div>
      </div>
    </div>
  );
}

export default PipelineCanvas;
