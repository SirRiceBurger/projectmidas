import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.ingestion.assembler import assemble_dataset
from src.ingestion.validator import validate_dataset
from src.zoning.partitioner import partition_site
from src.interventions.library import load_intervention_library
from src.interventions.feasibility import get_feasible_interventions
from src.optimiser.portfolio import optimise_portfolio
from src.scoring.mercury_score import compute_mercury_scores
from src.scoring.ranking import rank_by_mercury, rank_naive
from src.explainability.types import PipelineResults
from src.explainability.diagnostics import explain_exclusions

CORRELATIONS = {
    ("I1", "I2"): 0.28, ("I2", "I1"): 0.28,
    ("I1", "I3"): 0.71, ("I3", "I1"): 0.71,
    ("I2", "I3"): 0.54, ("I3", "I2"): 0.54,
}

B = 350_000
GAMMA = 70_000


def make_pipeline():
    base = os.path.join(os.path.dirname(__file__), '..', 'data', 'synthetic')
    dataset = assemble_dataset(
        drone_path=os.path.join(base, 'drone.json'),
        weather_path=os.path.join(base, 'weather.json'),
        hazard_path=os.path.join(base, 'hazard.json'),
        site_path=os.path.join(base, 'site.json'),
        economic_path=os.path.join(base, 'economic.json'),
    )
    library = load_intervention_library()
    zones = partition_site(dataset)
    feasibility = get_feasible_interventions(zones, library)
    opt = optimise_portfolio(library, B=B, Gamma=GAMMA)
    scored = compute_mercury_scores(library, CORRELATIONS)
    pr = PipelineResults(zones=zones, interventions=library, feasibility=feasibility, optimisation=opt, scored=scored)
    return pr


def test_pipeline_loads_and_validates():
    base = os.path.join(os.path.dirname(__file__), '..', 'data', 'synthetic')
    dataset = assemble_dataset(
        drone_path=os.path.join(base, 'drone.json'),
        weather_path=os.path.join(base, 'weather.json'),
        hazard_path=os.path.join(base, 'hazard.json'),
        site_path=os.path.join(base, 'site.json'),
        economic_path=os.path.join(base, 'economic.json'),
    )
    report = validate_dataset(dataset)
    assert report.passed
    assert report.completeness == 1.0


def test_pipeline_selects_i1_i2():
    pr = make_pipeline()
    selected = sorted(i.id for i in pr.optimisation.selected_portfolio.interventions)
    assert selected == ["I1", "I2"], f"Expected I1+I2, got {selected}"


def test_pipeline_mercury_ranking():
    pr = make_pipeline()
    ranked = rank_by_mercury(pr.scored)
    ids = [s.intervention.id for s in ranked]
    assert ids == ["I2", "I1", "I3"], f"Mercury ranking: {ids}"


def test_pipeline_naive_ranking():
    pr = make_pipeline()
    ranked = rank_naive(pr.interventions)
    ids = [i.id for i in ranked]
    assert ids == ["I3", "I1", "I2"], f"Naive ranking: {ids}"


def test_pipeline_ranking_diverges():
    pr = make_pipeline()
    mercury = [s.intervention.id for s in rank_by_mercury(pr.scored)]
    naive = [i.id for i in rank_naive(pr.interventions)]
    assert mercury[0] != naive[0]
    assert mercury != naive


def test_i3_excluded_cvar_breach():
    pr = make_pipeline()
    exclusions = explain_exclusions(pr, B=B, Gamma=GAMMA)
    i3_cvar = [e for e in exclusions if e.intervention_id == "I3" and e.reason_code == "cvar_breach"]
    assert len(i3_cvar) > 0
