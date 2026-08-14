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
import { mockRunState } from '@/data/mockPipelineState';
import type { NodeStatus } from '@/types/pipeline';

// Collapsible sidebar component
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className={`h-full border-r border-white/[0.06] bg-[#0f1320] transition-all duration-200 flex flex-col ${
        collapsed ? 'w-12' : 'w-72'
      }`}
    >
      {/* Toggle button */}
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
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search runs..."
              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {/* Filter: Status */}
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

          {/* Filter: Document Type */}
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

          {/* Filter: Playbook */}
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

          {/* Run list placeholder */}
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

// Top bar component
function TopBar() {
  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-white/[0.06] bg-[#0c0f1a]/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white/90">Run #001</span>
        <span className="text-white/20">·</span>
        <span className="text-sm text-white/40">Loan Agreement Analysis</span>
      </div>
      <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/20">
        Start pipeline
      </button>
    </div>
  );
}

// Build nodes from run state
function buildNodes(runState: typeof mockRunState): Node[] {
  return [
    {
      id: 'start',
      type: 'stageNode',
      position: { x: 400, y: 0 },
      data: { label: 'Start', status: runState.start as NodeStatus, icon: 'play' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'ingest_pdf',
      type: 'ingestNode',
      position: { x: 200, y: 120 },
      data: { label: 'Ingest PDF', status: runState.ingest_pdf as NodeStatus, icon: 'document' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'ingest_api',
      type: 'ingestNode',
      position: { x: 400, y: 120 },
      data: { label: 'Ingest API', status: runState.ingest_api as NodeStatus, icon: 'download' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'ingest_manual',
      type: 'ingestNode',
      position: { x: 600, y: 120 },
      data: { label: 'Ingest Manual', status: runState.ingest_manual as NodeStatus, icon: 'document' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'merge',
      type: 'mergeNode',
      position: { x: 400, y: 260 },
      data: { label: 'Merge', status: runState.merge as NodeStatus, icon: 'merge' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'understand',
      type: 'stageNode',
      position: { x: 400, y: 380 },
      data: { label: 'Understand', status: runState.understand as NodeStatus, icon: 'brain' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'add_1',
      type: 'addNode',
      position: { x: 400, y: 470 },
      data: { label: '+', status: 'ready' as NodeStatus, icon: '' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'examine',
      type: 'stageNode',
      position: { x: 400, y: 540 },
      data: { label: 'Examine', status: runState.examine as NodeStatus, icon: 'search' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'add_2',
      type: 'addNode',
      position: { x: 400, y: 630 },
      data: { label: '+', status: 'ready' as NodeStatus, icon: '' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
    {
      id: 'stay_alive',
      type: 'stageNode',
      position: { x: 400, y: 700 },
      data: { label: 'Stay-Alive', status: runState.stay_alive as NodeStatus, icon: 'shield' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    },
  ];
}

// Build edges from run state
function buildEdges(runState: typeof mockRunState): Edge[] {
  return [
    // Start to ingest nodes
    { id: 'e-start-pdf', source: 'start', target: 'ingest_pdf', type: 'smoothEdge', data: { sourceStatus: runState.start } },
    { id: 'e-start-api', source: 'start', target: 'ingest_api', type: 'smoothEdge', data: { sourceStatus: runState.start } },
    { id: 'e-start-manual', source: 'start', target: 'ingest_manual', type: 'smoothEdge', data: { sourceStatus: runState.start } },
    // Ingest to merge
    { id: 'e-pdf-merge', source: 'ingest_pdf', target: 'merge', type: 'smoothEdge', data: { sourceStatus: runState.ingest_pdf } },
    { id: 'e-api-merge', source: 'ingest_api', target: 'merge', type: 'smoothEdge', data: { sourceStatus: runState.ingest_api } },
    { id: 'e-manual-merge', source: 'ingest_manual', target: 'merge', type: 'smoothEdge', data: { sourceStatus: runState.ingest_manual } },
    // Merge to understand
    { id: 'e-merge-understand', source: 'merge', target: 'understand', type: 'smoothEdge', data: { sourceStatus: runState.merge } },
    // Understand to add_1
    { id: 'e-understand-add1', source: 'understand', target: 'add_1', type: 'smoothEdge', data: { sourceStatus: runState.understand } },
    // add_1 to examine
    { id: 'e-add1-examine', source: 'add_1', target: 'examine', type: 'smoothEdge', data: { sourceStatus: 'ready' } },
    // Examine to add_2
    { id: 'e-examine-add2', source: 'examine', target: 'add_2', type: 'smoothEdge', data: { sourceStatus: runState.examine } },
    // add_2 to stay_alive
    { id: 'e-add2-stay', source: 'add_2', target: 'stay_alive', type: 'smoothEdge', data: { sourceStatus: 'ready' } },
  ];
}

export function PipelineCanvas() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const nodeTypes = useMemo(() => ({
    stageNode: PipelineNode,
    ingestNode: PipelineNode,
    mergeNode: MergeNode,
    addNode: AddNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    smoothEdge: SmoothEdge,
  }), []);

  const nodes = useMemo(() => buildNodes(mockRunState), []);
  const edges = useMemo(() => buildEdges(mockRunState), []);

  return (
    <div className="flex h-screen w-screen bg-[#0b0f19] text-white overflow-hidden">
      {/* Left sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            edgesFocusable={false}
            fitView
            fitViewOptions={{ padding: 0.3 }}
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
