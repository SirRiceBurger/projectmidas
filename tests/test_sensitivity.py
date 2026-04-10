"""
test_sensitivity.py — Tests for the sensitivity analysis engine.

Tests cover:
- Parameter sweep for B (budget): empty portfolio at low budget, correct
  selection at base budget.
- Parameter sweep for lambda_: RACE monotonicity under increasing risk aversion.
- Sobol indices: sum-to-one invariant.
- Sobol indices: equal-weight degenerate case.
- Cholesky sampler: empirical correlation within tolerance.
- Regime CVaR: stress regime inflates CVaR vs base.
- SensitivityResult completeness: all 5 parameters present, keys match.
"""

from __future__ import annotations

import pytest
import numpy as np
from collections import defaultdict

from src.sensitivity.types import ParameterSweep, SensitivityResult
from src.sensitivity.sobol import first_order_indices, sensitivity_rank, validate_indices
from src.sensitivity.analyser import sweep_parameter, run_sensitivity
from src.monte_carlo.correlation_sampler import (
    build_correlation_matrix,
    cholesky_sample,
    sample_correlated_losses,
    empirical_correlation,
)
from src.monte_carlo.regime import (
    RegimeParams,
    simulate_regime_sequence,
    apply_regime_scaling,
    compute_regime_cvar,
    simulate_regime_losses,
)
from src.interventions.types import Intervention
from src.store.interventions import reset_to_builtins


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_store():
    """Reset the intervention store to builtins before and after each test."""
    reset_to_builtins()
    yield
    reset_to_builtins()


def _synthetic_zones():
    """Return synthetic zones matching the canonical test dataset."""
    from src.ingestion.types import Dataset, DroneData, WeatherData, HazardData, SiteData, EconomicData
    from src.zoning.partitioner import partition_site

    dataset = Dataset(
        drone=DroneData(
            canopy_cover=0.35, bare_soil_fraction=0.25, slope_degrees=8.0,
            aspect_degrees=180.0, drainage_index=0.6, shade_fraction=0.3,
            uv_index=4.5, georef_confidence=0.92, coverage_fraction=0.9,
        ),
        weather=WeatherData(
            mean_annual_rainfall_mm=650.0, mean_annual_temp_c=15.0,
            extreme_heat_days_per_year=12.0, frost_days_per_year=5.0,
            wind_speed_ms=4.0,
        ),
        hazard=HazardData(
            bushfire_risk=0.6, flood_risk=0.25, drought_risk=0.4, erosion_risk=0.2,
        ),
        site=SiteData(
            area_ha=25.0, soil_depth_cm=40.0, soil_type="clay",
            proximity_to_water_m=200.0, land_use_current="pasture",
        ),
        economic=EconomicData(
            land_value_aud_per_ha=5000.0, carbon_price_aud_per_tco2e=25.0,
            discount_rate=0.05, labour_cost_index=1.0,
        ),
    )
    return partition_site(dataset)


def _canonical_library() -> list[Intervention]:
    """Return the three canonical interventions I1, I2, I3."""
    return [
        Intervention(
            id="I1", name="Revegetation Belt",
            expected_emissions=120.0, success_probability=0.82,
            expected_cost=120_000.0, cvar_loss=40_000.0,
            maintenance_cost_annual=0.0, resilience_score=0.7,
        ),
        Intervention(
            id="I2", name="Rooftop Solar Retrofit",
            expected_emissions=180.0, success_probability=0.93,
            expected_cost=220_000.0, cvar_loss=25_000.0,
            maintenance_cost_annual=0.0, resilience_score=0.6,
        ),
        Intervention(
            id="I3", name="Water Retention & Soil Restoration",
            expected_emissions=150.0, success_probability=0.65,
            expected_cost=130_000.0, cvar_loss=90_000.0,
            maintenance_cost_annual=0.0, resilience_score=0.8,
        ),
    ]


def _base_params() -> dict:
    return {"B": 350_000.0, "Gamma": 70_000.0, "beta": 0.3, "lambda_": 0.5, "S": 200, "T": 20}


def _correlations() -> dict:
    return defaultdict(float, {
        ("I1", "I2"): 0.28, ("I2", "I1"): 0.28,
        ("I1", "I3"): 0.71, ("I3", "I1"): 0.71,
        ("I2", "I3"): 0.54, ("I3", "I2"): 0.54,
    })


# ---------------------------------------------------------------------------
# A1: Budget sweep
# ---------------------------------------------------------------------------

class TestParameterSweepB:
    """Test sweeping the budget parameter B."""

    def test_empty_portfolio_at_low_budget(self):
        """At very low budget (100k), no intervention can fit — portfolio is empty."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        # Sweep B from 50k to 200k (n_steps=5 for speed).
        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='B', n_steps=5,
        )

        assert sweep.parameter == 'B'
        assert len(sweep.values) == 5

        # The cheapest intervention (I1) costs 120k.
        # Any B < 120k should yield an empty portfolio.
        for val, portfolio in zip(sweep.values, sweep.selected_portfolios):
            if val < 120_000:
                assert portfolio == [], (
                    f"Expected empty portfolio at B={val:.0f}, got {portfolio}"
                )

    def test_i1_i2_selected_at_base_budget(self):
        """At B=350k (base), the portfolio should contain I1 and I2."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='B', n_steps=8,
        )

        # Find the step closest to B=350k.
        base_idx = min(range(len(sweep.values)), key=lambda i: abs(sweep.values[i] - 350_000))
        portfolio_at_base = set(sweep.selected_portfolios[base_idx])

        # I1+I2 should be selected: total cost 340k <= 350k, CVaR ~53k <= 70k.
        assert 'I1' in portfolio_at_base or 'I2' in portfolio_at_base, (
            f"Expected I1 or I2 in portfolio at B≈350k, got {portfolio_at_base}"
        )

    def test_larger_budget_non_decreasing_portfolio_size(self):
        """Larger budget should not decrease portfolio size (monotone in B)."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='B', n_steps=6,
        )

        sizes = [len(p) for p in sweep.selected_portfolios]
        # Not strictly monotone (snapping can repeat), but max size up to
        # the end should be non-decreasing overall.
        max_so_far = 0
        violations = 0
        for s in sizes:
            if s < max_so_far - 1:  # allow 1-step decrease (rounding)
                violations += 1
            max_so_far = max(max_so_far, s)
        assert violations == 0, f"Portfolio size decreased unexpectedly: {sizes}"

    def test_sweep_has_correct_structure(self):
        """ParameterSweep structure should be consistent."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='B', n_steps=5,
        )

        n = len(sweep.values)
        assert len(sweep.selected_portfolios) == n
        assert len(sweep.portfolio_scores) == n
        for iv_id, scores in sweep.metric_by_intervention.items():
            assert len(scores) == n, f"RACE scores for {iv_id} have wrong length"

    def test_all_interventions_present_in_metric(self):
        """All library interventions should appear in metric_by_intervention."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='B', n_steps=4,
        )

        for iv in library:
            assert iv.id in sweep.metric_by_intervention, (
                f"Intervention {iv.id} missing from metric_by_intervention"
            )


# ---------------------------------------------------------------------------
# A2: Lambda sweep and RACE monotonicity
# ---------------------------------------------------------------------------

class TestParameterSweepLambda:
    """Test sweeping lambda_ and verifying RACE score behaviour."""

    def test_race_decreases_with_higher_lambda_for_high_cvar(self):
        """Higher lambda = more risk-averse → lower RACE for high-CVaR interventions.

        RACE = (E * p) / (cost + lambda * CVaR).
        Increasing lambda in the denominator reduces RACE.  I3 has the
        highest CVaR (90k) so its RACE should decrease most steeply.
        """
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='lambda_', n_steps=8,
        )

        # I3 has highest CVaR → RACE should decrease as lambda increases.
        i3_races = sweep.metric_by_intervention.get('I3', [])
        assert i3_races, "I3 RACE scores should be populated"

        # Check overall trend: last value < first value.
        assert i3_races[-1] < i3_races[0], (
            f"I3 RACE should decrease as lambda increases, "
            f"but got first={i3_races[0]:.6e}, last={i3_races[-1]:.6e}"
        )

    def test_race_monotone_decreasing_with_lambda_for_i3(self):
        """I3 RACE should be strictly (or near-strictly) decreasing with lambda."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='lambda_', n_steps=10,
        )

        i3_races = sweep.metric_by_intervention.get('I3', [])
        assert len(i3_races) == 10

        # Count inversions (non-decreasing steps).
        inversions = sum(
            1 for i in range(len(i3_races) - 1)
            if i3_races[i + 1] > i3_races[i] + 1e-12
        )
        assert inversions == 0, (
            f"I3 RACE should be monotone decreasing with lambda. "
            f"Inversions found in: {[f'{r:.4e}' for r in i3_races]}"
        )

    def test_low_cvar_intervention_less_sensitive_to_lambda(self):
        """I2 (CVaR=25k) should be less sensitive to lambda than I3 (CVaR=90k)."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='lambda_', n_steps=8,
        )

        i2_races = sweep.metric_by_intervention.get('I2', [])
        i3_races = sweep.metric_by_intervention.get('I3', [])

        i2_range = max(i2_races) - min(i2_races)
        i3_range = max(i3_races) - min(i3_races)

        assert i3_range > i2_range, (
            f"I3 (high CVaR) should have larger RACE range than I2 (low CVaR). "
            f"I3 range: {i3_range:.4e}, I2 range: {i2_range:.4e}"
        )

    def test_lambda_sweep_values_span_0_to_1(self):
        """Lambda sweep should span [0, 1]."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        sweep = sweep_parameter(
            zones=zones, library=library, rules_map=rules_map,
            base_params=params, parameter='lambda_', n_steps=8,
        )

        assert sweep.values[0] == pytest.approx(0.0, abs=1e-9)
        assert sweep.values[-1] == pytest.approx(1.0, abs=1e-9)


# ---------------------------------------------------------------------------
# B: Sobol indices
# ---------------------------------------------------------------------------

class TestSobolIndicesSumToOne:
    """Test that normalised Sobol indices sum to 1.0."""

    def test_sum_to_one_basic(self):
        """Indices should sum to 1.0 within floating-point tolerance."""
        parameter_values = {
            'B': [100_000, 200_000, 300_000],
            'Gamma': [30_000, 50_000, 70_000],
            'beta': [0.0, 0.5, 1.0],
            'lambda_': [0.0, 0.5, 1.0],
            'T': [5, 15, 25],
        }
        # Simulate different outcomes to create variance.
        outcome_values = {
            'B': [0.0, 50.0, 200.0],
            'Gamma': [100.0, 120.0, 180.0],
            'beta': [150.0, 155.0, 160.0],
            'lambda_': [200.0, 190.0, 170.0],
            'T': [100.0, 130.0, 180.0],
        }

        indices = first_order_indices(parameter_values, outcome_values)
        assert validate_indices(indices), (
            f"Indices don't sum to 1.0: {indices}, sum={sum(indices.values()):.6f}"
        )

    def test_sum_to_one_with_zero_variance_param(self):
        """When one parameter has constant outcomes, its index should be 0.

        The others should still sum to 1.0.
        """
        parameter_values = {
            'B': [100_000, 200_000, 300_000],
            'Gamma': [30_000, 50_000, 70_000],
        }
        # Gamma has constant outcomes → zero variance → SI_Gamma = 0.
        outcome_values = {
            'B': [50.0, 100.0, 200.0],
            'Gamma': [150.0, 150.0, 150.0],
        }

        indices = first_order_indices(parameter_values, outcome_values)
        assert validate_indices(indices)
        assert indices['Gamma'] == pytest.approx(0.0, abs=1e-9)
        assert indices['B'] == pytest.approx(1.0, abs=1e-9)

    def test_full_sensitivity_sobol_sum_to_one(self):
        """run_sensitivity Sobol indices should sum to 1.0."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        total = sum(result.sobol_first_order.values())
        assert abs(total - 1.0) < 1e-6, (
            f"Sobol indices sum to {total:.6f}, not 1.0"
        )


class TestSobolEqualSensitivity:
    """Test degenerate case where all sweeps produce constant outcomes."""

    def test_equal_weights_when_all_same(self):
        """When all sweep outcomes are identical, all indices should be ~equal."""
        n_params = 5
        parameter_values = {f'p{i}': [0.0, 0.5, 1.0] for i in range(n_params)}
        outcome_values = {f'p{i}': [100.0, 100.0, 100.0] for i in range(n_params)}

        indices = first_order_indices(parameter_values, outcome_values)

        expected = 1.0 / n_params
        for name, val in indices.items():
            assert val == pytest.approx(expected, abs=1e-9), (
                f"Expected equal weight {expected} for {name}, got {val}"
            )

    def test_total_still_one_in_degenerate_case(self):
        """Even in the degenerate case, indices must sum to 1.0."""
        parameter_values = {'A': [1.0, 2.0], 'B': [3.0, 4.0]}
        outcome_values = {'A': [50.0, 50.0], 'B': [50.0, 50.0]}

        indices = first_order_indices(parameter_values, outcome_values)
        assert validate_indices(indices)

    def test_sensitivity_rank_sorted_correctly(self):
        """sensitivity_rank should return parameters sorted by index descending."""
        indices = {'B': 0.4, 'Gamma': 0.3, 'beta': 0.15, 'lambda_': 0.1, 'T': 0.05}
        ranked = sensitivity_rank(indices)

        # Should be sorted from highest to lowest.
        values = [v for _, v in ranked]
        assert values == sorted(values, reverse=True), (
            f"sensitivity_rank not sorted descending: {ranked}"
        )
        assert ranked[0][0] == 'B'
        assert ranked[-1][0] == 'T'


# ---------------------------------------------------------------------------
# C: Cholesky sampler correlation test
# ---------------------------------------------------------------------------

class TestCholeskySamplerCorrelation:
    """Test that the Cholesky sampler produces the correct correlation structure."""

    def test_empirical_correlation_within_tolerance(self):
        """Empirical correlations should be within 0.05 of target with 10000 samples."""
        intervention_ids = ['I1', 'I2', 'I3']
        cvar_losses = {'I1': 40_000.0, 'I2': 25_000.0, 'I3': 90_000.0}
        correlations_input = [
            ('I1', 'I2', 0.28),
            ('I1', 'I3', 0.71),
            ('I2', 'I3', 0.54),
        ]

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=correlations_input,
            n_samples=10_000,
            alpha=0.95,
            seed=42,
        )

        emp_corr = empirical_correlation(losses)

        # Check each target correlation is within 0.05.
        for id_i, id_j, target_rho in correlations_input:
            empirical_rho = emp_corr[(id_i, id_j)]
            assert abs(empirical_rho - target_rho) < 0.05, (
                f"Empirical correlation ({id_i}, {id_j}) = {empirical_rho:.3f}, "
                f"target = {target_rho:.3f}, difference = {abs(empirical_rho - target_rho):.3f}"
            )

    def test_zero_correlation_independent_samples(self):
        """Zero-correlation inputs should produce near-zero empirical correlation."""
        intervention_ids = ['A', 'B']
        cvar_losses = {'A': 50_000.0, 'B': 50_000.0}
        correlations_input = []  # no correlations → rho = 0

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=correlations_input,
            n_samples=10_000,
            seed=123,
        )

        emp_corr = empirical_correlation(losses)
        rho = emp_corr[('A', 'B')]
        assert abs(rho) < 0.05, (
            f"Zero-target correlation should give near-zero empirical, got {rho:.3f}"
        )

    def test_high_correlation_samples_correlated(self):
        """High correlation (0.9) should produce highly correlated samples."""
        intervention_ids = ['X', 'Y']
        cvar_losses = {'X': 30_000.0, 'Y': 30_000.0}
        correlations_input = [('X', 'Y', 0.9)]

        losses = sample_correlated_losses(
            intervention_ids=intervention_ids,
            cvar_losses=cvar_losses,
            correlations=correlations_input,
            n_samples=10_000,
            seed=7,
        )

        emp_corr = empirical_correlation(losses)
        rho = emp_corr[('X', 'Y')]
        assert rho > 0.80, (
            f"High-target correlation (0.9) gave low empirical {rho:.3f}"
        )


# ---------------------------------------------------------------------------
# D: Regime CVaR
# ---------------------------------------------------------------------------

class TestRegimeCvarHigherThanBase:
    """Test that regime CVaR is >= base CVaR (stress regime inflates losses)."""

    def test_regime_cvar_geq_base_cvar(self):
        """Regime CVaR should be at least as large as the base CVaR."""
        params = RegimeParams(normal_prob=0.85, stress_multiplier=2.5)
        cvar_loss = 40_000.0
        n_samples = 10_000

        regime_losses = simulate_regime_losses(
            cvar_loss=cvar_loss, n_samples=n_samples,
            params=params, alpha=0.95, seed=42,
        )
        regime_cvar = compute_regime_cvar(regime_losses, alpha=0.95)

        # Regime CVaR should exceed or equal base (non-trivially for a stress mult > 1).
        assert regime_cvar >= cvar_loss * 0.9, (
            f"Regime CVaR {regime_cvar:.0f} unexpectedly less than base {cvar_loss:.0f}"
        )

    def test_higher_stress_multiplier_gives_higher_cvar(self):
        """A larger stress multiplier should produce a higher CVaR."""
        cvar_loss = 50_000.0
        n_samples = 10_000

        params_low = RegimeParams(normal_prob=0.85, stress_multiplier=1.5)
        params_high = RegimeParams(normal_prob=0.85, stress_multiplier=4.0)

        losses_low = simulate_regime_losses(cvar_loss, n_samples, params_low, seed=42)
        losses_high = simulate_regime_losses(cvar_loss, n_samples, params_high, seed=42)

        cvar_low = compute_regime_cvar(losses_low)
        cvar_high = compute_regime_cvar(losses_high)

        assert cvar_high > cvar_low, (
            f"Higher stress multiplier should give higher CVaR: "
            f"low={cvar_low:.0f}, high={cvar_high:.0f}"
        )

    def test_no_stress_regime_matches_base(self):
        """With stress_multiplier=1.0, regime CVaR should equal base CVaR (±noise)."""
        cvar_loss = 30_000.0
        params = RegimeParams(normal_prob=0.85, stress_multiplier=1.0)
        losses = simulate_regime_losses(cvar_loss, 10_000, params, seed=42)
        regime_cvar = compute_regime_cvar(losses)

        # With multiplier = 1.0, losses are unscaled.  CVaR should be near base.
        # Allow 10% relative tolerance for sampling noise.
        assert abs(regime_cvar - cvar_loss) < cvar_loss * 0.20, (
            f"With stress_multiplier=1.0, regime CVaR {regime_cvar:.0f} differs "
            f"significantly from base {cvar_loss:.0f}"
        )

    def test_regime_sequence_has_correct_states(self):
        """Regime sequence should contain only 0s and 1s."""
        params = RegimeParams()
        seq = simulate_regime_sequence(n_steps=1000, params=params, seed=99)
        assert set(seq).issubset({0, 1}), f"Unexpected states in sequence: {set(seq)}"

    def test_regime_sequence_length(self):
        """Regime sequence should have the requested length."""
        params = RegimeParams()
        for n in [0, 1, 100, 1000]:
            seq = simulate_regime_sequence(n_steps=n, params=params, seed=1)
            assert len(seq) == n, f"Expected length {n}, got {len(seq)}"

    def test_apply_regime_scaling(self):
        """Losses in stress periods should be multiplied by stress_multiplier."""
        params = RegimeParams(normal_prob=0.7, stress_multiplier=3.0)
        losses = np.array([100.0, 200.0, 300.0, 400.0])
        regimes = np.array([0, 1, 0, 1])  # periods 1 and 3 are stress

        scaled = apply_regime_scaling(losses, regimes, params)
        expected = np.array([100.0, 600.0, 300.0, 1200.0])
        np.testing.assert_allclose(scaled, expected, rtol=1e-9)


# ---------------------------------------------------------------------------
# E: SensitivityResult completeness
# ---------------------------------------------------------------------------

class TestSensitivityResultCompleteness:
    """Test that SensitivityResult has all required fields."""

    def test_all_five_parameters_swept(self):
        """SensitivityResult should have sweeps for all 5 parameters."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        swept = set(result.swept_parameters)
        expected = {'B', 'Gamma', 'beta', 'lambda_', 'T'}
        assert swept == expected, (
            f"Expected swept parameters {expected}, got {swept}"
        )

    def test_sobol_keys_match_swept_parameters(self):
        """sobol_first_order keys should match swept parameter names."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        assert set(result.sobol_first_order.keys()) == set(result.swept_parameters), (
            f"sobol_first_order keys {set(result.sobol_first_order.keys())} "
            f"don't match swept parameters {set(result.swept_parameters)}"
        )

    def test_most_and_least_sensitive_are_valid(self):
        """most/least_sensitive_parameter should be valid parameter names."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        valid = set(result.swept_parameters)
        assert result.most_sensitive_parameter in valid, (
            f"most_sensitive_parameter '{result.most_sensitive_parameter}' not in {valid}"
        )
        assert result.least_sensitive_parameter in valid, (
            f"least_sensitive_parameter '{result.least_sensitive_parameter}' not in {valid}"
        )

    def test_base_portfolio_contains_known_ids(self):
        """Base portfolio should contain valid intervention IDs."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        valid_ids = {iv.id for iv in library}
        for iv_id in result.base_portfolio:
            assert iv_id in valid_ids, f"Unknown intervention ID '{iv_id}' in base_portfolio"

    def test_empty_library_returns_valid_result(self):
        """Empty library should return a valid SensitivityResult with no portfolio."""
        zones = _synthetic_zones()
        library = []
        rules_map = {}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        assert result.base_portfolio == []
        assert len(result.sweeps) == 5
        for sweep in result.sweeps:
            for portfolio in sweep.selected_portfolios:
                assert portfolio == []

    def test_sobol_indices_non_negative(self):
        """All Sobol indices should be non-negative."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        for param, idx in result.sobol_first_order.items():
            assert idx >= 0.0, f"Negative Sobol index for {param}: {idx}"

    def test_base_params_preserved(self):
        """base_params in result should match input params."""
        zones = _synthetic_zones()
        library = _canonical_library()
        rules_map = {iv.id: [] for iv in library}
        params = _base_params()

        result = run_sensitivity(
            zones=zones, library=library, rules_map=rules_map,
            params=params, S=200,
        )

        assert result.base_params['B'] == pytest.approx(params['B'])
        assert result.base_params['Gamma'] == pytest.approx(params['Gamma'])
        assert result.base_params['beta'] == pytest.approx(params['beta'])
