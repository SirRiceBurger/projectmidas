import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.interventions.rules import evaluate_rule, first_failing_rule, apply_rules_to_zone
from src.zoning.types import Zone, FeatureVector


def make_fv(**kwargs):
    defaults = dict(canopy=0.4, bare_soil=0.2, slope=8.0, aspect=180.0,
                    drainage=0.6, shade=0.25, uv=6.5, bushfire=0.3,
                    flood=0.2, drought=0.3, proximity=0.6)
    defaults.update(kwargs)
    return FeatureVector(**defaults)


def make_zone(zone_id="Z1", **fv_kwargs):
    return Zone(zone_id=zone_id, area_ha=8.0, feature_vector=make_fv(**fv_kwargs))


def test_gt_fires_when_above():
    rule = {"field": "bushfire", "operator": ">", "threshold": 0.5}
    assert evaluate_rule(rule, make_fv(bushfire=0.6)) is True


def test_gt_does_not_fire_when_equal():
    rule = {"field": "bushfire", "operator": ">", "threshold": 0.5}
    assert evaluate_rule(rule, make_fv(bushfire=0.5)) is False


def test_lt_fires_when_below():
    rule = {"field": "aspect", "operator": "<", "threshold": 90.0}
    assert evaluate_rule(rule, make_fv(aspect=45.0)) is True


def test_gte_fires_when_equal():
    rule = {"field": "slope", "operator": ">=", "threshold": 15.0}
    assert evaluate_rule(rule, make_fv(slope=15.0)) is True


def test_lte_fires_when_below():
    rule = {"field": "drainage", "operator": "<=", "threshold": 0.3}
    assert evaluate_rule(rule, make_fv(drainage=0.2)) is True


def test_eq_fires_on_match():
    rule = {"field": "slope", "operator": "==", "threshold": 8.0}
    assert evaluate_rule(rule, make_fv(slope=8.0)) is True


def test_unknown_field_returns_false():
    rule = {"field": "nonexistent", "operator": ">", "threshold": 0.5}
    assert evaluate_rule(rule, make_fv()) is False


def test_unknown_operator_returns_false():
    rule = {"field": "bushfire", "operator": "!=", "threshold": 0.5}
    assert evaluate_rule(rule, make_fv(bushfire=0.6)) is False


def test_first_failing_rule_returns_first_match():
    rules = [
        {"field": "slope", "operator": ">", "threshold": 20.0, "reason": "steep"},
        {"field": "bushfire", "operator": ">", "threshold": 0.5, "reason": "fire"},
    ]
    result = first_failing_rule(rules, make_fv(slope=5.0, bushfire=0.8))
    assert result["reason"] == "fire"


def test_first_failing_rule_returns_none_when_all_pass():
    rules = [
        {"field": "slope", "operator": ">", "threshold": 20.0},
        {"field": "bushfire", "operator": ">", "threshold": 0.5},
    ]
    assert first_failing_rule(rules, make_fv(slope=5.0, bushfire=0.3)) is None


def test_apply_rules_infeasible():
    rules = [{"field": "bushfire", "operator": ">", "threshold": 0.5,
              "effect": "infeasible", "reason": "high fire risk"}]
    zone = make_zone(bushfire=0.8)
    result = apply_rules_to_zone("I1", rules, zone)
    assert result.feasible is False
    assert "fire" in result.reason


def test_apply_rules_feasible():
    rules = [{"field": "bushfire", "operator": ">", "threshold": 0.5,
              "effect": "infeasible", "reason": "high fire risk"}]
    zone = make_zone(bushfire=0.2)
    result = apply_rules_to_zone("I1", rules, zone)
    assert result.feasible is True


def test_empty_rules_always_feasible():
    zone = make_zone(bushfire=0.99, slope=45.0)
    result = apply_rules_to_zone("CUSTOM", [], zone)
    assert result.feasible is True


def test_existing_feasibility_still_works():
    from src.interventions.feasibility import apply_feasibility_filter
    from src.interventions.library import load_intervention_library
    lib = load_intervention_library()
    i1 = next(i for i in lib if i.id == "I1")
    zone_safe = make_zone(bushfire=0.3, slope=8.0)
    zone_risky = make_zone(zone_id="C", bushfire=0.6)
    assert apply_feasibility_filter(i1, zone_safe).feasible is True
    assert apply_feasibility_filter(i1, zone_risky).feasible is False
