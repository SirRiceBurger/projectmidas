import numpy as np

from src.monte_carlo.types import OutcomeArrays


def compute_expected_emissions(outcomes: OutcomeArrays) -> float:
    return float(np.mean(outcomes.E))


def compute_expected_cost(outcomes: OutcomeArrays) -> float:
    return float(np.mean(outcomes.K))


def compute_cvar(outcomes: OutcomeArrays, alpha: float = 0.95) -> float:
    """Compute CVaR_alpha of the loss distribution using the sample average of the tail."""
    losses = outcomes.L
    cutoff = int(np.floor(alpha * len(losses)))
    sorted_losses = np.sort(losses)
    return float(np.mean(sorted_losses[cutoff:]))
