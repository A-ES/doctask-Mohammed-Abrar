"""Seed the database with a synthetic demo pile.

Generates a 5-document microfinance pile (2 loan agreements, 1 modification,
2 repayment statements) with 2 embedded factual conflicts, stores the
document bytes under uploads/, inserts document rows, creates a pipeline
run, and links everything to a pile.

If a previously seeded demo pile exists but its stored files are missing
(e.g. seeded by an older version that wrote fake `local://` storage refs),
the broken demo data is purged and re-seeded.

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
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2

from tests.synthetic.generator import SyntheticDocumentGenerator


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/docdb",
)

# Same convention as src/pipeline/upload_api.py — relative "uploads/" resolves
# both on the host (project root) and inside the API container
# (./uploads is volume-mounted at /app/uploads).
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "uploads"))

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
            # Check if demo data already exists (idempotent, self-healing)
            cur.execute(
                """
                SELECT dv.storage_ref
                FROM documents d
                JOIN document_versions dv ON dv.document_id = d.id
                WHERE d.metadata->>'demo_seed' = %s
                """,
                (str(DEMO_SEED),),
            )
            existing_refs = [row[0] for row in cur.fetchall()]
            if existing_refs:
                # Also check if the demo pile still exists and is active
                cur.execute(
                    "SELECT COUNT(*) FROM piles WHERE metadata->>'demo_seed' = %s AND status = 'active'",
                    (str(DEMO_SEED),),
                )
                active_pile = cur.fetchone()[0]
                if active_pile > 0 and all(Path(ref).exists() for ref in existing_refs):
                    print(f"Demo pile already seeded ({len(existing_refs)} documents found). Skipping.")
                    return
                print(
                    "Demo pile missing or archived. Purging stale demo data and re-seeding."
                )
                _purge_demo_data(cur)

            run_id = str(uuid.uuid4())
            pile_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)

            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

            # Create the demo pile
            cur.execute(
                """
                INSERT INTO piles (id, name, status, created_at, updated_at, metadata)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    pile_id,
                    "Demo Microfinance",
                    "active",
                    now,
                    now,
                    json.dumps({"demo_seed": str(DEMO_SEED)}),
                ),
            )

            # Insert documents and versions
            document_ids: list[str] = []
            for doc in pile.documents:
                doc_id = str(uuid.uuid4())
                version_id = str(uuid.uuid4())
                content_hash = hashlib.sha256(doc.content).hexdigest()

                # Store the bytes on disk like the upload API does, and
                # reference the real path. The synthetic generator emits
                # plain-text content for every document (the "pdf" format
                # is only a filename cosmetic), so the honest MIME type is
                # text/plain — registering text bytes as application/pdf
                # would crash PDF extraction.
                ext = Path(doc.filename).suffix or ".txt"
                storage_path = UPLOAD_DIR / f"{doc_id}{ext}"
                storage_path.write_bytes(doc.content)

                cur.execute(
                    """
                    INSERT INTO documents (id, filename, mime_type, ingested_at, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        doc_id,
                        doc.filename,
                        "text/plain",
                        now,
                        json.dumps(
                            {"document_type": doc.document_type, "demo_seed": str(DEMO_SEED)}
                        ),
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO document_versions (id, document_id, version_number, content_hash, storage_ref, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (version_id, doc_id, 1, content_hash, str(storage_path), now),
                )

                document_ids.append(doc_id)
                print(f"  + {doc.filename} ({doc.document_type}, stored at {storage_path})")

                # Link document to pile
                cur.execute(
                    """
                    INSERT INTO pile_documents (pile_id, document_id, added_at)
                    VALUES (%s, %s, %s)
                    """,
                    (pile_id, doc_id, now),
                )

            # Create a pipeline run
            cur.execute(
                """
                INSERT INTO runs (id, status, config_snapshot, started_at, initiator, version, pile_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    run_id,
                    "pending",
                    json.dumps({"playbook_id": "microfinance_v1", "pile_document_ids": document_ids}),
                    now,
                    "seed_demo",
                    1,
                    pile_id,
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


def _purge_demo_data(cur) -> None:
    """Delete every row belonging to demo piles, respecting RESTRICT FKs.

    Deletion order mirrors src/pipeline/run_cleanup.py, extended with the
    pile/document chain: decisions → approval_queue → source_locations →
    claims → run_steps → runs → pile_documents → document_versions →
    documents → piles. deliverables cascade with their run.
    """
    cur.execute(
        "SELECT id FROM piles WHERE metadata->>'demo_seed' = %s",
        (str(DEMO_SEED),),
    )
    pile_ids = [row[0] for row in cur.fetchall()]
    if not pile_ids:
        return

    cur.execute(
        """
        SELECT d.id FROM documents d
        JOIN pile_documents pd ON pd.document_id = d.id
        WHERE pd.pile_id = ANY(%s::uuid[])
        """,
        (pile_ids,),
    )
    doc_ids = [row[0] for row in cur.fetchall()]

    cur.execute(
        """
        SELECT dv.id FROM document_versions dv
        WHERE dv.document_id = ANY(%s::uuid[])
        """,
        (doc_ids,),
    )
    version_ids = [row[0] for row in cur.fetchall()]

    cur.execute(
        "SELECT id FROM runs WHERE pile_id = ANY(%s::uuid[])",
        (pile_ids,),
    )
    run_ids = [row[0] for row in cur.fetchall()]

    # Empty-list guards: Postgres cannot infer the type of an empty array
    # literal, so each scope is only deleted when it has members.
    if run_ids:
        # 1. Decisions on the demo runs' approval-queue entries
        cur.execute(
            """
            DELETE FROM decisions
            WHERE approval_queue_id IN (
                SELECT id FROM approval_queue WHERE run_id = ANY(%s::uuid[])
            )
            """,
            (run_ids,),
        )
        # 2. The demo runs' approval-queue entries
        cur.execute("DELETE FROM approval_queue WHERE run_id = ANY(%s::uuid[])", (run_ids,))
        # 3. Source locations of claims from demo runs or on demo versions
        cur.execute(
            """
            DELETE FROM source_locations
            WHERE claim_id IN (
                SELECT id FROM claims
                WHERE run_id = ANY(%s::uuid[]) OR document_version_id = ANY(%s::uuid[])
            )
            """,
            (run_ids, version_ids),
        )
        # 4. The claims themselves
        cur.execute(
            "DELETE FROM claims WHERE run_id = ANY(%s::uuid[]) OR document_version_id = ANY(%s::uuid[])",
            (run_ids, version_ids),
        )
        # 5. Run steps, then runs (deliverables cascade with runs)
        cur.execute("DELETE FROM run_steps WHERE run_id = ANY(%s::uuid[])", (run_ids,))
    if version_ids:
        # Claims may exist on demo versions from runs outside the demo piles
        cur.execute(
            """
            DELETE FROM source_locations
            WHERE claim_id IN (
                SELECT id FROM claims WHERE document_version_id = ANY(%s::uuid[])
            )
            """,
            (version_ids,),
        )
        cur.execute("DELETE FROM claims WHERE document_version_id = ANY(%s::uuid[])", (version_ids,))
    cur.execute("DELETE FROM runs WHERE pile_id = ANY(%s::uuid[])", (pile_ids,))
    # 6. Pile links, versions, documents, piles
    cur.execute("DELETE FROM pile_documents WHERE pile_id = ANY(%s::uuid[])", (pile_ids,))
    if doc_ids:
        cur.execute("DELETE FROM document_versions WHERE document_id = ANY(%s::uuid[])", (doc_ids,))
        cur.execute("DELETE FROM documents WHERE id = ANY(%s::uuid[])", (doc_ids,))
    cur.execute("DELETE FROM piles WHERE id = ANY(%s::uuid[])", (pile_ids,))

    print(
        f"Purged {len(pile_ids)} pile(s), {len(doc_ids)} document(s), "
        f"{len(run_ids)} run(s) of broken demo data."
    )


if __name__ == "__main__":
    main()
