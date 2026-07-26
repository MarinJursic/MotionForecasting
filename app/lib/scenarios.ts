export type TrackKeyframe = {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ScenarioActor = {
  id: string;
  label: string;
  kind: "vehicle" | "bus" | "cyclist";
  color: "cyan" | "amber" | "violet" | "lime";
  confidence: number;
  keyframes: TrackKeyframe[];
};

export type RealScenario = {
  id: string;
  code: string;
  title: string;
  location: string;
  context: string;
  date: string;
  duration: number;
  defaultTime: number;
  video: string;
  poster: string;
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  baselineRisk: number;
  visibility: number;
  actors: ScenarioActor[];
};

export type InterpolatedActor = ScenarioActor & TrackKeyframe;

const gaithersburgActors: ScenarioActor[] = [
  {
    id: "veh-101",
    label: "Eastbound sedan",
    kind: "vehicle",
    color: "cyan",
    confidence: 0.96,
    keyframes: [
      { t: 0.1, x: 5, y: 25.5, w: 8.2, h: 6.4 },
      { t: 1.2, x: 27, y: 26.2, w: 10.5, h: 7.2 },
      { t: 2.2, x: 56, y: 25.4, w: 13.2, h: 8.5 },
    ],
  },
  {
    id: "veh-204",
    label: "Eastbound crossover",
    kind: "vehicle",
    color: "amber",
    confidence: 0.94,
    keyframes: [
      { t: 2.6, x: 4, y: 25.3, w: 8.4, h: 6.4 },
      { t: 3.6, x: 30, y: 25.8, w: 11.6, h: 7.7 },
      { t: 4.7, x: 69, y: 24.7, w: 16.5, h: 9.7 },
    ],
  },
  {
    id: "veh-427",
    label: "Eastbound hatch",
    kind: "vehicle",
    color: "lime",
    confidence: 0.95,
    keyframes: [
      { t: 14.1, x: 4, y: 25.7, w: 8.2, h: 6.4 },
      { t: 15.4, x: 39, y: 25.7, w: 12.5, h: 8.3 },
      { t: 17.2, x: 83, y: 23.8, w: 18, h: 10.5 },
    ],
  },
];

const marketActors: ScenarioActor[] = [
  {
    id: "bus-38",
    label: "Muni route 38",
    kind: "bus",
    color: "cyan",
    confidence: 0.98,
    keyframes: [
      { t: 0, x: 4.5, y: 14.5, w: 17, h: 28 },
      { t: 2.3, x: 3, y: 13.5, w: 20, h: 31 },
      { t: 4.4, x: -5, y: 10.8, w: 29, h: 38 },
    ],
  },
  {
    id: "bus-31",
    label: "Muni route 31",
    kind: "bus",
    color: "amber",
    confidence: 0.97,
    keyframes: [
      { t: 3.1, x: 63, y: 10.5, w: 21, h: 34 },
      { t: 5.1, x: 56, y: 8.6, w: 28, h: 40 },
      { t: 7, x: 48, y: 5, w: 40, h: 49 },
    ],
  },
  {
    id: "cyc-12",
    label: "Northbound cyclist",
    kind: "cyclist",
    color: "lime",
    confidence: 0.9,
    keyframes: [
      { t: 8.4, x: 46.8, y: 31.5, w: 3.5, h: 9 },
      { t: 9.9, x: 48.5, y: 28.5, w: 4.1, h: 10.5 },
      { t: 11.4, x: 50, y: 25, w: 4.7, h: 12 },
    ],
  },
  {
    id: "taxi-73",
    label: "Market Street taxi",
    kind: "vehicle",
    color: "violet",
    confidence: 0.93,
    keyframes: [
      { t: 9.1, x: 51, y: 29.5, w: 7, h: 10 },
      { t: 10.8, x: 56, y: 28, w: 8.5, h: 12 },
      { t: 12.7, x: 63, y: 25, w: 10.5, h: 14 },
    ],
  },
];

const cologneActors: ScenarioActor[] = [
  {
    id: "veh-08",
    label: "Oncoming vehicle",
    kind: "vehicle",
    color: "cyan",
    confidence: 0.89,
    keyframes: [
      { t: 1.4, x: 44, y: 27, w: 4.5, h: 3.8 },
      { t: 3.4, x: 52, y: 26.5, w: 7, h: 5.2 },
      { t: 5.5, x: 64, y: 24, w: 12, h: 7.2 },
    ],
  },
  {
    id: "veh-19",
    label: "Crossing hatchback",
    kind: "vehicle",
    color: "amber",
    confidence: 0.91,
    keyframes: [
      { t: 3.6, x: 77, y: 22.5, w: 14, h: 7 },
      { t: 4.8, x: 57, y: 24, w: 16, h: 8.5 },
      { t: 6.1, x: 28, y: 25.5, w: 18, h: 9.5 },
    ],
  },
  {
    id: "veh-52",
    label: "Signal approach",
    kind: "vehicle",
    color: "violet",
    confidence: 0.9,
    keyframes: [
      { t: 10, x: 55, y: 27, w: 7, h: 5 },
      { t: 12.2, x: 56, y: 26, w: 8.5, h: 6 },
      { t: 14.3, x: 57, y: 25, w: 10, h: 7 },
    ],
  },
];

export const REAL_SCENARIOS: RealScenario[] = [
  {
    id: "gaithersburg",
    code: "MD–355 / MD–124",
    title: "Four-way signal phase",
    location: "Gaithersburg, Maryland",
    context: "Fixed elevated intersection · daylight · dense cross traffic",
    date: "30 Jul 2022",
    duration: 18,
    defaultTime: 3.6,
    video: "/scenarios/gaithersburg-intersection.webm",
    poster: "/scenarios/gaithersburg-intersection-poster.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:MD-355_and_MD-124_Gaithersburg_MD_2022-07-30_11-07-03_1.webm",
    creator: "G. Edward Johnson",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    baselineRisk: 0.38,
    visibility: 0.94,
    actors: gaithersburgActors,
  },
  {
    id: "market",
    code: "SF–MARKET–VIDEO",
    title: "Dense transit corridor",
    location: "Market Street, San Francisco",
    context: "Telephoto street record · transit · cyclist interaction",
    date: "28 May 2011",
    duration: 18,
    defaultTime: 9.8,
    video: "/scenarios/market-street.webm",
    poster: "/scenarios/market-street-poster.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Street_traffic.webm",
    creator: "Editor",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    baselineRisk: 0.46,
    visibility: 0.78,
    actors: marketActors,
  },
  {
    id: "cologne",
    code: "CGN–NIGHT–001",
    title: "Low-light signal approach",
    location: "Cologne, Germany",
    context: "Roadside camera · night · cyclist and vehicle interaction",
    date: "03 Jan 2024",
    duration: 15,
    defaultTime: 10.6,
    video: "/scenarios/cologne-night.webm",
    poster: "/scenarios/cologne-night-poster.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cars_Passing_by_at_Night.webm",
    creator: "Maximilian Schönherr",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    baselineRisk: 0.57,
    visibility: 0.52,
    actors: cologneActors,
  },
];

export function interpolateActor(actor: ScenarioActor, time: number): InterpolatedActor | null {
  const frames = actor.keyframes;
  if (time < frames[0].t || time > frames.at(-1)!.t) return null;
  const upperIndex = frames.findIndex((frame) => frame.t >= time);
  if (upperIndex <= 0) return { ...actor, ...frames[0] };
  const before = frames[upperIndex - 1];
  const after = frames[upperIndex];
  const progress = (time - before.t) / Math.max(0.001, after.t - before.t);
  const mix = (from: number, to: number) => from + (to - from) * progress;
  return {
    ...actor,
    t: time,
    x: mix(before.x, after.x),
    y: mix(before.y, after.y),
    w: mix(before.w, after.w),
    h: mix(before.h, after.h),
  };
}

export function observedPath(actor: ScenarioActor) {
  return actor.keyframes.map((frame) => `${frame.x + frame.w / 2},${frame.y + frame.h}`).join(" ");
}

export function forecastPaths(actor: ScenarioActor, time: number) {
  const current = interpolateActor(actor, time);
  if (!current) return [];
  const frames = actor.keyframes;
  const latestIndex = Math.max(1, frames.findIndex((frame) => frame.t >= time));
  const before = frames[latestIndex - 1];
  const after = frames[Math.min(frames.length - 1, latestIndex)];
  const dt = Math.max(0.2, after.t - before.t);
  const vx = (after.x - before.x) / dt;
  const vy = (after.y - before.y) / dt;
  const originX = current.x + current.w / 2;
  const originY = current.y + current.h;
  return [
    { label: "continue", probability: 0.62, curve: 0 },
    { label: "yield", probability: 0.25, curve: -1.8 },
    { label: "deviate", probability: 0.13, curve: 2.2 },
  ].map((mode) => ({
    ...mode,
    points: Array.from({ length: 8 }, (_, index) => {
      const horizon = index * 0.34;
      return {
        x: originX + vx * horizon * (mode.label === "yield" ? 0.48 : 1),
        y: originY + vy * horizon + mode.curve * horizon * horizon * 0.18,
      };
    }),
  }));
}

export function formatScenarioTime(value: number) {
  const seconds = Math.max(0, value);
  return `00:${seconds.toFixed(1).padStart(4, "0")}`;
}
