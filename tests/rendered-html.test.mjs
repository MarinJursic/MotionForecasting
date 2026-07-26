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
  assert.match(html, /<title>Vector Field — Real Footage Pair Review<\/title>/);
  assert.match(html, /Pair review/);
  assert.match(html, /Cyclist–taxi convergence/);
  assert.match(html, /Market Street, San Francisco/);
  assert.match(html, /Test visibility assumption/);
  assert.match(html, /Switch to light theme/);
  assert.match(html, /Watch the evidence/);
  assert.match(html, /Image-plane traces from the curated reviewed pair/);
  assert.doesNotMatch(html, /starter-preview|react-loading-skeleton|Your site is taking shape/);
});

test("ships footage-first scenarios, synchronized overlays, controls, and both themes", async () => {
  const [page, client, scenarios, css, layout, pkg, notices] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/MotionLab.tsx", root), "utf8"),
    readFile(new URL("app/lib/scenarios.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("THIRD_PARTY_NOTICES.md", root), "utf8"),
  ]);
  assert.match(page, /MotionLab/);
  assert.match(client, /Watch the evidence/);
  assert.match(client, /Read the relationship/);
  assert.match(client, /Evidence-derived image-plane relationship/);
  assert.match(client, /no road geometry or physical distance/);
  assert.match(client, /curated demonstration track/);
  assert.match(client, /Test visibility assumption/);
  assert.match(client, /fetchEvidenceCounterfactual/);
  assert.match(client, /scenario\.id,\s*selectedTrack\.id,\s*draftObstruction/);
  assert.match(client, /requestVideoFrameCallback/);
  assert.match(client, /video\.currentTime/);
  assert.match(client, /preload="metadata"/);
  assert.match(client, /type="video\/mp4"/);
  assert.match(client, /type="video\/webm"/);
  assert.match(client, /videoState/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /tabIndex=\{0\}/);
  assert.match(client, /reviewed demonstration tracks/i);
  assert.match(client, /research UI only/);
  assert.match(client, /querySelectorAll<HTMLElement>/);
  assert.match(scenarios, /gaithersburg-intersection\.webm/);
  assert.match(scenarios, /market-street\.webm/);
  assert.match(scenarios, /cologne-night\.webm/);
  assert.match(scenarios, /gaithersburg-intersection\.mp4/);
  assert.match(scenarios, /market-street\.mp4/);
  assert.match(scenarios, /cologne-night\.mp4/);
  assert.match(scenarios, /interpolateActor/);
  assert.match(scenarios, /forecastPaths/);
  assert.match(scenarios, /analyzeConflict/);
  assert.match(scenarios, /conflict:/);
  assert.match(client, /vector-field-theme/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 570px\)/);
  assert.match(css, /\.camera-card\s*\{[\s\S]*?order:\s*0;/);
  assert.match(layout, /prefers-color-scheme: light/);
  assert.match(notices, /G\. Edward Johnson/);
  assert.match(notices, /Maximilian Schönherr/);
  assert.match(pkg, /"next"/);
  assert.doesNotMatch(pkg, /react-loading-skeleton/);
  assert.doesNotMatch(client, /LAYER_LABELS|fetchMetrics|localCalibrationMetrics/);
  assert.doesNotMatch(client, /SceneCanvas|<Canvas|low-poly|car-model/i);
  assert.doesNotMatch(client, /review confidence|watch score|counterfactual_visibility \* 100|mode\.probability \* 100/i);
  assert.doesNotMatch(client, /top-down|bird.?s-eye|metric distance|map-axis|map-grid/i);
});
