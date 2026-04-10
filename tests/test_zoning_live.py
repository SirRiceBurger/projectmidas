import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.ingestion.types import Dataset, DroneData, WeatherData, HazardData, SiteData, EconomicData
from src.zoning.partitioner import partition_site


def make_dataset(area_ha=25, slope=8, bushfire=0.4, **kwargs):
    return Dataset(
        drone=DroneData(
            canopy_cover=kwargs.get('canopy_cover', 0.35),
            bare_soil_fraction=kwargs.get('bare_soil_fraction', 0.20),
            slope_degrees=float(slope),
            aspect_degrees=kwargs.get('aspect_degrees', 180.0),
            drainage_index=kwargs.get('drainage_index', 0.60),
            shade_fraction=kwargs.get('shade_fraction', 0.25),
            uv_index=kwargs.get('uv_index', 6.5),
            georef_confidence=kwargs.get('georef_confidence', 0.92),
            coverage_fraction=kwargs.get('coverage_fraction', 0.95),
        ),
        weather=WeatherData(
            mean_annual_rainfall_mm=650,
            mean_annual_temp_c=17.5,
            extreme_heat_days_per_year=12,
            frost_days_per_year=5,
            wind_speed_ms=4.2,
        ),
        hazard=HazardData(
            bushfire_risk=float(bushfire),
            flood_risk=kwargs.get('flood_risk', 0.20),
            drought_risk=kwargs.get('drought_risk', 0.35),
            erosion_risk=kwargs.get('erosion_risk', 0.15),
        ),
        site=SiteData(
            area_ha=float(area_ha),
            soil_depth_cm=45,
            soil_type='clay_loam',
            proximity_to_water_m=120,
            land_use_current='grazing',
        ),
        economic=EconomicData(
            land_value_aud_per_ha=8500,
            carbon_price_aud_per_tco2e=35,
            discount_rate=0.07,
            labour_cost_index=1.0,
        ),
    )


def test_larger_site_more_zones():
    d = make_dataset(area_ha=50, slope=9)
    zones = partition_site(d)
    assert len(zones) == 6, f"50ha should give 6 zones, got {len(zones)}"


def test_small_site_one_zone():
    d = make_dataset(area_ha=6, slope=9)
    zones = partition_site(d)
    assert len(zones) == 1


def test_zone_areas_sum_to_site_area():
    d = make_dataset(area_ha=40, slope=9)
    zones = partition_site(d)
    total = sum(z.area_ha for z in zones)
    assert abs(total - 40.0) < 0.01


def test_different_data_different_zones():
    d1 = make_dataset(area_ha=25, slope=9, bushfire=0.2)
    d2 = make_dataset(area_ha=25, slope=9, bushfire=0.8)
    z1 = partition_site(d1)
    z2 = partition_site(d2)
    fv1 = [z.feature_vector.bushfire for z in z1]
    fv2 = [z.feature_vector.bushfire for z in z2]
    assert sum(fv1) / len(fv1) < sum(fv2) / len(fv2), (
        "Higher bushfire input should yield higher avg bushfire in zones"
    )


def test_zone_feature_vectors_complete():
    d = make_dataset(area_ha=24, slope=9)
    zones = partition_site(d)
    for z in zones:
        fv = z.feature_vector
        for field in ['canopy', 'bare_soil', 'slope', 'aspect', 'drainage', 'shade',
                      'uv', 'bushfire', 'flood', 'drought', 'proximity']:
            val = getattr(fv, field)
            assert val is not None and not (val != val), f"NaN in {field}"
            assert val >= 0, f"Negative value in {field}: {val}"


def test_synthetic_path_unchanged():
    dataset = Dataset(
        drone=DroneData(0.35, 0.2, 8.0, 180, 0.6, 0.25, 6.5, 0.92, 0.95),
        weather=WeatherData(650, 17.5, 12, 5, 4.2),
        hazard=HazardData(0.4, 0.2, 0.35, 0.15),
        site=SiteData(25.0, 45, "clay_loam", 120, "grazing"),
        economic=EconomicData(8500, 35, 0.07, 1.0),
    )
    zones = partition_site(dataset)
    ids = [z.zone_id for z in zones]
    assert ids == ["A", "B", "C"], f"Synthetic path should return A/B/C, got {ids}"
