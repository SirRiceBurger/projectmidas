from .loader import (
    load_drone_data,
    load_weather_data,
    load_hazard_data,
    load_site_data,
    load_economic_data,
)
from .types import Dataset


def assemble_dataset(
    drone_path: str,
    weather_path: str,
    hazard_path: str,
    site_path: str,
    economic_path: str,
) -> Dataset:
    return Dataset(
        drone=load_drone_data(drone_path),
        weather=load_weather_data(weather_path),
        hazard=load_hazard_data(hazard_path),
        site=load_site_data(site_path),
        economic=load_economic_data(economic_path),
    )
