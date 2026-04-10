import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from collections import defaultdict
import numpy as np

from src.ingestion.types import Dataset, DroneData, WeatherData, HazardData, SiteData, EconomicData
from src.zoning.partitioner import partition_site
from src.interventions.feasibility import get_feasible_interventions
from src.interventions.types import Intervention as InterventionType
from src.store.interventions import list_interventions as store_list
from src.optimiser.portfolio import optimise_portfolio
from src.scoring.mercury_score import compute_mercury_scores
from src.scoring.ranking import rank_by_mercury, rank_naive
from src.explainability.types import PipelineResults
from src.explainability.diagnostics import explain_exclusions
from src.explainability.narrative import generate_narrative
from src.explainability.audit import build_audit_trail
from src.monte_carlo.simulator import run_simulation
from src.api.schemas import (
    DatasetIn, PipelineResponse, ZoneOut, FeasibilityOut,
    PortfolioOut, ScoredInterventionOut, ParametersUsed, InterventionDetail,
    PortfolioComparison, ExclusionReasonOut, ScenarioStats, AuditStage,
    DataSourceQuality, DataQuality,
)


def _store_to_intervention(record: dict, dataset=None) -> InterventionType:
    if record.get("use_cost_model") and dataset:
        from src.interventions.cost_model import compute_i1_from_dataset, compute_i2_from_dataset, compute_i3_from_dataset
        _models = {"I1": compute_i1_from_dataset, "I2": compute_i2_from_dataset, "I3": compute_i3_from_dataset}
        if record["id"] in _models:
            computed = _models[record["id"]](dataset)
            return InterventionType(id=record["id"], name=record["name"], **computed)
    return InterventionType(
        id=record["id"],
        name=record["name"],
        expected_emissions=record["expected_emissions"],
        success_probability=record["success_probability"],
        expected_cost=record["expected_cost"],
        cvar_loss=record["cvar_loss"],
        maintenance_cost_annual=record.get("maintenance_cost_annual", 0.0),
        resilience_score=record.get("resilience_score", 0.5),
    )


_BASE_CORRELATIONS = {
    ("I1", "I2"): 0.28, ("I2", "I1"): 0.28,
    ("I1", "I3"): 0.71, ("I3", "I1"): 0.71,
    ("I2", "I3"): 0.54, ("I3", "I2"): 0.54,
}

CORRELATIONS: dict = defaultdict(float, _BASE_CORRELATIONS)


def dataset_from_schema(d: DatasetIn) -> Dataset:
    return Dataset(
        drone=DroneData(**d.drone.model_dump()),
        weather=WeatherData(**d.weather.model_dump()),
        hazard=HazardData(**d.hazard.model_dump()),
        site=SiteData(**d.site.model_dump()),
        economic=EconomicData(**d.economic.model_dump()),
    )


def run_pipeline(request) -> PipelineResponse:
    dataset = dataset_from_schema(request.dataset)

    zones = partition_site(dataset)

    store_records = store_list(enabled_only=True)
    library = [_store_to_intervention(r, dataset) for r in store_records]
    rules_map = {r["id"]: r.get("feasibility_rules", []) for r in store_records}
    feasibility = get_feasible_interventions(zones, library, rules_map=rules_map)

    feasible_ids = {iv.id for zone_ivs in feasibility.values() for iv in zone_ivs}
    feasible_library = [iv for iv in library if iv.id in feasible_ids]

    opt_result = optimise_portfolio(feasible_library, B=request.B, Gamma=request.Gamma, beta=request.beta)
    scored = compute_mercury_scores(library, CORRELATIONS, lambda_=request.lambda_)

    pr = PipelineResults(
        zones=zones,
        interventions=library,
        feasibility=feasibility,
        optimisation=opt_result,
        scored=scored,
    )
    exclusions = explain_exclusions(pr, B=request.B, Gamma=request.Gamma)
    narrative = generate_narrative(pr, exclusions, B=request.B, Gamma=request.Gamma)

    mercury_ranked = rank_by_mercury(scored)
    naive_ranked = rank_naive(library)

    sim_results = run_simulation(library, S=request.S, T=request.T, seed=42)

    zones_out = [
        ZoneOut(
            zone_id=z.zone_id,
            area_ha=z.area_ha,
            feature_vector={
                k: getattr(z.feature_vector, k)
                for k in ['canopy', 'bare_soil', 'slope', 'aspect', 'drainage',
                          'shade', 'uv', 'bushfire', 'flood', 'drought', 'proximity']
            }
        ) for z in zones
    ]

    feasibility_out = [
        FeasibilityOut(
            zone_id=zone_id,
            feasible_intervention_ids=[i.id for i in interventions]
        )
        for zone_id, interventions in feasibility.items()
    ]

    portfolio_out = PortfolioOut(
        intervention_ids=[i.id for i in opt_result.selected_portfolio.interventions],
        total_cost=opt_result.selected_portfolio.total_cost,
        expected_emissions=opt_result.selected_portfolio.expected_emissions,
        portfolio_cvar=opt_result.selected_portfolio.portfolio_cvar,
        feasible=opt_result.selected_portfolio.feasible,
    )

    scored_out = [
        ScoredInterventionOut(
            intervention_id=s.intervention.id,
            race=s.race,
            mercury_score=s.mercury_score,
            avg_correlation=s.avg_correlation,
        ) for s in scored
    ]

    parameters_used = ParametersUsed(
        B=request.B,
        Gamma=request.Gamma,
        beta=request.beta,
        lambda_=request.lambda_,
        S=request.S,
        T=request.T,
        alpha=0.95,
    )

    interventions_detail = [
        InterventionDetail(
            id=iv.id,
            name=iv.name,
            description=getattr(iv, 'description', ''),
            expected_emissions=iv.expected_emissions,
            success_probability=iv.success_probability,
            expected_cost=iv.expected_cost,
            cvar_loss=iv.cvar_loss,
            maintenance_cost_annual=iv.maintenance_cost_annual,
            resilience_score=iv.resilience_score,
        ) for iv in library
    ]

    all_portfolios_out = []
    for p in opt_result.all_portfolios:
        ids = sorted(i.id for i in p.interventions)
        label = str(tuple(ids))
        rejection_reason = opt_result.rejected_reason.get("+".join(ids))
        all_portfolios_out.append(PortfolioComparison(
            intervention_ids=ids,
            total_cost=p.total_cost,
            expected_emissions=p.expected_emissions,
            portfolio_cvar=p.portfolio_cvar,
            feasible=p.feasible,
            rejection_reason=rejection_reason,
        ))

    exclusion_reasons_out = [
        ExclusionReasonOut(
            intervention_id=e.intervention_id,
            reason_code=e.reason_code,
            detail=e.detail,
        ) for e in exclusions
    ]

    scenario_distributions = {}
    for iv in library:
        outcomes = sim_results.get(iv.id)
        if outcomes is not None:
            e_pcts = np.percentile(outcomes.E, [5, 25, 50, 75, 95])
            k_pcts = np.percentile(outcomes.K, [5, 25, 50, 75, 95])
            l_pcts = np.percentile(outcomes.L, [5, 25, 50, 75, 95])
            scenario_distributions[iv.id] = ScenarioStats(
                e_p5=float(e_pcts[0]), e_p25=float(e_pcts[1]), e_p50=float(e_pcts[2]),
                e_p75=float(e_pcts[3]), e_p95=float(e_pcts[4]),
                k_p5=float(k_pcts[0]), k_p25=float(k_pcts[1]), k_p50=float(k_pcts[2]),
                k_p75=float(k_pcts[3]), k_p95=float(k_pcts[4]),
                l_p5=float(l_pcts[0]), l_p25=float(l_pcts[1]), l_p50=float(l_pcts[2]),
                l_p75=float(l_pcts[3]), l_p95=float(l_pcts[4]),
            )

    ids = [iv.id for iv in library]
    corr_out = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            key = f"{a}:{b}"
            corr_out[key] = float(CORRELATIONS[(a, b)] or CORRELATIONS[(b, a)])

    mercury_ranking = [s.intervention.id for s in mercury_ranked]
    context = {
        "zone_count": len(zones),
        "feasible_pair_count": sum(len(v) for v in feasibility.values()),
        "selected_ids": [i.id for i in opt_result.selected_portfolio.interventions],
        "portfolio_cvar": opt_result.selected_portfolio.portfolio_cvar,
        "top_intervention": mercury_ranking[0] if mercury_ranking else "",
        "exclusion_count": len(exclusions),
    }
    audit_trail_data = build_audit_trail(context)
    audit_trail_out = [
        AuditStage(
            stage=s.stage,
            module=s.module,
            description=s.description,
            passed=s.passed,
        ) for s in audit_trail_data.stages
    ]

    naive_scores = {
        iv.id: iv.expected_emissions / iv.expected_cost
        for iv in library
        if iv.expected_cost != 0
    }

    data_quality = DataQuality(
        drone=DataSourceQuality(completeness=1.0, quality="high", fields=9),
        weather=DataSourceQuality(completeness=1.0, quality="high", fields=5),
        hazard=DataSourceQuality(completeness=1.0, quality="high", fields=4),
        site=DataSourceQuality(completeness=1.0, quality="high", fields=5),
        economic=DataSourceQuality(completeness=1.0, quality="high", fields=4),
    )

    return PipelineResponse(
        zones=zones_out,
        feasibility=feasibility_out,
        portfolio=portfolio_out,
        scored=scored_out,
        narrative=narrative,
        mercury_ranking=mercury_ranking,
        naive_ranking=[i.id for i in naive_ranked],
        parameters_used=parameters_used,
        interventions_detail=interventions_detail,
        all_portfolios=all_portfolios_out,
        exclusion_reasons=exclusion_reasons_out,
        scenario_distributions=scenario_distributions,
        correlations=corr_out,
        audit_trail=audit_trail_out,
        naive_scores=naive_scores,
        data_quality=data_quality,
    )
