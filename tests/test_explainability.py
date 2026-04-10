import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.interventions.library import load_intervention_library
from src.interventions.feasibility import get_feasible_interventions
from src.zoning.partitioner import partition_site
from src.ingestion.types import Dataset, DroneData, WeatherData, HazardData, SiteData, EconomicData
from src.optimiser.portfolio import optimise_portfolio
from src.scoring.mercury_score import compute_mercury_scores
from src.explainability.types import PipelineResults
from src.explainability.audit import build_audit_trail
from src.explainability.diagnostics import explain_exclusions, get_inclusion_drivers
from src.explainability.narrative import generate_narrative
from src.explainability.overlay import build_spatial_overlays
from src.explainability.model_card import build_model_card

B = 350_000
GAMMA = 70_000

CORRELATIONS = {
    ("I1", "I2"): 0.28, ("I2", "I1"): 0.28,
    ("I1", "I3"): 0.71, ("I3", "I1"): 0.71,
    ("I2", "I3"): 0.54, ("I3", "I2"): 0.54,
}


def make_pipeline_results():
    dataset = Dataset(
        drone=DroneData(0.35, 0.2, 8, 180, 0.6, 0.25, 6.5, 0.92, 0.95),
        weather=WeatherData(650, 17.5, 12, 5, 4.2),
        hazard=HazardData(0.4, 0.2, 0.35, 0.15),
        site=SiteData(25, 45, "clay_loam", 120, "grazing"),
        economic=EconomicData(8500, 35, 0.07, 1.0),
    )
    library = load_intervention_library()
    zones = partition_site(dataset)
    feasibility = get_feasible_interventions(zones, library)
    opt_result = optimise_portfolio(library, B=B, Gamma=GAMMA)
    scored = compute_mercury_scores(library, CORRELATIONS)
    return PipelineResults(
        zones=zones,
        interventions=library,
        feasibility=feasibility,
        optimisation=opt_result,
        scored=scored,
    )


def test_audit_trail_covers_all_stages():
    pr = make_pipeline_results()
    trail = build_audit_trail(pr)
    assert trail.covers_all_stages(), f"Missing stages: {set(range(1,11)) - {s.stage for s in trail.stages}}"


def test_audit_trail_has_10_stages():
    pr = make_pipeline_results()
    trail = build_audit_trail(pr)
    assert len(trail.stages) == 10


def test_all_audit_stages_passed():
    pr = make_pipeline_results()
    trail = build_audit_trail(pr)
    assert all(s.passed for s in trail.stages)


def test_i3_exclusion_attributed_to_cvar_breach():
    pr = make_pipeline_results()
    reasons = explain_exclusions(pr, B=B, Gamma=GAMMA)
    i3_portfolio_exclusions = [
        r for r in reasons
        if r.intervention_id == "I3" and r.reason_code == "cvar_breach"
    ]
    assert len(i3_portfolio_exclusions) > 0, \
        f"Expected I3 cvar_breach exclusion, got: {[(r.intervention_id, r.reason_code) for r in reasons]}"


def test_selected_interventions_have_no_exclusion_reason():
    pr = make_pipeline_results()
    reasons = explain_exclusions(pr, B=B, Gamma=GAMMA)
    selected_ids = {i.id for i in pr.optimisation.selected_portfolio.interventions}
    portfolio_exclusion_ids = {r.intervention_id for r in reasons if r.reason_code in ("budget", "cvar_breach", "dominated")}
    overlap = selected_ids & portfolio_exclusion_ids
    assert not overlap, f"Selected interventions should not have portfolio exclusions: {overlap}"


def test_narrative_is_non_empty_string():
    pr = make_pipeline_results()
    reasons = explain_exclusions(pr, B=B, Gamma=GAMMA)
    text = generate_narrative(pr, reasons, B=B, Gamma=GAMMA)
    assert isinstance(text, str) and len(text) > 100


def test_narrative_mentions_selected_interventions():
    pr = make_pipeline_results()
    reasons = explain_exclusions(pr, B=B, Gamma=GAMMA)
    text = generate_narrative(pr, reasons, B=B, Gamma=GAMMA)
    assert "Revegetation" in text or "I1" in text
    assert "Solar" in text or "I2" in text


def test_overlays_cover_all_zone_intervention_combos():
    pr = make_pipeline_results()
    overlays = build_spatial_overlays(pr)
    assert len(overlays) > 0
    zone_ids = {o.zone_id for o in overlays}
    intervention_ids = {o.intervention_id for o in overlays}
    assert len(zone_ids) == len(pr.zones)
    assert "I1" in intervention_ids
    assert "I2" in intervention_ids
    assert "I3" in intervention_ids


def test_inclusion_drivers_have_correct_keys():
    pr = make_pipeline_results()
    scored_i2 = next(s for s in pr.scored if s.intervention.id == "I2")
    drivers = get_inclusion_drivers(scored_i2)
    expected_keys = {"race_contribution", "resilience_contribution", "probability_contribution", "cvar_penalty", "correlation_penalty"}
    assert set(drivers.keys()) == expected_keys


def test_model_card_structure():
    card = build_model_card(B=B, Gamma=GAMMA)
    assert card["model"] == "Mercury v0.1"
    assert card["parameters"]["B"] == B
    assert card["parameters"]["Gamma"] == GAMMA
    assert isinstance(card["assumptions"], list) and len(card["assumptions"]) > 0
