import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from src.interventions.library import load_intervention_library
from src.interventions.feasibility import apply_feasibility_filter, get_feasible_interventions
from src.interventions.cost_model import compute_race
from src.zoning.types import Zone, FeatureVector


def make_zone(id_, canopy, bare_soil, slope, aspect, drainage, shade, uv, bushfire, flood, drought, proximity):
    return Zone(zone_id=id_, area_ha=1.0, feature_vector=FeatureVector(
        canopy=canopy, bare_soil=bare_soil, slope=slope, aspect=aspect,
        drainage=drainage, shade=shade, uv=uv, bushfire=bushfire,
        flood=flood, drought=drought, proximity=proximity,
    ))


ZONE_A = make_zone("A", 0.45, 0.15, 6,  170, 0.7,  0.30, 6.0, 0.30, 0.15, 0.25, 0.8)
ZONE_B = make_zone("B", 0.35, 0.20, 8,  180, 0.6,  0.25, 6.5, 0.40, 0.20, 0.35, 0.5)
ZONE_C = make_zone("C", 0.20, 0.30, 12, 200, 0.45, 0.15, 7.0, 0.55, 0.25, 0.45, 0.3)

ZONES = [ZONE_A, ZONE_B, ZONE_C]


def test_library_returns_three_interventions():
    library = load_intervention_library()
    assert len(library) == 3


def test_i1_values():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    assert i1.expected_emissions == 120.0
    assert i1.success_probability == 0.82
    assert i1.expected_cost == 120000.0
    assert i1.cvar_loss == 40000.0


def test_i2_values():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    assert i2.expected_emissions == 180.0
    assert i2.success_probability == 0.93
    assert i2.expected_cost == 220000.0
    assert i2.cvar_loss == 25000.0


def test_i3_values():
    library = load_intervention_library()
    i3 = next(i for i in library if i.id == "I3")
    assert i3.expected_emissions == 150.0
    assert i3.success_probability == 0.65
    assert i3.expected_cost == 130000.0
    assert i3.cvar_loss == 90000.0


def test_i1_infeasible_zone_c():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    result = apply_feasibility_filter(i1, ZONE_C)
    assert not result.feasible
    assert result.reason != ""


def test_i1_feasible_zone_a_and_b():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    assert apply_feasibility_filter(i1, ZONE_A).feasible
    assert apply_feasibility_filter(i1, ZONE_B).feasible


def test_i2_feasible_all_zones():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    for zone in ZONES:
        assert apply_feasibility_filter(i2, zone).feasible


def test_i3_feasible_all_zones():
    library = load_intervention_library()
    i3 = next(i for i in library if i.id == "I3")
    for zone in ZONES:
        result = apply_feasibility_filter(i3, zone)
        assert result.feasible, f"Zone {zone.id}: {result.reason}"


def test_get_feasible_interventions_zone_c_excludes_i1():
    library = load_intervention_library()
    feasible = get_feasible_interventions(ZONES, library)
    zone_c_ids = [i.id for i in feasible["C"]]
    assert "I1" not in zone_c_ids


def test_zone_c_has_two_feasible_interventions():
    library = load_intervention_library()
    feasible = get_feasible_interventions(ZONES, library)
    assert len(feasible["C"]) == 2


def test_race_i1():
    library = load_intervention_library()
    i1 = next(i for i in library if i.id == "I1")
    race = compute_race(i1)
    assert abs(race - 7.03e-4) / 7.03e-4 < 0.01


def test_race_i2():
    library = load_intervention_library()
    i2 = next(i for i in library if i.id == "I2")
    race = compute_race(i2)
    assert abs(race - 7.20e-4) / 7.20e-4 < 0.01


def test_race_i3():
    library = load_intervention_library()
    i3 = next(i for i in library if i.id == "I3")
    race = compute_race(i3)
    assert abs(race - 5.57e-4) / 5.57e-4 < 0.01
