import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from src.api.schemas import (
    OptimiseRequest, PipelineResponse,
    InterventionOut, InterventionCreateIn, InterventionUpdateIn,
    SensitivityResponse, ParameterSweepOut,
)
from src.api.pipeline import run_pipeline, dataset_from_schema, _store_to_intervention, CORRELATIONS
from src.store.interventions import (
    list_interventions as store_list,
    get_intervention as store_get,
    create_intervention as store_create,
    update_intervention as store_update,
    delete_intervention as store_delete,
)

app = FastAPI(title="Mercury API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/pipeline", response_model=PipelineResponse)
def pipeline(request: OptimiseRequest):
    return run_pipeline(request)


@app.get("/interventions", response_model=List[InterventionOut])
def get_interventions(enabled_only: bool = False):
    return store_list(enabled_only=enabled_only)


@app.post("/interventions", response_model=InterventionOut, status_code=201)
def create_intervention_endpoint(body: InterventionCreateIn):
    data = body.model_dump()
    data["feasibility_rules"] = [r.model_dump() for r in body.feasibility_rules]
    return store_create(data)


@app.put("/interventions/{id}", response_model=InterventionOut)
def update_intervention_endpoint(id: str, body: InterventionUpdateIn):
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "feasibility_rules" in update_data:
        update_data["feasibility_rules"] = [
            r if isinstance(r, dict) else r.model_dump() for r in update_data["feasibility_rules"]
        ]
    result = store_update(id, update_data)
    if result is None:
        raise HTTPException(404, f"Intervention {id} not found")
    return result


@app.delete("/interventions/{id}", status_code=204)
def delete_intervention_endpoint(id: str):
    if not store_delete(id):
        raise HTTPException(400, f"Cannot delete {id} — not found or is a builtin")


@app.post("/sensitivity", response_model=SensitivityResponse)
def sensitivity(request: OptimiseRequest):
    """Run sensitivity analysis across pipeline parameters.

    Sweeps B, Gamma, beta, lambda_, and T across their plausible ranges
    (S is held fixed for speed) and returns per-parameter sweep results
    plus approximate first-order Sobol sensitivity indices.

    The endpoint uses S=200 Monte Carlo scenarios (vs. the normal pipeline's
    S=1000) to keep response times acceptable for interactive use.
    """
    from src.zoning.partitioner import partition_site
    from src.interventions.feasibility import get_feasible_interventions
    from src.sensitivity.analyser import run_sensitivity

    dataset = dataset_from_schema(request.dataset)
    zones = partition_site(dataset)

    store_records = store_list(enabled_only=True)
    library = [_store_to_intervention(r, dataset) for r in store_records]
    rules_map = {r["id"]: r.get("feasibility_rules", []) for r in store_records}

    params = {
        "B": request.B,
        "Gamma": request.Gamma,
        "beta": request.beta,
        "lambda_": request.lambda_,
        "S": min(request.S, 200),  # cap at 200 for speed
        "T": request.T,
    }

    result = run_sensitivity(
        zones=zones,
        library=library,
        rules_map=rules_map,
        params=params,
        correlations=CORRELATIONS,
        S=200,
    )

    sweeps_out = [
        ParameterSweepOut(
            parameter=sweep.parameter,
            values=sweep.values,
            selected_portfolios=sweep.selected_portfolios,
            portfolio_scores=sweep.portfolio_scores,
            metric_by_intervention=sweep.metric_by_intervention,
        )
        for sweep in result.sweeps
    ]

    return SensitivityResponse(
        sweeps=sweeps_out,
        base_params=result.base_params,
        base_portfolio=result.base_portfolio,
        sobol_first_order=result.sobol_first_order,
        most_sensitive_parameter=result.most_sensitive_parameter,
        least_sensitive_parameter=result.least_sensitive_parameter,
    )
