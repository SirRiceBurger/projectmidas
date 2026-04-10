"""
regime.py — Two-regime Markov-switching model for climate stress scenarios.

Background
----------
In the standard Monte Carlo simulator (simulator.py), losses are sampled from
stationary distributions without accounting for regime changes (e.g. a period
of severe drought followed by a period of normal conditions).  This module
introduces a two-regime Markov chain:

    State 0 (normal):  standard loss distribution
    State 1 (stress):  losses multiplied by stress_multiplier (e.g. 2.5×)

The Markov transition matrix governs how likely the system is to stay in each
regime or switch to the other.  A high normal_prob (e.g. 0.85) means the
system is predominantly in the normal regime, with infrequent stress episodes.

Mathematical basis
------------------
Markov chain:
    P(S_{t+1} = j | S_t = i) = transition_matrix[i, j]

Stationary distribution π satisfies π P = π.  For a 2×2 matrix with
transition probabilities p00, p11:
    π_0 = (1 - p11) / (2 - p00 - p11)
    π_1 = (1 - p00) / (2 - p00 - p11)

Regime-scaled CVaR:
    E[L_regime] = π_0 * E[L] + π_1 * stress_multiplier * E[L]
    CVaR_regime ≈ CVaR[scaled loss distribution]

Because stress episodes inflate losses, regime-CVaR >= base CVaR.  This
provides a conservative upper bound for risk assessment.

References
----------
- Hamilton, J.D. (1989). A New Approach to the Economic Analysis of
  Nonstationary Time Series and the Business Cycle. Econometrica, 57(2).
- Ang, A. & Bekaert, G. (2002). Regime Switches in Interest Rates.
  Journal of Business & Economic Statistics, 20(2), 163–182.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


# ---------------------------------------------------------------------------
# Parameter dataclass
# ---------------------------------------------------------------------------

@dataclass
class RegimeParams:
    """Parameters for the two-regime Markov-switching model.

    Attributes
    ----------
    normal_prob : float
        Probability of staying in the normal regime (transition p00).
        Must be in (0, 1).  Default: 0.85.
    stress_multiplier : float
        Factor by which losses are scaled in the stress regime.
        Must be >= 1.0.  Default: 2.5.
    transition_matrix : np.ndarray | None
        2×2 row-stochastic Markov transition matrix.  If None, constructed
        from normal_prob and a default stress-persistence probability (0.6).
        Row 0: [normal → normal, normal → stress]
        Row 1: [stress → normal, stress → stress]
    initial_state : int
        Starting state for regime simulation (0=normal, 1=stress).
        Default: 0.
    """

    normal_prob: float = 0.85
    stress_multiplier: float = 2.5
    transition_matrix: np.ndarray | None = field(default=None, repr=False)
    initial_state: int = 0

    def __post_init__(self) -> None:
        if not (0.0 < self.normal_prob < 1.0):
            raise ValueError(
                f"normal_prob must be in (0, 1), got {self.normal_prob}"
            )
        if self.stress_multiplier < 1.0:
            raise ValueError(
                f"stress_multiplier must be >= 1.0, got {self.stress_multiplier}"
            )
        if self.initial_state not in (0, 1):
            raise ValueError(
                f"initial_state must be 0 or 1, got {self.initial_state}"
            )
        if self.transition_matrix is None:
            # Default: stress regime has 60% persistence.
            stress_persist = 0.6
            self.transition_matrix = np.array([
                [self.normal_prob,       1.0 - self.normal_prob],
                [1.0 - stress_persist,  stress_persist],
            ])
        else:
            self.transition_matrix = np.asarray(self.transition_matrix, dtype=float)
            _validate_transition_matrix(self.transition_matrix)

    @property
    def stationary_distribution(self) -> np.ndarray:
        """Compute the stationary distribution of the Markov chain.

        Returns
        -------
        np.ndarray
            Shape (2,) array [pi_normal, pi_stress].
        """
        P = self.transition_matrix
        p00 = P[0, 0]
        p11 = P[1, 1]
        denom = 2.0 - p00 - p11
        if abs(denom) < 1e-12:
            return np.array([0.5, 0.5])
        pi_0 = (1.0 - p11) / denom
        pi_1 = (1.0 - p00) / denom
        return np.array([pi_0, pi_1])


def _validate_transition_matrix(P: np.ndarray) -> None:
    """Validate that P is a 2×2 row-stochastic matrix.

    Raises
    ------
    ValueError
        If P has wrong shape or rows don't sum to 1.
    """
    if P.shape != (2, 2):
        raise ValueError(f"transition_matrix must be shape (2, 2), got {P.shape}")
    for i in range(2):
        row_sum = float(P[i].sum())
        if abs(row_sum - 1.0) > 1e-6:
            raise ValueError(
                f"Row {i} of transition_matrix sums to {row_sum:.6f}, not 1.0"
            )
    if np.any(P < 0.0):
        raise ValueError("transition_matrix entries must be non-negative")


# ---------------------------------------------------------------------------
# Regime sequence simulation
# ---------------------------------------------------------------------------

def simulate_regime_sequence(
    n_steps: int,
    params: RegimeParams,
    seed: int | None = None,
) -> np.ndarray:
    """Simulate a Markov chain of regime states.

    Parameters
    ----------
    n_steps : int
        Number of time steps to simulate.
    params : RegimeParams
        Model parameters including transition matrix.
    seed : int | None
        RNG seed for reproducibility.

    Returns
    -------
    np.ndarray
        Shape (n_steps,) integer array with values 0 (normal) or 1 (stress).

    Notes
    -----
    The simulation starts from params.initial_state (default 0 = normal).
    Each step draws from the appropriate row of the transition matrix.
    """
    if n_steps <= 0:
        return np.empty(0, dtype=int)

    rng = np.random.default_rng(seed)
    P = params.transition_matrix
    states = np.empty(n_steps, dtype=int)
    state = params.initial_state

    for t in range(n_steps):
        states[t] = state
        # Draw next state from the transition distribution.
        state = int(rng.choice(2, p=P[state]))

    return states


# ---------------------------------------------------------------------------
# Regime scaling
# ---------------------------------------------------------------------------

def apply_regime_scaling(
    losses: np.ndarray,
    regime_sequence: np.ndarray,
    params: RegimeParams,
) -> np.ndarray:
    """Apply regime-dependent scaling to a loss array.

    In the stress regime, losses are multiplied by params.stress_multiplier.
    In the normal regime, losses are unchanged.

    Parameters
    ----------
    losses : np.ndarray
        Shape (n,) loss samples.  Each element corresponds to one time step
        or scenario.
    regime_sequence : np.ndarray
        Shape (n,) array of regime states (0=normal, 1=stress).
        Must have the same length as losses.
    params : RegimeParams
        Model parameters.

    Returns
    -------
    np.ndarray
        Shape (n,) scaled loss array.

    Raises
    ------
    ValueError
        If losses and regime_sequence have different lengths.
    """
    losses = np.asarray(losses, dtype=float)
    regime_sequence = np.asarray(regime_sequence, dtype=int)

    if len(losses) != len(regime_sequence):
        raise ValueError(
            f"losses (len {len(losses)}) and regime_sequence (len "
            f"{len(regime_sequence)}) must have the same length"
        )

    scaled = losses.copy()
    stress_mask = regime_sequence == 1
    scaled[stress_mask] *= params.stress_multiplier
    return scaled


# ---------------------------------------------------------------------------
# Regime-aware CVaR
# ---------------------------------------------------------------------------

def compute_regime_cvar(
    losses: np.ndarray,
    alpha: float = 0.95,
) -> float:
    """Compute CVaR at confidence level alpha from a loss array.

    CVaR (Conditional Value-at-Risk, also known as Expected Shortfall) is
    the expected value of losses exceeding the alpha-quantile:

        CVaR_alpha = E[L | L >= VaR_alpha]

    where VaR_alpha is the alpha-quantile of the loss distribution.

    Parameters
    ----------
    losses : np.ndarray
        Loss samples (may include regime scaling).
    alpha : float
        Confidence level.  Default 0.95.  Must be in (0, 1).

    Returns
    -------
    float
        CVaR at the given confidence level.  Returns 0.0 for empty arrays
        or when no losses exceed the VaR threshold.

    Notes
    -----
    This is the standard empirical CVaR estimator:
        1. Sort losses.
        2. VaR = quantile(losses, alpha).
        3. CVaR = mean(losses[losses >= VaR]).
    For large sample sizes this converges to the true CVaR of the
    underlying distribution.
    """
    losses = np.asarray(losses, dtype=float)
    if len(losses) == 0:
        return 0.0

    if not (0.0 < alpha < 1.0):
        raise ValueError(f"alpha must be in (0, 1), got {alpha}")

    var_threshold = float(np.quantile(losses, alpha))
    tail_losses = losses[losses >= var_threshold]

    if len(tail_losses) == 0:
        return var_threshold

    return float(np.mean(tail_losses))


# ---------------------------------------------------------------------------
# Full regime-aware simulation
# ---------------------------------------------------------------------------

def simulate_regime_losses(
    cvar_loss: float,
    n_samples: int,
    params: RegimeParams,
    alpha: float = 0.95,
    seed: int | None = None,
) -> np.ndarray:
    """Simulate regime-scaled losses for a single intervention.

    Generates n_samples loss values where each is drawn from an exponential
    distribution (calibrated to cvar_loss) and then scaled by regime state.

    Parameters
    ----------
    cvar_loss : float
        Target CVaR loss for the intervention (calibrates the exponential mean).
    n_samples : int
        Number of scenarios.
    params : RegimeParams
        Regime model parameters.
    alpha : float
        CVaR confidence level.  Default 0.95.
    seed : int | None
        RNG seed.

    Returns
    -------
    np.ndarray
        Shape (n_samples,) array of regime-scaled loss values.
    """
    import math
    if cvar_loss <= 0.0:
        return np.zeros(n_samples, dtype=float)

    # Calibrate exponential mean.
    cvar_factor = 1.0 - math.log(1.0 - alpha)
    mu = cvar_loss / cvar_factor

    rng = np.random.default_rng(seed)
    base_losses = rng.exponential(scale=mu, size=n_samples)

    # Simulate regime sequence.
    regimes = simulate_regime_sequence(n_samples, params, seed=seed)

    # Apply scaling.
    return apply_regime_scaling(base_losses, regimes, params)


def regime_cvar_ratio(
    cvar_loss: float,
    params: RegimeParams,
    n_samples: int = 10_000,
    alpha: float = 0.95,
    seed: int | None = 42,
) -> float:
    """Estimate the ratio CVaR_regime / CVaR_base.

    This quantifies how much the regime model inflates the CVaR relative
    to the base (no-regime) exponential distribution.

    Parameters
    ----------
    cvar_loss : float
        Target CVaR from the base distribution.
    params : RegimeParams
        Regime parameters.
    n_samples : int
        Number of Monte Carlo samples.  Default 10,000.
    alpha : float
        CVaR confidence level.  Default 0.95.
    seed : int | None
        RNG seed.

    Returns
    -------
    float
        Ratio >= 1.0.  Values > 1 indicate the regime model inflates CVaR.
    """
    if cvar_loss <= 0.0:
        return 1.0

    regime_losses = simulate_regime_losses(cvar_loss, n_samples, params, alpha, seed)
    regime_cvar = compute_regime_cvar(regime_losses, alpha)

    if cvar_loss == 0.0:
        return 1.0

    return regime_cvar / cvar_loss
