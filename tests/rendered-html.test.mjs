import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function relativeLuminance(hex) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function variables(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

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

test("server-renders the Crossing Lab review shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(
    html,
    /<title>Crossing Lab — Intersection Motion Review<\/title>/,
  );
  assert.match(html, /See who arrives first/);
  assert.match(html, /Watch/);
  assert.match(html, /Conflict/);
  assert.match(html, /Test/);
  assert.match(html, /Switch to light theme/);
  assert.match(html, /REAL PHOTOGRAPH/);
  assert.match(html, /AUTHORED TRACK FIXTURE/);
  assert.match(html, /Estimated velocity/);
  assert.doesNotMatch(
    html,
    /starter-preview|react-loading-skeleton|Your site is taking shape/,
  );
});

test("ships a three-step overhead UI, functional controls, provenance, and both themes", async () => {
  const [page, client, scenario, css, layout, pkg, notices] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/MotionLab.tsx", root), "utf8"),
    readFile(new URL("app/lib/overhead-scenario.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("THIRD_PARTY_NOTICES.md", root), "utf8"),
  ]);
  assert.match(page, /MotionLab/);
  assert.match(client, /01 · Watch/);
  assert.match(client, /02 · Conflict/);
  assert.match(client, /03 · Test/);
  assert.match(client, /Estimated velocity/);
  assert.match(client, /Heading/);
  assert.match(client, /Time to conflict/);
  assert.match(client, /Illustrative collision likelihood/);
  assert.match(client, /plausible fixture range/);
  assert.match(client, /not a calibrated estimate of a real crash/i);
  assert.match(client, /Early brake/);
  assert.match(client, /Protected turn/);
  assert.match(client, /Replay this timing/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /tabIndex=\{0\}/);
  assert.match(client, /type="range"/);
  assert.match(client, /type="checkbox"/);
  assert.match(client, /crossing-lab-theme/);
  assert.match(scenario, /vancouver-overhead\.jpg/);
  assert.match(scenario, /pedestrian/);
  assert.match(scenario, /estimateConflict/);
  assert.match(scenario, /forecastPoints/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(layout, /prefers-color-scheme: light/);
  assert.match(notices, /Ferdinand Stöhr/);
  assert.match(notices, /CC0/);
  assert.match(pkg, /"next"/);
  assert.doesNotMatch(pkg, /react-loading-skeleton/);
  assert.doesNotMatch(client, /<Canvas|low-poly|car-model/i);
});

test("secondary text and small yellow labels meet WCAG AA contrast in both themes", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const dark = variables(css.match(/:root\s*\{([\s\S]*?)\}/)[1]);
  const light = variables(
    css.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\}/)[1],
  );
  for (const palette of [dark, light]) {
    for (const foreground of [palette.muted, palette.quiet, palette.yellow]) {
      assert.ok(contrast(foreground, palette.page) >= 4.5);
      assert.ok(contrast(foreground, palette.surface) >= 4.5);
    }
  }
  assert.match(css, /\.media-badges span\s*\{[\s\S]*?rgba\(255, 255, 255, 0\.94\)/);
});
