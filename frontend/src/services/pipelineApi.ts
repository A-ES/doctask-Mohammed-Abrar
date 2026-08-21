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
