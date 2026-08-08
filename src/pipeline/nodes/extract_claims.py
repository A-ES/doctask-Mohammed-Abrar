"""Extract claims node — identifies factual assertions from document chunks.

This is the first node of the Examine Stage. It processes each chunk through
an LLM to identify discrete factual assertions (e.g., "APR is 24%",
"processing fee is 500 PHP"), producing ExtractionResult entries with claim
text, source location (chunk_index, start/end offsets where start < end),
and a preliminary confidence score.

Empty claims list (no claims found in any chunk) is a valid "completed"
outcome, not an error.
"""

from __future__ import annotations

from typing import Optional, Protocol

from src.pipeline.state import ChunkEntry, ExtractionResult, PipelineState


class ClaimExtractor(Protocol):
    """Protocol for extracting factual claims from chunk text via LLM."""

    async def extract(self, chunk_text: str, chunk_index: int) -> list[ExtractionResult]:
        """Extract factual claims from a single chunk of text.

        Args:
            chunk_text: The text content of the chunk to analyze.
            chunk_index: The index of the chunk in the document.

        Returns:
            List of ExtractionResult entries found in this chunk.
            May be empty if no claims are identified.

        Raises:
            Exception: If the LLM API call fails (timeout, rate-limit,
                connection error).
        """
        ...


async def extract_claims(
    state: PipelineState,
    *,
    extractor: Optional[ClaimExtractor] = None,
) -> PipelineState:
    """Identify factual assertions from document chunks via LLM.

    Processes each chunk through the claim extractor to identify discrete
    factual assertions. On success (including empty results), sets
    node_status="completed". On LLM API failure, returns a transient error.

    Args:
        state: The current pipeline state containing chunks and config.
        extractor: Optional ClaimExtractor implementation (dependency injection).
            If None, the node cannot proceed and returns a transient error.

    Returns:
        Updated PipelineState with claims, current_node, node_status,
        and completed_nodes set appropriately.
    """
    chunks: list[ChunkEntry] = state.get("chunks", [])

    # Validate dependency is provided
    if extractor is None:
        return _error_state(
            state,
            error_detail="Claim extractor service not provided",
        )

    # Process each chunk through the LLM extractor
    all_claims: list[ExtractionResult] = []
    try:
        for chunk in chunks:
            chunk_claims = await extractor.extract(chunk["text"], chunk["index"])
            all_claims.extend(chunk_claims)
    except Exception as exc:
        return _error_state(
            state,
            error_detail=f"LLM API failure: {exc}",
        )

    # Success — claims extracted (may be empty list)
    completed_nodes = list(state.get("completed_nodes", []))
    completed_nodes.append("extract_claims")

    return PipelineState(
        **{
            **state,
            "claims": all_claims,
            "current_node": "extract_claims",
            "node_status": "completed",
            "error_type": None,
            "error_detail": None,
            "completed_nodes": completed_nodes,
        }
    )


def _error_state(state: PipelineState, *, error_detail: str) -> PipelineState:
    """Return a transient error state for the extract_claims node.

    All extract_claims errors are transient — LLM API failures are retryable.
    """
    return PipelineState(
        **{
            **state,
            "current_node": "extract_claims",
            "node_status": "error",
            "error_type": "transient",
            "error_detail": error_detail,
            "completed_nodes": list(state.get("completed_nodes", [])),
        }
    )
