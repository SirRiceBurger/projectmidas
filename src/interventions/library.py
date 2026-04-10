from typing import List
from .types import Intervention
from .cost_model import compute_i1_from_dataset, compute_i2_from_dataset, compute_i3_from_dataset


def load_intervention_library(dataset=None) -> List[Intervention]:
    if dataset is None:
        return [
            Intervention("I1", "Revegetation Belt", 120, 0.82, 120_000, 40_000, 5_000, 0.7),
            Intervention("I2", "Rooftop Solar Retrofit", 180, 0.93, 220_000, 25_000, 3_000, 0.5),
            Intervention("I3", "Water Retention & Soil Restoration", 150, 0.65, 130_000, 90_000, 4_000, 0.8),
        ]

    i1 = Intervention("I1", "Revegetation Belt", **compute_i1_from_dataset(dataset))
    i2 = Intervention("I2", "Rooftop Solar Retrofit", **compute_i2_from_dataset(dataset))
    i3 = Intervention("I3", "Water Retention & Soil Restoration", **compute_i3_from_dataset(dataset))
    return [i1, i2, i3]
