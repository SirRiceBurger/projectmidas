import json, re, threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

STORE_PATH = Path(__file__).parent.parent.parent / "data" / "interventions.json"
_lock = threading.Lock()

BUILTINS = [
    {
        "id": "I1", "name": "Revegetation Belt",
        "description": "Native species planting along site boundaries and riparian corridors.",
        "expected_emissions": 120.0, "success_probability": 0.82,
        "expected_cost": 120000.0, "cvar_loss": 40000.0,
        "maintenance_cost_annual": 5000.0, "resilience_score": 0.7,
        "use_cost_model": False,
        "feasibility_rules": [
            {"field": "bushfire", "operator": ">", "threshold": 0.5, "effect": "infeasible", "reason": "High bushfire risk rules out planting"},
            {"field": "slope", "operator": ">", "threshold": 20.0, "effect": "infeasible", "reason": "Slope too steep for revegetation"}
        ],
        "enabled": True, "is_builtin": True,
        "created_at": "2026-01-01T00:00:00+00:00"
    },
    {
        "id": "I2", "name": "Rooftop Solar Retrofit",
        "description": "Installation of photovoltaic panels on existing structures.",
        "expected_emissions": 180.0, "success_probability": 0.93,
        "expected_cost": 220000.0, "cvar_loss": 25000.0,
        "maintenance_cost_annual": 3000.0, "resilience_score": 0.5,
        "use_cost_model": False,
        "feasibility_rules": [
            {"field": "shade", "operator": ">", "threshold": 0.6, "effect": "infeasible", "reason": "Excessive shading for solar"},
            {"field": "aspect", "operator": "<", "threshold": 90.0, "effect": "infeasible", "reason": "Roof orientation unsuitable"}
        ],
        "enabled": True, "is_builtin": True,
        "created_at": "2026-01-01T00:00:00+00:00"
    },
    {
        "id": "I3", "name": "Water Retention & Soil Restoration",
        "description": "Earthworks, swales, and soil amendment for water retention.",
        "expected_emissions": 150.0, "success_probability": 0.65,
        "expected_cost": 130000.0, "cvar_loss": 90000.0,
        "maintenance_cost_annual": 4000.0, "resilience_score": 0.8,
        "use_cost_model": False,
        "feasibility_rules": [
            {"field": "slope", "operator": ">", "threshold": 15.0, "effect": "infeasible", "reason": "Slope too steep for water retention"},
            {"field": "drainage", "operator": ">", "threshold": 0.8, "effect": "infeasible", "reason": "Too well-drained for water retention"}
        ],
        "enabled": True, "is_builtin": True,
        "created_at": "2026-01-01T00:00:00+00:00"
    }
]

def _load() -> List[dict]:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        _save(BUILTINS)
        return list(BUILTINS)
    with open(STORE_PATH) as f:
        return json.load(f)

def _save(records: List[dict]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STORE_PATH, "w") as f:
        json.dump(records, f, indent=2)

def list_interventions(enabled_only: bool = False) -> List[dict]:
    with _lock:
        records = _load()
    if enabled_only:
        return [r for r in records if r.get("enabled", True)]
    return records

def get_intervention(id_: str) -> Optional[dict]:
    with _lock:
        records = _load()
    return next((r for r in records if r["id"] == id_), None)

def _next_id(records: List[dict]) -> str:
    suffixes = [
        int(m.group(1))
        for r in records
        if (m := re.fullmatch(r"I(\d+)", r.get("id", "")))
    ]
    return f"I{max(suffixes) + 1}" if suffixes else "I1"


def create_intervention(data: dict) -> dict:
    with _lock:
        records = _load()
        new_id = _next_id(records)
        record = {**data, "id": new_id, "is_builtin": False,
                  "created_at": datetime.now(timezone.utc).isoformat()}
        record.setdefault("feasibility_rules", [])
        record.setdefault("enabled", True)
        record.setdefault("use_cost_model", False)
        records.append(record)
        _save(records)
    return record


def update_intervention(id_: str, data: dict) -> Optional[dict]:
    with _lock:
        records = _load()
        for i, r in enumerate(records):
            if r["id"] == id_:
                records[i] = {**r, **data, "id": id_}
                _save(records)
                return records[i]
    return None

def delete_intervention(id_: str) -> bool:
    with _lock:
        records = _load()
        before = len(records)
        records = [r for r in records if r["id"] != id_]
        if len(records) == before:
            return False
        _save(records)
    return True

def reset_to_builtins() -> None:
    with _lock:
        _save(list(BUILTINS))
