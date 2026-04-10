from typing import Any, Dict


def build_model_card(
    B: float,
    Gamma: float,
    alpha: float = 0.95,
    lambda_: float = 0.5,
    S: int = 10000,
    T: int = 20,
) -> Dict[str, Any]:
    return {
        "model": "Mercury v0.1",
        "parameters": {
            "B": B,
            "Gamma": Gamma,
            "alpha": alpha,
            "lambda": lambda_,
            "S": S,
            "T": T,
        },
        "assumptions": [
            "Intervention cost and emissions distributions are stationary over the planning horizon",
            "Zone feature vectors are representative of site conditions at time of assessment",
            "Correlation structure between interventions is fixed and estimated from domain knowledge",
            "CVaR is computed using a variance-covariance approximation with canonical pairwise correlations",
            "Monte Carlo scenarios are drawn from independent distributions per outcome dimension",
            "Success probability is treated as a fixed scalar per intervention",
            "All monetary values are expressed in real AUD (no inflation adjustment within the model)",
        ],
        "known_limitations": [
            "Output quality depends heavily on drone coverage, georeferencing confidence, and cost assumptions",
            "Resilience and ecological co-benefits are proxied by scalar scores and may not capture full value",
            "Climate and hazard probability distributions may be misspecified in data-sparse locations",
            "The framework simplifies human, regulatory, and behavioural constraints",
            "Correlation estimates are fixed rather than learned from observed co-movement data",
            "The model does not support multi-period reallocation or adaptive policies",
        ],
        "references": [
            "Markowitz (1952) — portfolio selection foundation",
            "Rockafellar & Uryasev (2000) — CVaR optimisation",
            "Krokhmal, Palmquist & Uryasev (2002) — portfolio optimisation with CVaR constraints",
            "Glasserman (2004) — Monte Carlo methods in financial engineering",
            "Kalra et al. (2014) — decision making under deep uncertainty",
        ],
    }
