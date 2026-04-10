import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import operator as op
from typing import List, Optional
from src.zoning.types import Zone, FeatureVector
from src.interventions.types import FeasibilityResult

OPERATORS = {
    ">":  op.gt,
    "<":  op.lt,
    ">=": op.ge,
    "<=": op.le,
    "==": op.eq,
}


def evaluate_rule(rule: dict, fv: FeatureVector) -> bool:
    """Returns True if the rule fires (intervention is infeasible)."""
    val = getattr(fv, rule["field"], None)
    if val is None:
        return False
    fn = OPERATORS.get(rule["operator"])
    if fn is None:
        return False
    return bool(fn(val, rule["threshold"]))


def first_failing_rule(rules: List[dict], fv: FeatureVector) -> Optional[dict]:
    """Returns the first rule that fires, or None if all pass."""
    for rule in rules:
        if evaluate_rule(rule, fv):
            return rule
    return None


def apply_rules_to_zone(intervention_id: str, rules: List[dict], zone: Zone) -> FeasibilityResult:
    """Evaluates all rules for an intervention against a zone's feature vector."""
    failing = first_failing_rule(rules, zone.feature_vector)
    if failing:
        return FeasibilityResult(
            intervention_id=intervention_id,
            zone_id=zone.zone_id,
            feasible=False,
            reason=failing.get("reason", f"{failing['field']} {failing['operator']} {failing['threshold']}")
        )
    return FeasibilityResult(intervention_id=intervention_id, zone_id=zone.zone_id, feasible=True, reason="")
