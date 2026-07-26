import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalEvidenceCounterfactual } from "../app/lib/motion-domain.ts";
import {
  forecastPaths,
  formatScenarioTime,
  interpolateActor,
  REAL_SCENARIOS,
} from "../app/lib/scenarios.ts";

const root = new URL("../", import.meta.url);

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions were not found");
}

test("ships three licensed local real-world evidence clips and HD posters", async () => {
  assert.equal(REAL_SCENARIOS.length, 3);
  for (const scenario of REAL_SCENARIOS) {
    assert.match(scenario.video, /^\/scenarios\/.+\.webm$/);
    assert.match(scenario.poster, /^\/scenarios\/.+-poster\.jpg$/);
    assert.match(scenario.sourceUrl, /^https:\/\/commons\.wikimedia\.org\//);
    assert.match(scenario.license, /^CC BY/);
    const video = await readFile(new URL(`public${scenario.video}`, root));
    assert.ok(video.length > 200_000);
    assert.deepEqual([...video.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], "WebM begins with an EBML header");
    const poster = await readFile(new URL(`public${scenario.poster}`, root));
    assert.deepEqual(jpegDimensions(poster), { width: 1280, height: 720 });
  }
  assert.ok(!REAL_SCENARIOS[0].actors.some((actor) => actor.id === "veh-315"));
  assert.ok(!REAL_SCENARIOS[2].actors.some((actor) => actor.id === "cyc-44"));
  for (const scenario of REAL_SCENARIOS) {
    for (const actor of scenario.actors) {
      const evidence = createLocalEvidenceCounterfactual(
        scenario.id,
        actor.id,
        "present",
      );
      assert.equal(evidence.scenario_id, scenario.id);
      assert.equal(evidence.actor_id, actor.id);
    }
  }
});

test("track interpolation is frame-bounded and forecast branches share an origin", () => {
  const actor = REAL_SCENARIOS[0].actors[1];
  assert.equal(interpolateActor(actor, actor.keyframes[0].t - 0.01), null);
  assert.equal(interpolateActor(actor, actor.keyframes.at(-1).t + 0.01), null);
  const time = actor.keyframes[1].t;
  const current = interpolateActor(actor, time);
  assert.ok(current);
  const paths = forecastPaths(actor, time);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map((path) => path.points[0]), Array(3).fill(paths[0].points[0]));
  assert.ok(paths.every((path) => path.points.length === 8));
  assert.equal(formatScenarioTime(9.8), "00:09.8");
});
