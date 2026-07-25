from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ActorKind = Literal["vehicle", "pedestrian", "cyclist", "ego"]
ObstructionMode = Literal["present", "shifted", "removed"]
MapFeatureKind = Literal[
    "lane",
    "crosswalk",
    "road_boundary",
    "stop_line",
    "traffic_light",
    "occlusion",
]


class Point2D(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    t: float = Field(ge=0)


class Actor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: ActorKind
    position: tuple[float, float]
    velocity: tuple[float, float]
    extent: tuple[float, float]
    visible_fraction: float = Field(ge=0, le=1)


class MapFeature(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: MapFeatureKind
    points: list[tuple[float, float]] = Field(min_length=1)
    state: Literal["unknown", "red", "amber", "green"] = "unknown"


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    sample_hz: int = Field(gt=0)
    coordinate_frame: Literal["ENU"]
    actors: list[Actor]
    map_features: list[MapFeature]
    story_note: str


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = "sf-market-0142"
    horizon_s: float = Field(default=8.0, gt=0, le=12)
    samples: int = Field(default=128, ge=8, le=1024)
    seed: int = 42
    obstruction: ObstructionMode = "present"


class TrajectoryMode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str
    probability: float = Field(ge=0, le=1)
    points: list[Point2D]
    covariance_trace: list[float]


class ActorForecast(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actor_id: str
    modes: list[TrajectoryMode]
    entropy: float
    ood_score: float = Field(ge=0, le=1)


class RiskSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    collision_probability: float = Field(ge=0, le=1)
    expected_ttc_s: float
    visibility: float = Field(ge=0, le=1)
    severity: Literal["low", "moderate", "watch"]


class ForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str
    model: str
    deterministic_seed: int
    sample_count: int
    latency_ms: float
    forecasts: list[ActorForecast]
    risk: RiskSummary


class CounterfactualRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = "sf-market-0142"
    obstruction: ObstructionMode
    seed: int = 42
    horizon_s: float = Field(default=8.0, gt=0, le=12)
    samples: int = Field(default=128, ge=8, le=1024)


class CounterfactualResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseline: RiskSummary
    counterfactual: RiskSummary
    baseline_forecast: ForecastResponse
    counterfactual_forecast: ForecastResponse
    risk_delta: float
    changed_variable: str
    controlled_variables: list[str]


class CalibrationMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    min_ade_m: float
    miss_rate: float
    expected_calibration_error: float
    brier_score: float
    p95_latency_ms: float
    ood_auroc: float
    provenance: Literal["synthetic_portfolio_fixture"]
