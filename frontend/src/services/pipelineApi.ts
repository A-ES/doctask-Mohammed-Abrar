/**
 * Pipeline API service — upload documents and start pipeline runs.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface UploadResponse {
  document_id: string;
  document_version_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface StartPipelineResponse {
  run_id: string;
  status: string;
}

export interface RunListItem {
  id: string;
  status: string;
  started_at: string;
  document_id: string | null;
  filename: string | null;
  pile_id: string | null;
  pile_name: string | null;
}

export interface NodeDetails {
  node_id: string;
  status: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  started_at: string | null;
  ended_at: string | null;
  // Node-specific fields
  extracted_text_preview?: string;
  text_length?: number;
  classification_label?: string;
  classification_confidence?: number;
  classification_scores?: Record<string, number>;
  chunk_count?: number;
  chunks_preview?: Array<{ index: number; length: number; text_preview: string }>;
  claim_count?: number;
  claims?: Array<{
    claim_id: string;
    claim_text: string;
    confidence: number;
    citation_status: string;
  }>;
  verdicts?: Array<{
    claim_id: string;
    verdict: string;
    confidence: number;
    needs_human_review: boolean;
    rule_id?: string;
  }>;
  findings?: Array<{
    claim_id?: string;
    rule_id?: string;
    verdict?: string;
    reason?: string;
    finding_type?: string;
    description?: string;
    severity?: string;
    source?: string;
  }>;
  finding_count?: number;
  queue_buckets?: {
    auto_approve: string[];
    escalate: string[];
    auto_reject: string[];
  };
  auto_approve_count?: number;
  escalate_count?: number;
  auto_reject_count?: number;
  decisions?: Array<{
    claim_id: string;
    decision_value: string;
    reviewer_id: string;
    justification: string;
  }>;
  decision_count?: number;
  mime_type?: string;
  file_size?: number;
  total_claims?: number;
  total_findings?: number;
  final_status?: string;
}

export interface RunCost {
  run_id: string;
  total_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  stages: Array<{
    stage: string;
    step_order: number;
    status: string;
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
}

/**
 * Upload a document file to the backend.
 */
export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a pipeline run on an uploaded document.
 */
export async function startPipeline(
  documentId: string,
  documentVersionId: string,
): Promise<StartPipelineResponse> {
  const response = await fetch(`${BASE_URL}/runs/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: documentId,
      document_version_id: documentVersionId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Start failed' }));
    throw new Error(error.detail || `Start failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the list of all pipeline runs.
 */
export async function fetchPipelineRuns(): Promise<RunListItem[]> {
  const response = await fetch(`${BASE_URL}/runs`);
  if (!response.ok) return [];
  return response.json();
}

/**
 * Get detailed node output for a specific node in a run.
 */
export async function fetchNodeDetails(runId: string, nodeId: string): Promise<NodeDetails> {
  const response = await fetch(`${BASE_URL}/runs/${runId}/node/${nodeId}/details`);
  if (!response.ok) {
    throw new Error(`Failed to fetch node details: ${response.status}`);
  }
  return response.json();
}

/**
 * Get cost breakdown for a pipeline run.
 */
export async function fetchRunCost(runId: string): Promise<RunCost> {
  const response = await fetch(`${BASE_URL}/runs/${runId}/cost`);
  if (!response.ok) {
    throw new Error(`Failed to fetch run cost: ${response.status}`);
  }
  return response.json();
}

export interface HistoryEntry {
  event_id: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  source_document_id: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown>;
}

export interface RunHistory {
  run_id: string;
  entries: HistoryEntry[];
  total: number;
}

export interface ResumeRunResponse {
  run_id: string;
  status: string;
  resumed_from: string | null;
  next_node: string | null;
}

/**
 * Get the full change history (audit trail) for a pipeline run.
 */
export async function fetchRunHistory(runId: string): Promise<RunHistory> {
  const response = await fetch(`${BASE_URL}/runs/${runId}/history`);
  if (!response.ok) {
    throw new Error(`Failed to fetch run history: ${response.status}`);
  }
  return response.json();
}

/**
 * Resume a paused/interrupted/cancelled pipeline run from its last checkpoint.
 */
export async function resumeRun(runId: string): Promise<ResumeRunResponse> {
  const response = await fetch(`${BASE_URL}/runs/${runId}/resume`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Resume failed' }));
    throw new Error(error.detail || `Resume failed: ${response.status}`);
  }
  return response.json();
}

// ─── Piles API ───────────────────────────────────────────────────────────────

export interface PileListItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
  document_count: number;
}

export interface PileDocumentItem {
  document_id: string;
  filename: string;
  mime_type: string;
  added_at: string;
}

export interface PileDetail {
  id: string;
  name: string;
  status: string;
  created_at: string;
  documents: PileDocumentItem[];
}

export interface UploadToPileResponse {
  pile_id: string;
  uploaded: Array<{
    document_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
  }>;
  errors: string[];
}

/**
 * List all active piles.
 */
export async function fetchPiles(): Promise<PileListItem[]> {
  const response = await fetch(`${BASE_URL}/piles`);
  if (!response.ok) return [];
  return response.json();
}

/**
 * Create a new pile.
 */
export async function createPile(name: string): Promise<{ id: string; name: string }> {
  const response = await fetch(`${BASE_URL}/piles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create pile' }));
    throw new Error(error.detail || `Create pile failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get pile details including its documents.
 */
export async function fetchPileDetail(pileId: string): Promise<PileDetail> {
  const response = await fetch(`${BASE_URL}/piles/${pileId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pile: ${response.status}`);
  }
  return response.json();
}

/**
 * Upload one or more files into a pile.
 */
export async function uploadToPile(pileId: string, files: File[]): Promise<UploadToPileResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await fetch(`${BASE_URL}/piles/${pileId}/documents`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || `Upload to pile failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a pipeline run against a pile (using its first document for now).
 */
export async function startPipelineWithPile(
  documentId: string,
  documentVersionId: string,
  pileId: string,
): Promise<StartPipelineResponse> {
  const response = await fetch(`${BASE_URL}/runs/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: documentId,
      document_version_id: documentVersionId,
      pile_id: pileId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Start failed' }));
    throw new Error(error.detail || `Start failed: ${response.status}`);
  }

  return response.json();
}
