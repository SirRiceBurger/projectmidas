from itertools import combinations
from typing import List

from src.interventions.types import Intervention
from src.optimiser.cvar import compute_portfolio_cvar
from src.optimiser.types import OptimisationResult, Portfolio


def build_portfolio(interventions: List[Intervention]) -> Portfolio:
    total_cost = sum(i.expected_cost for i in interventions)
    expected_emissions = sum(i.expected_emissions * i.success_probability for i in interventions)
    portfolio_cvar = compute_portfolio_cvar(interventions)
    return Portfolio(interventions, total_cost, expected_emissions, portfolio_cvar, feasible=True)


def optimise_portfolio(
    interventions: List[Intervention],
    B: float,
    Gamma: float,
    beta: float = 0.5,
) -> OptimisationResult:
    all_portfolios: List[Portfolio] = []
    rejected_reason = {}
    best: Portfolio | None = None
    best_score = -float("inf")

    for r in range(1, len(interventions) + 1):
        for combo in combinations(interventions, r):
            p = build_portfolio(list(combo))
            label = "+".join(i.id for i in sorted(combo, key=lambda x: x.id))

            if p.total_cost > B:
                rejected_reason[label] = f"cost {p.total_cost:.0f} exceeds budget {B:.0f}"
                all_portfolios.append(Portfolio(p.interventions, p.total_cost, p.expected_emissions, p.portfolio_cvar, feasible=False))
                continue

            if p.portfolio_cvar > Gamma:
                rejected_reason[label] = f"CVaR {p.portfolio_cvar:.0f} exceeds Gamma {Gamma:.0f}"
                all_portfolios.append(Portfolio(p.interventions, p.total_cost, p.expected_emissions, p.portfolio_cvar, feasible=False))
                continue

            all_portfolios.append(p)

            total_resilience = sum(i.resilience_score for i in combo)
            score = p.expected_emissions + beta * total_resilience
            if score > best_score:
                best_score = score
                best = p

    if best is None:
        best = Portfolio([], 0.0, 0.0, 0.0, feasible=False)

    return OptimisationResult(best, all_portfolios, rejected_reason)
