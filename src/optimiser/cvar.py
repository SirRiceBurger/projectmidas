from typing import List

from src.interventions.types import Intervention
from src.optimiser.correlation import get_correlation


def compute_portfolio_cvar(interventions: List[Intervention]) -> float:
    if len(interventions) == 1:
        return interventions[0].cvar_loss

    variance = sum(i.cvar_loss ** 2 for i in interventions)
    for j in range(len(interventions)):
        for k in range(j + 1, len(interventions)):
            rho = get_correlation(interventions[j].id, interventions[k].id)
            variance += 2 * rho * interventions[j].cvar_loss * interventions[k].cvar_loss
    return variance ** 0.5
