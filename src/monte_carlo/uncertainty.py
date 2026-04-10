import numpy as np

from src.monte_carlo.types import ScenarioArrays


def sample_scenario_arrays(S: int, rng: np.random.Generator) -> ScenarioArrays:
    return ScenarioArrays(
        climate_factor=rng.lognormal(mean=-0.02, sigma=0.2, size=S),
        cost_factor=rng.lognormal(mean=-0.01125, sigma=0.15, size=S),
        resilience_factor=rng.beta(5, 2, size=S),
    )
