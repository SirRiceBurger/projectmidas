import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.interventions.library import load_intervention_library
from src.optimiser.portfolio import optimise_portfolio
from src.optimiser.cvar import compute_portfolio_cvar

B = 350_000
GAMMA = 70_000


def test_i1_i2_selected():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    selected_ids = sorted(i.id for i in result.selected_portfolio.interventions)
    assert selected_ids == ["I1", "I2"], f"Expected I1+I2, got {selected_ids}"


def test_i1_i3_rejected():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    i1i3 = next((p for p in result.all_portfolios
                 if sorted(i.id for i in p.interventions) == ["I1", "I3"]), None)
    assert i1i3 is not None
    assert not i1i3.feasible, "I1+I3 should be infeasible"


def test_i2_i3_rejected():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    i2i3 = next((p for p in result.all_portfolios
                 if sorted(i.id for i in p.interventions) == ["I2", "I3"]), None)
    assert i2i3 is not None
    assert not i2i3.feasible, "I2+I3 should be infeasible"


def test_selected_portfolio_feasible():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    assert result.selected_portfolio.feasible


def test_selected_cost_within_budget():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    assert result.selected_portfolio.total_cost <= B


def test_selected_cvar_within_gamma():
    library = load_intervention_library()
    result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    assert result.selected_portfolio.portfolio_cvar <= GAMMA


def test_i1_i2_cvar_below_gamma():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    i2 = next(i for i in library if i.id == "I2")
    cvar = compute_portfolio_cvar([i1, i2])
    assert cvar < GAMMA, f"I1+I2 CVaR={cvar} should be < {GAMMA}"


def test_i1_i3_cvar_above_gamma():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    i3 = next(i for i in library if i.id == "I3")
    cvar = compute_portfolio_cvar([i1, i3])
    assert cvar > GAMMA, f"I1+I3 CVaR={cvar} should be > {GAMMA}"


def test_i2_i3_cvar_above_gamma():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    i3 = next(i for i in library if i.id == "I3")
    cvar = compute_portfolio_cvar([i2, i3])
    assert cvar > GAMMA, f"I2+I3 CVaR={cvar} should be > {GAMMA}"
