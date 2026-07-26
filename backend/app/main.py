from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .adapters import builtin_scenario
from .engine import calibration_metrics, evidence_counterfactual, forecast
from .schemas import (
    CalibrationMetrics,
    CounterfactualRequest,
    CounterfactualResponse,
    EvidenceCounterfactualRequest,
    EvidenceCounterfactualResponse,
    ForecastRequest,
    ForecastResponse,
    Scenario,
)

app = FastAPI(
    title="Vector Field Motion Forecast API",
    version="0.4.0",
    description="Deterministic multimodal motion and counterfactual forecasting for the portfolio laboratory.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "deterministic", "model": "graph-diffusion-surrogate-v0.4"}


@app.get("/api/scenarios/{scenario_id}", response_model=Scenario)
def get_scenario(scenario_id: str) -> Scenario:
    scenario = builtin_scenario()
    if scenario_id != scenario.id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@app.post("/api/forecast", response_model=ForecastResponse)
def create_forecast(request: ForecastRequest) -> ForecastResponse:
    if request.scenario_id != "sf-market-0142":
        raise HTTPException(status_code=404, detail="Scenario not found")
    return forecast(request)


@app.post("/api/counterfactual", response_model=CounterfactualResponse)
def create_counterfactual(request: CounterfactualRequest) -> CounterfactualResponse:
    if request.scenario_id != "sf-market-0142":
        raise HTTPException(status_code=404, detail="Scenario not found")
    shared = {
        "scenario_id": request.scenario_id,
        "horizon_s": request.horizon_s,
        "samples": request.samples,
        "seed": request.seed,
    }
    baseline_forecast = forecast(ForecastRequest(**shared, obstruction="present"))
    counterfactual_forecast = forecast(
        ForecastRequest(**shared, obstruction=request.obstruction)
    )
    baseline = baseline_forecast.risk
    counterfactual = counterfactual_forecast.risk
    return CounterfactualResponse(
        baseline=baseline,
        counterfactual=counterfactual,
        baseline_forecast=baseline_forecast,
        counterfactual_forecast=counterfactual_forecast,
        risk_delta=round(counterfactual.collision_probability - baseline.collision_probability, 3),
        changed_variable=f"delivery_van:{request.obstruction}",
        controlled_variables=[
            "actor intent",
            "initial velocity",
            "map",
            "weather",
            f"horizon_s:{request.horizon_s}",
            f"samples:{request.samples}",
            f"seed:{request.seed}",
        ],
    )


@app.post(
    "/api/evidence-counterfactual",
    response_model=EvidenceCounterfactualResponse,
)
def create_evidence_counterfactual(
    request: EvidenceCounterfactualRequest,
) -> EvidenceCounterfactualResponse:
    try:
        return evidence_counterfactual(request)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/metrics", response_model=list[CalibrationMetrics])
def metrics() -> list[CalibrationMetrics]:
    return calibration_metrics()
