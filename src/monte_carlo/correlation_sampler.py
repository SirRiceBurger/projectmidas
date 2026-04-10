"""
correlation_sampler.py — Correlated loss sampling via Cholesky decomposition.

This module provides improved correlated loss sampling for Monte Carlo
simulation.  The standard simulator (simulator.py) samples losses
independently for each intervention.  When correlations between interventions
are significant (e.g. ρ=0.71 between I1 and I3), independent sampling
under-estimates the probability of simultaneous large losses and therefore
under-estimates portfolio CVaR.

Method
------
We use the Cholesky decomposition of the correlation matrix to induce
correlation structure in the sampled standard normals, then apply a
probability integral transform to map them to the desired marginal
distribution (exponential, calibrated to match CVaR targets).

Algorithm:
1. Build n×n correlation matrix C from pairwise (id_i, id_j, rho) tuples.
2. Ensure C is positive semi-definite (PSD) via eigenvalue clipping.
3. Compute Cholesky factor L such that L @ L.T ≈ C.
4. Sample Z ~ N(0, I_{n×n}) with shape (n_samples, n).
5. Apply correlation: W = Z @ L.T  → marginals are N(0,1), with
   Corr(W_i, W_j) ≈ C[i,j].
6. Transform to uniform: U = Phi(W) where Phi is the standard normal CDF.
7. Transform to exponential: X_i = -mu_i * log(1 - U_i), where mu_i is
   calibrated so that CVaR_alpha(Exp(mu_i)) == cvar_loss_i.

This is the Gaussian copula approach: marginals remain exponential with
correct CVaR calibration, but losses are correlated via the normal copula.

References
----------
- Li, D.X. (2000). On Default Correlation: A Copula Function Approach.
  Journal of Fixed Income, 9(4), 43–54.
- McNeil, A.J., Frey, R., Embrechts, P. (2015). Quantitative Risk Management
  (Revised ed.). Princeton University Press, Chapter 7.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np


def _ndtr(x: np.ndarray) -> np.ndarray:
    """Standard normal CDF implemented via the error function.

    Equivalent to scipy.special.ndtr but avoids the scipy dependency.
    Phi(x) = (1 + erf(x / sqrt(2))) / 2

    Uses math.erf via vectorised apply (works on all numpy versions).
    """
    import math
    sqrt2 = math.sqrt(2.0)
    flat = (x / sqrt2).ravel()
    result = np.empty(len(flat), dtype=float)
    for i, v in enumerate(flat):
        result[i] = (1.0 + math.erf(float(v))) / 2.0
    return result.reshape(x.shape)


# Minimum eigenvalue after clipping (ensures strict PSD).
_EIG_CLIP_EPS = 1e-8

# Minimum diagonal value (should be 1.0 for a correlation matrix).
_DIAG_VALUE = 1.0


# ---------------------------------------------------------------------------
# Correlation matrix construction
# ---------------------------------------------------------------------------

def build_correlation_matrix(
    intervention_ids: list[str],
    correlations: list[tuple[str, str, float]],
) -> np.ndarray:
    """Build an n×n correlation matrix from pairwise correlation tuples.

    Parameters
    ----------
    intervention_ids : list[str]
        Ordered list of intervention IDs.  Defines the row/column order.
    correlations : list[tuple[str, str, float]]
        List of (id_i, id_j, rho) tuples specifying off-diagonal entries.
        Pairs not present default to 0.0.  rho must be in [-1, 1].

    Returns
    -------
    np.ndarray
        Shape (n, n) correlation matrix.  Diagonal = 1.0, symmetric.
        Guaranteed PSD via eigenvalue clipping.

    Raises
    ------
    ValueError
        If any rho value is outside [-1.0, 1.0].

    Notes
    -----
    Eigenvalue clipping procedure:
    1. Eigen-decompose: C = V @ diag(λ) @ V.T
    2. Clip: λ_clipped = max(λ, eps)
    3. Reconstruct: C_psd = V @ diag(λ_clipped) @ V.T
    4. Rescale diagonal to 1.0 (correlation normalisation).
    This guarantees the result is valid correlation matrix and PSD.
    """
    n = len(intervention_ids)
    if n == 0:
        return np.empty((0, 0), dtype=float)

    id_to_idx = {id_: i for i, id_ in enumerate(intervention_ids)}
    C = np.eye(n, dtype=float)

    for id_i, id_j, rho in correlations:
        if abs(rho) > 1.0:
            raise ValueError(
                f"Correlation rho={rho} between '{id_i}' and '{id_j}' "
                f"is outside [-1, 1]."
            )
        i = id_to_idx.get(id_i)
        j = id_to_idx.get(id_j)
        if i is None or j is None:
            # Silently skip unknown intervention IDs.
            continue
        if i == j:
            continue  # diagonal stays 1.0
        C[i, j] = rho
        C[j, i] = rho

    # Ensure symmetry (in case of floating-point drift).
    C = (C + C.T) / 2.0
    np.fill_diagonal(C, 1.0)

    # Clip negative eigenvalues to ensure PSD.
    C = _clip_to_psd(C)
    return C


def _clip_to_psd(C: np.ndarray) -> np.ndarray:
    """Return the nearest positive semi-definite matrix via eigenvalue clipping.

    Parameters
    ----------
    C : np.ndarray
        Symmetric matrix (e.g. a near-PSD correlation matrix).

    Returns
    -------
    np.ndarray
        PSD matrix with diagonal renormalised to 1.0.
    """
    # Eigen-decomposition.  Force symmetry to get real eigenvalues.
    C_sym = (C + C.T) / 2.0
    eigenvalues, eigenvectors = np.linalg.eigh(C_sym)

    # Clip negative eigenvalues.
    eigenvalues_clipped = np.maximum(eigenvalues, _EIG_CLIP_EPS)

    # Reconstruct.
    C_psd = (eigenvectors * eigenvalues_clipped) @ eigenvectors.T

    # Renormalise diagonal to 1.0 (preserves correlation structure).
    d = np.sqrt(np.diag(C_psd))
    d = np.where(d < _EIG_CLIP_EPS, 1.0, d)
    C_psd = C_psd / np.outer(d, d)
    np.fill_diagonal(C_psd, 1.0)

    return C_psd


# ---------------------------------------------------------------------------
# Correlated normal sampling
# ---------------------------------------------------------------------------

def cholesky_sample(
    n_samples: int,
    n_interventions: int,
    correlation_matrix: np.ndarray,
    seed: int | None = None,
) -> np.ndarray:
    """Sample correlated standard normals via Cholesky decomposition.

    Parameters
    ----------
    n_samples : int
        Number of rows (samples / scenarios).
    n_interventions : int
        Number of columns (interventions / dimensions).
    correlation_matrix : np.ndarray
        Shape (n_interventions, n_interventions) PSD correlation matrix.
        Off-diagonal entries must be in [-1, 1].
    seed : int | None
        Optional RNG seed for reproducibility.

    Returns
    -------
    np.ndarray
        Shape (n_samples, n_interventions) matrix of correlated standard
        normals.  Each column has mean ≈ 0, std ≈ 1, and cross-column
        correlations approximately match the input matrix.

    Notes
    -----
    If Cholesky decomposition fails (e.g. matrix is not strictly PD despite
    clipping), falls back to eigen-decomposition, which is slower but
    numerically more robust.
    """
    if n_interventions == 0 or n_samples == 0:
        return np.empty((n_samples, n_interventions), dtype=float)

    rng = np.random.default_rng(seed)
    Z = rng.standard_normal((n_samples, n_interventions))

    if n_interventions == 1:
        return Z

    # Attempt Cholesky factorisation.
    try:
        L = np.linalg.cholesky(correlation_matrix)
        W = Z @ L.T
    except np.linalg.LinAlgError:
        # Fallback: use eigen-decomposition (handles borderline non-PD).
        W = _eigen_sample(Z, correlation_matrix)

    return W


def _eigen_sample(
    Z: np.ndarray,
    C: np.ndarray,
) -> np.ndarray:
    """Fallback correlated sampling via eigen-decomposition.

    Parameters
    ----------
    Z : np.ndarray
        Shape (n_samples, n) i.i.d. standard normals.
    C : np.ndarray
        Shape (n, n) correlation matrix (may be near-singular).

    Returns
    -------
    np.ndarray
        Shape (n_samples, n) correlated standard normals.
    """
    eigenvalues, eigenvectors = np.linalg.eigh(C)
    eigenvalues_pos = np.maximum(eigenvalues, 0.0)
    L_eigen = eigenvectors * np.sqrt(eigenvalues_pos)
    return Z @ L_eigen.T


# ---------------------------------------------------------------------------
# Full correlated loss sampling
# ---------------------------------------------------------------------------

def sample_correlated_losses(
    intervention_ids: list[str],
    cvar_losses: dict[str, float],
    correlations: list[tuple[str, str, float]],
    n_samples: int,
    alpha: float = 0.95,
    seed: int | None = None,
) -> dict[str, np.ndarray]:
    """Sample correlated losses using the Gaussian copula method.

    Each intervention's marginal loss distribution is exponential, calibrated
    so that CVaR_alpha(L_j) == cvar_loss_j.  Correlation structure is
    induced via a Gaussian copula.

    Parameters
    ----------
    intervention_ids : list[str]
        Ordered list of intervention IDs.
    cvar_losses : dict[str, float]
        Maps intervention_id → CVaR loss target (in AUD).
    correlations : list[tuple[str, str, float]]
        Pairwise correlations as (id_i, id_j, rho).
    n_samples : int
        Number of Monte Carlo samples.
    alpha : float
        CVaR confidence level.  Default 0.95.
    seed : int | None
        RNG seed for reproducibility.

    Returns
    -------
    dict[str, np.ndarray]
        Maps intervention_id → loss array of length n_samples.

    Notes
    -----
    Calibration: For X ~ Exp(mu), CVaR_alpha(X) = mu * (1 - ln(1 - alpha)).
    Therefore: mu = cvar_loss / (1 - ln(1 - alpha)).

    The copula transform:
    1. Sample W ~ N(0, C) using Cholesky (shape n_samples × n).
    2. Map to uniform: U = Phi(W) where Phi = standard normal CDF.
    3. Map to exponential: L = -mu * log(1 - U).
       (Inverse CDF of Exp(mu) evaluated at U.)
    """
    n = len(intervention_ids)
    if n == 0:
        return {}

    # Build correlation matrix.
    C = build_correlation_matrix(intervention_ids, correlations)

    # Sample correlated normals.
    W = cholesky_sample(n_samples, n, C, seed=seed)

    # Map to uniform via standard normal CDF.
    U = _ndtr(W)

    # Clip U away from 0 and 1 to avoid log(0) issues.
    eps = 1e-10
    U = np.clip(U, eps, 1.0 - eps)

    # CVaR calibration constant for exponential distribution.
    # CVaR_alpha(Exp(mu)) = mu * (1 - ln(1 - alpha))
    cvar_factor = 1.0 - math.log(1.0 - alpha)  # > 1 for alpha in (0,1)

    results: dict[str, np.ndarray] = {}
    for col_idx, iv_id in enumerate(intervention_ids):
        cvar_loss = cvar_losses.get(iv_id, 0.0)
        if cvar_loss <= 0.0:
            results[iv_id] = np.zeros(n_samples, dtype=float)
            continue

        # Calibrated mean of the exponential distribution.
        mu = cvar_loss / cvar_factor

        # Inverse CDF of Exp(mu): F^{-1}(u) = -mu * log(1 - u)
        u_col = U[:, col_idx]
        losses = -mu * np.log(1.0 - u_col)
        results[iv_id] = losses

    return results


# ---------------------------------------------------------------------------
# Utility: empirical correlation check
# ---------------------------------------------------------------------------

def empirical_correlation(
    loss_dict: dict[str, np.ndarray],
) -> dict[tuple[str, str], float]:
    """Compute empirical pairwise correlations from sampled loss arrays.

    Useful for validating that the Cholesky sampler has produced the
    desired correlation structure.

    Parameters
    ----------
    loss_dict : dict[str, np.ndarray]
        Maps intervention_id → loss array (all same length).

    Returns
    -------
    dict[tuple[str, str], float]
        Pairwise Pearson correlations.  Symmetric.
    """
    ids = sorted(loss_dict.keys())
    result: dict[tuple[str, str], float] = {}
    for i, id_i in enumerate(ids):
        for j, id_j in enumerate(ids):
            if i <= j:
                arr_i = loss_dict[id_i]
                arr_j = loss_dict[id_j]
                if len(arr_i) < 2 or np.std(arr_i) == 0 or np.std(arr_j) == 0:
                    rho = 0.0 if i != j else 1.0
                else:
                    rho = float(np.corrcoef(arr_i, arr_j)[0, 1])
                result[(id_i, id_j)] = rho
                result[(id_j, id_i)] = rho
    return result
