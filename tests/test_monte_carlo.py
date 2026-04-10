import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np

from src.interventions.library import load_intervention_library
from src.monte_carlo.simulator import run_simulation
from src.monte_carlo.outcome_vectors import compute_expected_emissions, compute_cvar
from src.monte_carlo.types import OutcomeArrays
from src.monte_carlo.uncertainty import sample_scenario_arrays


def test_simulation_returns_outcome_arrays():
    library = load_intervention_library()
    results = run_simulation(library, S=100)
    for iv in library:
        assert iv.id in results
        assert isinstance(results[iv.id], OutcomeArrays)


def test_outcome_arrays_shape():
    library = load_intervention_library()
    S = 500
    results = run_simulation(library, S=S)
    for iv in library:
        oa = results[iv.id]
        assert oa.E.shape == (S,)
        assert oa.K.shape == (S,)
        assert oa.L.shape == (S,)
        assert oa.R.shape == (S,)
        assert oa.Q.shape == (S,)


def test_all_scenario_factors_positive():
    rng = np.random.default_rng(42)
    scenarios = sample_scenario_arrays(100, rng)
    assert np.all(scenarios.climate_factor > 0)
    assert np.all(scenarios.cost_factor > 0)
    assert np.all(scenarios.resilience_factor > 0)
    assert np.all(scenarios.resilience_factor <= 1)


def test_quality_scores_bounded():
    library = load_intervention_library()
    results = run_simulation(library, S=1000)
    for iv in library:
        q = results[iv.id].Q
        assert np.all(q >= 0.0) and np.all(q <= 1.0), f"{iv.id} Q out of [0,1]"


def test_expected_emissions_i1():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    results = run_simulation([i1], S=10000)
    e_mean = compute_expected_emissions(results["I1"])
    assert abs(e_mean - 120) / 120 < 0.05, f"I1 E[E]={e_mean}, expected ~120"


def test_expected_emissions_i2():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    results = run_simulation([i2], S=10000)
    e_mean = compute_expected_emissions(results["I2"])
    assert abs(e_mean - 180) / 180 < 0.05, f"I2 E[E]={e_mean}, expected ~180"


def test_expected_emissions_i3():
    library = load_intervention_library()
    i3 = next(i for i in library if i.id == "I3")
    results = run_simulation([i3], S=10000)
    e_mean = compute_expected_emissions(results["I3"])
    assert abs(e_mean - 150) / 150 < 0.05, f"I3 E[E]={e_mean}, expected ~150"


def test_cvar_i1():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    results = run_simulation([i1], S=10000)
    cvar = compute_cvar(results["I1"])
    assert abs(cvar - 40000) / 40000 < 0.05, f"I1 CVaR={cvar}, expected ~40000"


def test_cvar_i2():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    results = run_simulation([i2], S=10000)
    cvar = compute_cvar(results["I2"])
    assert abs(cvar - 25000) / 25000 < 0.05, f"I2 CVaR={cvar}, expected ~25000"


def test_cvar_i3():
    library = load_intervention_library()
    i3 = next(i for i in library if i.id == "I3")
    results = run_simulation([i3], S=10000)
    cvar = compute_cvar(results["I3"])
    assert abs(cvar - 90000) / 90000 < 0.05, f"I3 CVaR={cvar}, expected ~90000"
