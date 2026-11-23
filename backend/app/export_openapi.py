import json
from pathlib import Path

from app.main import app

path = Path(__file__).resolve().parents[2] / "contracts" / "openapi.json"
path.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
