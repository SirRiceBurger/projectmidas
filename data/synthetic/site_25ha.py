import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.ingestion.types import Dataset, DroneData, HazardData, SiteData


def make_synthetic_dataset() -> Dataset:
    return Dataset(
        drone=DroneData(
            canopy_cover=0.35,
            bare_soil_fraction=0.20,
            slope_degrees=8.0,
            aspect_degrees=180.0,
            drainage_index=0.60,
            shade_fraction=0.25,
            uv_index=6.5,
            georef_confidence=0.92,
            coverage_fraction=0.95,
        ),
        hazard=HazardData(
            bushfire_risk=0.40,
            flood_risk=0.20,
            drought_risk=0.35,
            erosion_risk=0.15,
        ),
        site=SiteData(
            area_ha=25.0,
            soil_depth_cm=45.0,
            soil_type='clay_loam',
            proximity_to_water_m=120.0,
            land_use_current='grazing',
        ),
    )
