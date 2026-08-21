"""Seed the database with a synthetic demo pile.

Generates a 5-document microfinance pile (2 loan agreements, 1 modification,
2 repayment statements) with 2 embedded factual conflicts, then inserts
document rows, creates a pipeline run, and queues the pile for processing.

Usage:
    python scripts/seed_demo.py

Requires:
    DATABASE_URL environment variable (defaults to local docker-compose value)
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2

from tests.synthetic.generator import SyntheticDocumentGenerator


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/docdb",
)

DEMO_SEED = 42  # Deterministic pile for reproducibility


def main() -> None:
    print("=== Seeding demo pile ===")
    print(f"Database: {DATABASE_URL.split('@')[-1]}")  # Print host only, not creds

    # Generate deterministic synthetic pile
    generator = SyntheticDocumentGenerator(seed=DEMO_SEED)
    pile = generator.generate()

    print(f"Generated {len(pile.documents)} documents with {len(pile.manifest.conflicts)} conflicts")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            # Check if demo data already exists (idempotent)
            cur.execute(
                "SELECT COUNT(*) FROM documents WHERE metadata->>'demo_seed' = %s",
                (str(DEMO_SEED),),
            )
            existing = cur.fetchone()[0]
            if existing > 0:
                print(f"Demo pile already seeded ({existing} documents found). Skipping.")
                return

            run_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)

            # Insert documents and versions
            document_ids: list[str] = []
            for doc in pile.documents:
                doc_id = str(uuid.uuid4())
                version_id = str(uuid.uuid4())
                content_hash = hashlib.sha256(doc.content).hexdigest()

                cur.execute(
                    """
                    INSERT INTO documents (id, filename, mime_type, ingested_at, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        doc_id,
                        doc.filename,
                        _mime_type(doc.format),
                        now,
                        f'{{"document_type": "{doc.document_type}", "demo_seed": "{DEMO_SEED}"}}',
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO document_versions (id, document_id, version_number, content_hash, storage_ref, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (version_id, doc_id, 1, content_hash, f"local://{doc.filename}", now),
                )

                document_ids.append(doc_id)
                print(f"  + {doc.filename} ({doc.document_type}, {doc.format})")

            # Create a pipeline run
            cur.execute(
                """
                INSERT INTO runs (id, status, config_snapshot, started_at, initiator, version)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    run_id,
                    "pending",
                    json.dumps({"playbook_id": "microfinance_v1", "pile_document_ids": document_ids}),
                    now,
                    "seed_demo",
                    1,
                ),
            )

            # Note: source_locations require claim_id (FK to claims table),
            # so ground-truth provenance is populated when the pipeline runs extraction.

        conn.commit()
        print(f"\nDone. Run ID: {run_id}")
        print(f"Documents: {len(document_ids)}")
        print(f"Conflicts embedded: {len(pile.manifest.conflicts)}")
        for c in pile.manifest.conflicts:
            print(f"  - {c.field_name}: expected {c.expected_value}, "
                  f"got {c.contradicting_value} ({c.repayment_filename})")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


def _mime_type(fmt: str) -> str:
    """Map format name to MIME type."""
    return {
        "text": "text/plain",
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(fmt, "application/octet-stream")


if __name__ == "__main__":
    main()
