"""Unit tests for the extract_claims node.

Tests cover:
- Successful extraction with claims found
- Successful extraction with no claims (empty list, still "completed")
- Transient error on LLM API failure
- That each ExtractionResult has start_offset < end_offset
- That completed_nodes includes "extract_claims" on success
- That completed_nodes does NOT include "extract_claims" on error
"""

import pytest

from src.pipeline.config import load_config
from src.pipeline.nodes.extract_claims import ClaimExtractor, extract_claims
from src.pipeline.state import (
    ChunkEntry,
    ExtractionResult,
    PipelineState,
    create_initial_state,
)


# --- Mock implementations ---


class MockClaimExtractor:
    """Mock claim extractor that returns predetermined claims per chunk."""

    def __init__(
        self,
        *,
        claims_per_chunk: dict[int, list[ExtractionResult]] | None = None,
        should_fail: bool = False,
        fail_message: str = "LLM API timeout",
        fail_on_chunk_index: int | None = None,
    ):
        """Initialize the mock extractor.

        Args:
            claims_per_chunk: Mapping from chunk_index to list of claims to return.
                If None, returns empty list for all chunks.
            should_fail: If True, raise an exception on every call.
            fail_message: The exception message to use when failing.
            fail_on_chunk_index: If set, fail only on this specific chunk index.
        """
        self.claims_per_chunk = claims_per_chunk or {}
        self.should_fail = should_fail
        self.fail_message = fail_message
        self.fail_on_chunk_index = fail_on_chunk_index
        self.call_count = 0
        self.called_with: list[tuple[str, int]] = []

    async def extract(self, chunk_text: str, chunk_index: int) -> list[ExtractionResult]:
        self.call_count += 1
        self.called_with.append((chunk_text, chunk_index))

        if self.should_fail:
            raise RuntimeError(self.fail_message)
        if self.fail_on_chunk_index is not None and chunk_index == self.fail_on_chunk_index:
            raise RuntimeError(self.fail_message)

        return self.claims_per_chunk.get(chunk_index, [])


# --- Fixtures ---


@pytest.fixture
def base_state() -> PipelineState:
    """Create a pipeline state with chunks ready for claim extraction."""
    config = load_config()
    state = create_initial_state(
        run_id="test-run-id",
        document_id="test-doc-id",
        document_version_id="test-version-id",
        config=config,
    )
    state["chunks"] = [
        ChunkEntry(
            index=0,
            text="The annual percentage rate (APR) is 24%.",
            start_offset=0,
            end_offset=41,
        ),
        ChunkEntry(
            index=1,
            text="A processing fee of 500 PHP is charged upfront.",
            start_offset=35,
            end_offset=83,
        ),
        ChunkEntry(
            index=2,
            text="Repayment period is 12 months with monthly installments.",
            start_offset=78,
            end_offset=134,
        ),
    ]
    return state


# --- Tests ---


@pytest.mark.anyio
async def test_successful_extraction_with_claims(base_state: PipelineState):
    """Successful extraction produces claims and sets node_status to completed."""
    claims_per_chunk = {
        0: [
            ExtractionResult(
                claim_id="claim-1",
                claim_text="APR is 24%",
                chunk_index=0,
                start_offset=5,
                end_offset=15,
                confidence=0.9,
            )
        ],
        1: [
            ExtractionResult(
                claim_id="claim-2",
                claim_text="processing fee is 500 PHP",
                chunk_index=1,
                start_offset=2,
                end_offset=27,
                confidence=0.85,
            )
        ],
    }
    extractor = MockClaimExtractor(claims_per_chunk=claims_per_chunk)

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "completed"
    assert result["current_node"] == "extract_claims"
    assert result["error_type"] is None
    assert result["error_detail"] is None
    assert len(result["claims"]) == 2
    assert result["claims"][0]["claim_id"] == "claim-1"
    assert result["claims"][1]["claim_id"] == "claim-2"


@pytest.mark.anyio
async def test_successful_extraction_no_claims(base_state: PipelineState):
    """No claims found is still 'completed' with empty claims list, not an error."""
    extractor = MockClaimExtractor(claims_per_chunk={})

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "completed"
    assert result["current_node"] == "extract_claims"
    assert result["claims"] == []
    assert result["error_type"] is None
    assert result["error_detail"] is None


@pytest.mark.anyio
async def test_transient_error_on_llm_api_failure(base_state: PipelineState):
    """LLM API failure produces transient error."""
    extractor = MockClaimExtractor(
        should_fail=True, fail_message="Connection refused"
    )

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "error"
    assert result["error_type"] == "transient"
    assert "LLM API failure" in result["error_detail"]
    assert "Connection refused" in result["error_detail"]


@pytest.mark.anyio
async def test_transient_error_on_partial_failure(base_state: PipelineState):
    """LLM failure on a later chunk still produces transient error."""
    extractor = MockClaimExtractor(
        fail_on_chunk_index=1, fail_message="Rate limit exceeded"
    )

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "error"
    assert result["error_type"] == "transient"
    assert "Rate limit exceeded" in result["error_detail"]


@pytest.mark.anyio
async def test_extraction_result_start_offset_less_than_end_offset(
    base_state: PipelineState,
):
    """Each ExtractionResult must have start_offset < end_offset."""
    claims_per_chunk = {
        0: [
            ExtractionResult(
                claim_id="claim-1",
                claim_text="APR is 24%",
                chunk_index=0,
                start_offset=5,
                end_offset=15,
                confidence=0.9,
            ),
            ExtractionResult(
                claim_id="claim-2",
                claim_text="annual percentage rate",
                chunk_index=0,
                start_offset=4,
                end_offset=25,
                confidence=0.8,
            ),
        ],
        1: [
            ExtractionResult(
                claim_id="claim-3",
                claim_text="500 PHP",
                chunk_index=1,
                start_offset=20,
                end_offset=27,
                confidence=0.95,
            ),
        ],
    }
    extractor = MockClaimExtractor(claims_per_chunk=claims_per_chunk)

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "completed"
    for claim in result["claims"]:
        assert claim["start_offset"] < claim["end_offset"], (
            f"Claim {claim['claim_id']} has start_offset={claim['start_offset']} "
            f">= end_offset={claim['end_offset']}"
        )


@pytest.mark.anyio
async def test_completed_nodes_includes_extract_claims(base_state: PipelineState):
    """On success, completed_nodes should include 'extract_claims'."""
    extractor = MockClaimExtractor(claims_per_chunk={})

    result = await extract_claims(base_state, extractor=extractor)

    assert "extract_claims" in result["completed_nodes"]


@pytest.mark.anyio
async def test_completed_nodes_appends_to_existing(base_state: PipelineState):
    """Completed nodes should append to any pre-existing entries."""
    base_state["completed_nodes"] = ["ingest", "extract_text", "chunk", "embed"]
    extractor = MockClaimExtractor(claims_per_chunk={})

    result = await extract_claims(base_state, extractor=extractor)

    assert result["completed_nodes"] == [
        "ingest",
        "extract_text",
        "chunk",
        "embed",
        "extract_claims",
    ]


@pytest.mark.anyio
async def test_completed_nodes_not_includes_extract_claims_on_error(
    base_state: PipelineState,
):
    """On error, completed_nodes should NOT include 'extract_claims'."""
    extractor = MockClaimExtractor(should_fail=True)

    result = await extract_claims(base_state, extractor=extractor)

    assert "extract_claims" not in result["completed_nodes"]


@pytest.mark.anyio
async def test_error_preserves_existing_completed_nodes(base_state: PipelineState):
    """On error, pre-existing completed_nodes should be preserved."""
    base_state["completed_nodes"] = ["ingest", "extract_text", "chunk", "embed"]
    extractor = MockClaimExtractor(should_fail=True)

    result = await extract_claims(base_state, extractor=extractor)

    assert result["completed_nodes"] == ["ingest", "extract_text", "chunk", "embed"]
    assert "extract_claims" not in result["completed_nodes"]


@pytest.mark.anyio
async def test_transient_error_when_no_extractor_provided(base_state: PipelineState):
    """When no extractor is injected, return transient error."""
    result = await extract_claims(base_state)

    assert result["node_status"] == "error"
    assert result["error_type"] == "transient"
    assert "not provided" in result["error_detail"]


@pytest.mark.anyio
async def test_extraction_with_empty_chunks(base_state: PipelineState):
    """Extraction with empty chunks list produces empty claims, still completed."""
    base_state["chunks"] = []
    extractor = MockClaimExtractor()

    result = await extract_claims(base_state, extractor=extractor)

    assert result["node_status"] == "completed"
    assert result["claims"] == []
    assert "extract_claims" in result["completed_nodes"]
    assert extractor.call_count == 0
