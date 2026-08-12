"""Extract claims node — identifies factual assertions from document chunks.

This is the first node of the Examine Stage. It processes each chunk through
an LLM to identify discrete factual assertions (e.g., "APR is 24%",
"processing fee is 500 PHP"), producing ExtractionResult entries with claim
text, source location (chunk_index, start/end offsets where start < end),
and a preliminary confidence score.

When a classification_label is present and maps to a type-specific extractor
in the EXTRACTOR_REGISTRY, the node dispatches to that extractor and converts
ExtractedFacts to ExtractionResult entries. Otherwise, it falls back to the
generic ClaimExtractor-based extraction.

Empty claims list (no claims found in any chunk) is a valid "completed"
outcome, not an error.
"""

from __future__ import annotations

import logging
from typing import Optional, Protocol

from src.pipeline.extractors.base import ExtractedFact
from src.pipeline.extractors.registry import EXTRACTOR_REGISTRY
from src.pipeline.source_linker import SourceLinker
from src.pipeline.state import ChunkEntry, ExtractionResult, PipelineState

logger = logging.getLogger(__name__)


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


def _convert_fact_to_extraction_result(
    fact: ExtractedFact,
    document_type: str,
    idx: int,
) -> ExtractionResult:
    """Convert an ExtractedFact to an ExtractionResult for downstream compatibility.

    Args:
        fact: The extracted fact to convert.
        document_type: The classification label (used in claim_id prefix).
        idx: Index for unique claim_id generation.

    Returns:
        An ExtractionResult entry compatible with the pipeline state.
    """
    return ExtractionResult(
        claim_id=f"{document_type}.{fact.field_name}_{idx}",
        claim_text=f"{fact.field_name}: {fact.value}",
        chunk_index=0,
        start_offset=fact.source_span.start_offset,
        end_offset=fact.source_span.end_offset,
        confidence=fact.confidence,
    )


async def _dispatch_type_specific(
    state: PipelineState,
    document_type: str,
) -> list[ExtractionResult]:
    """Dispatch extraction to a type-specific extractor.

    Instantiates the extractor from the registry, runs extraction, attaches
    source pointers (skipping facts with invalid spans), and converts results
    to ExtractionResult entries.

    Args:
        state: The current pipeline state.
        document_type: The classification label to dispatch on.

    Returns:
        List of ExtractionResult entries from type-specific extraction.
    """
    extractor_class = EXTRACTOR_REGISTRY[document_type]
    extractor_instance = extractor_class()

    extracted_text = state.get("extracted_text") or ""
    chunks = state.get("chunks", [])
    # Convert ChunkEntry TypedDicts to plain dicts for the FactExtractor protocol
    chunk_dicts = [dict(c) for c in chunks]

    facts: list[ExtractedFact] = await extractor_instance.extract(extracted_text, chunk_dicts)

    source_linker = SourceLinker()
    document_version_id = state.get("document_version_id", "")

    results: list[ExtractionResult] = []
    for idx, fact in enumerate(facts):
        # Attempt to attach source pointer; skip on invalid spans
        try:
            source_linker.attach(fact, document_version_id)
        except ValueError:
            logger.warning(
                "Skipping source pointer attachment for fact %s.%s_%d: "
                "invalid span (%d:%d)",
                document_type,
                fact.field_name,
                idx,
                fact.source_span.start_offset,
                fact.source_span.end_offset,
            )
            # Still include the fact in results, just without source attachment

        results.append(_convert_fact_to_extraction_result(fact, document_type, idx))

    return results


async def extract_claims(
    state: PipelineState,
    *,
    extractor: Optional[ClaimExtractor] = None,
) -> PipelineState:
    """Identify factual assertions from document chunks via LLM.

    If classification_label is in EXTRACTOR_REGISTRY, dispatches to the
    type-specific extractor and converts ExtractedFacts to ExtractionResult
    entries. Otherwise, falls back to the generic ClaimExtractor-based
    extraction.

    On success (including empty results), sets node_status="completed".
    On LLM API failure, returns a transient error.

    Args:
        state: The current pipeline state containing chunks and config.
        extractor: Optional ClaimExtractor implementation (dependency injection).
            Used as fallback for unclassified/unknown document types.
            If None and no type-specific extractor applies, returns transient error.

    Returns:
        Updated PipelineState with claims, current_node, node_status,
        and completed_nodes set appropriately.
    """
    classification_label = state.get("classification_label")

    # Type-specific dispatch path
    if classification_label and classification_label in EXTRACTOR_REGISTRY:
        try:
            all_claims = await _dispatch_type_specific(state, classification_label)
        except Exception as exc:
            return _error_state(
                state,
                error_detail=f"LLM API failure: {exc}",
            )

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

    # Fallback: generic extraction for unclassified or unknown types
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
