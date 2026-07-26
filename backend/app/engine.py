from __future__ import annotations

import math
from collections.abc import Callable

from .schemas import (
    ActorForecast,
    CalibrationMetrics,
    EvidenceCounterfactualRequest,
    EvidenceCounterfactualResponse,
    EvidenceModeProbability,
    ForecastRequest,
    ForecastResponse,
    Point2D,
    RiskSummary,
    TrajectoryMode,
)


SCENARIO_ACTORS = {
    "ego-01": {"position": (-5.2, -12.0), "velocity": (0.0, 9.8), "kind": "ego"},
    "veh-27": {"position": (-14.0, -5.0), "velocity": (7.1, 0.0), "kind": "vehicle"},
    # At the shared forecast anchor, the pedestrian and ego are both about
    # 2.5 seconds from the northbound lane/crosswalk conflict point.
    "ped-04": {"position": (-1.8, 14.0), "velocity": (-1.4, 0.0), "kind": "pedestrian"},
    "cyc-09": {"position": (5.4, 18.0), "velocity": (0.0, -4.2), "kind": "cyclist"},
}

VISIBILITY_BY_OBSTRUCTION = {"present": 0.31, "shifted": 0.72, "removed": 0.96}

EVIDENCE_SCENARIOS = {
    "gaithersburg": {
        "baseline_risk": 0.38,
        "visibility": 0.94,
        "actors": {
            "veh-101": ("vehicle", 0.96),
            "veh-204": ("vehicle", 0.94),
            "veh-427": ("vehicle", 0.95),
        },
    },
    "market": {
        "baseline_risk": 0.46,
        "visibility": 0.78,
        "actors": {
            "bus-38": ("bus", 0.98),
            "bus-31": ("bus", 0.97),
            "cyc-12": ("cyclist", 0.90),
            "taxi-73": ("vehicle", 0.93),
        },
    },
    "cologne": {
        "baseline_risk": 0.57,
        "visibility": 0.52,
        "actors": {
            "veh-08": ("vehicle", 0.89),
            "veh-19": ("vehicle", 0.91),
            "veh-52": ("vehicle", 0.90),
        },
    },
}


def _seeded_random(seed: int) -> Callable[[], float]:
    """Return the same unsigned 32-bit LCG used by the browser fallback."""

    state = seed & 0xFFFFFFFF

    def draw() -> float:
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state / 0x100000000

    return draw


def _trajectory(
    position: tuple[float, float],
    velocity: tuple[float, float],
    horizon_s: float,
    lateral_curve: float,
    speed_scale: float,
    uncertainty: float,
) -> tuple[list[Point2D], list[float]]:
    points: list[Point2D] = []
    covariance: list[float] = []
    steps = max(2, round(horizon_s * 2))
    speed = math.hypot(*velocity)
    unit_x, unit_y = (velocity[0] / speed, velocity[1] / speed) if speed else (1.0, 0.0)
    perpendicular = (-unit_y, unit_x)
    for index in range(steps + 1):
        t = horizon_s * index / steps
        curve = lateral_curve * (t / horizon_s) ** 2
        x = position[0] + velocity[0] * speed_scale * t + perpendicular[0] * curve
        y = position[1] + velocity[1] * speed_scale * t + perpendicular[1] * curve
        points.append(Point2D(x=round(x, 3), y=round(y, 3), t=round(t, 3)))
        covariance.append(round(uncertainty * (0.15 + t * 0.21), 4))
    return points, covariance


def _actor_forecast(
    actor_id: str,
    request: ForecastRequest,
    random_draw: Callable[[], float],
) -> ActorForecast:
    actor = SCENARIO_ACTORS[actor_id]
    kind = actor["kind"]
    occlusion_boost = (
        (1 - VISIBILITY_BY_OBSTRUCTION[request.obstruction]) * 0.41
        if actor_id == "ped-04"
        else 0.0
    )
    interaction_boost = 0.12 if actor_id in {"ped-04", "ego-01"} else 0.03
    base_weights = {
        "pedestrian": [0.61, 0.27, 0.12],
        "ego": [0.64, 0.25, 0.11],
        "vehicle": [0.71, 0.21, 0.08],
        "cyclist": [0.68, 0.22, 0.10],
    }[kind]
    weights = base_weights
    if actor_id == "ped-04":
        weights = {
            "present": [0.61, 0.27, 0.12],
            "shifted": [0.45, 0.38, 0.17],
            "removed": [0.34, 0.44, 0.22],
        }[request.obstruction]
    # Allocate the requested seeded samples to the three hypotheses. Laplace
    # smoothing avoids zero-probability modes for very small valid sample counts.
    counts = [1, 1, 1]
    first_threshold = weights[0]
    second_threshold = weights[0] + weights[1]
    for _ in range(request.samples):
        draw = random_draw()
        counts[0 if draw < first_threshold else 1 if draw < second_threshold else 2] += 1
    probabilities = [count / sum(counts) for count in counts]
    labels = ["continue", "yield", "deviate"]
    curves = [0.0, 1.6 if kind != "pedestrian" else -1.8, -2.4 if kind != "pedestrian" else 2.1]
    speed_scales = [1.0, 0.47, 0.76]
    modes: list[TrajectoryMode] = []
    for label, probability, curve, speed_scale in zip(labels, probabilities, curves, speed_scales, strict=True):
        points, covariance = _trajectory(
            actor["position"],
            actor["velocity"],
            request.horizon_s,
            curve,
            speed_scale,
            0.52 + occlusion_boost + interaction_boost,
        )
        modes.append(
            TrajectoryMode(
                label=label,
                probability=round(probability, 6),
                points=points,
                covariance_trace=covariance,
            )
        )
    entropy = -sum(probability * math.log(probability) for probability in probabilities)
    ood_score = min(0.95, 0.08 + occlusion_boost + interaction_boost)
    return ActorForecast(
        actor_id=actor_id,
        modes=modes,
        entropy=round(entropy, 4),
        ood_score=round(ood_score, 4),
    )


def _risk_from_forecasts(
    forecasts: list[ActorForecast],
    obstruction: str,
) -> RiskSummary:
    pedestrian = next(item for item in forecasts if item.actor_id == "ped-04")
    crossing_probability = pedestrian.modes[0].probability
    visibility = VISIBILITY_BY_OBSTRUCTION[obstruction]
    # A transparent synthetic conflict model: crossing intent and lost
    # visibility increase the log-odds of a collision in this fixed scene.
    log_odds = -3.0 + 4.3 * crossing_probability + 2.25 * (1 - visibility)
    collision_probability = 1 / (1 + math.exp(-log_odds))
    expected_ttc = max(1.2, min(8.0, 8.0 - 8.0 * collision_probability))
    severity = "watch" if collision_probability >= 0.6 else "moderate" if collision_probability >= 0.3 else "low"
    return RiskSummary(
        collision_probability=round(collision_probability, 3),
        expected_ttc_s=round(expected_ttc, 2),
        visibility=visibility,
        severity=severity,
    )


def forecast(request: ForecastRequest) -> ForecastResponse:
    """Deterministic graph/diffusion-inspired multimodal surrogate.

    The graph stage is represented by actor-specific interaction boosts; the diffusion
    stage produces seeded mode logits and widening covariance. This is deliberately
    lightweight and auditable, not a learned production driving model.
    """

    random_draw = _seeded_random(request.seed)
    forecasts = [
        _actor_forecast(actor_id, request, random_draw)
        for actor_id in SCENARIO_ACTORS
    ]
    return ForecastResponse(
        scenario_id=request.scenario_id,
        model="graph-diffusion-surrogate-v0.4",
        deterministic_seed=request.seed,
        sample_count=request.samples,
        latency_ms=36.0,
        forecasts=forecasts,
        risk=_risk_from_forecasts(forecasts, request.obstruction),
    )


def calibration_metrics() -> list[CalibrationMetrics]:
    return [
        CalibrationMetrics(model="graph-diffusion-surrogate", min_ade_m=0.82, miss_rate=0.062, expected_calibration_error=0.041, brier_score=0.118, p95_latency_ms=36, ood_auroc=0.84, provenance="synthetic_portfolio_fixture"),
        CalibrationMetrics(model="scene-transformer-surrogate", min_ade_m=0.94, miss_rate=0.085, expected_calibration_error=0.068, brier_score=0.146, p95_latency_ms=24, ood_auroc=0.79, provenance="synthetic_portfolio_fixture"),
        CalibrationMetrics(model="constant-velocity", min_ade_m=1.73, miss_rate=0.181, expected_calibration_error=0.142, brier_score=0.231, p95_latency_ms=2, ood_auroc=0.51, provenance="synthetic_portfolio_fixture"),
    ]


def evidence_counterfactual(
    request: EvidenceCounterfactualRequest,
) -> EvidenceCounterfactualResponse:
    """Rerun the fixture for the selected real clip and reviewed actor."""

    scenario = EVIDENCE_SCENARIOS[request.scenario_id]
    actor_profile = scenario["actors"].get(request.actor_id)
    if actor_profile is None:
        raise ValueError(
            f"Actor {request.actor_id!r} is not reviewed in scenario {request.scenario_id!r}"
        )
    actor_kind, confidence = actor_profile
    kind_adjustment = 0.1 if actor_kind == "cyclist" else 0.05 if actor_kind == "bus" else 0
    review_uncertainty = (1 - confidence) * 0.22
    baseline_risk = min(
        0.96,
        max(0.03, scenario["baseline_risk"] + kind_adjustment + review_uncertainty),
    )

    base_weights = {
        "vehicle": [0.68, 0.22, 0.10],
        "bus": [0.61, 0.30, 0.09],
        "cyclist": [0.55, 0.30, 0.15],
    }[actor_kind]
    shift = {
        "present": [0.0, 0.0, 0.0],
        "shifted": [-0.10, 0.07, 0.03],
        "removed": [-0.18, 0.12, 0.06],
    }[request.intervention]
    weights = [value + shift[index] for index, value in enumerate(base_weights)]
    random_draw = _seeded_random(request.seed)
    counts = [1, 1, 1]
    for _ in range(request.samples):
        draw = random_draw()
        counts[0 if draw < weights[0] else 1 if draw < weights[0] + weights[1] else 2] += 1
    labels = ["continue", "yield", "deviate"]
    mode_probabilities = [
        EvidenceModeProbability(
            label=label,
            probability=round(count / sum(counts), 6),
        )
        for label, count in zip(labels, counts, strict=True)
    ]

    sensitivity = 1.0 if actor_kind == "cyclist" else 0.85 if actor_kind == "bus" else 0.75
    reduction = (
        0.24 * sensitivity
        if request.intervention == "shifted"
        else 0.52 * sensitivity
        if request.intervention == "removed"
        else 0
    )
    counterfactual_risk = max(0.03, baseline_risk * (1 - reduction))
    baseline_visibility = scenario["visibility"]
    counterfactual_visibility = (
        baseline_visibility + (1 - baseline_visibility) * 0.55
        if request.intervention == "shifted"
        else 0.99
        if request.intervention == "removed"
        else baseline_visibility
    )
    return EvidenceCounterfactualResponse(
        scenario_id=request.scenario_id,
        actor_id=request.actor_id,
        actor_kind=actor_kind,
        intervention=request.intervention,
        deterministic_seed=request.seed,
        sample_count=request.samples,
        baseline_risk=round(baseline_risk, 3),
        counterfactual_risk=round(counterfactual_risk, 3),
        baseline_visibility=baseline_visibility,
        counterfactual_visibility=round(counterfactual_visibility, 3),
        mode_probabilities=mode_probabilities,
        risk_delta=round(counterfactual_risk - baseline_risk, 3),
        changed_variable=(
            f"{request.scenario_id}:{request.actor_id}:"
            f"visibility_context:{request.intervention}"
        ),
        controlled_variables=[
            f"scenario:{request.scenario_id}",
            f"actor:{request.actor_id}",
            "reviewed track",
            "source footage",
            f"horizon_s:{request.horizon_s:g}",
            f"samples:{request.samples}",
            f"seed:{request.seed}",
        ],
    )
