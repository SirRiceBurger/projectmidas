import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.interventions.library import load_intervention_library


def make_dataset(area_ha=25, labour=1.0, bushfire=0.4, drought=0.35, carbon_price=35, shade=0.25, drainage=0.6):
    from src.ingestion.types import Dataset, DroneData, WeatherData, HazardData, SiteData, EconomicData
    return Dataset(
        drone=DroneData(0.35, 0.2, 8, 180, drainage, shade, 6.5, 0.92, 0.95),
        weather=WeatherData(650, 17.5, 12, 5, 4.2),
        hazard=HazardData(bushfire, 0.2, drought, 0.15),
        site=SiteData(area_ha, 45, "clay_loam", 120, "grazing"),
        economic=EconomicData(8500, carbon_price, 0.07, labour),
    )


def test_larger_site_higher_cost():
    lib_small = load_intervention_library(make_dataset(area_ha=25))
    lib_large = load_intervention_library(make_dataset(area_ha=50))
    i1_small = next(i for i in lib_small if i.id == "I1")
    i1_large = next(i for i in lib_large if i.id == "I1")
    assert i1_large.expected_cost > i1_small.expected_cost * 1.5


def test_higher_labour_higher_cost():
    lib_base = load_intervention_library(make_dataset(labour=1.0))
    lib_high = load_intervention_library(make_dataset(labour=1.5))
    i1_base = next(i for i in lib_base if i.id == "I1")
    i1_high = next(i for i in lib_high if i.id == "I1")
    assert i1_high.expected_cost > i1_base.expected_cost


def test_higher_carbon_price_more_emissions_benefit():
    lib_low = load_intervention_library(make_dataset(carbon_price=20))
    lib_high = load_intervention_library(make_dataset(carbon_price=60))
    i1_low = next(i for i in lib_low if i.id == "I1")
    i1_high = next(i for i in lib_high if i.id == "I1")
    assert i1_high.expected_emissions > i1_low.expected_emissions


def test_high_bushfire_reduces_i1_probability():
    lib_safe = load_intervention_library(make_dataset(bushfire=0.1))
    lib_risky = load_intervention_library(make_dataset(bushfire=0.8))
    i1_safe = next(i for i in lib_safe if i.id == "I1")
    i1_risky = next(i for i in lib_risky if i.id == "I1")
    assert i1_risky.success_probability < i1_safe.success_probability


def test_synthetic_none_unchanged():
    lib = load_intervention_library(dataset=None)
    i1 = next(i for i in lib if i.id == "I1")
    assert i1.expected_emissions == 120
    assert i1.expected_cost == 120_000
    assert i1.cvar_loss == 40_000


def test_all_interventions_have_positive_values():
    lib = load_intervention_library(make_dataset(area_ha=30))
    for i in lib:
        assert i.expected_cost > 0
        assert i.expected_emissions > 0
        assert i.cvar_loss > 0
        assert 0 < i.success_probability <= 1


def test_cvar_ratio_preserved():
    lib = load_intervention_library(make_dataset(area_ha=40))
    i1 = next(i for i in lib if i.id == "I1")
    i3 = next(i for i in lib if i.id == "I3")
    assert (i3.cvar_loss / i3.expected_cost) > (i1.cvar_loss / i1.expected_cost)
