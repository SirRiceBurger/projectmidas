import json
from .types import DroneData, WeatherData, HazardData, SiteData, EconomicData, QualityFlag


def _load_json(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def load_drone_data(path: str) -> DroneData:
    d = _load_json(path)
    flag = QualityFlag(d.get("quality_flag", QualityFlag.OK.value))
    return DroneData(
        canopy_cover=d["canopy_cover"],
        bare_soil_fraction=d["bare_soil_fraction"],
        slope_degrees=d["slope_degrees"],
        aspect_degrees=d["aspect_degrees"],
        drainage_index=d["drainage_index"],
        shade_fraction=d["shade_fraction"],
        uv_index=d["uv_index"],
        georef_confidence=d["georef_confidence"],
        coverage_fraction=d["coverage_fraction"],
        quality_flag=flag,
    )


def load_weather_data(path: str) -> WeatherData:
    d = _load_json(path)
    flag = QualityFlag(d.get("quality_flag", QualityFlag.OK.value))
    return WeatherData(
        mean_annual_rainfall_mm=d["mean_annual_rainfall_mm"],
        mean_annual_temp_c=d["mean_annual_temp_c"],
        extreme_heat_days_per_year=d["extreme_heat_days_per_year"],
        frost_days_per_year=d["frost_days_per_year"],
        wind_speed_ms=d["wind_speed_ms"],
        quality_flag=flag,
    )


def load_hazard_data(path: str) -> HazardData:
    d = _load_json(path)
    flag = QualityFlag(d.get("quality_flag", QualityFlag.OK.value))
    return HazardData(
        bushfire_risk=d["bushfire_risk"],
        flood_risk=d["flood_risk"],
        drought_risk=d["drought_risk"],
        erosion_risk=d["erosion_risk"],
        quality_flag=flag,
    )


def load_site_data(path: str) -> SiteData:
    d = _load_json(path)
    flag = QualityFlag(d.get("quality_flag", QualityFlag.OK.value))
    return SiteData(
        area_ha=d["area_ha"],
        soil_depth_cm=d["soil_depth_cm"],
        soil_type=d["soil_type"],
        proximity_to_water_m=d["proximity_to_water_m"],
        land_use_current=d["land_use_current"],
        quality_flag=flag,
    )


def load_economic_data(path: str) -> EconomicData:
    d = _load_json(path)
    flag = QualityFlag(d.get("quality_flag", QualityFlag.OK.value))
    return EconomicData(
        land_value_aud_per_ha=d["land_value_aud_per_ha"],
        carbon_price_aud_per_tco2e=d["carbon_price_aud_per_tco2e"],
        discount_rate=d["discount_rate"],
        labour_cost_index=d["labour_cost_index"],
        quality_flag=flag,
    )
