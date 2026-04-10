import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.ingestion.types import DroneData, HazardData, SiteData
from src.zoning.types import FeatureVector


def _normalise_proximity(distance_m: float) -> float:
    return max(0.0, min(1.0, 1.0 - distance_m / 500.0))


def compute_feature_vector(
    drone: DroneData,
    hazard: HazardData,
    site: SiteData,
    zone_modifiers: dict,
) -> FeatureVector:
    base_proximity = _normalise_proximity(site.proximity_to_water_m)

    return FeatureVector(
        canopy=float(zone_modifiers.get('canopy', drone.canopy_cover)),
        bare_soil=float(zone_modifiers.get('bare_soil', drone.bare_soil_fraction)),
        slope=float(zone_modifiers.get('slope', drone.slope_degrees)),
        aspect=float(zone_modifiers.get('aspect', drone.aspect_degrees)),
        drainage=float(zone_modifiers.get('drainage', drone.drainage_index)),
        shade=float(zone_modifiers.get('shade', drone.shade_fraction)),
        uv=float(zone_modifiers.get('uv', drone.uv_index)),
        bushfire=float(zone_modifiers.get('bushfire', hazard.bushfire_risk)),
        flood=float(zone_modifiers.get('flood', hazard.flood_risk)),
        drought=float(zone_modifiers.get('drought', hazard.drought_risk)),
        proximity=float(zone_modifiers.get('proximity', base_proximity)),
    )
