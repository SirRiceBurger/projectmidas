import pytest
import os

from src.ingestion.loader import (
    load_drone_data,
    load_weather_data,
    load_hazard_data,
    load_site_data,
    load_economic_data,
)
from src.ingestion.assembler import assemble_dataset
from src.ingestion.validator import validate_dataset
from src.ingestion.types import (
    DroneData,
    WeatherData,
    HazardData,
    SiteData,
    EconomicData,
    Dataset,
    ValidationReport,
    QualityFlag,
)

SYNTHETIC = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic")


def _path(filename: str) -> str:
    return os.path.join(SYNTHETIC, filename)


def test_load_drone_data_returns_correct_type_and_values():
    d = load_drone_data(_path("drone.json"))
    assert isinstance(d, DroneData)
    assert d.canopy_cover == 0.35
    assert d.bare_soil_fraction == 0.2
    assert d.slope_degrees == 8
    assert d.aspect_degrees == 180
    assert d.drainage_index == 0.6
    assert d.shade_fraction == 0.25
    assert d.uv_index == 6.5
    assert d.georef_confidence == 0.92
    assert d.coverage_fraction == 0.95
    assert d.quality_flag == QualityFlag.OK


def test_load_weather_data_returns_correct_type_and_values():
    w = load_weather_data(_path("weather.json"))
    assert isinstance(w, WeatherData)
    assert w.mean_annual_rainfall_mm == 650
    assert w.mean_annual_temp_c == 17.5
    assert w.extreme_heat_days_per_year == 12
    assert w.frost_days_per_year == 5
    assert w.wind_speed_ms == 4.2
    assert w.quality_flag == QualityFlag.OK


def test_load_hazard_data_returns_correct_type_and_values():
    h = load_hazard_data(_path("hazard.json"))
    assert isinstance(h, HazardData)
    assert h.bushfire_risk == 0.4
    assert h.flood_risk == 0.2
    assert h.drought_risk == 0.35
    assert h.erosion_risk == 0.15
    assert h.quality_flag == QualityFlag.OK


def test_load_site_data_returns_correct_type_and_values():
    s = load_site_data(_path("site.json"))
    assert isinstance(s, SiteData)
    assert s.area_ha == 25
    assert s.soil_depth_cm == 45
    assert s.soil_type == "clay_loam"
    assert s.proximity_to_water_m == 120
    assert s.land_use_current == "grazing"
    assert s.quality_flag == QualityFlag.OK


def test_load_economic_data_returns_correct_type_and_values():
    e = load_economic_data(_path("economic.json"))
    assert isinstance(e, EconomicData)
    assert e.land_value_aud_per_ha == 8500
    assert e.carbon_price_aud_per_tco2e == 35
    assert e.discount_rate == 0.07
    assert e.labour_cost_index == 1.0
    assert e.quality_flag == QualityFlag.OK


def test_assemble_dataset_all_sources_present():
    ds = assemble_dataset(
        drone_path=_path("drone.json"),
        weather_path=_path("weather.json"),
        hazard_path=_path("hazard.json"),
        site_path=_path("site.json"),
        economic_path=_path("economic.json"),
    )
    assert isinstance(ds, Dataset)
    assert ds.drone is not None
    assert ds.weather is not None
    assert ds.hazard is not None
    assert ds.site is not None
    assert ds.economic is not None


def test_validate_dataset_full_completeness_and_passes():
    ds = assemble_dataset(
        drone_path=_path("drone.json"),
        weather_path=_path("weather.json"),
        hazard_path=_path("hazard.json"),
        site_path=_path("site.json"),
        economic_path=_path("economic.json"),
    )
    report = validate_dataset(ds)
    assert isinstance(report, ValidationReport)
    assert report.completeness == 1.0
    assert report.passed is True
    assert report.missing_sources == []
    assert QualityFlag.MISSING not in report.flags


def test_validate_dataset_partial_completeness_fails():
    ds = Dataset(drone=None, weather=None, hazard=None, site=None, economic=None)
    report = validate_dataset(ds)
    assert report.completeness == 0.0
    assert report.passed is False
    assert len(report.missing_sources) == 5


def test_validate_dataset_four_of_five_passes():
    ds = assemble_dataset(
        drone_path=_path("drone.json"),
        weather_path=_path("weather.json"),
        hazard_path=_path("hazard.json"),
        site_path=_path("site.json"),
        economic_path=_path("economic.json"),
    )
    ds.economic = None
    report = validate_dataset(ds)
    assert report.completeness == 0.8
    assert report.passed is False
    assert "economic" in report.missing_sources


def test_load_missing_file_raises_error():
    with pytest.raises(FileNotFoundError):
        load_drone_data(_path("nonexistent.json"))
