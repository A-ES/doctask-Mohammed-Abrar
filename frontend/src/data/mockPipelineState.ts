import type { PipelineRunState } from '@/types/pipeline';

// Shows all status variants for visual verification
export const mockRunState: PipelineRunState = {
  start: 'complete',
  ingest_pdf: 'complete',
  ingest_api: 'complete',
  ingest_manual: 'processing',
  merge: 'ready',
  understand: 'ready',
  examine: 'ready',
  stay_alive: 'ready',
};
