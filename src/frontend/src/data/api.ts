const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface DroneDataIn {
  canopy_cover: number
  bare_soil_fraction: number
  slope_degrees: number
  aspect_degrees: number
  drainage_index: number
  shade_fraction: number
  uv_index: number
  georef_confidence: number
  coverage_fraction: number
}

export interface WeatherDataIn {
  mean_annual_rainfall_mm: number
  mean_annual_temp_c: number
  extreme_heat_days_per_year: number
  frost_days_per_year: number
  wind_speed_ms: number
}

export interface HazardDataIn {
  bushfire_risk: number
  flood_risk: number
  drought_risk: number
  erosion_risk: number
}

export interface SiteDataIn {
  area_ha: number
  soil_depth_cm: number
  soil_type: string
  proximity_to_water_m: number
  land_use_current: string
}

export interface EconomicDataIn {
  land_value_aud_per_ha: number
  carbon_price_aud_per_tco2e: number
  discount_rate: number
  labour_cost_index: number
}

export interface DatasetIn {
  drone: DroneDataIn
  weather: WeatherDataIn
  hazard: HazardDataIn
  site: SiteDataIn
  economic: EconomicDataIn
}

export interface PipelineRequest {
  dataset: DatasetIn
  B?: number
  Gamma?: number
  beta?: number
  lambda_?: number
  S?: number
  T?: number
}

export interface PipelineParams {
  B: number
  Gamma: number
  beta: number
  lambda_: number
  S: number
  T: number
}

export const DEFAULT_PARAMS: PipelineParams = {
  B: 350000,
  Gamma: 70000,
  beta: 0.3,
  lambda_: 0.5,
  S: 1000,
  T: 20,
}

export interface ZoneOut {
  zone_id: string
  area_ha: number
  feature_vector: Record<string, number>
}

export interface FeasibilityOut {
  zone_id: string
  feasible_intervention_ids: string[]
}

export interface PortfolioOut {
  intervention_ids: string[]
  total_cost: number
  expected_emissions: number
  portfolio_cvar: number
  feasible: boolean
}

export interface ScoredOut {
  intervention_id: string
  race: number
  mercury_score: number
  avg_correlation: number
}

export interface ParametersUsed {
  B: number
  Gamma: number
  beta: number
  lambda_: number
  S: number
  T: number
  alpha: number
}

export interface InterventionDetail {
  id: string
  name: string
  description: string
  expected_emissions: number
  success_probability: number
  expected_cost: number
  cvar_loss: number
  maintenance_cost_annual: number
  resilience_score: number
}

export interface PortfolioComparison {
  intervention_ids: string[]
  total_cost: number
  expected_emissions: number
  portfolio_cvar: number
  feasible: boolean
  rejection_reason: string | null
}

export interface ExclusionReason {
  intervention_id: string
  reason_code: string
  detail: string
}

export interface ScenarioStats {
  e_p5: number; e_p25: number; e_p50: number; e_p75: number; e_p95: number
  k_p5: number; k_p25: number; k_p50: number; k_p75: number; k_p95: number
  l_p5: number; l_p25: number; l_p50: number; l_p75: number; l_p95: number
}

export interface AuditStage {
  stage: number
  module: string
  description: string
  passed: boolean
}

export interface DataSourceQuality {
  completeness: number
  quality: string
  fields: number
}

export interface DataQuality {
  drone: DataSourceQuality
  weather: DataSourceQuality
  hazard: DataSourceQuality
  site: DataSourceQuality
  economic: DataSourceQuality
}

export interface PipelineResponse {
  zones: ZoneOut[]
  feasibility: FeasibilityOut[]
  portfolio: PortfolioOut
  scored: ScoredOut[]
  narrative: string
  mercury_ranking: string[]
  naive_ranking: string[]
  parameters_used: ParametersUsed
  interventions_detail: InterventionDetail[]
  all_portfolios: PortfolioComparison[]
  exclusion_reasons: ExclusionReason[]
  scenario_distributions: Record<string, ScenarioStats>
  correlations: Record<string, number>
  audit_trail: AuditStage[]
  naive_scores: Record<string, number>
  data_quality: DataQuality
}

export async function runPipeline(
  dataset: DatasetIn,
  params: PipelineParams
): Promise<PipelineResponse> {
  const res = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset,
      B: params.B,
      Gamma: params.Gamma,
      beta: params.beta,
      lambda_: params.lambda_,
      S: params.S,
      T: params.T,
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const msg = detail?.detail
      ? (Array.isArray(detail.detail)
          ? detail.detail.map((e: {loc: string[], msg: string}) => `${e.loc.join('.')}: ${e.msg}`).join('\n')
          : String(detail.detail))
      : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json() as Promise<PipelineResponse>
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`)
    return res.ok
  } catch {
    return false
  }
}

export interface FeasibilityRuleIn {
  field: string
  operator: '>' | '<' | '>=' | '<=' | '=='
  threshold: number
  effect: 'infeasible'
  reason: string
}

export interface InterventionCreateIn {
  name: string
  description: string
  expected_emissions: number
  success_probability: number
  expected_cost: number
  cvar_loss: number
  maintenance_cost_annual: number
  resilience_score: number
  use_cost_model: boolean
  feasibility_rules: FeasibilityRuleIn[]
  enabled: boolean
}

export interface InterventionRecord {
  id: string
  name: string
  description: string
  expected_emissions: number
  success_probability: number
  expected_cost: number
  cvar_loss: number
  maintenance_cost_annual: number
  resilience_score: number
  use_cost_model: boolean
  feasibility_rules: FeasibilityRuleIn[]
  enabled: boolean
  is_builtin: boolean
  created_at: string
}

export async function fetchInterventions(): Promise<InterventionRecord[]> {
  const res = await fetch(`${API_BASE}/interventions`)
  if (!res.ok) throw new Error(`Failed to fetch interventions: ${res.status}`)
  return res.json()
}

export async function createIntervention(data: InterventionCreateIn): Promise<InterventionRecord> {
  const res = await fetch(`${API_BASE}/interventions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create: ${res.status}`)
  return res.json()
}

export async function updateIntervention(id: string, data: Partial<InterventionCreateIn>): Promise<InterventionRecord> {
  const res = await fetch(`${API_BASE}/interventions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to update: ${res.status}`)
  return res.json()
}

export async function deleteIntervention(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/interventions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Sensitivity analysis types and API function
// ---------------------------------------------------------------------------

export interface ParameterSweep {
  /** Name of the swept parameter: 'B', 'Gamma', 'beta', 'lambda_', or 'T'. */
  parameter: string
  /** Parameter values evaluated in the sweep. Length = n_steps. */
  values: number[]
  /** Intervention IDs in the selected portfolio at each step. */
  selected_portfolios: string[][]
  /** Portfolio objective score at each step. */
  portfolio_scores: number[]
  /** Per-intervention RACE score at each step, keyed by intervention ID. */
  metric_by_intervention: Record<string, number[]>
}

export interface SensitivityResponse {
  /** One sweep per parameter (B, Gamma, beta, lambda_, T). */
  sweeps: ParameterSweep[]
  /** Base parameter values used as the centre of each sweep. */
  base_params: Record<string, number>
  /** Intervention IDs in the portfolio at base parameters. */
  base_portfolio: string[]
  /** Approximate first-order Sobol indices (normalised, sum to 1.0). */
  sobol_first_order: Record<string, number>
  /** Parameter with the highest Sobol index. */
  most_sensitive_parameter: string
  /** Parameter with the lowest Sobol index. */
  least_sensitive_parameter: string
}

/**
 * Run sensitivity analysis across pipeline parameters.
 *
 * Sweeps B, Gamma, beta, lambda_, and T (S is held fixed for speed) and
 * returns per-parameter sweep results plus approximate first-order Sobol
 * sensitivity indices.
 *
 * Note: this is a separate API call from the main pipeline. The backend
 * uses S=200 for faster response times.
 */
export async function runSensitivity(
  dataset: DatasetIn,
  params: PipelineParams,
): Promise<SensitivityResponse> {
  const res = await fetch(`${API_BASE}/sensitivity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataset,
      B: params.B,
      Gamma: params.Gamma,
      beta: params.beta,
      lambda_: params.lambda_,
      S: params.S,
      T: params.T,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<SensitivityResponse>
}
