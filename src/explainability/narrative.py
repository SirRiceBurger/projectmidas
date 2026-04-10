import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from typing import List
from src.explainability.types import ExclusionReason, PipelineResults


def generate_narrative(
    pipeline_results: PipelineResults,
    exclusion_reasons: List[ExclusionReason],
    B: float,
    Gamma: float,
) -> str:
    portfolio = pipeline_results.optimisation.selected_portfolio
    selected_names = [i.name for i in portfolio.interventions]
    carbon = portfolio.expected_emissions
    cost = portfolio.total_cost
    cvar = portfolio.portfolio_cvar

    names_str = " and ".join(selected_names) if selected_names else "no interventions"

    cvar_exclusions = [r for r in exclusion_reasons if r.reason_code == "cvar_breach"]
    cvar_excluded_names = list({
        next(i.name for i in pipeline_results.interventions if i.id == r.intervention_id)
        for r in cvar_exclusions
    })

    narrative = (
        f"Mercury selected {names_str} as the optimal portfolio, delivering an expected "
        f"{carbon:.1f} tCO2e of success-adjusted carbon reduction at a total cost of "
        f"AUD {cost:,.0f} — well within the AUD {B:,.0f} budget (portfolio CVaR AUD {cvar:,.0f})."
    )

    if cvar_excluded_names:
        excluded_str = " and ".join(cvar_excluded_names)
        narrative += (
            f" {excluded_str} was excluded because its inclusion in any affordable portfolio "
            f"combination pushed the CVaR above the AUD {Gamma:,.0f} risk cap."
        )

        excluded_interventions = [
            i for i in pipeline_results.interventions if i.name in cvar_excluded_names
        ]
        if excluded_interventions:
            exc = excluded_interventions[0]
            narrative += (
                f" This selection reverses the naive carbon-per-dollar ranking — "
                f"Mercury's risk adjustment penalises {exc.name}'s high tail-loss exposure "
                f"(CVaR AUD {exc.cvar_loss:,.0f})."
            )

    return narrative
