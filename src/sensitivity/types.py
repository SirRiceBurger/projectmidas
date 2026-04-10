"""
types.py — Data structures for the sensitivity analysis engine.

The sensitivity module sweeps each pipeline parameter across a plausible range
and records how outcomes (selected portfolio, portfolio score, per-intervention
RACE) vary.  Results are collected into ParameterSweep objects and then
aggregated into a SensitivityResult which also includes Sobol first-order
indices approximated from the variance of outcomes across sweeps.

Design notes
------------
- Parameters swept: B (budget cap), Gamma (CVaR cap), beta (resilience weight),
  lambda_ (risk penalty in RACE), T (planning horizon in years).
- S (Monte Carlo scenario count) is NOT swept — running the full simulator
  across many S values would be prohibitively slow.
- Sobol indices are approximated as the fraction of total outcome variance
  explained by each parameter's sweep:
      SI_j = Var(score | param_j swept) / sum_j Var(score | param_j swept)
  This is a variance-based decomposition, not the full Saltelli estimator, but
  it is fast and sufficient for ranking parameter importance.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParameterSweep:
    """Result of sweeping one pipeline parameter across a range of values.

    Each attribute is a list of length n_steps, where entry i corresponds to
    the i-th value in ``values``.

    Attributes
    ----------
    parameter : str
        Name of the swept parameter.  One of 'B', 'Gamma', 'beta',
        'lambda_', 'T'.
    values : list[float]
        The concrete parameter values evaluated.  Length n_steps.
    selected_portfolios : list[list[str]]
        Intervention IDs in the selected portfolio at each step.  An empty
        list indicates that no feasible portfolio was found.
    portfolio_scores : list[float]
        Objective score of the selected portfolio at each step.  The score
        formula is:  sum(E[E_j] * p_j) + beta * sum(R_j)  for selected j.
        Zero when no feasible portfolio exists.
    metric_by_intervention : dict[str, list[float]]
        Maps each intervention ID to its per-step RACE score.  Length of
        each value list equals len(values).  Allows plotting how individual
        RACE scores evolve as the parameter changes.
    """

    parameter: str
    values: list[float]
    selected_portfolios: list[list[str]]
    portfolio_scores: list[float]
    metric_by_intervention: dict[str, list[float]]

    def __post_init__(self) -> None:
        n = len(self.values)
        if len(self.selected_portfolios) != n:
            raise ValueError(
                f"selected_portfolios length {len(self.selected_portfolios)} "
                f"!= values length {n}"
            )
        if len(self.portfolio_scores) != n:
            raise ValueError(
                f"portfolio_scores length {len(self.portfolio_scores)} "
                f"!= values length {n}"
            )
        for iv_id, scores in self.metric_by_intervention.items():
            if len(scores) != n:
                raise ValueError(
                    f"metric_by_intervention['{iv_id}'] length {len(scores)} "
                    f"!= values length {n}"
                )

    @property
    def score_variance(self) -> float:
        """Variance of portfolio_scores across the sweep.

        Used as the numerator for approximated Sobol first-order indices.
        Returns 0.0 when the sweep has fewer than 2 data points.
        """
        if len(self.portfolio_scores) < 2:
            return 0.0
        mean = sum(self.portfolio_scores) / len(self.portfolio_scores)
        return sum((s - mean) ** 2 for s in self.portfolio_scores) / len(
            self.portfolio_scores
        )

    @property
    def score_range(self) -> float:
        """Max − min portfolio score across the sweep.

        A quick non-normalised sensitivity indicator.
        """
        if not self.portfolio_scores:
            return 0.0
        return max(self.portfolio_scores) - min(self.portfolio_scores)


@dataclass
class SensitivityResult:
    """Full sensitivity analysis result aggregating sweeps across all parameters.

    Attributes
    ----------
    sweeps : list[ParameterSweep]
        One ParameterSweep per swept parameter (B, Gamma, beta, lambda_, T).
    base_params : dict[str, Any]
        The parameter values used as the base point (centre) of each sweep.
        Keys: 'B', 'Gamma', 'beta', 'lambda_', 'S', 'T'.
    base_portfolio : list[str]
        Intervention IDs in the portfolio selected at the base parameter values.
    sobol_first_order : dict[str, float]
        Approximate first-order Sobol index for each swept parameter.
        Values sum to 1.0 (normalised across swept parameters).
        A higher value indicates that varying this parameter explains a larger
        fraction of the total portfolio-score variance across all sweeps.
    most_sensitive_parameter : str
        Name of the parameter with the highest Sobol index.
    least_sensitive_parameter : str
        Name of the parameter with the lowest Sobol index.
    """

    sweeps: list[ParameterSweep]
    base_params: dict[str, Any]
    base_portfolio: list[str]
    sobol_first_order: dict[str, float] = field(default_factory=dict)
    most_sensitive_parameter: str = ""
    least_sensitive_parameter: str = ""

    def get_sweep(self, parameter: str) -> ParameterSweep | None:
        """Return the sweep for the given parameter name, or None."""
        for sweep in self.sweeps:
            if sweep.parameter == parameter:
                return sweep
        return None

    @property
    def swept_parameters(self) -> list[str]:
        """Names of all swept parameters, in sweep order."""
        return [s.parameter for s in self.sweeps]
