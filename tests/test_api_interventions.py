import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pytest
from fastapi.testclient import TestClient
from src.api.main import app
from src.store.interventions import reset_to_builtins

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset():
    reset_to_builtins()
    yield
    reset_to_builtins()

SYNTHETIC_PAYLOAD = {
    "dataset": {
        "drone": {"canopy_cover": 0.35, "bare_soil_fraction": 0.2, "slope_degrees": 8,
                  "aspect_degrees": 180, "drainage_index": 0.6, "shade_fraction": 0.25,
                  "uv_index": 6.5, "georef_confidence": 0.92, "coverage_fraction": 0.95},
        "weather": {"mean_annual_rainfall_mm": 650, "mean_annual_temp_c": 17.5,
                    "extreme_heat_days_per_year": 12, "frost_days_per_year": 5, "wind_speed_ms": 4.2},
        "hazard": {"bushfire_risk": 0.4, "flood_risk": 0.2, "drought_risk": 0.35, "erosion_risk": 0.15},
        "site": {"area_ha": 25, "soil_depth_cm": 45, "soil_type": "clay_loam",
                 "proximity_to_water_m": 120, "land_use_current": "grazing"},
        "economic": {"land_value_aud_per_ha": 8500, "carbon_price_aud_per_tco2e": 35,
                     "discount_rate": 0.07, "labour_cost_index": 1.0},
    },
    "B": 350000, "Gamma": 70000,
}

NEW_INTERVENTION = {
    "name": "Biochar Application",
    "description": "Soil carbon sequestration.",
    "expected_emissions": 80.0, "success_probability": 0.75,
    "expected_cost": 50000.0, "cvar_loss": 15000.0,
    "maintenance_cost_annual": 1000.0, "resilience_score": 0.6,
    "feasibility_rules": [
        {"field": "slope", "operator": ">", "threshold": 25.0, "effect": "infeasible", "reason": "Too steep for biochar"}
    ]
}

def test_list_interventions_returns_builtins():
    r = client.get("/interventions")
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()}
    assert ids == {"I1", "I2", "I3"}

def test_create_intervention():
    r = client.post("/interventions", json=NEW_INTERVENTION)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Biochar Application"
    assert data["is_builtin"] is False
    assert len(data["feasibility_rules"]) == 1

def test_get_interventions_after_create():
    client.post("/interventions", json=NEW_INTERVENTION)
    r = client.get("/interventions")
    assert len(r.json()) == 4

def test_update_intervention():
    r = client.put("/interventions/I1", json={"expected_cost": 150000.0})
    assert r.status_code == 200
    assert r.json()["expected_cost"] == 150000.0

def test_delete_user_intervention():
    created = client.post("/interventions", json=NEW_INTERVENTION).json()
    r = client.delete(f"/interventions/{created['id']}")
    assert r.status_code == 204
    ids = {i["id"] for i in client.get("/interventions").json()}
    assert created["id"] not in ids

def test_can_delete_builtin():
    r = client.delete("/interventions/I1")
    assert r.status_code == 204

def test_disable_intervention_excludes_from_pipeline():
    client.put("/interventions/I2", json={"enabled": False})
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    assert r.status_code == 200
    assert "I2" not in r.json()["portfolio"]["intervention_ids"]

def test_pipeline_with_custom_intervention():
    client.post("/interventions", json=NEW_INTERVENTION)
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    assert r.status_code == 200

def test_custom_intervention_infeasible_rule_respected():
    client.post("/interventions", json={**NEW_INTERVENTION,
        "name": "Always Infeasible",
        "feasibility_rules": [{"field": "slope", "operator": ">", "threshold": 0.0,
                               "effect": "infeasible", "reason": "always blocked"}]
    })
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    assert r.status_code == 200

def test_pipeline_still_selects_i1_i2_with_builtins():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    assert r.status_code == 200
    selected = sorted(r.json()["portfolio"]["intervention_ids"])
    assert selected == ["I1", "I2"]
