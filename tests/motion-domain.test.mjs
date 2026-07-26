import assert from "node:assert/strict";
import test from "node:test";

import {
  MotionApiError,
  createLocalCounterfactual,
  createLocalEvidenceCounterfactual,
  createLocalForecast,
  fetchCounterfactual,
  fetchEvidenceCounterfactual,
  fetchForecast,
  fetchMetrics,
  FORECAST_ANCHOR_S,
  replayActorPositions,
} from "../app/lib/motion-domain.ts";

test("local forecast is deterministic, normalized, multimodal, and horizon-complete", () => {
  const first = createLocalForecast("present", 42, 128);
  const second = createLocalForecast("present", 42, 128);
  assert.deepEqual(first, second);
  assert.equal(first.forecasts.length, 4);
  assert.equal(first.sample_count, 128);
  for (const actor of first.forecasts) {
    assert.equal(actor.modes.length, 3);
    assert.ok(Math.abs(actor.modes.reduce((sum, mode) => sum + mode.probability, 0) - 1) < 1e-10);
    for (const mode of actor.modes) {
      assert.equal(mode.points.at(-1).t, 8);
      assert.equal(mode.points.length, mode.covariance_trace.length);
      assert.ok(mode.covariance_trace.at(-1) > mode.covariance_trace[0]);
    }
  }
  assert.deepEqual(
    first.forecasts.flatMap((actor) => actor.modes.map((mode) => Number(mode.probability.toFixed(6)))),
    [
      0.625954, 0.251908, 0.122137,
      0.664122, 0.236641, 0.099237,
      0.618321, 0.267176, 0.114504,
      0.679389, 0.251908, 0.068702,
    ],
    "seed 42 allocation matches the Python API contract",
  );
});

test("local obstruction intervention reruns probabilities and risk", () => {
  const present = createLocalCounterfactual("present");
  const shifted = createLocalCounterfactual("shifted");
  const removed = createLocalCounterfactual("removed");
  assert.ok(present.counterfactual.collision_probability > shifted.counterfactual.collision_probability);
  assert.ok(shifted.counterfactual.collision_probability > removed.counterfactual.collision_probability);
  assert.ok(present.counterfactual.visibility < shifted.counterfactual.visibility);
  assert.ok(shifted.counterfactual.visibility < removed.counterfactual.visibility);
  assert.notDeepEqual(
    present.counterfactual_forecast.forecasts.find((actor) => actor.actor_id === "ped-04").modes,
    removed.counterfactual_forecast.forecasts.find((actor) => actor.actor_id === "ped-04").modes,
  );
});

test("replay actors meet every future tube at the shared ENU forecast anchor", () => {
  const forecast = createLocalForecast("present");
  const anchored = replayActorPositions(FORECAST_ANCHOR_S);
  for (const actor of forecast.forecasts) {
    for (const mode of actor.modes) {
      assert.deepEqual(
        [mode.points[0].x, mode.points[0].y],
        [...anchored[actor.actor_id]],
      );
    }
  }

  const before = replayActorPositions(FORECAST_ANCHOR_S - 1);
  assert.equal(before["ego-01"][1], anchored["ego-01"][1] - 9.8);
  assert.equal(before["veh-27"][0], anchored["veh-27"][0] - 7.1);
  const egoArrival = (14 - anchored["ego-01"][1]) / 9.8;
  const pedestrianArrival = (
    anchored["ego-01"][0] - anchored["ped-04"][0]
  ) / -1.4;
  assert.ok(Math.abs(egoArrival - pedestrianArrival) < 0.25);
  const realized = replayActorPositions(FORECAST_ANCHOR_S + 3);
  assert.ok(Math.abs(realized["ego-01"][1] - (anchored["ego-01"][1] + 9.8 * 3)) < 1e-9);
  assert.ok(Math.abs(realized["ped-04"][0] - (anchored["ped-04"][0] - 1.4 * 3)) < 1e-9);
});

test("forecast client sends the complete typed intervention request", async () => {
  const expected = createLocalForecast("shifted");
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await fetchForecast("http://api.example", "shifted", undefined, fetcher);
  assert.deepEqual(result, expected);
  assert.equal(captured.url, "http://api.example/api/forecast");
  assert.deepEqual(JSON.parse(captured.init.body), {
    scenario_id: "sf-market-0142",
    horizon_s: 8,
    samples: 128,
    seed: 42,
    obstruction: "shifted",
  });
});

test("counterfactual and metrics clients consume response bodies", async () => {
  const counterfactual = createLocalCounterfactual("removed");
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    const body = url.endsWith("/api/metrics")
      ? [{ model: "test", min_ade_m: 1, miss_rate: 0.1, expected_calibration_error: 0.1, brier_score: 0.2, p95_latency_ms: 3, ood_auroc: 0.5, provenance: "synthetic_portfolio_fixture" }]
      : counterfactual;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const [counterfactualResult, metrics] = await Promise.all([
    fetchCounterfactual("http://api.example", "removed", undefined, fetcher),
    fetchMetrics("http://api.example", undefined, fetcher),
  ]);
  assert.equal(counterfactualResult.counterfactual_forecast.risk.visibility, 0.96);
  assert.equal(metrics[0].provenance, "synthetic_portfolio_fixture");
  assert.deepEqual(requests.sort(), [
    "http://api.example/api/counterfactual",
    "http://api.example/api/metrics",
  ]);
});

test("API client rejects non-success responses with status and detail", async () => {
  const fetcher = async () => new Response(
    JSON.stringify({ detail: "Scenario not found" }),
    { status: 404, headers: { "content-type": "application/json" } },
  );
  await assert.rejects(
    () => fetchForecast("http://api.example", "present", undefined, fetcher),
    (error) => error instanceof MotionApiError
      && error.status === 404
      && error.message === "Scenario not found",
  );
});

test("evidence counterfactual binds scenario, reviewed actor, and intervention", () => {
  const observed = createLocalEvidenceCounterfactual("market", "cyc-12", "present");
  const shifted = createLocalEvidenceCounterfactual("market", "cyc-12", "shifted");
  const removed = createLocalEvidenceCounterfactual("market", "cyc-12", "removed");
  assert.equal(observed.scenario_id, "market");
  assert.equal(observed.actor_id, "cyc-12");
  assert.equal(observed.actor_kind, "cyclist");
  assert.equal(observed.changed_variable, "market:cyc-12:visibility_context:present");
  assert.ok(observed.counterfactual_risk > shifted.counterfactual_risk);
  assert.ok(shifted.counterfactual_risk > removed.counterfactual_risk);
  assert.ok(observed.counterfactual_visibility < shifted.counterfactual_visibility);
  assert.ok(shifted.counterfactual_visibility < removed.counterfactual_visibility);
  assert.notDeepEqual(observed.mode_probabilities, removed.mode_probabilities);

  const bus = createLocalEvidenceCounterfactual("market", "bus-38", "present");
  assert.notEqual(bus.baseline_risk, observed.baseline_risk);
  assert.notDeepEqual(bus.mode_probabilities, observed.mode_probabilities);
});

test("evidence client sends the active scenario, actor, and intervention", async () => {
  const expected = createLocalEvidenceCounterfactual("cologne", "veh-52", "shifted");
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await fetchEvidenceCounterfactual(
    "http://api.example",
    "cologne",
    "veh-52",
    "shifted",
    undefined,
    fetcher,
  );
  assert.deepEqual(result, expected);
  assert.equal(captured.url, "http://api.example/api/evidence-counterfactual");
  assert.deepEqual(JSON.parse(captured.init.body), {
    scenario_id: "cologne",
    actor_id: "veh-52",
    intervention: "shifted",
    horizon_s: 3,
    samples: 128,
    seed: 42,
  });
});
