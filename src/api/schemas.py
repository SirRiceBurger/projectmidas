from pydantic import BaseModel
from typing import List, Dict, Optional, Any


class DroneDataIn(BaseModel):
    canopy_cover: float
    bare_soil_fraction: float
    slope_degrees: float
    aspect_degrees: float
    drainage_index: float
    shade_fraction: float
    uv_index: float
    georef_confidence: float
    coverage_fraction: float


class WeatherDataIn(BaseModel):
    mean_annual_rainfall_mm: float
    mean_annual_temp_c: float
    extreme_heat_days_per_year: float
    frost_days_per_year: float
    wind_speed_ms: float


class HazardDataIn(BaseModel):
    bushfire_risk: float
    flood_risk: float
    drought_risk: float
    erosion_risk: float


class SiteDataIn(BaseModel):
    area_ha: float
    soil_depth_cm: float
    soil_type: str
    proximity_to_water_m: float
    land_use_current: str


class EconomicDataIn(BaseModel):
    land_value_aud_per_ha: float
    carbon_price_aud_per_tco2e: float
    discount_rate: float
    labour_cost_index: float


class DatasetIn(BaseModel):
    drone: DroneDataIn
    weather: WeatherDataIn
    hazard: HazardDataIn
    site: SiteDataIn
    economic: EconomicDataIn


class OptimiseRequest(BaseModel):
    dataset: DatasetIn
    B: float = 350_000
    Gamma: float = 70_000
    beta: float = 0.5
    lambda_: float = 0.5
    S: int = 1000
    T: int = 20


class InterventionOut(BaseModel):
    id: str
    name: str
    description: str = ""
    expected_emissions: float
    success_probability: float
    expected_cost: float
    cvar_loss: float
    maintenance_cost_annual: float = 0.0
    resilience_score: float = 0.5
    use_cost_model: bool = False
    feasibility_rules: List[dict] = []
    enabled: bool = True
    is_builtin: bool = False
    created_at: str = ""


class FeasibilityRuleIn(BaseModel):
    field: str
    operator: str
    threshold: float
    effect: str = "infeasible"
    reason: str = ""


class InterventionCreateIn(BaseModel):
    name: str
    description: str = ""
    expected_emissions: float
    success_probability: float
    expected_cost: float
    cvar_loss: float
    maintenance_cost_annual: float = 0.0
    resilience_score: float = 0.5
    use_cost_model: bool = False
    feasibility_rules: List[FeasibilityRuleIn] = []
    enabled: bool = True


class InterventionUpdateIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    expected_emissions: Optional[float] = None
    success_probability: Optional[float] = None
    expected_cost: Optional[float] = None
    cvar_loss: Optional[float] = None
    maintenance_cost_annual: Optional[float] = None
    resilience_score: Optional[float] = None
    use_cost_model: Optional[bool] = None
    feasibility_rules: Optional[List[FeasibilityRuleIn]] = None
    enabled: Optional[bool] = None


class ZoneOut(BaseModel):
    zone_id: str
    area_ha: float
    feature_vector: Dict[str, float]


class FeasibilityOut(BaseModel):
    zone_id: str
    feasible_intervention_ids: List[str]


class PortfolioOut(BaseModel):
    intervention_ids: List[str]
    total_cost: float
    expected_emissions: float
    portfolio_cvar: float
    feasible: bool


class ScoredInterventionOut(BaseModel):
    intervention_id: str
    race: float
    mercury_score: float
    avg_correlation: float


class ParametersUsed(BaseModel):
    B: float
    Gamma: float
    beta: float
    lambda_: float
    S: int
    T: int
    alpha: float


class InterventionDetail(BaseModel):
    id: str
    name: str
    description: str
    expected_emissions: float
    success_probability: float
    expected_cost: float
    cvar_loss: float
    maintenance_cost_annual: float
    resilience_score: float


class PortfolioComparison(BaseModel):
    intervention_ids: List[str]
    total_cost: float
    expected_emissions: float
    portfolio_cvar: float
    feasible: bool
    rejection_reason: Optional[str]


class ExclusionReasonOut(BaseModel):
    intervention_id: str
    reason_code: str
    detail: str


class ScenarioStats(BaseModel):
    e_p5: float
    e_p25: float
    e_p50: float
    e_p75: float
    e_p95: float
    k_p5: float
    k_p25: float
    k_p50: float
    k_p75: float
    k_p95: float
    l_p5: float
    l_p25: float
    l_p50: float
    l_p75: float
    l_p95: float


class AuditStage(BaseModel):
    stage: int
    module: str
    description: str
    passed: bool


class DataSourceQuality(BaseModel):
    completeness: float
    quality: str
    fields: int


class DataQuality(BaseModel):
    drone: DataSourceQuality
    weather: DataSourceQuality
    hazard: DataSourceQuality
    site: DataSourceQuality
    economic: DataSourceQuality


class PipelineResponse(BaseModel):
    zones: List[ZoneOut]
    feasibility: List[FeasibilityOut]
    portfolio: PortfolioOut
    scored: List[ScoredInterventionOut]
    narrative: str
    mercury_ranking: List[str]
    naive_ranking: List[str]
    parameters_used: ParametersUsed
    interventions_detail: List[InterventionDetail]
    all_portfolios: List[PortfolioComparison]
    exclusion_reasons: List[ExclusionReasonOut]
    scenario_distributions: Dict[str, ScenarioStats]
    correlations: Dict[str, float]
    audit_trail: List[AuditStage]
    naive_scores: Dict[str, float]
    data_quality: DataQuality


class ParameterSweepOut(BaseModel):
    """Serialisable form of a single parameter sweep result.

    Each list attribute has length equal to the number of sweep steps.

    Attributes
    ----------
    parameter : str
        Name of the swept parameter ('B', 'Gamma', 'beta', 'lambda_', 'T').
    values : List[float]
        Parameter values evaluated in the sweep.
    selected_portfolios : List[List[str]]
        Intervention IDs in the selected portfolio at each step.
    portfolio_scores : List[float]
        Portfolio objective score at each step.
    metric_by_intervention : Dict[str, List[float]]
        Per-intervention RACE score at each step, keyed by intervention ID.
    """

    parameter: str
    values: List[float]
    selected_portfolios: List[List[str]]
    portfolio_scores: List[float]
    metric_by_intervention: Dict[str, List[float]]


class SensitivityResponse(BaseModel):
    """Full sensitivity analysis response.

    Attributes
    ----------
    sweeps : List[ParameterSweepOut]
        One sweep per parameter (B, Gamma, beta, lambda_, T).
    base_params : Dict
        Base parameter values used as the centre of each sweep.
    base_portfolio : List[str]
        Intervention IDs in the portfolio at base parameters.
    sobol_first_order : Dict[str, float]
        Approximate first-order Sobol indices (normalised, sum to 1.0).
    most_sensitive_parameter : str
        Parameter with the highest Sobol index.
    least_sensitive_parameter : str
        Parameter with the lowest Sobol index.
    """

    sweeps: List[ParameterSweepOut]
    base_params: Dict
    base_portfolio: List[str]
    sobol_first_order: Dict[str, float]
    most_sensitive_parameter: str
    least_sensitive_parameter: str
