import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.interventions.library import load_intervention_library
from src.scoring.race import compute_race
from src.scoring.mercury_score import compute_mercury_scores
from src.scoring.ranking import rank_by_mercury, rank_naive

CORRELATIONS = {
    ("I1", "I2"): 0.28,
    ("I2", "I1"): 0.28,
    ("I1", "I3"): 0.71,
    ("I3", "I1"): 0.71,
    ("I2", "I3"): 0.54,
    ("I3", "I2"): 0.54,
}

library = load_intervention_library()
_by_id = {iv.id: iv for iv in library}


def test_race_i1():
    assert abs(compute_race(_by_id["I1"]) - 7.03e-4) / 7.03e-4 < 0.01


def test_race_i2():
    assert abs(compute_race(_by_id["I2"]) - 7.20e-4) / 7.20e-4 < 0.01


def test_race_i3():
    assert abs(compute_race(_by_id["I3"]) - 5.57e-4) / 5.57e-4 < 0.01


def test_mercury_ranking_i2_beats_i1_beats_i3():
    scored = compute_mercury_scores(library, CORRELATIONS)
    ranked = rank_by_mercury(scored)
    ids = [s.intervention.id for s in ranked]
    assert ids == ["I2", "I1", "I3"], f"Mercury ranking was {ids}"


def test_naive_ranking_i3_beats_i1_beats_i2():
    ranked = rank_naive(library)
    ids = [iv.id for iv in ranked]
    assert ids == ["I3", "I1", "I2"], f"Naive ranking was {ids}"


def test_mercury_naive_diverge():
    mercury_ids = [
        s.intervention.id
        for s in rank_by_mercury(compute_mercury_scores(library, CORRELATIONS))
    ]
    naive_ids = [iv.id for iv in rank_naive(library)]
    assert mercury_ids != naive_ids
    assert mercury_ids[0] != naive_ids[0]
