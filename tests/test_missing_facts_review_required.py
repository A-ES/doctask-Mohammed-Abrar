"""Tests for missing, 'not found', or unverifiable facts handling (Option B).

Validates:
1. When a mandatory term or disclosure is missing, 'not_found', or unverifiable,
   a 'review_required' verdict and a queued Finding are produced.
2. Invariant 13: Findings are produced for confirmed violations ('fail') and
   missing/unverifiable mandatory terms ('review_required'). 'pass' and
   'not_applicable' produce no findings.
3. Queue routing: 'review_required' items escalate to human review.
4. Report generation: 'review_required' items prevent false 'COMPLIANT' ratings,
   yielding 'REQUIRES REVIEW' with appropriate risk level.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from src.pipeline.config import load_config
from src.pipeline.demo_executor import (
    _node_match_rules,
    _node_score_confidence,
    _node_route_to_queue,
)
from src.pipeline.findings import CitedSpan, EvaluationResult, Finding
from src.pipeline.nodes.match_rules_against_sources import match_rules_against_sources
from src.pipeline.nodes.route_to_queue import route_to_queue
from src.pipeline.state import (
    ComplianceVerdict,
    ExtractionResult,
    PipelineState,
    create_initial_state,
)
from src.main import _generate_summary


@pytest.fixture
def base_state() -> PipelineState:
    config = load_config()
    return create_initial_state(
        run_id="test-run-missing-facts",
        document_id="test-doc-id",
        document_version_id="test-doc-ver-id",
        config=config,
    )


class TestMissingFactsSourceEvaluation:
    """Test match_rules_against_sources producing review_required findings."""

    @pytest.mark.anyio
    async def test_missing_mandatory_disclosure_produces_review_required_finding(
        self, base_state: PipelineState
    ):
        """When an evaluator returns 'review_required' for missing disclosure (MF-002),
        a Finding is created with verdict='review_required'."""
        source_rules = [
            {
                "id": "MF-002",
                "description": "Processing fee must be disclosed",
                "check_description": "Verify that a processing fee amount is explicitly stated in the document.",
                "scope": "source",
                "check_type": "llm",
            }
        ]
        chunks = [
            {
                "index": 0,
                "text": "The loan principal is Rs. 50,000 with interest rate 18% per annum.",
                "start_offset": 0,
                "end_offset": 68,
            }
        ]

        mock_evaluator = AsyncMock()
        mock_evaluator.evaluate_batch = AsyncMock(
            return_value=[
                EvaluationResult(
                    rule_id="MF-002",
                    verdict="review_required",
                    cited_span=CitedSpan(
                        start_offset=0,
                        end_offset=68,
                        text="The loan principal is Rs. 50,000 with interest rate 18% per annum.",
                    ),
                    explanation="No processing fee disclosure was found in this document section.",
                    evaluation_method="llm",
                )
            ]
        )

        state = PipelineState(**{
            **base_state,
            "source_rules": source_rules,
            "chunks": chunks,
        })

        result = await match_rules_against_sources(state, llm_evaluator=mock_evaluator)

        assert result["node_status"] == "completed"
        source_findings = result["source_findings"]
        assert len(source_findings) == 1
        finding = source_findings[0]
        assert finding["rule_id"] == "MF-002"
        assert finding["verdict"] == "review_required"
        assert "No processing fee disclosure" in finding["explanation"]

    @pytest.mark.anyio
    async def test_pass_and_not_applicable_produce_no_findings(
        self, base_state: PipelineState
    ):
        """Invariant 13: 'pass' and 'not_applicable' results do NOT produce findings."""
        source_rules = [
            {
                "id": "MF-001",
                "description": "APR must not exceed 36%",
                "check_description": "Check APR",
                "scope": "source",
                "check_type": "llm",
            },
            {
                "id": "MF-004",
                "description": "Late payment penalty",
                "check_description": "Check penalty",
                "scope": "source",
                "check_type": "llm",
            },
        ]
        chunks = [
            {
                "index": 0,
                "text": "The stated APR is 24%.",
                "start_offset": 0,
                "end_offset": 22,
            }
        ]

        mock_evaluator = AsyncMock()
        mock_evaluator.evaluate_batch = AsyncMock(
            return_value=[
                EvaluationResult(
                    rule_id="MF-001",
                    verdict="pass",
                    cited_span=CitedSpan(start_offset=0, end_offset=22, text="stated APR is 24%"),
                    explanation="APR of 24% is below 36%",
                    evaluation_method="llm",
                ),
                EvaluationResult(
                    rule_id="MF-004",
                    verdict="not_applicable",
                    cited_span=CitedSpan(start_offset=0, end_offset=22, text="The stated APR is 24%."),
                    explanation="No late payment clause in span",
                    evaluation_method="llm",
                ),
            ]
        )

        state = PipelineState(**{
            **base_state,
            "source_rules": source_rules,
            "chunks": chunks,
        })

        result = await match_rules_against_sources(state, llm_evaluator=mock_evaluator)
        assert result["node_status"] == "completed"
        assert len(result["source_findings"]) == 0


class TestMissingFactsClaimsMatching:
    """Test claim-level matching for missing/not_found facts."""

    @pytest.mark.anyio
    async def test_missing_fact_in_demo_executor_produces_review_required(
        self, base_state: PipelineState
    ):
        """Claims containing 'not_found' trigger review_required verdict and a queued finding."""
        claims = [
            ExtractionResult(
                claim_id="loan_agreement.principal_amount_0",
                claim_text="principal_amount: 50000",
                chunk_index=0,
                start_offset=10,
                end_offset=30,
                confidence=0.9,
                citation_status="grounded",
            ),
            ExtractionResult(
                claim_id="loan_agreement.processing_fee_1",
                claim_text="processing_fee: not_found",
                chunk_index=0,
                start_offset=0,
                end_offset=0,
                confidence=0.0,
                citation_status="unverifiable",
            ),
        ]

        state = PipelineState(**{
            **base_state,
            "claims": claims,
        })

        # Run demo executor's match_rules (triggers fallback or structured path)
        result = await _node_match_rules(state, ctx={})

        fee_verdicts = [v for v in result["verdicts"] if v["claim_id"] == "loan_agreement.processing_fee_1"]
        assert len(fee_verdicts) == 1
        assert fee_verdicts[0]["verdict"] == "review_required"
        assert fee_verdicts[0]["needs_human_review"] is True

        fee_findings = [f for f in result["claim_findings"] if f["claim_id"] == "loan_agreement.processing_fee_1"]
        assert len(fee_findings) == 1
        assert fee_findings[0]["verdict"] == "review_required"
        assert fee_findings[0]["rule_id"] == "MF-002"


class TestReviewRequiredRouting:
    """Test routing of review_required claims to approval queue."""

    @pytest.mark.anyio
    async def test_review_required_claims_escalate_in_route_to_queue(
        self, base_state: PipelineState
    ):
        claims = [
            ExtractionResult(
                claim_id="claim-pass",
                claim_text="apr: 18%",
                chunk_index=0,
                start_offset=0,
                end_offset=8,
                confidence=0.95,
                citation_status="grounded",
            ),
            ExtractionResult(
                claim_id="claim-review",
                claim_text="processing_fee: not_found",
                chunk_index=0,
                start_offset=0,
                end_offset=0,
                confidence=0.0,
                citation_status="unverifiable",
            ),
        ]
        verdicts = [
            ComplianceVerdict(
                claim_id="claim-pass",
                verdict="compliant",
                confidence=0.95,
                needs_human_review=False,
                rule_id="MF-001",
                evidence_refs=[],
            ),
            ComplianceVerdict(
                claim_id="claim-review",
                verdict="review_required",
                confidence=0.0,
                needs_human_review=True,
                rule_id="MF-002",
                evidence_refs=[],
            ),
        ]

        state = PipelineState(**{
            **base_state,
            "claims": claims,
            "verdicts": verdicts,
        })

        result = await route_to_queue(state)
        buckets = result["queue_buckets"]

        assert "claim-review" in buckets["escalate"]
        assert "claim-pass" in buckets["auto_approve"]


class TestReportAssessmentReviewRequired:
    """Test report assessment logic when review_required findings or verdicts exist."""

    def test_summary_reflects_review_required_findings(self):
        findings = [
            {
                "rule_id": "MF-002",
                "verdict": "review_required",
                "reason": "Processing fee missing",
            }
        ]
        summary = _generate_summary(
            verdict="REQUIRES REVIEW",
            non_compliant=0,
            indeterminate=0,
            compliant=3,
            total=4,
            findings=findings,
        )
        assert "require compliance review due to missing disclosures" in summary
        assert "All 3 evaluated claims are within regulatory bounds" not in summary
