from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class PipelineStageRecord:
    stage: int
    module: str
    description: str
    inputs: List[str]
    outputs: List[str]
    passed: bool


@dataclass
class AuditTrail:
    stages: List[PipelineStageRecord]

    def covers_all_stages(self) -> bool:
        return {s.stage for s in self.stages} == set(range(1, 11))


@dataclass
class ExclusionReason:
    intervention_id: str
    zone_id: str
    reason_code: str
    detail: str


@dataclass
class Overlay:
    zone_id: str
    intervention_id: str
    feasible: bool
    selected: bool
    mercury_score: float
    race: float


@dataclass
class PipelineResults:
    zones: List
    interventions: List
    feasibility: Dict
    optimisation: Any
    scored: List
