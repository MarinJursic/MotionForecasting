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
  assert.match(html, /<title>Vector Field — Real-World Motion Evidence Lab<\/title>/);
  assert.match(html, /Motion evidence lab/);
  assert.match(html, /Four-way signal phase/);
  assert.match(html, /Gaithersburg, Maryland/);
  assert.match(html, /Run counterfactual/);
  assert.match(html, /Switch to light theme/);
  assert.match(html, /Footage first/);
  assert.match(html, /no synthetic vehicles/);
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
  assert.match(client, /Reviewed detections/);
  assert.match(client, /Observed trails/);
  assert.match(client, /Forecast branches/);
  assert.match(client, /Conflict occupancy/);
  assert.match(client, /Visibility field/);
  assert.match(client, /fetchEvidenceCounterfactual/);
  assert.match(client, /scenario\.id,\s*selectedTrack\.id,\s*draftObstruction/);
  assert.match(client, /requestVideoFrameCallback/);
  assert.match(client, /video\.currentTime/);
  assert.match(client, /reviewed demonstration annotations/i);
  assert.match(client, /Metrics are synthetic test evidence/);
  assert.match(scenarios, /gaithersburg-intersection\.webm/);
  assert.match(scenarios, /market-street\.webm/);
  assert.match(scenarios, /cologne-night\.webm/);
  assert.match(scenarios, /interpolateActor/);
  assert.match(scenarios, /forecastPaths/);
  assert.match(client, /vector-field-theme/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /\.video-bay\s*\{[\s\S]*?order:\s*0;/);
  assert.match(layout, /prefers-color-scheme: light/);
  assert.match(notices, /G\. Edward Johnson/);
  assert.match(notices, /Maximilian Schönherr/);
  assert.match(pkg, /"next"/);
  assert.doesNotMatch(pkg, /react-loading-skeleton/);
  assert.doesNotMatch(client, /SceneCanvas|<Canvas|low-poly/i);
});
