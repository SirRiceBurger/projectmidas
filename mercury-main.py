# mercury-main.py
# Entry point for the Mercury computational back-end.

from dataclasses import dataclass
from typing import List


@dataclass
class Intervention:
    id: str
    name: str
    expected_emissions: float   # tCO2e
    success_prob: float
    expected_cost: float        # AUD
    cvar: float                 # CVaR at alpha=0.95, AUD


def compute_race(intervention: Intervention, lambda_: float = 0.5) -> float:
    """
    RACE = (E[E_j] * p_j) / (E[K_j] + lambda * CVaR_alpha(L_j))
    """
    numerator = intervention.expected_emissions * intervention.success_prob
    denominator = intervention.expected_cost + lambda_ * intervention.cvar
    return numerator / denominator


def rank_interventions(interventions: List[Intervention]) -> List[Intervention]:
    """Rank interventions by RACE score (descending)."""
    return sorted(interventions, key=lambda i: compute_race(i), reverse=True)


if __name__ == "__main__":
    # Synthetic validation cases from Mercury methodology (Section 3)
    candidates = [
        Intervention("I1", "Revegetation Belt",              120, 0.82, 120_000, 40_000),
        Intervention("I2", "Rooftop Solar Retrofit",         180, 0.93, 220_000, 25_000),
        Intervention("I3", "Water Retention & Soil Restore", 150, 0.65, 130_000, 90_000),
    ]

    print("Intervention RACE Scores")
    print("-" * 45)
    for iv in rank_interventions(candidates):
        score = compute_race(iv)
        print(f"  {iv.id}  {iv.name:<34}  RACE={score:.2e}")
