import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from typing import Dict, List, Optional
from src.zoning.types import Zone
from src.interventions.types import Intervention, FeasibilityResult
from src.interventions.rules import apply_rules_to_zone

_BUILTIN_RULES = {
    "I1": [
        {"field": "bushfire", "operator": ">", "threshold": 0.5, "effect": "infeasible", "reason": "bushfire risk exceeds threshold"},
        {"field": "slope", "operator": ">", "threshold": 20.0, "effect": "infeasible", "reason": "slope too steep for planting"},
    ],
    "I2": [
        {"field": "shade", "operator": ">", "threshold": 0.6, "effect": "infeasible", "reason": "excessive shading for rooftop solar"},
        {"field": "aspect", "operator": "<", "threshold": 90.0, "effect": "infeasible", "reason": "roof orientation unsuitable for solar"},
    ],
    "I3": [
        {"field": "slope", "operator": ">", "threshold": 15.0, "effect": "infeasible", "reason": "slope too steep for water retention"},
        {"field": "drainage", "operator": ">", "threshold": 0.8, "effect": "infeasible", "reason": "drainage too high for water retention"},
    ],
}


def apply_feasibility_filter(
    intervention: Intervention,
    zone: Zone,
    rules: Optional[List[dict]] = None,
) -> FeasibilityResult:
    effective_rules = rules if rules is not None else _BUILTIN_RULES.get(intervention.id, [])
    return apply_rules_to_zone(intervention.id, effective_rules, zone)


def get_feasible_interventions(
    zones: List[Zone],
    library: List[Intervention],
    rules_map: Optional[Dict[str, List[dict]]] = None,
) -> Dict[str, List[Intervention]]:
    result: Dict[str, List[Intervention]] = {}
    for zone in zones:
        feasible = []
        for intervention in library:
            rules = rules_map.get(intervention.id) if rules_map else None
            if apply_feasibility_filter(intervention, zone, rules=rules).feasible:
                feasible.append(intervention)
        result[zone.zone_id] = feasible
    return result
