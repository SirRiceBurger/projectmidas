from src.interventions.types import Intervention


def compute_race(intervention: Intervention, lambda_: float = 0.5) -> float:
    numerator = intervention.expected_emissions * intervention.success_probability
    denominator = intervention.expected_cost + lambda_ * intervention.cvar_loss
    return numerator / denominator
