from dataclasses import dataclass
from typing import Dict, List, Tuple

from src.interventions.types import Intervention
from src.scoring.race import compute_race


@dataclass
class ScoredIntervention:
    intervention: Intervention
    race: float
    mercury_score: float
    avg_correlation: float


def z_score(values: List[float]) -> List[float]:
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = variance ** 0.5
    if std == 0.0:
        return [0.0] * len(values)
    return [(v - mean) / std for v in values]


def compute_mercury_scores(
    interventions: List[Intervention],
    correlations: Dict[Tuple[str, str], float],
    lambda_: float = 0.5,
    thetas: Tuple[float, ...] = (0.35, 0.20, 0.20, 0.15, 0.10),
) -> List[ScoredIntervention]:
    races = [compute_race(iv, lambda_) for iv in interventions]

    avg_correlations = []
    for iv in interventions:
        peers = [other for other in interventions if other.id != iv.id]
        rhos = [correlations[(iv.id, p.id)] for p in peers]
        avg_correlations.append(sum(rhos) / len(rhos) if rhos else 0.0)

    resiliences = [iv.resilience_score for iv in interventions]
    probs = [iv.success_probability for iv in interventions]
    cvars = [iv.cvar_loss for iv in interventions]

    z_race = z_score(races)
    z_r = z_score(resiliences)
    z_p = z_score(probs)
    z_cvar = z_score(cvars)
    z_rho = z_score(avg_correlations)

    t1, t2, t3, t4, t5 = thetas

    scored = []
    for i, iv in enumerate(interventions):
        score = (
            t1 * z_race[i]
            + t2 * z_r[i]
            + t3 * z_p[i]
            - t4 * z_cvar[i]
            - t5 * z_rho[i]
        )
        scored.append(
            ScoredIntervention(
                intervention=iv,
                race=races[i],
                mercury_score=score,
                avg_correlation=avg_correlations[i],
            )
        )

    return scored
