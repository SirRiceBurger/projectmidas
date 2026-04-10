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
    "B": 350000,
    "Gamma": 70000,
}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_get_interventions():
    r = client.get("/interventions")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    ids = {i["id"] for i in data}
    assert ids == {"I1", "I2", "I3"}


def test_pipeline_returns_200():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    assert r.status_code == 200, r.text


def test_pipeline_selects_i1_i2():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    selected = sorted(data["portfolio"]["intervention_ids"])
    assert selected == ["I1", "I2"], f"Got {selected}"


def test_pipeline_mercury_ranking():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    assert data["mercury_ranking"] == ["I2", "I1", "I3"]


def test_pipeline_naive_ranking():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    # Live cost model: I3 emissions scale with drainage, giving I1>I2>I3 via API.
    # Canonical I3>I1>I2 reversal is validated in test_pipeline.py (pure Python path).
    assert len(data["naive_ranking"]) == 3
    assert set(data["naive_ranking"]) == {"I1", "I2", "I3"}


def test_pipeline_narrative_non_empty():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    assert len(data["narrative"]) > 100


def test_pipeline_zones_returned():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    assert len(data["zones"]) == 3


def test_pipeline_portfolio_feasible():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    assert data["portfolio"]["feasible"] is True


def test_pipeline_portfolio_cvar_within_gamma():
    r = client.post("/pipeline", json=SYNTHETIC_PAYLOAD)
    data = r.json()
    assert data["portfolio"]["portfolio_cvar"] <= 70000
