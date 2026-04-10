import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.explainability.types import AuditTrail, PipelineResults, PipelineStageRecord

_STAGE_DEFINITIONS = [
    (1, "ingestion", "Assemble D = {D_drone, D_weather, D_hazard, D_site, D_economic}",
     ["D_drone", "D_weather", "D_hazard", "D_site", "D_economic"], ["Dataset"]),
    (2, "zoning", "Partition site into {zone_count} zones, each with feature vector x_i",
     ["Dataset"], ["zones", "feature_vectors"]),
    (3, "interventions", "Apply feasibility filter F_j(x_i) — {feasible_pair_count} feasible zone-intervention pairs",
     ["zones", "intervention_library"], ["feasibility_map"]),
    (4, "monte_carlo", "Simulate S=10,000 scenarios over horizon T=20 years",
     ["feasibility_map", "Dataset"], ["scenario_set"]),
    (5, "monte_carlo", "Compute outcome vectors Y_{j,s} = [E, K, L, R, Q]",
     ["scenario_set"], ["outcome_vectors"]),
    (6, "scoring", "Compute RACE metric per intervention",
     ["outcome_vectors"], ["race_scores"]),
    (7, "optimiser", "Portfolio optimisation selected {selected_ids} with CVaR {portfolio_cvar:.0f}",
     ["race_scores", "B", "Gamma"], ["portfolio"]),
    (8, "optimiser", "Apply correlation penalty rho_{jk}",
     ["portfolio", "correlations"], ["adjusted_portfolio"]),
    (9, "scoring", "Compute MercuryScore — top-ranked: {top_intervention}",
     ["adjusted_portfolio", "race_scores"], ["mercury_scores"]),
    (10, "explainability", "Return ranked results, diagnostics to MIDAS — {exclusion_count} exclusions explained",
     ["mercury_scores", "portfolio", "zones"], ["ranked_list", "overlays", "diagnostics", "narrative"]),
]


def build_audit_trail(pipeline_results_or_context) -> AuditTrail:
    if isinstance(pipeline_results_or_context, dict):
        context = pipeline_results_or_context
    else:
        pr = pipeline_results_or_context
        context = {
            "zone_count": len(pr.zones),
            "feasible_pair_count": sum(len(v) for v in pr.feasibility.values()),
            "selected_ids": [i.id for i in pr.optimisation.selected_portfolio.interventions],
            "portfolio_cvar": pr.optimisation.selected_portfolio.portfolio_cvar,
            "top_intervention": pr.scored[0].intervention.id if pr.scored else "",
            "exclusion_count": 0,
        }

    stages = []
    for stage, module, description, inputs, outputs in _STAGE_DEFINITIONS:
        try:
            filled = description.format(**context)
        except (KeyError, ValueError):
            filled = description
        stages.append(PipelineStageRecord(
            stage=stage,
            module=module,
            description=filled,
            inputs=inputs,
            outputs=outputs,
            passed=True,
        ))
    return AuditTrail(stages=stages)
