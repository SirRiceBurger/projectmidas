import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pytest
from src.store.interventions import (
    list_interventions, get_intervention, create_intervention,
    update_intervention, delete_intervention, reset_to_builtins
)

@pytest.fixture(autouse=True)
def reset():
    reset_to_builtins()
    yield
    reset_to_builtins()

def test_list_returns_three_builtins():
    items = list_interventions()
    assert len(items) == 3
    assert {i["id"] for i in items} == {"I1", "I2", "I3"}

def test_list_enabled_only():
    update_intervention("I3", {"enabled": False})
    enabled = list_interventions(enabled_only=True)
    assert len(enabled) == 2
    assert all(i["id"] != "I3" for i in enabled)

def test_get_existing():
    i1 = get_intervention("I1")
    assert i1 is not None
    assert i1["name"] == "Revegetation Belt"

def test_get_missing_returns_none():
    assert get_intervention("nonexistent") is None

def test_create_intervention():
    new = create_intervention({
        "name": "Biochar Application",
        "description": "Soil carbon sequestration via biochar.",
        "expected_emissions": 80.0, "success_probability": 0.75,
        "expected_cost": 50000.0, "cvar_loss": 15000.0,
        "maintenance_cost_annual": 1000.0, "resilience_score": 0.6,
    })
    assert "id" in new
    assert new["is_builtin"] is False
    assert new["name"] == "Biochar Application"
    items = list_interventions()
    assert len(items) == 4

def test_update_intervention():
    update_intervention("I1", {"expected_cost": 150000.0})
    i1 = get_intervention("I1")
    assert i1["expected_cost"] == 150000.0

def test_delete_user_intervention():
    new = create_intervention({"name": "Test", "expected_emissions": 10.0,
                               "success_probability": 0.5, "expected_cost": 10000.0,
                               "cvar_loss": 3000.0, "maintenance_cost_annual": 500.0,
                               "resilience_score": 0.5})
    assert delete_intervention(new["id"]) is True
    assert get_intervention(new["id"]) is None

def test_can_delete_builtin():
    assert delete_intervention("I1") is True
    assert get_intervention("I1") is None

def test_intervention_has_feasibility_rules():
    i1 = get_intervention("I1")
    assert len(i1["feasibility_rules"]) > 0
    rule = i1["feasibility_rules"][0]
    assert "field" in rule and "operator" in rule and "threshold" in rule

def test_create_with_feasibility_rules():
    new = create_intervention({
        "name": "Custom", "expected_emissions": 50.0, "success_probability": 0.7,
        "expected_cost": 80000.0, "cvar_loss": 20000.0,
        "maintenance_cost_annual": 2000.0, "resilience_score": 0.6,
        "feasibility_rules": [{"field": "slope", "operator": ">", "threshold": 10.0,
                               "effect": "infeasible", "reason": "Too steep"}]
    })
    fetched = get_intervention(new["id"])
    assert len(fetched["feasibility_rules"]) == 1
