from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class QualityFlag(Enum):
    OK = "ok"
    MISSING = "missing"
    LOW_COVERAGE = "low_coverage"
    GEOREF_WEAK = "georef_weak"
    STALE = "stale"


@dataclass
class DroneData:
    canopy_cover: float          # fraction 0–1
    bare_soil_fraction: float    # fraction 0–1
    slope_degrees: float
    aspect_degrees: float
    drainage_index: float        # 0–1, higher = better drainage
    shade_fraction: float        # fraction 0–1
    uv_index: float
    georef_confidence: float     # 0–1
    coverage_fraction: float     # fraction of site covered by drone survey 0–1
    quality_flag: QualityFlag = QualityFlag.OK


@dataclass
class WeatherData:
    mean_annual_rainfall_mm: float
    mean_annual_temp_c: float
    extreme_heat_days_per_year: float
    frost_days_per_year: float
    wind_speed_ms: float
    quality_flag: QualityFlag = QualityFlag.OK


@dataclass
class HazardData:
    bushfire_risk: float    # 0–1
    flood_risk: float       # 0–1
    drought_risk: float     # 0–1
    erosion_risk: float     # 0–1
    quality_flag: QualityFlag = QualityFlag.OK


@dataclass
class SiteData:
    area_ha: float
    soil_depth_cm: float
    soil_type: str
    proximity_to_water_m: float
    land_use_current: str
    quality_flag: QualityFlag = QualityFlag.OK


@dataclass
class EconomicData:
    land_value_aud_per_ha: float
    carbon_price_aud_per_tco2e: float
    discount_rate: float        # annual, e.g. 0.07
    labour_cost_index: float    # relative index, 1.0 = baseline
    quality_flag: QualityFlag = QualityFlag.OK


@dataclass
class Dataset:
    drone: Optional[DroneData] = None
    weather: Optional[WeatherData] = None
    hazard: Optional[HazardData] = None
    site: Optional[SiteData] = None
    economic: Optional[EconomicData] = None


@dataclass
class ValidationReport:
    completeness: float          # 0–1
    flags: list = field(default_factory=list)
    missing_sources: list = field(default_factory=list)
    none_fields: list = field(default_factory=list)
    passed: bool = False
