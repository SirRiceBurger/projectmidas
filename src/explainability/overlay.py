import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from typing import List
from src.explainability.types import Overlay, PipelineResults
from src.scoring.race import compute_race


def build_spatial_overlays(pipeline_results: PipelineResults) -> List[Overlay]:
    selected_ids = {i.id for i in pipeline_results.optimisation.selected_portfolio.interventions}

    score_map = {s.intervention.id: s.mercury_score for s in pipeline_results.scored}

    selected_host_zone: dict = {}
    for intervention in pipeline_results.interventions:
        if intervention.id not in selected_ids:
            continue
        for zone in pipeline_results.zones:
            feasible_here = any(
                i.id == intervention.id
                for i in pipeline_results.feasibility.get(zone.zone_id, [])
            )
            if feasible_here:
                selected_host_zone[intervention.id] = zone.zone_id
                break

    overlays: List[Overlay] = []
    for zone in pipeline_results.zones:
        for intervention in pipeline_results.interventions:
            feasible = any(
                i.id == intervention.id
                for i in pipeline_results.feasibility.get(zone.zone_id, [])
            )
            is_selected = (
                intervention.id in selected_ids
                and selected_host_zone.get(intervention.id) == zone.zone_id
            )
            overlays.append(Overlay(
                zone_id=zone.zone_id,
                intervention_id=intervention.id,
                feasible=feasible,
                selected=is_selected,
                mercury_score=score_map.get(intervention.id, 0.0),
                race=compute_race(intervention),
            ))

    return overlays
