import math
from typing import Dict, List

import numpy as np

from src.interventions.types import Intervention
from src.monte_carlo.types import OutcomeArrays, ScenarioArrays
from src.monte_carlo.uncertainty import sample_scenario_arrays


def _cvar_exponential_mean(target_cvar: float, alpha: float) -> float:
    """Return exponential mean mu such that CVaR_alpha(Exp(mu)) == target_cvar.

    For X ~ Exp(mu), CVaR_alpha = mu * (1 - ln(1 - alpha)).
    """
    return target_cvar / (1.0 - math.log(1.0 - alpha))


_BASE_HORIZON = 20


def _compute_outcomes(
    intervention: Intervention,
    scenarios: ScenarioArrays,
    rng: np.random.Generator,
    alpha: float,
    horizon_scale: float,
) -> OutcomeArrays:
    S = len(scenarios.climate_factor)

    E = intervention.expected_emissions * scenarios.climate_factor * horizon_scale

    K = intervention.expected_cost * scenarios.cost_factor

    mu_loss = _cvar_exponential_mean(intervention.cvar_loss * horizon_scale, alpha)
    L = rng.exponential(scale=mu_loss, size=S)

    R = intervention.resilience_score * scenarios.resilience_factor

    Q = np.clip(0.6 + 0.4 * scenarios.climate_factor * intervention.success_probability, 0.0, 1.0)

    return OutcomeArrays(E=E, K=K, L=L, R=R, Q=Q)


def run_simulation(
    interventions: List[Intervention],
    S: int = 10000,
    T: int = 20,
    seed: int = 42,
    alpha: float = 0.95,
) -> Dict[str, OutcomeArrays]:
    """Simulate S scenarios for each intervention over a T-year horizon.

    intervention.expected_emissions and cvar_loss are defined over the base
    horizon of 20 years. T scales them linearly (T/20).
    """
    rng = np.random.default_rng(seed)
    scenarios = sample_scenario_arrays(S, rng)
    horizon_scale = T / _BASE_HORIZON

    results: Dict[str, OutcomeArrays] = {}
    for intervention in interventions:
        iv_rng = np.random.default_rng(seed + abs(hash(intervention.id)) % 100000)
        results[intervention.id] = _compute_outcomes(intervention, scenarios, iv_rng, alpha, horizon_scale)

    return results
