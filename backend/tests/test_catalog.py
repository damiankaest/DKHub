import json
from pathlib import Path

from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


def test_catalog_reads_current_file(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    original = json.loads((Path(main.ROOT) / "apps.json").read_text(encoding="utf-8"))
    catalog.write_text(json.dumps(original), encoding="utf-8")
    response = client.get("/api/apps")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "demo"
    catalog.write_text("[]", encoding="utf-8")
    assert client.get("/api/apps").json() == []


def test_invalid_catalog_does_not_expose_data(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    entry = json.loads((Path(main.ROOT) / "apps.json").read_text(encoding="utf-8"))[0]
    entry["url"] = "javascript:alert(1)"
    catalog.write_text(json.dumps([entry]), encoding="utf-8")
    response = client.get("/api/apps")
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to read app catalog"}


def test_frontend_and_demo_when_build_exists():
    if not main.FRONTEND.is_dir():
        return  # CI tests the frontend build in its own job.
    assert client.get("/").status_code == 200
    assert "DKHub" in client.get("/").text
    assert "Hallo aus deiner Demo-App" in client.get("/demo.html").text
