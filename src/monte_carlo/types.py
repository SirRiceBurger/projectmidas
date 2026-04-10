from dataclasses import dataclass

import numpy as np


@dataclass
class Scenario:
    scenario_id: int
    climate_factor: float
    cost_factor: float
    resilience_factor: float


@dataclass
class OutcomeVector:
    scenario_id: int
    intervention_id: str
    E: float
    K: float
    L: float
    R: float
    Q: float


@dataclass
class ScenarioArrays:
    """Vectorised scenario draws — shape (S,) for each field."""
    climate_factor: np.ndarray
    cost_factor: np.ndarray
    resilience_factor: np.ndarray


@dataclass
class OutcomeArrays:
    """Per-intervention simulation outcomes — shape (S,) for each field."""
    E: np.ndarray
    K: np.ndarray
    L: np.ndarray
    R: np.ndarray
    Q: np.ndarray
