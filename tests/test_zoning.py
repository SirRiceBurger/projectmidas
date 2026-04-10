import math
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.ingestion.types import Dataset, DroneData, HazardData, SiteData
from src.zoning.partitioner import partition_site
from src.zoning.types import FeatureVector


def _make_dataset() -> Dataset:
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


def test_partition_returns_zones():
    dataset = _make_dataset()
    zones = partition_site(dataset)
    assert len(zones) > 0


def test_all_zones_have_feature_vector():
    dataset = _make_dataset()
    zones = partition_site(dataset)
    for zone in zones:
        assert zone.feature_vector is not None


def test_feature_vector_fields_are_floats():
    dataset = _make_dataset()
    zones = partition_site(dataset)
    fields = [
        'canopy', 'bare_soil', 'slope', 'aspect', 'drainage',
        'shade', 'uv', 'bushfire', 'flood', 'drought', 'proximity',
    ]
    for zone in zones:
        fv = zone.feature_vector
        for field in fields:
            val = getattr(fv, field)
            assert isinstance(val, float), f"Zone {zone.zone_id}.{field} is not float: {val!r}"
            assert not math.isnan(val), f"Zone {zone.zone_id}.{field} is NaN"


def test_total_area_equals_site_area():
    dataset = _make_dataset()
    zones = partition_site(dataset)
    total = sum(z.area_ha for z in zones)
    assert total == dataset.site.area_ha


def test_at_least_one_zone_high_bushfire():
    dataset = _make_dataset()
    zones = partition_site(dataset)
    assert any(z.feature_vector.bushfire > 0.3 for z in zones)
