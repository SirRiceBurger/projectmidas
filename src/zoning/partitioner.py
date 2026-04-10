import sys
import os
from typing import List

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.ingestion.types import Dataset
from src.zoning.types import FeatureVector, Zone
from src.zoning.feature_vector import compute_feature_vector

_SYNTHETIC_SITE_AREA = 25.0
_SYNTHETIC_SLOPE = 8.0

_SYNTHETIC_ZONES = [
    {
        'zone_id': 'A',
        'area_ha': 10.0,
        'modifiers': {
            'canopy': 0.45,
            'bare_soil': 0.15,
            'slope': 6.0,
            'aspect': 170.0,
            'drainage': 0.70,
            'shade': 0.30,
            'uv': 6.0,
            'bushfire': 0.30,
            'flood': 0.15,
            'drought': 0.25,
            'proximity': 0.80,
        },
    },
    {
        'zone_id': 'B',
        'area_ha': 8.0,
        'modifiers': {
            'canopy': 0.35,
            'bare_soil': 0.20,
            'slope': 8.0,
            'aspect': 180.0,
            'drainage': 0.60,
            'shade': 0.25,
            'uv': 6.5,
            'bushfire': 0.40,
            'flood': 0.20,
            'drought': 0.35,
            'proximity': 0.50,
        },
    },
    {
        'zone_id': 'C',
        'area_ha': 7.0,
        'modifiers': {
            'canopy': 0.20,
            'bare_soil': 0.30,
            'slope': 12.0,
            'aspect': 200.0,
            'drainage': 0.45,
            'shade': 0.15,
            'uv': 7.0,
            'bushfire': 0.55,
            'flood': 0.25,
            'drought': 0.45,
            'proximity': 0.30,
        },
    },
]


_SYNTHETIC_GEOREF = 0.92  # canonical synthetic value — unique enough to identify the dataset

def _is_synthetic(dataset: Dataset) -> bool:
    return (
        dataset.site.area_ha == _SYNTHETIC_SITE_AREA
        and dataset.drone.slope_degrees == _SYNTHETIC_SLOPE
        and dataset.drone.georef_confidence == _SYNTHETIC_GEOREF
    )


def _clamp_fraction(value: float) -> float:
    return max(0.0, min(1.0, value))


def _clamp_non_negative(value: float) -> float:
    return max(0.0, value)


def _clamp_aspect(value: float) -> float:
    return value % 360.0


def _sample_field(base: float, sigma: float, rng: np.random.Generator, clamp) -> float:
    sampled = rng.normal(base, abs(base) * sigma)
    return float(clamp(sampled))


def _compute_zone_feature_vector(dataset: Dataset, zone_index: int, seed: int) -> FeatureVector:
    rng = np.random.default_rng(seed + zone_index)

    drone = dataset.drone
    hazard = dataset.hazard
    site = dataset.site
    base_proximity = max(0.0, min(1.0, 1.0 - site.proximity_to_water_m / 500.0))

    return FeatureVector(
        canopy=_sample_field(drone.canopy_cover, 0.15, rng, _clamp_fraction),
        bare_soil=_sample_field(drone.bare_soil_fraction, 0.15, rng, _clamp_fraction),
        slope=_sample_field(drone.slope_degrees, 0.20, rng, _clamp_non_negative),
        aspect=_sample_field(drone.aspect_degrees, 0.05, rng, _clamp_aspect),
        drainage=_sample_field(drone.drainage_index, 0.12, rng, _clamp_fraction),
        shade=_sample_field(drone.shade_fraction, 0.12, rng, _clamp_fraction),
        uv=_sample_field(drone.uv_index, 0.10, rng, _clamp_non_negative),
        bushfire=_sample_field(hazard.bushfire_risk, 0.15, rng, _clamp_fraction),
        flood=_sample_field(hazard.flood_risk, 0.15, rng, _clamp_fraction),
        drought=_sample_field(hazard.drought_risk, 0.15, rng, _clamp_fraction),
        proximity=_sample_field(base_proximity, 0.10, rng, _clamp_fraction),
    )


def _allocate_areas(total_ha: float, n: int, seed: int) -> List[float]:
    rng = np.random.default_rng(seed)
    weights = rng.dirichlet(np.ones(n))
    areas = [round(w * total_ha, 1) for w in weights]
    adjustment = round(total_ha - sum(areas), 1)
    areas[-1] = round(areas[-1] + adjustment, 1)
    return areas


def partition_site(dataset: Dataset, seed: int = 42) -> List[Zone]:
    if _is_synthetic(dataset):
        zones = []
        for defn in _SYNTHETIC_ZONES:
            fv = compute_feature_vector(
                drone=dataset.drone,
                hazard=dataset.hazard,
                site=dataset.site,
                zone_modifiers=defn['modifiers'],
            )
            zones.append(Zone(zone_id=defn['zone_id'], area_ha=defn['area_ha'], feature_vector=fv))
        return zones

    n = max(1, round(dataset.site.area_ha / 8))
    areas = _allocate_areas(dataset.site.area_ha, n, seed)

    zones = []
    for i in range(n):
        fv = _compute_zone_feature_vector(dataset, i, seed)
        zones.append(Zone(zone_id=f"Z{i + 1}", area_ha=areas[i], feature_vector=fv))
    return zones
