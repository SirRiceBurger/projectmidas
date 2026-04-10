from .types import Intervention


def compute_race(intervention: Intervention, lambda_: float = 0.5) -> float:
    numerator = intervention.expected_emissions * intervention.success_probability
    denominator = intervention.expected_cost + lambda_ * intervention.cvar_loss
    return numerator / denominator


def compute_i1_from_dataset(dataset) -> dict:
    """Revegetation Belt — scales with area, labour, carbon price."""
    area = dataset.site.area_ha
    labour = dataset.economic.labour_cost_index
    carbon_price = dataset.economic.carbon_price_aud_per_tco2e

    base_cost_per_ha = 4800 * labour
    expected_cost = area * base_cost_per_ha

    expected_emissions = area * 4.8 * (carbon_price / 35)

    cvar_loss = expected_cost * 0.333

    success_probability = max(0.3, 0.92 - dataset.hazard.bushfire_risk * 0.5)

    maintenance_cost_annual = area * 200 * labour
    resilience_score = 0.7

    return dict(expected_cost=round(expected_cost), expected_emissions=round(expected_emissions, 1),
                cvar_loss=round(cvar_loss), success_probability=round(success_probability, 3),
                maintenance_cost_annual=round(maintenance_cost_annual), resilience_score=resilience_score)


def compute_i2_from_dataset(dataset) -> dict:
    """Rooftop Solar Retrofit — scales with area."""
    area = dataset.site.area_ha

    expected_cost = area * 8800
    expected_emissions = area * 7.2
    cvar_loss = expected_cost * 0.114

    shade_penalty = max(0, dataset.drone.shade_fraction - 0.3) * 0.5
    success_probability = max(0.5, 0.95 - shade_penalty)

    maintenance_cost_annual = area * 120
    resilience_score = 0.5

    return dict(expected_cost=round(expected_cost), expected_emissions=round(expected_emissions, 1),
                cvar_loss=round(cvar_loss), success_probability=round(success_probability, 3),
                maintenance_cost_annual=round(maintenance_cost_annual), resilience_score=resilience_score)


def compute_i3_from_dataset(dataset) -> dict:
    """Water Retention & Soil Restoration — scales with area, drainage."""
    area = dataset.site.area_ha
    labour = dataset.economic.labour_cost_index

    expected_cost = area * 5200 * labour

    drainage_factor = max(0.5, 1 - dataset.drone.drainage_index)
    expected_emissions = area * 6.0 * drainage_factor

    cvar_loss = expected_cost * 0.692

    success_probability = max(0.3, 0.55 + dataset.hazard.drought_risk * 0.3)

    maintenance_cost_annual = area * 160 * labour
    resilience_score = 0.8

    return dict(expected_cost=round(expected_cost), expected_emissions=round(expected_emissions, 1),
                cvar_loss=round(cvar_loss), success_probability=round(success_probability, 3),
                maintenance_cost_annual=round(maintenance_cost_annual), resilience_score=resilience_score)
