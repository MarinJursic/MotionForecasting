"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalibrationMetric,
  createLocalEvidenceCounterfactual,
  fetchEvidenceCounterfactual,
  fetchMetrics,
  localCalibrationMetrics,
  ObstructionMode,
} from "../lib/motion-domain";
import {
  forecastPaths,
  formatScenarioTime,
  interpolateActor,
  observedPath,
  REAL_SCENARIOS,
} from "../lib/scenarios";

type Theme = "dark" | "light";
type LayerKey = "detections" | "tracks" | "forecast" | "occupancy" | "visibility";

const API_URL = process.env.NEXT_PUBLIC_MOTION_API_URL ?? "http://127.0.0.1:8000";
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SPEEDS = [0.5, 1, 1.5];

const LAYER_LABELS: Record<LayerKey, { label: string; detail: string }> = {
  detections: { label: "Reviewed detections", detail: "Frame-aligned boxes" },
  tracks: { label: "Observed trails", detail: "Annotated history" },
  forecast: { label: "Forecast branches", detail: "Continue · yield · deviate" },
  occupancy: { label: "Conflict occupancy", detail: "Selected interaction zone" },
  visibility: { label: "Visibility field", detail: "Scene-level evidence mask" },
};

function interventionLabel(mode: ObstructionMode) {
  if (mode === "shifted") return "Context shifted";
  if (mode === "removed") return "Context removed";
  return "Observed context";
}

export function MotionLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCallbackRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = REAL_SCENARIOS[scenarioIndex];
  const [time, setTime] = useState(scenario.defaultTime);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selectedActor, setSelectedActor] = useState("veh-204");
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    detections: true,
    tracks: true,
    forecast: true,
    occupancy: true,
    visibility: true,
  });
  const [metrics, setMetrics] = useState<CalibrationMetric[]>(localCalibrationMetrics);
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "local">("checking");
  const [counterfactualOpen, setCounterfactualOpen] = useState(false);
  const [counterfactualRunning, setCounterfactualRunning] = useState(false);
  const [obstruction, setObstruction] = useState<ObstructionMode>("present");
  const [draftObstruction, setDraftObstruction] = useState<ObstructionMode>("present");
  const [evidenceResult, setEvidenceResult] = useState(
    () => createLocalEvidenceCounterfactual(scenario.id, "veh-204", "present"),
  );
  const [notice, setNotice] = useState("Reviewed demonstration annotations · select any visible actor");

  useEffect(() => {
    const stored = window.localStorage.getItem("vector-field-theme");
    const preferred: Theme = stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.dataset.theme = preferred;
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMetrics(API_URL, controller.signal)
      .then((nextMetrics) => {
        setMetrics(nextMetrics);
        setApiStatus("connected");
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiStatus("local");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.src = `${PUBLIC_BASE_PATH}${scenario.video}`;
    video.poster = `${PUBLIC_BASE_PATH}${scenario.poster}`;
    video.load();
    video.currentTime = scenario.defaultTime;
    video.playbackRate = 1;
    void video.play().catch(() => setPlaying(false));
  }, [scenario]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof video.requestVideoFrameCallback !== "function") return;
    const update = () => {
      setTime(video.currentTime);
      frameCallbackRef.current = video.requestVideoFrameCallback(update);
    };
    frameCallbackRef.current = video.requestVideoFrameCallback(update);
    return () => {
      if (frameCallbackRef.current !== null) video.cancelVideoFrameCallback(frameCallbackRef.current);
      frameCallbackRef.current = null;
    };
  }, [scenario]);

  const activeActors = useMemo(
    () => scenario.actors.flatMap((actor) => {
      const current = interpolateActor(actor, time);
      return current ? [current] : [];
    }),
    [scenario, time],
  );
  const selectedTrack = useMemo(
    () => scenario.actors.find((actor) => actor.id === selectedActor) ?? scenario.actors[0],
    [scenario, selectedActor],
  );
  const selectedPosition = useMemo(() => interpolateActor(selectedTrack, time), [selectedTrack, time]);
  const selectedForecasts = useMemo(() => forecastPaths(selectedTrack, time), [selectedTrack, time]);
  const draftEvidenceResult = useMemo(
    () => createLocalEvidenceCounterfactual(scenario.id, selectedTrack.id, draftObstruction),
    [draftObstruction, scenario.id, selectedTrack.id],
  );
  const probabilities = evidenceResult.mode_probabilities.map((mode) => mode.probability);
  const risk = evidenceResult.counterfactual_risk;

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("vector-field-theme", next);
  };

  const toggleLayer = (key: LayerKey) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const seek = (nextTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = nextTime;
    setTime(nextTime);
  };

  const selectEvidenceActor = (actorId: string) => {
    setSelectedActor(actorId);
    setEvidenceResult(createLocalEvidenceCounterfactual(scenario.id, actorId, obstruction));
    setNotice(`${scenario.code} · ${actorId} selected for evidence review`);
  };

  const chooseScenario = (index: number) => {
    const nextScenario = REAL_SCENARIOS[index];
    const initialActor = nextScenario.actors.find((actor) => interpolateActor(actor, nextScenario.defaultTime)) ?? nextScenario.actors[0];
    setTime(nextScenario.defaultTime);
    setPlaying(true);
    setSpeed(1);
    setObstruction("present");
    setDraftObstruction("present");
    setSelectedActor(initialActor.id);
    setEvidenceResult(createLocalEvidenceCounterfactual(nextScenario.id, initialActor.id, "present"));
    setScenarioIndex(index);
    setNotice(`Opening ${nextScenario.location} evidence clip`);
    if (index === scenarioIndex && videoRef.current) {
      videoRef.current.currentTime = nextScenario.defaultTime;
      void videoRef.current.play().catch(() => setPlaying(false));
    }
  };

  const runCounterfactual = async () => {
    setCounterfactualRunning(true);
    try {
      const response = await fetchEvidenceCounterfactual(
        API_URL,
        scenario.id,
        selectedTrack.id,
        draftObstruction,
      );
      setEvidenceResult(response);
      setApiStatus("connected");
      setNotice(
        `${response.scenario_id} · ${response.actor_id} · ${response.intervention} · ${response.sample_count} samples`,
      );
    } catch {
      const response = createLocalEvidenceCounterfactual(
        scenario.id,
        selectedTrack.id,
        draftObstruction,
      );
      setEvidenceResult(response);
      setApiStatus("local");
      setNotice(
        `Local ${response.scenario_id} · ${response.actor_id} · ${response.intervention} · ${response.sample_count} samples`,
      );
    } finally {
      setObstruction(draftObstruction);
      setCounterfactualRunning(false);
      setCounterfactualOpen(false);
    }
  };

  return (
    <main className="motion-workstation" id="top">
      <header className="evidence-header">
        <a className="evidence-brand" href="#top" aria-label="Vector Field home">
          <span>VF</span>
          <div><strong>Vector Field</strong><small>Motion evidence lab</small></div>
        </a>
        <nav className="scenario-tabs" aria-label="Real-world scenarios">
          {REAL_SCENARIOS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={scenarioIndex === index ? "active" : ""}
              aria-pressed={scenarioIndex === index}
              onClick={() => chooseScenario(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.location.split(",")[0]}</strong>
            </button>
          ))}
        </nav>
        <div className="evidence-actions">
          <span className={`engine-state ${apiStatus}`}><i />{apiStatus === "connected" ? "API evidence" : apiStatus === "local" ? "Local fallback" : "Checking engine"}</span>
          <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <section className="evidence-grid">
        <aside className="review-rail" aria-label="Review controls">
          <section>
            <header><span>Evidence clip</span><b>0{scenarioIndex + 1} / 03</b></header>
            <p className="scenario-code">{scenario.code}</p>
            <h1>{scenario.title}</h1>
            <p className="scenario-context">{scenario.context}</p>
            <dl className="clip-facts">
              <div><dt>Location</dt><dd>{scenario.location}</dd></div>
              <div><dt>Observed</dt><dd>{scenario.date}</dd></div>
              <div><dt>Clip</dt><dd>{scenario.duration}s · 30 fps</dd></div>
            </dl>
          </section>

          <section className="actor-review">
            <header><span>Reviewed tracks</span><b>{scenario.actors.length}</b></header>
            <div>
              {scenario.actors.map((actor) => {
                const active = Boolean(interpolateActor(actor, time));
                return (
                  <button
                    type="button"
                    key={actor.id}
                    className={`${selectedActor === actor.id ? "active" : ""} ${active ? "in-frame" : ""}`}
                    onClick={() => {
                      selectEvidenceActor(actor.id);
                      const first = actor.keyframes[0].t;
                      const last = actor.keyframes.at(-1)!.t;
                      if (time < first || time > last) seek((first + last) / 2);
                    }}
                  >
                    <i className={actor.color} />
                    <span><strong>{actor.id}</strong><small>{actor.label}</small></span>
                    <em>{active ? "LIVE" : "SEEK"}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="layer-review">
            <header><span>Evidence layers</span><b>{Object.values(layers).filter(Boolean).length} / 5</b></header>
            {Object.entries(LAYER_LABELS).map(([key, item]) => (
              <label key={key}>
                <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                <input
                  type="checkbox"
                  checked={layers[key as LayerKey]}
                  onChange={() => toggleLayer(key as LayerKey)}
                />
              </label>
            ))}
          </section>
        </aside>

        <section className="video-bay" aria-label="Synchronized real-world motion evidence">
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onError={() => setNotice("The local evidence clip could not be opened")}
          />
          <div className="video-grade" aria-hidden="true" />
          {layers.visibility && <div className="visibility-field" aria-hidden="true" />}

          <svg
            className="evidence-overlay"
            viewBox="0 0 100 56.25"
            preserveAspectRatio="none"
            aria-label="Reviewed tracks and forecast overlay"
          >
            <defs>
              <filter id="soft-glow">
                <feGaussianBlur stdDeviation="0.32" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {layers.tracks && scenario.actors.map((actor) => (
              <polyline
                key={`track-${actor.id}`}
                className={`observed-track ${actor.color} ${selectedActor === actor.id ? "selected" : ""}`}
                points={observedPath(actor)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {layers.occupancy && selectedPosition && (
              <>
                <ellipse
                  className="occupancy-ring outer"
                  cx={selectedPosition.x + selectedPosition.w / 2}
                  cy={selectedPosition.y + selectedPosition.h}
                  rx={selectedPosition.w * 1.45}
                  ry={selectedPosition.h * 0.72}
                  vectorEffect="non-scaling-stroke"
                />
                <ellipse
                  className="occupancy-ring inner"
                  cx={selectedPosition.x + selectedPosition.w / 2}
                  cy={selectedPosition.y + selectedPosition.h}
                  rx={selectedPosition.w * 0.82}
                  ry={selectedPosition.h * 0.42}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {layers.forecast && selectedForecasts.map((forecast, index) => (
              <polyline
                key={forecast.label}
                className={`forecast-line mode-${index}`}
                points={forecast.points.map((point) => `${point.x},${point.y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
                filter="url(#soft-glow)"
              />
            ))}
            {layers.detections && activeActors.map((actor) => (
              <g
                key={actor.id}
                className={`detection ${actor.color} ${selectedActor === actor.id ? "selected" : ""}`}
                onClick={() => selectEvidenceActor(actor.id)}
              >
                <rect x={actor.x} y={actor.y} width={actor.w} height={actor.h} vectorEffect="non-scaling-stroke" />
                <path
                  d={`M${actor.x},${actor.y + 1.8}V${actor.y}H${actor.x + 2.4} M${actor.x + actor.w - 2.4},${actor.y}H${actor.x + actor.w}V${actor.y + 1.8}`}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={actor.x} y={Math.max(2, actor.y - 0.8)}>{actor.id} · {Math.round(actor.confidence * 100)}</text>
              </g>
            ))}
          </svg>

          <div className="clip-heading">
            <span>REAL-WORLD EVIDENCE · {scenario.code}</span>
            <strong>{scenario.location}</strong>
            <small>Footage first · reviewed demonstration annotations · no synthetic vehicles</small>
          </div>

          <div className="frame-readout">
            <span>FRAME {String(Math.floor(time * 30)).padStart(4, "0")}</span>
            <i />
            <span>{activeActors.length} ACTIVE TRACKS</span>
            <i />
            <span>{scenario.visibility >= 0.8 ? "CLEAR" : scenario.visibility >= 0.6 ? "PARTIAL" : "LOW-LIGHT"} VISIBILITY</span>
          </div>

          {selectedPosition && (
            <button
              type="button"
              className="actor-callout"
              style={{
                left: `${Math.min(82, selectedPosition.x + selectedPosition.w + 1)}%`,
                top: `${Math.min(76, (selectedPosition.y / 56.25) * 100)}%`,
              }}
              onClick={() => setCounterfactualOpen(true)}
            >
              <small>SELECTED · {selectedTrack.kind.toUpperCase()}</small>
              <strong>{selectedTrack.id}</strong>
              <span>{Math.round(risk * 100)}% interaction watch · inspect ↗</span>
            </button>
          )}

          <div className="transport">
            <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause evidence clip" : "Play evidence clip"}>
              {playing ? "Ⅱ" : "▶"}
            </button>
            <span>{formatScenarioTime(time)}</span>
            <input
              aria-label="Evidence time"
              type="range"
              min="0"
              max={scenario.duration}
              step="0.01"
              value={Math.min(time, scenario.duration)}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span>{formatScenarioTime(scenario.duration)}</span>
            <button type="button" onClick={cycleSpeed} aria-label="Change playback speed">{speed}×</button>
          </div>

          <div className="evidence-notice" role="status" aria-live="polite">{notice}</div>
        </section>

        <aside className="forecast-rail" aria-label="Forecast inspector">
          <section className="selected-record">
            <header><span>Selected record</span><b className={selectedTrack.color} /></header>
            <p>{selectedTrack.id}</p>
            <h2>{selectedTrack.label}</h2>
            <dl>
              <div><dt>Type</dt><dd>{selectedTrack.kind}</dd></div>
              <div><dt>Review confidence</dt><dd>{Math.round(selectedTrack.confidence * 100)}%</dd></div>
              <div><dt>Frame status</dt><dd>{selectedPosition ? "visible" : "outside window"}</dd></div>
              <div><dt>Visibility</dt><dd>{Math.round(evidenceResult.counterfactual_visibility * 100)}%</dd></div>
            </dl>
          </section>

          <section className="risk-record">
            <header><span>Interaction watch</span><b>{Math.round(risk * 100)}</b></header>
            <div className="risk-meter"><i style={{ width: `${risk * 100}%` }} /></div>
            <p>{interventionLabel(obstruction)} · {evidenceResult.scenario_id} / {evidenceResult.actor_id} · deterministic {evidenceResult.sample_count}-sample fixture</p>
          </section>

          <section className="mode-record">
            <header><span>Future modes</span><b>+3.0s</b></header>
            {["Continue", "Yield", "Deviate"].map((label, index) => (
              <div key={label}>
                <span><i className={`mode-${index}`} />{label}</span>
                <em><b style={{ width: `${probabilities[index] * 100}%` }} /></em>
                <strong>{Math.round(probabilities[index] * 100)}%</strong>
              </div>
            ))}
          </section>

          <button type="button" className="counterfactual-button" onClick={() => {
            setDraftObstruction(obstruction);
            setCounterfactualOpen(true);
          }}>
            <span>Run counterfactual</span>
            <small>Control one context variable →</small>
          </button>

          <section className="source-record">
            <span>Footage provenance</span>
            <strong>{scenario.creator}</strong>
            <a href={scenario.sourceUrl} target="_blank" rel="noreferrer">{scenario.license} · source ↗</a>
          </section>
        </aside>
      </section>

      <footer className="evidence-footer">
        <div className="footer-label">
          <span>Evaluation fixture</span>
          <strong>Calibration · error · latency</strong>
          <small>Metrics are synthetic test evidence, not claims about the footage.</small>
        </div>
        {metrics.slice(0, 3).map((metric) => (
          <div className="metric-card" key={metric.model}>
            <span>{metric.model.replace("-surrogate", "").replaceAll("-", " ")}</span>
            <dl>
              <div><dt>minADE ↓</dt><dd>{metric.min_ade_m.toFixed(2)}m</dd></div>
              <div><dt>Miss ↓</dt><dd>{(metric.miss_rate * 100).toFixed(1)}%</dd></div>
              <div><dt>ECE ↓</dt><dd>{metric.expected_calibration_error.toFixed(3)}</dd></div>
              <div><dt>p95</dt><dd>{metric.p95_latency_ms}ms</dd></div>
            </dl>
          </div>
        ))}
      </footer>

      {counterfactualOpen && (
        <div className="counterfactual-scrim" role="presentation" onMouseDown={() => setCounterfactualOpen(false)}>
          <section
            className="counterfactual-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="counterfactual-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div><span>Controlled intervention</span><h2 id="counterfactual-title">What changes if context visibility changes?</h2></div>
              <button type="button" onClick={() => setCounterfactualOpen(false)} aria-label="Close counterfactual">×</button>
            </header>
            <p>The footage remains unchanged. The deterministic fixture reruns the selected <strong>{scenario.code}</strong> / <strong>{selectedTrack.id}</strong> evidence record while holding the reviewed track, source footage, horizon, sample count, and seed constant.</p>
            <div className="intervention-options">
              {([
                ["present", "Observed", "Use the reviewed scene as recorded"],
                ["shifted", "Shifted", "Increase visibility without removing context"],
                ["removed", "Removed", "Test an unobstructed evidence condition"],
              ] as const).map(([value, label, detail]) => (
                <button
                  type="button"
                  key={value}
                  className={draftObstruction === value ? "active" : ""}
                  onClick={() => setDraftObstruction(value)}
                >
                  <i /><span><strong>{label}</strong><small>{detail}</small></span>
                </button>
              ))}
            </div>
            <div className="counterfactual-summary">
              <span>Baseline <strong>{Math.round(draftEvidenceResult.baseline_risk * 100)}%</strong></span>
              <i>→</i>
              <span>Estimated <strong>{Math.round(draftEvidenceResult.counterfactual_risk * 100)}%</strong></span>
            </div>
            <button type="button" className="run-intervention" onClick={runCounterfactual} disabled={counterfactualRunning}>
              {counterfactualRunning ? "Rerunning seeded fixture…" : "Rerun 128 samples"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
