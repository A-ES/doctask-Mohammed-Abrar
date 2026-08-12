"""Source linker for attaching and resolving source pointers.

Attaches provenance pointers to extracted facts and resolves them
back to the original text substring.
"""

import re
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from src.models.claims import Claim, SourceLocation
from src.pipeline.extractors.base import ExtractedFact


class SourceResolutionError(Exception):
    """Raised when a source pointer cannot be resolved."""

    def __init__(self, claim_id: str, source_location_id: str, reason: str):
        self.claim_id = claim_id
        self.source_location_id = source_location_id
        self.reason = reason
        super().__init__(f"Cannot resolve source for claim {claim_id}: {reason}")


class SourceLinker:
    """Attaches and resolves source pointers for extracted facts."""

    def attach(
        self,
        fact: ExtractedFact,
        document_version_id: str,
    ) -> SourceLocation:
        """Create a SourceLocation record from an ExtractedFact's span.

        Validates: start_offset < end_offset.

        Args:
            fact: The extracted fact containing source span information.
            document_version_id: UUID string of the document version.

        Returns:
            A SourceLocation model instance (not yet persisted).

        Raises:
            ValueError: If start_offset >= end_offset.
        """
        start = fact.source_span.start_offset
        end = fact.source_span.end_offset

        if start >= end:
            raise ValueError(
                f"start_offset ({start}) must be strictly less than end_offset ({end})"
            )

        source_location = SourceLocation(
            document_version_id=uuid.UUID(document_version_id),
            page_number=fact.source_span.page_number,
            section_id=fact.source_span.section_id,
            start_offset=start,
            end_offset=end,
            clause_ref=fact.fact_group_id,
        )

        return source_location

    def resolve(
        self,
        source_location: SourceLocation,
        stored_text: str,
    ) -> str:
        """Resolve a source pointer to the original substring.

        Returns text[start_offset:end_offset].

        Args:
            source_location: The SourceLocation to resolve.
            stored_text: The full text of the document page/section.

        Returns:
            The substring from start_offset to end_offset.

        Raises:
            SourceResolutionError: If offsets exceed text length or
                document_version_id doesn't exist.
        """
        claim_id = str(source_location.claim_id) if source_location.claim_id else ""
        source_location_id = str(source_location.id) if source_location.id else ""

        if source_location.document_version_id is None:
            raise SourceResolutionError(
                claim_id=claim_id,
                source_location_id=source_location_id,
                reason="missing document_version_id",
            )

        text_length = len(stored_text)
        start = source_location.start_offset
        end = source_location.end_offset

        if end > text_length or start > text_length:
            raise SourceResolutionError(
                claim_id=claim_id,
                source_location_id=source_location_id,
                reason=(
                    f"offsets ({start}:{end}) exceed document text length ({text_length})"
                ),
            )

        return stored_text[start:end]


# Regex to detect repayment row fact_group_id pattern like "row_1", "row_23"
_ROW_PATTERN = re.compile(r"^row_(\d+)$")


def persist_fact(
    fact: ExtractedFact,
    document_version_id: str,
    run_id: str,
    document_type: str,
    session: Session,
) -> tuple[Claim, SourceLocation]:
    """Persist an ExtractedFact as a Claim + SourceLocation pair.

    Maps ExtractedFact → Claim record using compound claim_type format.
    For repayment statements with row indexing (fact_group_id like "row_N"),
    the claim_type becomes `repayment_statement.row_N.field_name`.
    For other document types, claim_type is `{document_type}.{field_name}`.

    Args:
        fact: The extracted fact to persist.
        document_version_id: UUID string of the document version.
        run_id: UUID string of the pipeline run.
        document_type: Classification label (e.g. "loan_agreement").
        session: SQLAlchemy session for persistence.

    Returns:
        Tuple of (Claim, SourceLocation) that were added to the session.
    """
    # Build claim_type with repayment row indexing support
    if fact.fact_group_id and _ROW_PATTERN.match(fact.fact_group_id):
        # e.g. repayment_statement.row_1.amount_paid
        claim_type = f"{document_type}.{fact.fact_group_id}.{fact.field_name}"
    else:
        # e.g. loan_agreement.borrower_name
        claim_type = f"{document_type}.{fact.field_name}"

    claim = Claim(
        document_version_id=uuid.UUID(document_version_id),
        run_id=uuid.UUID(run_id),
        extracted_text=fact.value,
        claim_type=claim_type,
        confidence=Decimal(str(round(fact.confidence, 3))),
    )
    session.add(claim)
    session.flush()  # get claim.id

    source_location = SourceLocation(
        claim_id=claim.id,
        document_version_id=uuid.UUID(document_version_id),
        page_number=fact.source_span.page_number,
        section_id=fact.source_span.section_id,
        start_offset=fact.source_span.start_offset,
        end_offset=fact.source_span.end_offset,
        clause_ref=fact.fact_group_id,
    )
    session.add(source_location)
    return claim, source_location
