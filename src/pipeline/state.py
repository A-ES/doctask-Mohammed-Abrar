"""Pipeline state schema and supporting types for the LangGraph pipeline."""

from typing import Literal, Optional, TypedDict

# --- Type Literals ---

NodeStatus = Literal["completed", "skipped", "error"]
ErrorType = Literal["transient", "permanent"]
Verdict = Literal["compliant", "non_compliant", "indeterminate"]
DecisionValue = Literal["approved", "rejected"]


# --- Supporting TypedDicts ---


class ChunkEntry(TypedDict):
    """A single chunk of extracted text with positional metadata."""

    index: int
    text: str
    start_offset: int
    end_offset: int


class ExtractionResult(TypedDict):
    """A claim extracted from a chunk with source location and confidence."""

    claim_id: str
    claim_text: str
    chunk_index: int
    start_offset: int
    end_offset: int
    confidence: float  # 0.0–1.0


class ComplianceVerdict(TypedDict):
    """The compliance assessment for a single claim."""

    claim_id: str
    verdict: Verdict
    confidence: float  # 0.0–1.0
    needs_human_review: bool
    rule_id: Optional[str]
    evidence_refs: list[str]


class Decision(TypedDict):
    """A human reviewer's decision on an escalated claim."""

    claim_id: str
    approval_queue_id: str
    decision_value: DecisionValue
    reviewer_id: str
    justification: str


class SkippedNodeEntry(TypedDict):
    """Record of a node that was skipped during pipeline execution."""

    node_name: str
    reason: str


class PipelineConfig(TypedDict):
    """Configuration parameters frozen at run creation time."""

    max_retries: int  # default: 3
    chunk_max_size: int  # default: 1000 characters
    chunk_overlap: int  # default: 200 characters
    confidence_threshold: float  # default: 0.7
    review_timeout_hours: int  # default: 72
    reminder_interval_hours: int  # default: 24
    poll_interval_seconds: int  # default: 30
    extract_text_timeout_seconds: int  # default: 60
    min_chunk_threshold: int  # default: 200 characters


class QueueBuckets(TypedDict):
    """Partitioned claim IDs for the Stay-Alive stage."""

    auto_approve: list[str]  # claim IDs
    escalate: list[str]  # claim IDs
    auto_reject: list[str]  # claim IDs


# --- Main Pipeline State ---


class PipelineState(TypedDict):
    """The full state that flows through the LangGraph pipeline.

    This TypedDict is the single source of truth for a pipeline run's progress.
    It accumulates results from each node and is serialized to JSONB at checkpoint
    boundaries.
    """

    # Identity
    run_id: str  # UUID as string for JSON serialization
    document_id: str  # UUID as string
    document_version_id: str  # UUID as string

    # Execution tracking
    current_node: str
    node_status: NodeStatus
    error_type: Optional[ErrorType]
    error_detail: Optional[str]
    retries: dict[str, int]  # node_name → retry count
    skipped_nodes: list[SkippedNodeEntry]
    completed_nodes: list[str]  # ordered list of completed/skipped node names

    # Configuration
    config: PipelineConfig

    # Understand Stage outputs
    raw_content: Optional[bytes]  # serialized as base64 string in JSONB
    mime_type: Optional[str]
    extracted_text: Optional[str]
    chunks: list[ChunkEntry]
    embeddings_stored: bool

    # Examine Stage outputs
    claims: list[ExtractionResult]
    verdicts: list[ComplianceVerdict]

    # Stay-Alive Stage outputs
    queue_buckets: QueueBuckets
    decisions: list[Decision]


# --- Factory Function ---


def create_initial_state(
    run_id: str,
    document_id: str,
    document_version_id: str,
    config: PipelineConfig,
) -> PipelineState:
    """Create a valid initial PipelineState with all defaults.

    Args:
        run_id: UUID string identifying this pipeline run.
        document_id: UUID string identifying the document being processed.
        document_version_id: UUID string identifying the specific document version.
        config: Frozen pipeline configuration for this run.

    Returns:
        A PipelineState with all fields initialized to their default values,
        ready to begin pipeline execution.
    """
    return PipelineState(
        # Identity
        run_id=run_id,
        document_id=document_id,
        document_version_id=document_version_id,
        # Execution tracking
        current_node="",
        node_status="completed",
        error_type=None,
        error_detail=None,
        retries={},
        skipped_nodes=[],
        completed_nodes=[],
        # Configuration
        config=config,
        # Understand Stage outputs
        raw_content=None,
        mime_type=None,
        extracted_text=None,
        chunks=[],
        embeddings_stored=False,
        # Examine Stage outputs
        claims=[],
        verdicts=[],
        # Stay-Alive Stage outputs
        queue_buckets=QueueBuckets(
            auto_approve=[],
            escalate=[],
            auto_reject=[],
        ),
        decisions=[],
    )
