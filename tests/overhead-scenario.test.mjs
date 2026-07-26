import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  actorState,
  actorTrackFor,
  CONFLICT_POINT,
  estimateConflict,
  forecastPoints,
  OVERHEAD_ACTORS,
  OVERHEAD_SOURCE,
} from "../app/lib/overhead-scenario.ts";

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
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions were not found");
}

test("ships a high-resolution, attributed real overhead photograph", async () => {
  assert.equal(OVERHEAD_SOURCE.image, "/scenarios/vancouver-overhead.jpg");
  assert.equal(OVERHEAD_SOURCE.license, "CC0 1.0");
  assert.match(OVERHEAD_SOURCE.sourceUrl, /^https:\/\/commons\.wikimedia\.org\//);
  const image = await readFile(new URL(`public${OVERHEAD_SOURCE.image}`, root));
  assert.ok(image.length > 500_000);
  assert.deepEqual(jpegDimensions(image), { width: 1920, height: 1280 });
});

test("fixture includes two vehicles and one pedestrian with honest state metadata", () => {
  assert.equal(OVERHEAD_ACTORS.length, 3);
  assert.equal(
    OVERHEAD_ACTORS.filter((actor) => actor.kind === "vehicle").length,
    2,
  );
  assert.equal(
    OVERHEAD_ACTORS.filter((actor) => actor.kind === "pedestrian").length,
    1,
  );
  for (const actor of OVERHEAD_ACTORS) {
    assert.ok(actor.velocityMs > 0);
    assert.ok(actor.confidence > 0 && actor.confidence < 1);
    assert.ok(actor.track.length >= 4);
  }
});

test("observed pair reaches the same conflict point with a 0.23 second gap", () => {
  const [actorA, actorB] = OVERHEAD_ACTORS;
  const aConflict = actorA.track.find(
    (point) => point.x === CONFLICT_POINT.x && point.y === CONFLICT_POINT.y,
  );
  const bConflict = actorB.track.find(
    (point) => point.x === CONFLICT_POINT.x && point.y === CONFLICT_POINT.y,
  );
  assert.ok(aConflict);
  assert.ok(bConflict);
  assert.ok(Math.abs(bConflict.t - aConflict.t - 0.23) < 1e-9);
  const estimate = estimateConflict("recorded", 2.45);
  assert.equal(estimate.likelihood, 42);
  assert.equal(estimate.uncertainty, 9);
  assert.deepEqual(estimate.range, [33, 51]);
  assert.ok(Math.abs(estimate.actorATtc - 1.8) < 1e-9);
  assert.ok(Math.abs(estimate.actorBTtc - 2.03) < 1e-9);
});

test("counterfactual timing separates arrivals and lowers the illustrative score", () => {
  const observed = estimateConflict("recorded", 2.45);
  const braking = estimateConflict("early-brake", 2.45);
  const protectedTurn = estimateConflict("protected-turn", 2.45);
  assert.ok(observed.arrivalGap < braking.arrivalGap);
  assert.ok(braking.arrivalGap < protectedTurn.arrivalGap);
  assert.ok(observed.likelihood > braking.likelihood);
  assert.ok(braking.likelihood > protectedTurn.likelihood);
  assert.ok(observed.uncertainty > braking.uncertainty);
  assert.ok(braking.uncertainty > protectedTurn.uncertainty);
  assert.notDeepEqual(
    actorTrackFor(OVERHEAD_ACTORS[1], "recorded"),
    actorTrackFor(OVERHEAD_ACTORS[1], "early-brake"),
  );
});

test("intervention state exposes velocity, heading, and future path", () => {
  const turn = OVERHEAD_ACTORS[1];
  const observed = actorState(turn, 2.45, "recorded");
  const braking = actorState(turn, 2.45, "early-brake");
  const held = actorState(turn, 2.45, "protected-turn");
  assert.equal(observed.velocityMs, 8.4);
  assert.equal(braking.velocityMs, 4.8);
  assert.equal(held.velocityMs, 0);
  assert.ok(Number.isFinite(observed.headingDeg));
  assert.equal(forecastPoints(turn, 2.45, "recorded").split(" ").length, 6);
});

