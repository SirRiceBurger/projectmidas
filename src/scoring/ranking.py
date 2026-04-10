from typing import List

from src.interventions.types import Intervention
from src.scoring.mercury_score import ScoredIntervention


def rank_by_mercury(scored: List[ScoredIntervention]) -> List[ScoredIntervention]:
    return sorted(scored, key=lambda x: x.mercury_score, reverse=True)


def rank_naive(interventions: List[Intervention]) -> List[Intervention]:
    return sorted(
        interventions,
        key=lambda x: x.expected_emissions / x.expected_cost,
        reverse=True,
    )
