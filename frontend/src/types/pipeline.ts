export type NodeStatus = 'ready' | 'processing' | 'complete' | 'escalated' | 'failed';

export interface PipelineRunState {
  start: NodeStatus;
  ingest_pdf: NodeStatus;
  ingest_api: NodeStatus;
  ingest_manual: NodeStatus;
  merge: NodeStatus;
  understand: NodeStatus;
  examine: NodeStatus;
  stay_alive: NodeStatus;
}
