export type Intervention = "recorded" | "early-brake" | "protected-turn";

export type TrackPoint = {
  t: number;
  x: number;
  y: number;
};

export type OverheadActor = {
  id: string;
  label: string;
  kind: "vehicle" | "pedestrian";
  color: "coral" | "cyan" | "lime";
  confidence: number;
  velocityMs: number;
  track: TrackPoint[];
};

export type ConflictEstimate = {
  actorAArrival: number;
  actorBArrival: number;
  actorATtc: number;
  actorBTtc: number;
  arrivalGap: number;
  likelihood: number;
  uncertainty: number;
  range: [number, number];
  band: "elevated" | "attention" | "lower";
  summary: string;
};

export const OVERHEAD_SOURCE = {
  title: "Traffic at night",
  location: "Vancouver, Canada",
  date: "2017-01-07",
  image: "/scenarios/vancouver-overhead.jpg",
  sourceUrl:
    "https://commons.wikimedia.org/wiki/File:Traffic_at_night_(Unsplash).jpg",
  creator: "Ferdinand Stöhr",
  license: "CC0 1.0",
} as const;

export const CONFLICT_POINT = { x: 515, y: 345 } as const;
export const FIXTURE_DURATION_S = 8;

export const OVERHEAD_ACTORS: OverheadActor[] = [
  {
    id: "V-21",
    label: "Southeast through vehicle",
    kind: "vehicle",
    color: "coral",
    confidence: 0.96,
    velocityMs: 12.6,
    track: [
      { t: 0.4, x: 92, y: 77 },
      { t: 2.2, x: 292, y: 203 },
      { t: 4.25, x: CONFLICT_POINT.x, y: CONFLICT_POINT.y },
      { t: 6.2, x: 735, y: 482 },
      { t: 7.8, x: 914, y: 598 },
    ],
  },
  {
    id: "V-08",
    label: "Northbound turning vehicle",
    kind: "vehicle",
    color: "cyan",
    confidence: 0.93,
    velocityMs: 8.4,
    track: [
      { t: 0.45, x: 97, y: 558 },
      { t: 2.35, x: 300, y: 454 },
      { t: 4.48, x: CONFLICT_POINT.x, y: CONFLICT_POINT.y },
      { t: 6.25, x: 589, y: 174 },
      { t: 7.8, x: 625, y: 52 },
    ],
  },
  {
    id: "P-04",
    label: "Crosswalk pedestrian",
    kind: "pedestrian",
    color: "lime",
    confidence: 0.88,
    velocityMs: 1.4,
    track: [
      { t: 0.4, x: 790, y: 119 },
      { t: 2.8, x: 744, y: 150 },
      { t: 5.4, x: 690, y: 190 },
      { t: 7.8, x: 645, y: 223 },
    ],
  },
];

const ACTOR_B_ID = "V-08";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function interventionLabel(intervention: Intervention) {
  if (intervention === "early-brake") return "Early brake";
  if (intervention === "protected-turn") return "Protected turn";
  return "Observed flow";
}

export function actorTrackFor(
  actor: OverheadActor,
  intervention: Intervention,
): TrackPoint[] {
  if (actor.id !== ACTOR_B_ID || intervention === "recorded") return actor.track;
  if (intervention === "protected-turn") {
    return [
      { t: 0.45, x: 97, y: 558 },
      { t: 1.9, x: 245, y: 482 },
      { t: 5.8, x: 245, y: 482 },
      { t: 7.1, x: CONFLICT_POINT.x, y: CONFLICT_POINT.y },
      { t: 8.35, x: 589, y: 174 },
      { t: 9.55, x: 625, y: 52 },
    ];
  }
  const conflictArrival = intervention === "early-brake" ? 5.62 : 7.1;
  const delay = conflictArrival - 4.48;
  return actor.track.map((point) => {
    if (point.t < 4.48) {
      const approachScale = (point.t - 0.45) / (4.48 - 0.45);
      return {
        ...point,
        t: point.t + Math.max(0, approachScale) * delay,
      };
    }
    return { ...point, t: point.t + delay };
  });
}

export function interpolateTrack(track: TrackPoint[], time: number): TrackPoint {
  if (time <= track[0].t) return { ...track[0], t: time };
  if (time >= track.at(-1)!.t) return { ...track.at(-1)!, t: time };
  const nextIndex = track.findIndex((point) => point.t >= time);
  const previous = track[nextIndex - 1];
  const next = track[nextIndex];
  const progress = (time - previous.t) / (next.t - previous.t);
  return {
    t: time,
    x: previous.x + (next.x - previous.x) * progress,
    y: previous.y + (next.y - previous.y) * progress,
  };
}

export function actorState(
  actor: OverheadActor,
  time: number,
  intervention: Intervention,
) {
  const track = actorTrackFor(actor, intervention);
  const current = interpolateTrack(track, time);
  const ahead = interpolateTrack(track, Math.min(time + 0.35, track.at(-1)!.t));
  const dx = ahead.x - current.x;
  const dy = ahead.y - current.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const baseVelocity =
    actor.id === ACTOR_B_ID && intervention === "early-brake"
      ? 4.8
      : actor.id === ACTOR_B_ID && intervention === "protected-turn"
        ? time < 5.8
          ? 0
          : 3.2
        : actor.velocityMs;

  return {
    ...current,
    headingDeg: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
    direction: { x: dx / magnitude, y: dy / magnitude },
    velocityMs: baseVelocity,
  };
}

export function forecastPoints(
  actor: OverheadActor,
  time: number,
  intervention: Intervention,
) {
  const track = actorTrackFor(actor, intervention);
  return [0, 0.5, 1, 1.5, 2, 2.5]
    .map((offset) => interpolateTrack(track, time + offset))
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

export function observedPoints(actor: OverheadActor, intervention: Intervention) {
  return actorTrackFor(actor, intervention)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

export function estimateConflict(
  intervention: Intervention,
  time: number,
): ConflictEstimate {
  const actorAArrival = 4.25;
  const actorBArrival =
    intervention === "early-brake"
      ? 5.62
      : intervention === "protected-turn"
        ? 7.1
        : 4.48;
  const arrivalGap = Math.abs(actorBArrival - actorAArrival);
  const likelihood = clamp(Math.round(52 * Math.exp(-0.9 * arrivalGap)), 1, 99);
  const uncertainty =
    intervention === "recorded" ? 9 : intervention === "early-brake" ? 6 : 3;
  const range: [number, number] = [
    clamp(likelihood - uncertainty, 0, 100),
    clamp(likelihood + uncertainty, 0, 100),
  ];
  const band =
    likelihood >= 35 ? "elevated" : likelihood >= 12 ? "attention" : "lower";

  return {
    actorAArrival,
    actorBArrival,
    actorATtc: Math.max(0, actorAArrival - time),
    actorBTtc: Math.max(0, actorBArrival - time),
    arrivalGap,
    likelihood,
    uncertainty,
    range,
    band,
    summary:
      intervention === "recorded"
        ? "Both fixture paths reach the conflict point within the same half-second."
        : intervention === "early-brake"
          ? "Earlier deceleration separates the two fixture arrival windows."
          : "A protected phase holds the turn until the through path clears.",
  };
}
