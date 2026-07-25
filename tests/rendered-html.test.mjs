import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the motion forecasting laboratory shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Vector Field/);
  assert.match(html, /AUTONOMOUS MOTION LAB/);
  assert.match(html, /Occluded crosswalk emergence/);
  assert.match(html, /RUN COUNTERFACTUAL/);
  assert.match(html, /Switch to light theme/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("ships scenario layers, time controls, evidence metrics, and both themes", async () => {
  const [page, client, scene, css, layout, pkg] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/MotionLab.tsx", root), "utf8"),
    readFile(new URL("app/components/SceneCanvas.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(page, /MotionLab/);
  assert.match(client, /Probability tubes/);
  assert.match(client, /Occupancy \+ collision/);
  assert.match(client, /RERUN 128 SAMPLES/);
  assert.match(client, /fetchCounterfactual/);
  assert.match(client, /counterfactual_forecast/);
  assert.match(client, /expected_calibration_error|Graph diffusion|ECE/);
  assert.match(scene, /OrbitControls/);
  assert.match(scene, /TubeGeometry/);
  assert.match(scene, /PointsMaterial/);
  assert.match(scene, /detectionBoxes/);
  assert.match(scene, /ped-04/);
  assert.match(scene, /replayActorPositions/);
  assert.match(scene, /background:\s*0xdce8e2/);
  assert.match(scene, /toneMappingExposure = lightTheme/);
  assert.match(client, /vector-field-theme/);
  assert.match(client, /aria-pressed=\{theme === "light"\}/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(layout, /prefers-color-scheme: light/);
  assert.match(pkg, /"three"/);
  assert.doesNotMatch(pkg, /react-loading-skeleton/);
});
