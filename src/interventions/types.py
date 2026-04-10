from dataclasses import dataclass


@dataclass
class Intervention:
    id: str
    name: str
    expected_emissions: float
    success_probability: float
    expected_cost: float
    cvar_loss: float
    maintenance_cost_annual: float
    resilience_score: float


@dataclass
class FeasibilityResult:
    intervention_id: str
    zone_id: str
    feasible: bool
    reason: str
