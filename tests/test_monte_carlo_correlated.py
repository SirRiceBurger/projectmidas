"""
test_monte_carlo_correlated.py — Tests for correlated Monte Carlo sampling.

Tests cover:
- Independent samples (zero correlation → near-zero empirical correlation).
- Perfect correlation (rho=1.0 → samples are identical within tolerance).
- PSD guarantee: correlation matrix is PSD after eigenvalue clipping.
- Cholesky fallback: non-PSD matrix triggers fallback without exception.
- Marginal calibration: CVaR of sampled losses matches target within tolerance.
- Regime model: sequence statistics, CVaR inflation, scaling correctness.
"""

from __future__ import annotations

import pytest
import numpy as np

from src.monte_carlo.correlation_sampler import (
    build_correlation_matrix,
    cholesky_sample,
    sample_correlated_losses,
    empirical_correlation,
    _clip_to_psd,
    _eigen_sample,
)
from src.monte_carlo.regime import (
    RegimeParams,
    simulate_regime_sequence,
    apply_regime_scaling,
    compute_regime_cvar,
    simulate_regime_losses,
    regime_cvar_ratio,
    _validate_transition_matrix,
)


# ---------------------------------------------------------------------------
# A: Independent samples (zero correlation)
# ---------------------------------------------------------------------------

class TestIndependentSamples:
    """Zero-correlation inputs should yield near-independent samples."""

    def test_zero_correlation_gives_near_zero_empirical(self):
        """With no correlations specified, empirical correlation ≈ 0."""
        intervention_ids = ['A', 'B', 'C']
        cvar_losses = {'A': 40_000.0, 'B': 60_000.0, 'C': 20_000.0}

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=[],
            n_samples=10_000,
            seed=42,
        )

        emp = empirical_correlation(losses)

        for id_i in intervention_ids:
            for id_j in intervention_ids:
                if id_i == id_j:
                    continue
                rho = emp[(id_i, id_j)]
                assert abs(rho) < 0.05, (
                    f"Expected near-zero correlation ({id_i},{id_j}), got {rho:.4f}"
                )

    def test_identity_correlation_matrix_from_no_pairs(self):
        """No pairwise correlations → identity matrix."""
        ids = ['X', 'Y', 'Z']
        C = build_correlation_matrix(ids, correlations=[])
        np.testing.assert_allclose(C, np.eye(3), atol=1e-12)

    def test_independent_marginals_correct_scale(self):
        """Even with zero correlation, marginal CVaR should match target."""
        intervention_ids = ['I1']
        cvar_loss_target = 40_000.0

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses={'I1': cvar_loss_target},
            correlations=[],
            n_samples=50_000,
            alpha=0.95,
            seed=99,
        )

        # Compute empirical CVaR.
        arr = losses['I1']
        var_95 = float(np.quantile(arr, 0.95))
        cvar_95 = float(np.mean(arr[arr >= var_95]))

        # Should be within 10% of target.
        rel_err = abs(cvar_95 - cvar_loss_target) / cvar_loss_target
        assert rel_err < 0.10, (
            f"Marginal CVaR {cvar_95:.0f} differs from target {cvar_loss_target:.0f} "
            f"by {rel_err*100:.1f}%"
        )


# ---------------------------------------------------------------------------
# B: Perfect correlation
# ---------------------------------------------------------------------------

class TestPerfectCorrelation:
    """rho = 1.0 should yield nearly identical loss samples."""

    def test_perfect_positive_correlation_identical_samples(self):
        """rho=1.0 → samples for A and B should be highly correlated (>0.99)."""
        intervention_ids = ['A', 'B']
        cvar_losses = {'A': 40_000.0, 'B': 40_000.0}
        correlations_input = [('A', 'B', 0.999)]  # Use 0.999 to avoid numerical singularity

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=correlations_input,
            n_samples=5_000,
            seed=1,
        )

        emp = empirical_correlation(losses)
        rho = emp[('A', 'B')]
        assert rho > 0.97, (
            f"Expected near-perfect correlation (>0.97), got {rho:.4f}"
        )

    def test_perfect_correlation_cholesky_samples_consistent(self):
        """Cholesky samples with rho=0.99 matrix should give correlated outputs."""
        C = np.array([[1.0, 0.99], [0.99, 1.0]])
        W = cholesky_sample(n_samples=5_000, n_interventions=2, correlation_matrix=C, seed=42)

        # Empirical correlation of the normal samples.
        rho_empirical = float(np.corrcoef(W[:, 0], W[:, 1])[0, 1])
        assert rho_empirical > 0.97, (
            f"Cholesky samples should have high correlation, got {rho_empirical:.4f}"
        )

    def test_negative_correlation_anti_correlated(self):
        """rho=-0.9 should give strongly anti-correlated samples."""
        intervention_ids = ['A', 'B']
        cvar_losses = {'A': 30_000.0, 'B': 30_000.0}
        correlations_input = [('A', 'B', -0.9)]

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=correlations_input,
            n_samples=10_000,
            seed=5,
        )

        emp = empirical_correlation(losses)
        rho = emp[('A', 'B')]
        # Due to the exponential marginals (non-symmetric), negative correlation
        # is partially attenuated; we expect meaningfully negative.
        assert rho < -0.5, (
            f"Expected negative correlation (<-0.5), got {rho:.4f}"
        )


# ---------------------------------------------------------------------------
# C: PSD guarantee
# ---------------------------------------------------------------------------

class TestCorrelationMatrixPSD:
    """Correlation matrix should be PSD after eigenvalue clipping."""

    def test_psd_after_clipping_borderline_matrix(self):
        """A matrix with a near-zero eigenvalue should become strictly PSD."""
        # Create a borderline correlation matrix with near-zero smallest eigenvalue.
        C = np.array([
            [1.0, 0.9, 0.9],
            [0.9, 1.0, 0.9],
            [0.9, 0.9, 1.0],
        ])  # This has one small eigenvalue.

        ids = ['A', 'B', 'C']
        correlations = [
            ('A', 'B', 0.9), ('A', 'C', 0.9), ('B', 'C', 0.9),
        ]
        C_built = build_correlation_matrix(ids, correlations)

        eigenvalues = np.linalg.eigvalsh(C_built)
        assert np.all(eigenvalues >= -1e-9), (
            f"Expected non-negative eigenvalues, got min={eigenvalues.min():.2e}"
        )

    def test_diagonal_is_one_after_clipping(self):
        """After PSD clipping and renormalisation, diagonal should be 1.0."""
        ids = ['I1', 'I2', 'I3']
        correlations = [
            ('I1', 'I2', 0.99), ('I1', 'I3', 0.99), ('I2', 'I3', 0.99),
        ]
        C = build_correlation_matrix(ids, correlations)
        np.testing.assert_allclose(np.diag(C), 1.0, atol=1e-9)

    def test_symmetric_correlation_matrix(self):
        """Correlation matrix should be symmetric."""
        ids = ['A', 'B', 'C', 'D']
        correlations = [
            ('A', 'B', 0.5), ('A', 'C', 0.3), ('B', 'D', -0.2),
        ]
        C = build_correlation_matrix(ids, correlations)
        np.testing.assert_allclose(C, C.T, atol=1e-12)

    def test_unknown_ids_silently_ignored(self):
        """Correlation tuples with unknown IDs should be silently ignored."""
        ids = ['A', 'B']
        correlations = [
            ('A', 'B', 0.4),
            ('X', 'Y', 0.9),  # Unknown IDs — should not raise
        ]
        C = build_correlation_matrix(ids, correlations)
        assert C.shape == (2, 2)
        assert C[0, 1] == pytest.approx(0.4)

    def test_rho_out_of_range_raises(self):
        """rho outside [-1, 1] should raise ValueError."""
        ids = ['A', 'B']
        with pytest.raises(ValueError, match="outside \\[-1, 1\\]"):
            build_correlation_matrix(ids, [('A', 'B', 1.5)])

    def test_empty_ids_returns_empty_matrix(self):
        """Empty intervention list → empty 0×0 matrix."""
        C = build_correlation_matrix([], [])
        assert C.shape == (0, 0)

    def test_single_intervention_returns_identity(self):
        """Single intervention → 1×1 identity matrix."""
        C = build_correlation_matrix(['A'], [])
        assert C.shape == (1, 1)
        assert C[0, 0] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# D: Cholesky fallback
# ---------------------------------------------------------------------------

class TestCholeskyFallback:
    """Non-PSD matrix should trigger fallback without raising."""

    def test_non_psd_matrix_does_not_raise(self):
        """A non-PSD matrix should not raise LinAlgError — fallback kicks in."""
        # Create a non-PSD matrix by skipping the PSD clipping.
        C_invalid = np.array([
            [1.0, 1.5],
            [1.5, 1.0],
        ])  # Eigenvalues: 2.5 and -0.5 → not PSD

        # Direct cholesky_sample with a non-PSD matrix should fall back gracefully.
        try:
            W = cholesky_sample(
                n_samples=100, n_interventions=2,
                correlation_matrix=C_invalid, seed=7,
            )
            # If no exception: verify shape is correct.
            assert W.shape == (100, 2)
        except Exception as exc:
            pytest.fail(f"cholesky_sample raised unexpectedly: {exc}")

    def test_eigen_sample_fallback_produces_correct_shape(self):
        """_eigen_sample fallback should produce correct output shape."""
        rng = np.random.default_rng(42)
        Z = rng.standard_normal((200, 3))
        C = np.array([
            [1.0, 0.5, -0.3],
            [0.5, 1.0, 0.8],
            [-0.3, 0.8, 1.0],
        ])
        W = _eigen_sample(Z, C)
        assert W.shape == (200, 3), f"Expected shape (200, 3), got {W.shape}"

    def test_cholesky_sample_with_identity_correct(self):
        """Identity correlation matrix → uncorrelated samples."""
        C = np.eye(4)
        W = cholesky_sample(n_samples=5_000, n_interventions=4, correlation_matrix=C, seed=13)

        assert W.shape == (5_000, 4)

        # Check all pairwise correlations are near zero.
        for i in range(4):
            for j in range(i + 1, 4):
                rho = float(np.corrcoef(W[:, i], W[:, j])[0, 1])
                assert abs(rho) < 0.05, (
                    f"Expected uncorrelated samples for identity C, "
                    f"got rho({i},{j})={rho:.4f}"
                )

    def test_cholesky_zero_samples(self):
        """Zero samples should return empty array without raising."""
        C = np.eye(3)
        W = cholesky_sample(n_samples=0, n_interventions=3, correlation_matrix=C)
        assert W.shape == (0, 3)

    def test_cholesky_single_intervention(self):
        """Single intervention → no correlation needed, returns N(0,1) samples."""
        C = np.array([[1.0]])
        W = cholesky_sample(n_samples=1_000, n_interventions=1, correlation_matrix=C, seed=1)
        assert W.shape == (1_000, 1)
        # Check standard normal marginals.
        assert abs(float(np.mean(W))) < 0.1
        assert abs(float(np.std(W)) - 1.0) < 0.1


# ---------------------------------------------------------------------------
# E: Regime model tests
# ---------------------------------------------------------------------------

class TestRegimeModel:
    """Additional tests for the regime Markov-switching model."""

    def test_default_params_valid(self):
        """Default RegimeParams should construct without error."""
        params = RegimeParams()
        assert params.normal_prob == 0.85
        assert params.stress_multiplier == 2.5
        assert params.transition_matrix is not None
        assert params.transition_matrix.shape == (2, 2)

    def test_transition_matrix_rows_sum_to_one(self):
        """Transition matrix rows should sum to 1.0."""
        params = RegimeParams(normal_prob=0.8)
        P = params.transition_matrix
        np.testing.assert_allclose(P.sum(axis=1), [1.0, 1.0], atol=1e-12)

    def test_invalid_normal_prob_raises(self):
        """normal_prob outside (0,1) should raise ValueError."""
        with pytest.raises(ValueError):
            RegimeParams(normal_prob=1.5)
        with pytest.raises(ValueError):
            RegimeParams(normal_prob=0.0)

    def test_invalid_stress_multiplier_raises(self):
        """stress_multiplier < 1.0 should raise ValueError."""
        with pytest.raises(ValueError):
            RegimeParams(stress_multiplier=0.5)

    def test_stationary_distribution_sums_to_one(self):
        """Stationary distribution π should sum to 1.0."""
        for p in [0.7, 0.8, 0.9]:
            params = RegimeParams(normal_prob=p)
            pi = params.stationary_distribution
            assert abs(pi.sum() - 1.0) < 1e-9
            assert np.all(pi >= 0)

    def test_mostly_normal_regime_fraction(self):
        """With high normal_prob, most time steps should be in normal regime."""
        params = RegimeParams(normal_prob=0.95)
        seq = simulate_regime_sequence(n_steps=50_000, params=params, seed=42)
        normal_fraction = float((seq == 0).mean())
        # Should be well above 50% normal.
        assert normal_fraction > 0.7, (
            f"Expected >70% normal regime, got {normal_fraction*100:.1f}%"
        )

    def test_apply_scaling_no_stress_unchanged(self):
        """All-normal regime (sequence of 0s) → losses unchanged."""
        params = RegimeParams(stress_multiplier=3.0)
        losses = np.array([10.0, 20.0, 30.0])
        regimes = np.array([0, 0, 0])

        scaled = apply_regime_scaling(losses, regimes, params)
        np.testing.assert_allclose(scaled, losses, rtol=1e-12)

    def test_apply_scaling_all_stress(self):
        """All-stress regime → all losses multiplied by stress_multiplier."""
        params = RegimeParams(stress_multiplier=2.0)
        losses = np.array([100.0, 200.0, 300.0])
        regimes = np.array([1, 1, 1])

        scaled = apply_regime_scaling(losses, regimes, params)
        np.testing.assert_allclose(scaled, losses * 2.0, rtol=1e-12)

    def test_mismatched_lengths_raises(self):
        """Mismatched lengths between losses and regimes should raise ValueError."""
        params = RegimeParams()
        with pytest.raises(ValueError, match="same length"):
            apply_regime_scaling(
                losses=np.array([1.0, 2.0, 3.0]),
                regime_sequence=np.array([0, 1]),
                params=params,
            )

    def test_compute_regime_cvar_empty(self):
        """compute_regime_cvar with empty array should return 0.0."""
        assert compute_regime_cvar(np.array([]), alpha=0.95) == 0.0

    def test_compute_regime_cvar_known_value(self):
        """CVaR at 100% confidence = max loss."""
        losses = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        cvar = compute_regime_cvar(losses, alpha=0.99)
        # At 99th percentile of a 5-element array, all values >= threshold.
        assert cvar == pytest.approx(5.0, rel=0.01)

    def test_invalid_alpha_raises(self):
        """alpha outside (0,1) should raise ValueError."""
        with pytest.raises(ValueError, match="alpha must be in"):
            compute_regime_cvar(np.array([1.0, 2.0, 3.0]), alpha=1.5)

    def test_validate_transition_matrix_wrong_shape(self):
        """Non-2×2 matrix should raise ValueError."""
        with pytest.raises(ValueError, match="shape"):
            _validate_transition_matrix(np.eye(3))

    def test_validate_transition_matrix_rows_not_sum_to_one(self):
        """Rows not summing to 1 should raise ValueError."""
        with pytest.raises(ValueError, match="sums to"):
            _validate_transition_matrix(np.array([[0.8, 0.1], [0.5, 0.6]]))

    def test_regime_cvar_ratio_geq_one(self):
        """regime_cvar_ratio should be >= 1.0 for stress_multiplier > 1."""
        params = RegimeParams(normal_prob=0.85, stress_multiplier=2.5)
        ratio = regime_cvar_ratio(cvar_loss=40_000.0, params=params, n_samples=5_000)
        assert ratio >= 1.0, f"Expected ratio >= 1.0, got {ratio:.4f}"

    def test_regime_cvar_zero_loss_returns_one(self):
        """Zero cvar_loss should return ratio 1.0 (no loss to scale)."""
        params = RegimeParams()
        ratio = regime_cvar_ratio(cvar_loss=0.0, params=params)
        assert ratio == pytest.approx(1.0)
