/**
 * Hook to poll pipeline run state and derive node statuses + edge decisions.
 * Drives the canvas directly from LangGraph checkpointer state.
 * Falls back to mock data when VITE_MOCK_API=true or API unavailable.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { NodeStatus, EdgeDecision, PipelineRunState } from '@/types/pipeline';
import { PIPELINE_NODES } from '@/types/pipeline';

const USE_MOCK = import.meta.env.VITE_MOCK_API === 'true';
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const POLL_INTERVAL = 3000;

// Mock state for dev mode
const MOCK_STATE: PipelineRunState = {
  run_id: 'run-001',
  current_node: 'extract_claims',
  node_status: 'completed',
  completed_nodes: ['ingest', 'extract_text', 'classify_document', 'chunk', 'embed'],
  skipped_nodes: [],
  retries: { extract_text: 1 },
  error_type: null,
  error_detail: null,
  run_status: 'running',
};

export interface DerivedPipelineView {
  nodeStatuses: Record<string, NodeStatus>;
  edgeDecisions: Record<string, EdgeDecision>;
  runState: PipelineRunState | null;
  isPolling: boolean;
  error: Error | null;
  connectionLost: boolean;
}

function deriveNodeStatus(
  nodeName: string,
  state: PipelineRunState
): NodeStatus {
  // Check completed
  if (state.completed_nodes.includes(nodeName)) return 'complete';

  // Check skipped
  if (state.skipped_nodes.some((s) => s.node_name === nodeName)) return 'skipped';

  // Check if current node
  if (state.current_node === nodeName) {
    if (state.node_status === 'error') {
      // Check if retrying
      const retryCount = state.retries[nodeName] ?? 0;
      if (retryCount > 0 && state.error_type === 'transient') return 'retrying';
      return 'failed';
    }
    // Active/processing
    return 'processing';
  }

  // Check if node has been escalated (errored and flow went to route_to_queue)
  // Heuristic: if a node has retries at max and isn't completed/current, it was escalated
  if (state.retries[nodeName] && state.retries[nodeName] >= 3) return 'escalated';

  return 'ready';
}

function deriveEdgeDecisions(state: PipelineRunState): Record<string, EdgeDecision> {
  const decisions: Record<string, EdgeDecision> = {};

  // Check for retries — show retry edges
  for (const [nodeName, count] of Object.entries(state.retries)) {
    if (count > 0) {
      decisions[`retry-${nodeName}`] = 'retry';
    }
  }

  // Check for skipped nodes — edge into them is "skip"
  for (const skipped of state.skipped_nodes) {
    const nodeIdx = PIPELINE_NODES.indexOf(skipped.node_name as typeof PIPELINE_NODES[number]);
    if (nodeIdx > 0) {
      const prevNode = PIPELINE_NODES[nodeIdx - 1];
      decisions[`e-${prevNode}-${skipped.node_name}`] = 'skip';
    }
  }

  // Check for escalation — if a node failed and flow went to route_to_queue
  if (state.node_status === 'error' && state.current_node !== 'route_to_queue') {
    decisions[`e-${state.current_node}-route_to_queue`] = 'escalate';
  }

  return decisions;
}

async function fetchRunState(runId: string): Promise<PipelineRunState> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100));
    return MOCK_STATE;
  }

  const response = await fetch(`${BASE_URL}/runs/${runId}/state`);
  if (!response.ok) throw new Error(`Failed to fetch run state: ${response.status}`);
  return response.json();
}

export function usePipelineState(runId: string | null): DerivedPipelineView {
  const [runState, setRunState] = useState<PipelineRunState | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!runId) return;
    setIsPolling(true);
    try {
      const state = await fetchRunState(runId);
      if (!mountedRef.current) return;
      setRunState(state);
      setError(null);
      setConnectionLost(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setConnectionLost(true);
      // Keep existing state — don't clear on error
    } finally {
      if (mountedRef.current) setIsPolling(false);
    }
  }, [runId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!runId) return;

    // Initial fetch
    poll();

    // Start polling
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runId, poll]);

  // Derive view from state
  const nodeStatuses: Record<string, NodeStatus> = {};
  const edgeDecisions: Record<string, EdgeDecision> = {};

  if (runState) {
    for (const node of PIPELINE_NODES) {
      nodeStatuses[node] = deriveNodeStatus(node, runState);
    }
    Object.assign(edgeDecisions, deriveEdgeDecisions(runState));
  } else {
    // Default all to ready when no state
    for (const node of PIPELINE_NODES) {
      nodeStatuses[node] = 'ready';
    }
  }

  return { nodeStatuses, edgeDecisions, runState, isPolling, error, connectionLost };
}
