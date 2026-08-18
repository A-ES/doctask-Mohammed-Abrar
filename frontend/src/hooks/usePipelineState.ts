/**
 * Hook to poll pipeline run state and derive node statuses + edge decisions.
 * Drives the canvas directly from LangGraph checkpointer state.
 * Falls back to mock data when VITE_MOCK_API=true or API unavailable.
 *
 * KEY DESIGN: State diffing — only signals transitions when node statuses
 * actually change. Animations fire on genuine state transitions, not on
 * every poll tick that returns the same data.
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

export interface NodeTransition {
  nodeId: string;
  from: NodeStatus;
  to: NodeStatus;
  timestamp: number;
}

export interface DerivedPipelineView {
  nodeStatuses: Record<string, NodeStatus>;
  edgeDecisions: Record<string, EdgeDecision>;
  /** Nodes whose status changed on the most recent poll (empty if no change) */
  recentTransitions: NodeTransition[];
  runState: PipelineRunState | null;
  isPolling: boolean;
  error: Error | null;
  connectionLost: boolean;
}

function deriveNodeStatus(
  nodeName: string,
  state: PipelineRunState
): NodeStatus {
  if (state.completed_nodes.includes(nodeName)) return 'complete';
  if (state.skipped_nodes.some((s) => s.node_name === nodeName)) return 'skipped';

  if (state.current_node === nodeName) {
    if (state.node_status === 'error') {
      const retryCount = state.retries[nodeName] ?? 0;
      if (retryCount > 0 && state.error_type === 'transient') return 'retrying';
      return 'failed';
    }
    return 'processing';
  }

  if (state.retries[nodeName] && state.retries[nodeName] >= 3) return 'escalated';
  return 'ready';
}

function deriveEdgeDecisions(state: PipelineRunState): Record<string, EdgeDecision> {
  const decisions: Record<string, EdgeDecision> = {};

  for (const [nodeName, count] of Object.entries(state.retries)) {
    if (count > 0) {
      decisions[`retry-${nodeName}`] = 'retry';
    }
  }

  for (const skipped of state.skipped_nodes) {
    const nodeIdx = PIPELINE_NODES.indexOf(skipped.node_name as typeof PIPELINE_NODES[number]);
    if (nodeIdx > 0) {
      const prevNode = PIPELINE_NODES[nodeIdx - 1];
      decisions[`e-${prevNode}-${skipped.node_name}`] = 'skip';
    }
  }

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
  const [recentTransitions, setRecentTransitions] = useState<NodeTransition[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const prevStatusesRef = useRef<Record<string, NodeStatus>>({});

  const poll = useCallback(async () => {
    if (!runId) return;
    setIsPolling(true);
    try {
      const state = await fetchRunState(runId);
      if (!mountedRef.current) return;

      // Derive new statuses
      const newStatuses: Record<string, NodeStatus> = {};
      for (const node of PIPELINE_NODES) {
        newStatuses[node] = deriveNodeStatus(node, state);
      }

      // Diff against previous — only emit transitions for actual changes
      const transitions: NodeTransition[] = [];
      const prevStatuses = prevStatusesRef.current;
      for (const node of PIPELINE_NODES) {
        const prev = prevStatuses[node];
        const next = newStatuses[node];
        if (prev !== undefined && prev !== next) {
          transitions.push({ nodeId: node, from: prev, to: next, timestamp: Date.now() });
        }
      }

      // Update ref for next diff
      prevStatusesRef.current = newStatuses;

      // Only update transitions state if there are actual changes
      if (transitions.length > 0) {
        setRecentTransitions(transitions);
        // Clear transitions after animation duration (500ms)
        setTimeout(() => {
          if (mountedRef.current) setRecentTransitions([]);
        }, 500);
      }

      setRunState(state);
      setError(null);
      setConnectionLost(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setConnectionLost(true);
    } finally {
      if (mountedRef.current) setIsPolling(false);
    }
  }, [runId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!runId) return;
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runId, poll]);

  // Derive current view
  const nodeStatuses: Record<string, NodeStatus> = {};
  const edgeDecisions: Record<string, EdgeDecision> = {};

  if (runState) {
    for (const node of PIPELINE_NODES) {
      nodeStatuses[node] = deriveNodeStatus(node, runState);
    }
    Object.assign(edgeDecisions, deriveEdgeDecisions(runState));
  } else {
    for (const node of PIPELINE_NODES) {
      nodeStatuses[node] = 'ready';
    }
  }

  return { nodeStatuses, edgeDecisions, recentTransitions, runState, isPolling, error, connectionLost };
}
