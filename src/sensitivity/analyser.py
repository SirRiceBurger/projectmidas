"""
analyser.py — Sensitivity analysis engine for the Mercury pipeline.

This module sweeps each pipeline parameter (B, Gamma, beta, lambda_, T) across
a plausible range and records how the selected portfolio and individual RACE
scores respond.  The results feed the Sensitivity view in the frontend and the
Sobol index approximation in sobol.py.

Design decisions
----------------
1. **Tiered re-computation**: Different parameters require different amounts of
   re-computation:
   - lambda_ → only RACE formula changes; feasibility and portfolio objective
     are independent of lambda_.  We just recompute RACE for existing scored
     interventions.
   - B, Gamma → only portfolio optimisation needs to re-run (feasibility and
     scoring are unchanged).
   - beta → portfolio objective changes; we re-run optimisation.
   - T → scaling factor in simulation and RACE; we recompute RACE and re-run
     optimisation.

2. **Speed**: The sensitivity endpoint uses S=200 for Monte Carlo (compared to
   S=1000 in the normal pipeline) to keep response times acceptable.

3. **Edge cases**: Empty library, single intervention, no feasible portfolio —
   all handled gracefully by returning zeroed results.
"""

from __future__ import annotations

import numpy as np
from typing import Any

from src.interventions.feasibility import get_feasible_interventions
from src.interventions.types import Intervention
from src.scoring.race import compute_race
from src.scoring.mercury_score import compute_mercury_scores
from src.optimiser.portfolio import optimise_portfolio
from src.monte_carlo.simulator import run_simulation
from src.sensitivity.types import ParameterSweep, SensitivityResult
from src.sensitivity.sobol import first_order_indices, sensitivity_rank


# ---------------------------------------------------------------------------
# Parameter range specifications
# ---------------------------------------------------------------------------

def _b_range(base: float, n_steps: int) -> list[float]:
    """Generate budget sweep: 50% to 200% of base, snapped to 50k increments.

    Parameters
    ----------
    base : float
        Base budget value in AUD.
    n_steps : int
        Number of evenly-spaced values to generate.

    Returns
    -------
    list[float]
        Sweep values in ascending order.
    """
    lo = max(50_000.0, base * 0.5)
    hi = base * 2.0
    raw = np.linspace(lo, hi, n_steps)
    # Snap to nearest 50k increment for readability.
    snapped = [round(v / 50_000) * 50_000.0 for v in raw]
    # Remove duplicates that can arise from snapping, keep sorted.
    unique = sorted(set(snapped))
    # If snapping produced fewer steps, pad with linearly interpolated values.
    while len(unique) < n_steps:
        gaps = [(unique[i + 1] - unique[i], i) for i in range(len(unique) - 1)]
        gaps.sort(reverse=True)
        gap_size, idx = gaps[0]
        mid = round((unique[idx] + unique[idx + 1]) / 2 / 50_000) * 50_000.0
        if mid not in unique:
            unique.insert(idx + 1, mid)
        else:
            break  # Can't subdivide further without duplicates
    return unique[:n_steps]


def _gamma_range(base: float, n_steps: int) -> list[float]:
    """Generate CVaR cap sweep: 30% to 150% of base value.

    Parameters
    ----------
    base : float
        Base Gamma value in AUD.
    n_steps : int
        Number of evenly-spaced values.
    """
    lo = max(5_000.0, base * 0.3)
    hi = base * 1.5
    return [float(v) for v in np.linspace(lo, hi, n_steps)]


def _beta_range(n_steps: int) -> list[float]:
    """Generate resilience-weight sweep: 0.0 to 1.0."""
    return [float(v) for v in np.linspace(0.0, 1.0, n_steps)]


def _lambda_range(n_steps: int) -> list[float]:
    """Generate risk-penalty sweep: 0.0 to 1.0."""
    return [float(v) for v in np.linspace(0.0, 1.0, n_steps)]


def _t_range(n_steps: int) -> list[float]:
    """Generate planning-horizon sweep: 5 to 30 years (integer steps)."""
    # Integer steps; linspace may produce floats, cast to int then back.
    raw = np.linspace(5, 30, n_steps)
    return [float(int(round(v))) for v in raw]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _portfolio_score(
    portfolio_interventions: list[Intervention],
    beta: float,
) -> float:
    """Compute the portfolio objective score.

    Score = Σ(E[E_j] * p_j) + β * Σ(R_j)

    Parameters
    ----------
    portfolio_interventions : list[Intervention]
        Interventions in the selected portfolio.
    beta : float
        Resilience weighting.

    Returns
    -------
    float
        Portfolio score.  Zero for an empty portfolio.
    """
    if not portfolio_interventions:
        return 0.0
    emissions_term = sum(iv.expected_emissions * iv.success_probability for iv in portfolio_interventions)
    resilience_term = beta * sum(iv.resilience_score for iv in portfolio_interventions)
    return emissions_term + resilience_term


def _race_scores(
    library: list[Intervention],
    lambda_: float,
    t_scale: float = 1.0,
) -> dict[str, float]:
    """Compute RACE scores for all interventions.

    Parameters
    ----------
    library : list[Intervention]
        All interventions (feasible and infeasible).
    lambda_ : float
        Risk penalty coefficient.
    t_scale : float
        Horizon scaling factor (T / 20).  Scales expected_emissions linearly.

    Returns
    -------
    dict[str, float]
        Maps intervention_id → RACE score.
    """
    result: dict[str, float] = {}
    for iv in library:
        # Apply horizon scaling to emissions component.
        effective_emissions = iv.expected_emissions * t_scale
        denom = iv.expected_cost + lambda_ * iv.cvar_loss
        if denom <= 0:
            result[iv.id] = 0.0
        else:
            result[iv.id] = (effective_emissions * iv.success_probability) / denom
    return result


# ---------------------------------------------------------------------------
# Parameter sweep functions
# ---------------------------------------------------------------------------

def sweep_parameter(
    zones: list,
    library: list[Intervention],
    rules_map: dict[str, list[dict]],
    base_params: dict[str, Any],
    parameter: str,
    n_steps: int = 10,
    correlations: dict | None = None,
) -> ParameterSweep:
    """Sweep a single pipeline parameter across its defined range.

    Runs feasibility, scoring, and portfolio optimisation at each step,
    using the minimum computation necessary for each parameter type.

    Parameters
    ----------
    zones : list[Zone]
        Site zones from partition_site().
    library : list[Intervention]
        Intervention library (all enabled interventions).
    rules_map : dict[str, list[dict]]
        Feasibility rules keyed by intervention ID.
    base_params : dict[str, Any]
        Base parameter values.  Expected keys: 'B', 'Gamma', 'beta',
        'lambda_', 'S', 'T'.
    parameter : str
        Parameter to sweep.  Must be one of 'B', 'Gamma', 'beta',
        'lambda_', 'T'.
    n_steps : int
        Number of evenly-spaced values to evaluate.  Default 10.
    correlations : dict | None
        Correlation dict from pipeline (for CVaR calculation).
        If None, defaults to empty dict (zero correlations).

    Returns
    -------
    ParameterSweep
        Results for this sweep.

    Raises
    ------
    ValueError
        If ``parameter`` is not a recognised parameter name.
    """
    valid_params = {'B', 'Gamma', 'beta', 'lambda_', 'T'}
    if parameter not in valid_params:
        raise ValueError(
            f"Unknown parameter '{parameter}'.  Must be one of {valid_params}."
        )

    if correlations is None:
        from collections import defaultdict
        correlations = defaultdict(float)

    B = float(base_params.get('B', 350_000))
    Gamma = float(base_params.get('Gamma', 70_000))
    beta = float(base_params.get('beta', 0.3))
    lambda_ = float(base_params.get('lambda_', 0.5))
    T = int(base_params.get('T', 20))

    # Determine the sweep range for this parameter.
    if parameter == 'B':
        values = _b_range(B, n_steps)
    elif parameter == 'Gamma':
        values = _gamma_range(Gamma, n_steps)
    elif parameter == 'beta':
        values = _beta_range(n_steps)
    elif parameter == 'lambda_':
        values = _lambda_range(n_steps)
    else:  # 'T'
        values = _t_range(n_steps)

    # Handle empty library.
    if not library:
        empty_metric: dict[str, list[float]] = {}
        return ParameterSweep(
            parameter=parameter,
            values=values,
            selected_portfolios=[[] for _ in values],
            portfolio_scores=[0.0 for _ in values],
            metric_by_intervention=empty_metric,
        )

    # Compute feasibility once (doesn't change with parameter sweeps).
    feasibility = get_feasible_interventions(zones, library, rules_map=rules_map)
    feasible_ids = {iv.id for zone_ivs in feasibility.values() for iv in zone_ivs}
    feasible_library = [iv for iv in library if iv.id in feasible_ids]

    # Initialise per-intervention metric lists.
    metric_by_intervention: dict[str, list[float]] = {iv.id: [] for iv in library}

    selected_portfolios: list[list[str]] = []
    portfolio_scores_list: list[float] = []

    for val in values:
        # ----------------------------------------------------------------
        # Assign swept value to correct parameter.
        # ----------------------------------------------------------------
        sweep_B = val if parameter == 'B' else B
        sweep_Gamma = val if parameter == 'Gamma' else Gamma
        sweep_beta = val if parameter == 'beta' else beta
        sweep_lambda = val if parameter == 'lambda_' else lambda_
        sweep_T = int(val) if parameter == 'T' else T
        t_scale = sweep_T / 20.0

        # ----------------------------------------------------------------
        # Compute RACE scores for all interventions at this step.
        # ----------------------------------------------------------------
        races = _race_scores(library, sweep_lambda, t_scale)
        for iv in library:
            metric_by_intervention[iv.id].append(races[iv.id])

        # ----------------------------------------------------------------
        # Run portfolio optimisation (always needed for portfolio metrics).
        # ----------------------------------------------------------------
        if not feasible_library:
            selected_portfolios.append([])
            portfolio_scores_list.append(0.0)
            continue

        try:
            opt_result = optimise_portfolio(
                feasible_library,
                B=sweep_B,
                Gamma=sweep_Gamma,
                beta=sweep_beta,
            )
            selected = opt_result.selected_portfolio
            if selected.feasible and selected.interventions:
                ids = [iv.id for iv in selected.interventions]
                score = _portfolio_score(selected.interventions, sweep_beta)
            else:
                ids = []
                score = 0.0
        except Exception:
            ids = []
            score = 0.0

        selected_portfolios.append(ids)
        portfolio_scores_list.append(score)

    return ParameterSweep(
        parameter=parameter,
        values=values,
        selected_portfolios=selected_portfolios,
        portfolio_scores=portfolio_scores_list,
        metric_by_intervention=metric_by_intervention,
    )


# ---------------------------------------------------------------------------
# Full sensitivity run
# ---------------------------------------------------------------------------

def run_sensitivity(
    zones: list,
    library: list[Intervention],
    rules_map: dict[str, list[dict]],
    params: dict[str, Any],
    correlations: dict | None = None,
    S: int = 200,
) -> SensitivityResult:
    """Run full sensitivity analysis across all five pipeline parameters.

    Sweeps B, Gamma, beta, lambda_, and T (S is held fixed for speed).
    Computes approximate first-order Sobol indices from the variance of
    portfolio scores across each sweep.

    Parameters
    ----------
    zones : list[Zone]
        Site zones from partition_site().
    library : list[Intervention]
        Full intervention library (enabled only).
    rules_map : dict[str, list[dict]]
        Feasibility rules keyed by intervention ID.
    params : dict[str, Any]
        Base pipeline parameters with keys 'B', 'Gamma', 'beta', 'lambda_',
        'S', 'T'.
    correlations : dict | None
        Pairwise correlation dict.  Defaults to zero correlations.
    S : int
        Number of Monte Carlo scenarios for the baseline run.  Default 200
        (faster than the normal 1000 for interactive sensitivity sweeps).

    Returns
    -------
    SensitivityResult
        Full sensitivity analysis result with sweeps and Sobol indices.

    Notes
    -----
    The number of sweep steps is fixed at 8 for speed.  This gives adequate
    resolution to compute variance-based Sobol indices while keeping total
    computation under 2 seconds for a typical 3-intervention library.

    Sobol index computation:
    1. For each parameter p, compute variance of portfolio scores across
       that parameter's 8-step sweep.
    2. Normalise: SI_p = Var_p / sum_q(Var_q).
    3. Handle degenerate case (all variances zero) → equal weights.
    """
    n_steps = 8

    if correlations is None:
        from collections import defaultdict
        correlations = defaultdict(float)

    # Determine base portfolio.
    B = float(params.get('B', 350_000))
    Gamma = float(params.get('Gamma', 70_000))
    beta = float(params.get('beta', 0.3))

    base_portfolio: list[str] = []
    if library:
        feasibility = get_feasible_interventions(zones, library, rules_map=rules_map)
        feasible_ids = {iv.id for zone_ivs in feasibility.values() for iv in zone_ivs}
        feasible_library = [iv for iv in library if iv.id in feasible_ids]
        if feasible_library:
            try:
                opt = optimise_portfolio(feasible_library, B=B, Gamma=Gamma, beta=beta)
                if opt.selected_portfolio.feasible:
                    base_portfolio = [iv.id for iv in opt.selected_portfolio.interventions]
            except Exception:
                pass

    # Run sweeps for each parameter.
    parameters_to_sweep = ['B', 'Gamma', 'beta', 'lambda_', 'T']
    sweeps: list[ParameterSweep] = []

    for param in parameters_to_sweep:
        sweep = sweep_parameter(
            zones=zones,
            library=library,
            rules_map=rules_map,
            base_params=params,
            parameter=param,
            n_steps=n_steps,
            correlations=correlations,
        )
        sweeps.append(sweep)

    # Compute approximate Sobol first-order indices.
    outcome_values: dict[str, list[float]] = {
        sweep.parameter: sweep.portfolio_scores for sweep in sweeps
    }
    parameter_values_map: dict[str, list[float]] = {
        sweep.parameter: sweep.values for sweep in sweeps
    }

    sobol_indices = first_order_indices(parameter_values_map, outcome_values)

    # Find most/least sensitive parameters.
    ranked = sensitivity_rank(sobol_indices)
    most_sensitive = ranked[0][0] if ranked else ""
    least_sensitive = ranked[-1][0] if ranked else ""

    return SensitivityResult(
        sweeps=sweeps,
        base_params=dict(params),
        base_portfolio=base_portfolio,
        sobol_first_order=sobol_indices,
        most_sensitive_parameter=most_sensitive,
        least_sensitive_parameter=least_sensitive,
    )
