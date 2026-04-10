"""
sobol.py — Approximate Sobol first-order sensitivity indices.

Mathematical background
-----------------------
The Sobol variance-based sensitivity framework decomposes the variance of a
model output Y = f(X1, X2, ..., Xk) into contributions from each input Xi
and their interactions.  The first-order Sobol index Si is defined as:

    Si = Var_Xi( E_{X~i}(Y | Xi) ) / Var(Y)

where X~i denotes all inputs except Xi.

Computing the exact Sobol index requires a full quasi-Monte Carlo design
(Saltelli 2002) with O(N*(k+2)) model evaluations.  For this module we use
a much cheaper approximation that is appropriate for online/interactive use:

    SI_j ≈ Var_j(Y) / Σ_j Var_j(Y)

where Var_j(Y) is the variance of the pipeline output (portfolio score) when
parameter j is swept across its range while all other parameters are held
fixed at their base values.

This is equivalent to a one-at-a-time (OAT) sensitivity decomposition
normalised to sum to 1.  It over-estimates the importance of parameters with
high individual variance and ignores interaction effects, but is sufficient
for ranking parameter importance in a decision-support context.

References
----------
- Saltelli, A. et al. (2008). Global Sensitivity Analysis: The Primer.
  Wiley, Chichester.
- Pianosi, F. et al. (2016). Sensitivity analysis of environmental models.
  Environmental Modelling & Software, 79, 214–232.
"""

from __future__ import annotations

import numpy as np


def first_order_indices(
    parameter_values: dict[str, list[float]],
    outcome_values: dict[str, list[float]],
) -> dict[str, float]:
    """Compute approximate first-order Sobol indices.

    For each parameter, we compute the variance of the outcome across its
    sweep, then normalise so all indices sum to 1.0.

    Parameters
    ----------
    parameter_values : dict[str, list[float]]
        Maps each parameter name to the list of values it was swept over.
        Used only to validate consistency with outcome_values.
    outcome_values : dict[str, list[float]]
        Maps each parameter name to the list of outcome values recorded
        at each step of that parameter's sweep.  Must have the same keys
        as parameter_values.

    Returns
    -------
    dict[str, float]
        Normalised first-order sensitivity index for each parameter.
        Values are non-negative and sum to 1.0 (within floating-point
        tolerance).  Returns equal weights if all variances are zero
        (degenerate case where all outcomes are identical).

    Raises
    ------
    ValueError
        If parameter_values and outcome_values have different key sets,
        or if any outcome list has fewer than 2 entries.

    Notes
    -----
    The approximation is:
        raw_i  = Var(outcome_i)           # variance across the sweep
        SI_i   = raw_i / Σ_j raw_j        # normalise

    When Σ_j raw_j == 0 (all outcomes identical across all sweeps), we
    return equal weights 1/k to avoid division by zero.
    """
    if set(parameter_values.keys()) != set(outcome_values.keys()):
        raise ValueError(
            "parameter_values and outcome_values must have the same keys.  "
            f"Got parameter_values keys: {sorted(parameter_values.keys())} "
            f"and outcome_values keys: {sorted(outcome_values.keys())}"
        )

    params = sorted(parameter_values.keys())

    # Validate that each sweep has at least 1 point (variance needs >=2 but
    # we handle length-1 gracefully by returning 0 variance).
    for p in params:
        outcomes = outcome_values[p]
        if len(outcomes) == 0:
            raise ValueError(
                f"outcome_values['{p}'] is empty — at least 1 value is required"
            )

    # Compute per-parameter variance.
    raw_variances: dict[str, float] = {}
    for p in params:
        arr = np.asarray(outcome_values[p], dtype=float)
        if len(arr) < 2:
            raw_variances[p] = 0.0
        else:
            raw_variances[p] = float(np.var(arr, ddof=0))

    total_variance = sum(raw_variances.values())

    if total_variance <= 0.0:
        # Degenerate case: all outcomes identical across all sweeps.
        # Return equal weights.
        equal_weight = 1.0 / len(params) if params else 0.0
        return {p: equal_weight for p in params}

    # Normalise.
    indices: dict[str, float] = {}
    for p in params:
        indices[p] = raw_variances[p] / total_variance

    return indices


def sensitivity_rank(
    indices: dict[str, float],
) -> list[tuple[str, float]]:
    """Return parameters sorted by sensitivity index descending.

    Parameters
    ----------
    indices : dict[str, float]
        First-order sensitivity indices as returned by first_order_indices().

    Returns
    -------
    list[tuple[str, float]]
        List of (parameter_name, index_value) tuples sorted from most
        sensitive to least sensitive.

    Examples
    --------
    >>> indices = {'B': 0.4, 'Gamma': 0.3, 'beta': 0.15, 'lambda_': 0.1, 'T': 0.05}
    >>> sensitivity_rank(indices)
    [('B', 0.4), ('Gamma', 0.3), ('beta', 0.15), ('lambda_', 0.1), ('T', 0.05)]
    """
    return sorted(indices.items(), key=lambda kv: kv[1], reverse=True)


def validate_indices(indices: dict[str, float], tol: float = 1e-6) -> bool:
    """Return True if indices sum to 1.0 within the given tolerance.

    Useful as a post-condition check in unit tests.

    Parameters
    ----------
    indices : dict[str, float]
        Sensitivity indices to validate.
    tol : float
        Absolute tolerance.  Defaults to 1e-6.

    Returns
    -------
    bool
        True if abs(sum(indices.values()) - 1.0) < tol, else False.
    """
    if not indices:
        return False
    total = sum(indices.values())
    return abs(total - 1.0) < tol


def pairwise_covariance(
    sweeps: dict[str, list[float]],
) -> dict[tuple[str, str], float]:
    """Compute pairwise covariances between outcome sweeps.

    This is a utility function that can surface interaction effects:
    if two parameters have highly correlated outcomes, they may interact
    strongly.

    Parameters
    ----------
    sweeps : dict[str, list[float]]
        Maps each parameter name to the list of outcome values at each
        sweep step.  All lists must have the same length.

    Returns
    -------
    dict[tuple[str, str], float]
        Pairwise covariances.  The matrix is symmetric: cov(i, j) == cov(j, i).

    Raises
    ------
    ValueError
        If sweep lengths are inconsistent.

    Notes
    -----
    Covariances are sample covariances (ddof=1).  When a sweep has fewer
    than 2 points, covariance is 0.0.
    """
    params = sorted(sweeps.keys())
    lengths = {p: len(sweeps[p]) for p in params}
    if len(set(lengths.values())) > 1:
        raise ValueError(
            f"Inconsistent sweep lengths: {lengths}.  All must be equal."
        )

    result: dict[tuple[str, str], float] = {}
    for i, pi in enumerate(params):
        for j, pj in enumerate(params):
            ai = np.asarray(sweeps[pi], dtype=float)
            aj = np.asarray(sweeps[pj], dtype=float)
            if len(ai) < 2:
                result[(pi, pj)] = 0.0
            else:
                result[(pi, pj)] = float(np.cov(ai, aj, ddof=1)[0, 1])

    return result


def effect_size(
    base_outcome: float,
    sweep_outcomes: list[float],
) -> float:
    """Cohen's d-like effect size for a sweep relative to the base outcome.

    Measures how large the sweep-induced variation is relative to the
    spread (std dev) of the sweep outcomes.

    Parameters
    ----------
    base_outcome : float
        The outcome value at the base parameter setting.
    sweep_outcomes : list[float]
        Outcome values across the sweep (including the base value if desired).

    Returns
    -------
    float
        abs(mean(sweep_outcomes) - base_outcome) / std(sweep_outcomes).
        Returns 0.0 if std == 0.
    """
    arr = np.asarray(sweep_outcomes, dtype=float)
    if len(arr) < 2:
        return 0.0
    std = float(np.std(arr, ddof=1))
    if std == 0.0:
        return 0.0
    return float(abs(np.mean(arr) - base_outcome) / std)


def bootstrap_confidence(
    outcome_values: list[float],
    n_bootstrap: int = 500,
    alpha: float = 0.95,
    seed: int | None = None,
) -> tuple[float, float]:
    """Bootstrap 95% confidence interval for a sweep's variance estimate.

    Provides uncertainty quantification for the Sobol index numerator.

    Parameters
    ----------
    outcome_values : list[float]
        Outcome values from one parameter sweep.
    n_bootstrap : int
        Number of bootstrap resamples.  Default 500.
    alpha : float
        Confidence level (0 < alpha < 1).  Default 0.95.
    seed : int | None
        Random seed for reproducibility.

    Returns
    -------
    tuple[float, float]
        (lower_bound, upper_bound) of the confidence interval for the
        variance of outcome_values.
    """
    arr = np.asarray(outcome_values, dtype=float)
    if len(arr) < 2:
        return (0.0, 0.0)

    rng = np.random.default_rng(seed)
    boot_vars = np.empty(n_bootstrap)
    for i in range(n_bootstrap):
        sample = rng.choice(arr, size=len(arr), replace=True)
        boot_vars[i] = np.var(sample, ddof=0)

    lo = float(np.percentile(boot_vars, (1 - alpha) / 2 * 100))
    hi = float(np.percentile(boot_vars, (1 + alpha) / 2 * 100))
    return (lo, hi)
