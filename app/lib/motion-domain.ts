export type ObstructionMode = "present" | "shifted" | "removed";

export type Point2D = { x: number; y: number; t: number };
export type TrajectoryMode = {
  label: string;
  probability: number;
  points: Point2D[];
  covariance_trace: number[];
};
export type ActorForecast = {
  actor_id: string;
  modes: TrajectoryMode[];
  entropy: number;
  ood_score: number;
};
export type RiskSummary = {
  collision_probability: number;
  expected_ttc_s: number;
  visibility: number;
  severity: "low" | "moderate" | "watch";
};
export type ForecastResponse = {
  scenario_id: string;
  model: string;
  deterministic_seed: number;
  sample_count: number;
  latency_ms: number;
  forecasts: ActorForecast[];
  risk: RiskSummary;
};
export type CounterfactualResponse = {
  baseline: RiskSummary;
  counterfactual: RiskSummary;
  baseline_forecast: ForecastResponse;
  counterfactual_forecast: ForecastResponse;
  risk_delta: number;
  changed_variable: string;
  controlled_variables: string[];
};
export type CalibrationMetric = {
  model: string;
  min_ade_m: number;
  miss_rate: number;
  expected_calibration_error: number;
  brier_score: number;
  p95_latency_ms: number;
  ood_auroc: number;
  provenance: "synthetic_portfolio_fixture";
};

export type EvidenceModeProbability = {
  label: "continue" | "yield" | "deviate";
  probability: number;
};

export type EvidenceCounterfactualResponse = {
  scenario_id: string;
  actor_id: string;
  actor_kind: "vehicle" | "bus" | "cyclist";
  intervention: ObstructionMode;
  deterministic_seed: number;
  sample_count: number;
  baseline_risk: number;
  counterfactual_risk: number;
  baseline_visibility: number;
  counterfactual_visibility: number;
  mode_probabilities: EvidenceModeProbability[];
  risk_delta: number;
  changed_variable: string;
  controlled_variables: string[];
};

type EvidenceProfile = {
  baselineRisk: number;
  visibility: number;
  actors: Record<string, {
    kind: "vehicle" | "bus" | "cyclist";
    confidence: number;
  }>;
};

const EVIDENCE_PROFILES: Record<string, EvidenceProfile> = {
  gaithersburg: {
    baselineRisk: 0.38,
    visibility: 0.94,
    actors: {
      "veh-101": { kind: "vehicle", confidence: 0.96 },
      "veh-204": { kind: "vehicle", confidence: 0.94 },
      "veh-427": { kind: "vehicle", confidence: 0.95 },
    },
  },
  market: {
    baselineRisk: 0.46,
    visibility: 0.78,
    actors: {
      "bus-38": { kind: "bus", confidence: 0.98 },
      "bus-31": { kind: "bus", confidence: 0.97 },
      "cyc-12": { kind: "cyclist", confidence: 0.9 },
      "taxi-73": { kind: "vehicle", confidence: 0.93 },
    },
  },
  cologne: {
    baselineRisk: 0.57,
    visibility: 0.52,
    actors: {
      "veh-08": { kind: "vehicle", confidence: 0.89 },
      "veh-19": { kind: "vehicle", confidence: 0.91 },
      "veh-52": { kind: "vehicle", confidence: 0.9 },
    },
  },
};

export const ACTOR_ORDER = ["ego-01", "veh-27", "ped-04", "cyc-09"] as const;
export const FORECAST_ANCHOR_S = 6.2;

const actors = {
  "ego-01": { position: [-5.2, -12], velocity: [0, 9.8], kind: "ego" },
  "veh-27": { position: [-14, -5], velocity: [7.1, 0], kind: "vehicle" },
  // The pedestrian and ego reach (-5.2, 14) about 2.5 s after the
  // shared forecast anchor. This keeps the displayed conflict physically
  // legible instead of merely drawing two trajectories that cross in space.
  "ped-04": { position: [-1.8, 14], velocity: [-1.4, 0], kind: "pedestrian" },
  "cyc-09": { position: [5.4, 18], velocity: [0, -4.2], kind: "cyclist" },
} as const;

const visibilityByObstruction: Record<ObstructionMode, number> = {
  present: 0.31,
  shifted: 0.72,
  removed: 0.96,
};

export function replayActorPositions(time: number): Record<(typeof ACTOR_ORDER)[number], readonly [number, number]> {
  // The timeline shows 4.2 s of observed approach before T₀, followed by the
  // highest-probability "continue" rollout. The full prediction fan stays
  // anchored at T₀ so viewers can compare the realized path with alternatives.
  const replayDelta = Math.max(-4.2, Math.min(5.8, time - FORECAST_ANCHOR_S));
  return Object.fromEntries(
    ACTOR_ORDER.map((actorId) => {
      const actor = actors[actorId];
      return [
        actorId,
        [
          actor.position[0] + replayDelta * actor.velocity[0],
          actor.position[1] + replayDelta * actor.velocity[1],
        ] as const,
      ];
    }),
  ) as Record<(typeof ACTOR_ORDER)[number], readonly [number, number]>;
}

const fixtureMetrics: CalibrationMetric[] = [
  { model: "graph-diffusion-surrogate", min_ade_m: 0.82, miss_rate: 0.062, expected_calibration_error: 0.041, brier_score: 0.118, p95_latency_ms: 36, ood_auroc: 0.84, provenance: "synthetic_portfolio_fixture" },
  { model: "scene-transformer-surrogate", min_ade_m: 0.94, miss_rate: 0.085, expected_calibration_error: 0.068, brier_score: 0.146, p95_latency_ms: 24, ood_auroc: 0.79, provenance: "synthetic_portfolio_fixture" },
  { model: "constant-velocity", min_ade_m: 1.73, miss_rate: 0.181, expected_calibration_error: 0.142, brier_score: 0.231, p95_latency_ms: 2, ood_auroc: 0.51, provenance: "synthetic_portfolio_fixture" },
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function trajectory(
  position: readonly [number, number],
  velocity: readonly [number, number],
  horizon: number,
  lateralCurve: number,
  speedScale: number,
  uncertainty: number,
) {
  const speed = Math.hypot(...velocity);
  const unit = speed ? [velocity[0] / speed, velocity[1] / speed] : [1, 0];
  const perpendicular = [-unit[1], unit[0]];
  const steps = Math.max(2, Math.round(horizon * 2));
  const points: Point2D[] = [];
  const covariance_trace: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = (horizon * index) / steps;
    const curve = lateralCurve * (t / horizon) ** 2;
    points.push({
      x: Number((position[0] + velocity[0] * speedScale * t + perpendicular[0] * curve).toFixed(3)),
      y: Number((position[1] + velocity[1] * speedScale * t + perpendicular[1] * curve).toFixed(3)),
      t: Number(t.toFixed(3)),
    });
    covariance_trace.push(Number((uncertainty * (0.15 + t * 0.21)).toFixed(4)));
  }
  return { points, covariance_trace };
}

function localActorForecast(
  actorId: (typeof ACTOR_ORDER)[number],
  obstruction: ObstructionMode,
  samples: number,
  random: () => number,
): ActorForecast {
  const actor = actors[actorId];
  const defaultWeights = {
    ego: [0.64, 0.25, 0.11],
    vehicle: [0.71, 0.21, 0.08],
    pedestrian: [0.61, 0.27, 0.12],
    cyclist: [0.68, 0.22, 0.1],
  };
  const weights = actorId === "ped-04"
    ? { present: [0.61, 0.27, 0.12], shifted: [0.45, 0.38, 0.17], removed: [0.34, 0.44, 0.22] }[obstruction]
    : defaultWeights[actor.kind];
  const counts = [1, 1, 1];
  for (let index = 0; index < samples; index += 1) {
    const draw = random();
    counts[draw < weights[0] ? 0 : draw < weights[0] + weights[1] ? 1 : 2] += 1;
  }
  const probability = counts.map((count) => count / counts.reduce((sum, value) => sum + value, 0));
  const occlusionBoost = actorId === "ped-04"
    ? (1 - visibilityByObstruction[obstruction]) * 0.41
    : 0;
  const interactionBoost = actorId === "ped-04" || actorId === "ego-01" ? 0.12 : 0.03;
  const curves = [0, actor.kind === "pedestrian" ? -1.8 : 1.6, actor.kind === "pedestrian" ? 2.1 : -2.4];
  const speedScales = [1, 0.47, 0.76];
  const labels = ["continue", "yield", "deviate"];
  const modes = labels.map((label, index) => ({
    label,
    probability: probability[index],
    ...trajectory(actor.position, actor.velocity, 8, curves[index], speedScales[index], 0.52 + occlusionBoost + interactionBoost),
  }));
  return {
    actor_id: actorId,
    modes,
    entropy: -probability.reduce((sum, value) => sum + value * Math.log(value), 0),
    ood_score: Math.min(0.95, 0.08 + occlusionBoost + interactionBoost),
  };
}

export function createLocalForecast(
  obstruction: ObstructionMode,
  seed = 42,
  samples = 128,
): ForecastResponse {
  const random = seededRandom(seed);
  const forecasts = ACTOR_ORDER.map((id) => localActorForecast(id, obstruction, samples, random));
  const pedestrian = forecasts.find((item) => item.actor_id === "ped-04")!;
  const visibility = visibilityByObstruction[obstruction];
  const logOdds = -3 + 4.3 * pedestrian.modes[0].probability + 2.25 * (1 - visibility);
  const collisionProbability = 1 / (1 + Math.exp(-logOdds));
  return {
    scenario_id: "sf-market-0142",
    model: "local-deterministic-fallback-v0.4",
    deterministic_seed: seed,
    sample_count: samples,
    latency_ms: 0,
    forecasts,
    risk: {
      collision_probability: Number(collisionProbability.toFixed(3)),
      expected_ttc_s: Number(Math.max(1.2, Math.min(8, 8 - 8 * collisionProbability)).toFixed(2)),
      visibility,
      severity: collisionProbability >= 0.6 ? "watch" : collisionProbability >= 0.3 ? "moderate" : "low",
    },
  };
}

export function createLocalCounterfactual(
  obstruction: ObstructionMode,
  seed = 42,
  samples = 128,
): CounterfactualResponse {
  const baseline_forecast = createLocalForecast("present", seed, samples);
  const counterfactual_forecast = createLocalForecast(obstruction, seed, samples);
  return {
    baseline: baseline_forecast.risk,
    counterfactual: counterfactual_forecast.risk,
    baseline_forecast,
    counterfactual_forecast,
    risk_delta: Number((counterfactual_forecast.risk.collision_probability - baseline_forecast.risk.collision_probability).toFixed(3)),
    changed_variable: `delivery_van:${obstruction}`,
    controlled_variables: ["actor intent", "initial velocity", "map", "weather", "horizon_s:8", `samples:${samples}`, `seed:${seed}`],
  };
}

function evidenceProfile(scenarioId: string, actorId: string) {
  const scenario = EVIDENCE_PROFILES[scenarioId as keyof typeof EVIDENCE_PROFILES];
  const actor = scenario?.actors[actorId];
  if (!scenario || !actor) throw new Error(`Unknown evidence selection: ${scenarioId}/${actorId}`);
  const kindAdjustment = actor.kind === "cyclist" ? 0.1 : actor.kind === "bus" ? 0.05 : 0;
  const reviewUncertainty = (1 - actor.confidence) * 0.22;
  return {
    scenario: { id: scenarioId, visibility: scenario.visibility },
    actor: { id: actorId, kind: actor.kind, confidence: actor.confidence },
    baselineRisk: Math.min(0.96, Math.max(0.03, scenario.baselineRisk + kindAdjustment + reviewUncertainty)),
  };
}

function evidenceModeWeights(kind: "vehicle" | "bus" | "cyclist", intervention: ObstructionMode) {
  const base = kind === "cyclist" ? [0.55, 0.3, 0.15] : kind === "bus" ? [0.61, 0.3, 0.09] : [0.68, 0.22, 0.1];
  const shift = intervention === "shifted" ? [-0.1, 0.07, 0.03] : intervention === "removed" ? [-0.18, 0.12, 0.06] : [0, 0, 0];
  return base.map((value, index) => value + shift[index]);
}

export function createLocalEvidenceCounterfactual(
  scenarioId: string,
  actorId: string,
  intervention: ObstructionMode,
  seed = 42,
  samples = 128,
): EvidenceCounterfactualResponse {
  const { scenario, actor, baselineRisk } = evidenceProfile(scenarioId, actorId);
  const weights = evidenceModeWeights(actor.kind, intervention);
  const random = seededRandom(seed);
  const counts = [1, 1, 1];
  for (let index = 0; index < samples; index += 1) {
    const draw = random();
    counts[draw < weights[0] ? 0 : draw < weights[0] + weights[1] ? 1 : 2] += 1;
  }
  const countTotal = counts.reduce((sum, value) => sum + value, 0);
  const labels = ["continue", "yield", "deviate"] as const;
  const modeProbabilities = labels.map((label, index) => ({
    label,
    probability: Number((counts[index] / countTotal).toFixed(6)),
  }));
  const sensitivity = actor.kind === "cyclist" ? 1 : actor.kind === "bus" ? 0.85 : 0.75;
  const reduction = intervention === "shifted" ? 0.24 * sensitivity : intervention === "removed" ? 0.52 * sensitivity : 0;
  const counterfactualRisk = Math.max(0.03, baselineRisk * (1 - reduction));
  const counterfactualVisibility = intervention === "shifted"
    ? scenario.visibility + (1 - scenario.visibility) * 0.55
    : intervention === "removed" ? 0.99 : scenario.visibility;
  return {
    scenario_id: scenario.id,
    actor_id: actor.id,
    actor_kind: actor.kind,
    intervention,
    deterministic_seed: seed,
    sample_count: samples,
    baseline_risk: Number(baselineRisk.toFixed(3)),
    counterfactual_risk: Number(counterfactualRisk.toFixed(3)),
    baseline_visibility: scenario.visibility,
    counterfactual_visibility: Number(counterfactualVisibility.toFixed(3)),
    mode_probabilities: modeProbabilities,
    risk_delta: Number((counterfactualRisk - baselineRisk).toFixed(3)),
    changed_variable: `${scenario.id}:${actor.id}:visibility_context:${intervention}`,
    controlled_variables: [
      `scenario:${scenario.id}`,
      `actor:${actor.id}`,
      "reviewed track",
      "source footage",
      "horizon_s:3",
      `samples:${samples}`,
      `seed:${seed}`,
    ],
  };
}

export const localCalibrationMetrics = fixtureMetrics.map((metric) => ({ ...metric }));

export class MotionApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "MotionApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  apiUrl: string,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(`${apiUrl}${path}`, init);
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Preserve the status-based message for malformed error bodies.
    }
    throw new MotionApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export function fetchForecast(
  apiUrl: string,
  obstruction: ObstructionMode,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return requestJson<ForecastResponse>(
    apiUrl,
    "/api/forecast",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: "sf-market-0142", horizon_s: 8, samples: 128, seed: 42, obstruction }),
      signal,
    },
    fetcher,
  );
}

export function fetchCounterfactual(
  apiUrl: string,
  obstruction: ObstructionMode,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return requestJson<CounterfactualResponse>(
    apiUrl,
    "/api/counterfactual",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: "sf-market-0142", horizon_s: 8, samples: 128, seed: 42, obstruction }),
      signal,
    },
    fetcher,
  );
}

export function fetchEvidenceCounterfactual(
  apiUrl: string,
  scenarioId: string,
  actorId: string,
  intervention: ObstructionMode,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return requestJson<EvidenceCounterfactualResponse>(
    apiUrl,
    "/api/evidence-counterfactual",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario_id: scenarioId,
        actor_id: actorId,
        intervention,
        horizon_s: 3,
        samples: 128,
        seed: 42,
      }),
      signal,
    },
    fetcher,
  );
}

export function fetchMetrics(
  apiUrl: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  return requestJson<CalibrationMetric[]>(
    apiUrl,
    "/api/metrics",
    { method: "GET", signal },
    fetcher,
  );
}
