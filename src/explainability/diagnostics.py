import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from itertools import combinations
from typing import Dict, List
from src.explainability.types import ExclusionReason, PipelineResults
from src.optimiser.cvar import compute_portfolio_cvar
from src.scoring.mercury_score import ScoredIntervention


def explain_exclusions(
    pipeline_results: PipelineResults,
    B: float,
    Gamma: float,
) -> List[ExclusionReason]:
    reasons: List[ExclusionReason] = []

    selected_ids = {i.id for i in pipeline_results.optimisation.selected_portfolio.interventions}

    feasible_anywhere = set()
    for zone_id, zone_interventions in pipeline_results.feasibility.items():
        feasible_zone_ids = {i.id for i in zone_interventions}
        all_ids = {i.id for i in pipeline_results.interventions}
        infeasible_here = all_ids - feasible_zone_ids
        for iid in infeasible_here:
            intervention = next(i for i in pipeline_results.interventions if i.id == iid)
            already_reported = any(
                r.intervention_id == iid and r.zone_id == zone_id and r.reason_code == "feasibility"
                for r in reasons
            )
            if not already_reported:
                reasons.append(ExclusionReason(
                    intervention_id=iid,
                    zone_id=zone_id,
                    reason_code="feasibility",
                    detail=f"{intervention.name} is not feasible in zone {zone_id}",
                ))
        for i in zone_interventions:
            feasible_anywhere.add(i.id)

    for intervention in pipeline_results.interventions:
        if intervention.id in selected_ids:
            continue
        if intervention.id not in feasible_anywhere:
            continue

        if intervention.expected_cost > B:
            reasons.append(ExclusionReason(
                intervention_id=intervention.id,
                zone_id="",
                reason_code="budget",
                detail=f"{intervention.name} solo cost AUD {intervention.expected_cost:,.0f} exceeds budget AUD {B:,.0f}",
            ))
            continue

        all_combos_breach_cvar = True
        for r in range(1, len(pipeline_results.interventions) + 1):
            for combo in combinations(pipeline_results.interventions, r):
                combo_list = list(combo)
                if not any(i.id == intervention.id for i in combo_list):
                    continue
                total_cost = sum(i.expected_cost for i in combo_list)
                if total_cost > B:
                    continue
                cvar = compute_portfolio_cvar(combo_list)
                if cvar <= Gamma:
                    all_combos_breach_cvar = False
                    break
            if not all_combos_breach_cvar:
                break

        if all_combos_breach_cvar:
            reasons.append(ExclusionReason(
                intervention_id=intervention.id,
                zone_id="",
                reason_code="cvar_breach",
                detail=(
                    f"{intervention.name} was excluded because every affordable portfolio "
                    f"containing it has CVaR exceeding the cap of AUD {Gamma:,.0f}"
                ),
            ))
        else:
            reasons.append(ExclusionReason(
                intervention_id=intervention.id,
                zone_id="",
                reason_code="suboptimal",
                detail=f"{intervention.name} was feasible and affordable but the optimizer selected a higher-scoring portfolio without it",
            ))

    return reasons


def get_inclusion_drivers(scored_intervention: ScoredIntervention) -> Dict[str, float]:
    return {
        "race_contribution": scored_intervention.race,
        "resilience_contribution": scored_intervention.intervention.resilience_score,
        "probability_contribution": scored_intervention.intervention.success_probability,
        "cvar_penalty": scored_intervention.intervention.cvar_loss,
        "correlation_penalty": scored_intervention.avg_correlation,
    }
