from dataclasses import dataclass
from typing import Dict, List

from src.interventions.types import Intervention


@dataclass
class Portfolio:
    interventions: List[Intervention]
    total_cost: float
    expected_emissions: float
    portfolio_cvar: float
    feasible: bool


@dataclass
class OptimisationResult:
    selected_portfolio: Portfolio
    all_portfolios: List[Portfolio]
    rejected_reason: Dict[str, str]
