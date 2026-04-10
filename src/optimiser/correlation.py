CORRELATIONS = {
    ("I1", "I2"): 0.28, ("I2", "I1"): 0.28,
    ("I1", "I3"): 0.71, ("I3", "I1"): 0.71,
    ("I2", "I3"): 0.54, ("I3", "I2"): 0.54,
}


def get_correlation(id_j: str, id_k: str) -> float:
    return CORRELATIONS.get((id_j, id_k), 0.0)
