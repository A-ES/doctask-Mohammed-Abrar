import pytest
import httpx
from src.main import app


@pytest.mark.anyio
async def test_health_returns_200():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_health_returns_503_on_db_failure(monkeypatch):
    from sqlalchemy.exc import OperationalError

    def fake_connect(*args, **kwargs):
        raise OperationalError("Connection refused", {}, Exception("Down"))

    monkeypatch.setattr("src.main.engine.connect", fake_connect)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded"}


@pytest.mark.anyio
async def test_demo_seed_endpoint_calls_seed_demo(monkeypatch):
    class FakeSeedModule:
        @staticmethod
        def seed_demo():
            return {
                "status": "seeded",
                "pile_id": "pile-1",
                "run_id": "run-1",
                "document_count": 5,
                "conflicts": [],
            }

    monkeypatch.setattr("src.main._load_seed_demo_module", lambda: FakeSeedModule)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/demo/seed")

    assert response.status_code == 200
    assert response.json()["document_count"] == 5


@pytest.mark.anyio
async def test_upload_document_exceeding_max_size_returns_413(monkeypatch):
    import io

    monkeypatch.setenv("MAX_UPLOAD_SIZE_BYTES", "50")
    large_content = b"Y" * 100
    files = {"file": ("large_doc.txt", io.BytesIO(large_content), "text/plain")}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/documents/upload", files=files)

    assert response.status_code == 413
    assert "exceeds maximum allowed size" in response.json()["detail"]
