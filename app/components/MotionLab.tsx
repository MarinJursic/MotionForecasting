"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalibrationMetric,
  createLocalCounterfactual,
  createLocalForecast,
  fetchCounterfactual,
  fetchForecast,
  fetchMetrics,
  localCalibrationMetrics,
  ObstructionMode,
} from "../lib/motion-domain";
import { LayerState, SceneCanvas } from "./SceneCanvas";

const ACTORS = [
  { id: "ego-01", type: "Ego vehicle", color: "white", speed: "9.8 m/s", uncertainty: "0.08" },
  { id: "veh-27", type: "Vehicle", color: "blue", speed: "7.1 m/s", uncertainty: "0.16" },
  { id: "ped-04", type: "Pedestrian", color: "amber", speed: "1.4 m/s", uncertainty: "0.41" },
  { id: "cyc-09", type: "Cyclist", color: "lime", speed: "4.2 m/s", uncertainty: "0.23" },
];

const API_URL = process.env.NEXT_PUBLIC_MOTION_API_URL ?? "http://127.0.0.1:8000";

const actorVisibility: Record<string, number> = {
  "ego-01": 1,
  "veh-27": 0.96,
  "cyc-09": 0.83,
};

function modelLabel(model: string) {
  if (model.startsWith("graph-diffusion")) return "Graph diffusion";
  if (model.startsWith("scene-transformer")) return "Scene transformer";
  if (model === "constant-velocity") return "Constant velocity";
  return model;
}

export function MotionLab() {
  const [time, setTime] = useState(6.2);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selectedActor, setSelectedActor] = useState("ped-04");
  const [obstruction, setObstruction] = useState<ObstructionMode>("present");
  const [draftObstruction, setDraftObstruction] = useState<ObstructionMode>("present");
  const [counterfactualOpen, setCounterfactualOpen] = useState(false);
  const [counterfactualRunning, setCounterfactualRunning] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    detections: true,
    trajectories: true,
    occupancy: true,
    occlusion: true,
    tracks: true,
  });
  const [forecast, setForecast] = useState(() => createLocalForecast("present"));
  const [metrics, setMetrics] = useState<CalibrationMetric[]>(localCalibrationMetrics);
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "local">("checking");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (playing) setTime((value) => (value + 0.08 * speed) % 12);
    }, 80);
    return () => window.clearInterval(interval);
  }, [playing, speed]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchForecast(API_URL, "present", controller.signal),
      fetchMetrics(API_URL, controller.signal),
    ])
      .then(([nextForecast, nextMetrics]) => {
        setForecast(nextForecast);
        setMetrics(nextMetrics);
        setApiStatus("connected");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.info("Motion API unavailable; using the deterministic local fallback.", error);
        setApiStatus("local");
      });
    return () => controller.abort();
  }, []);

  const actor = useMemo(() => ACTORS.find((item) => item.id === selectedActor) ?? ACTORS[2], [selectedActor]);
  const actorForecast = useMemo(
    () => forecast.forecasts.find((item) => item.actor_id === selectedActor) ?? forecast.forecasts[2],
    [forecast, selectedActor],
  );
  const risk = forecast.risk;
  const visibility = selectedActor === "ped-04" ? risk.visibility : actorVisibility[selectedActor] ?? 1;

  const toggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const openCounterfactual = () => {
    setDraftObstruction(obstruction);
    setCounterfactualOpen(true);
  };

  const runCounterfactual = async () => {
    setCounterfactualRunning(true);
    try {
      const response = await fetchCounterfactual(API_URL, draftObstruction);
      setForecast(response.counterfactual_forecast);
      setApiStatus("connected");
      setToast(`API counterfactual complete · ${response.counterfactual_forecast.sample_count} seeded samples`);
    } catch (error) {
      console.info("Counterfactual API unavailable; rerunning the bundled fallback.", error);
      const response = createLocalCounterfactual(draftObstruction);
      setForecast(response.counterfactual_forecast);
      setApiStatus("local");
      setToast(`Local counterfactual complete · ${response.counterfactual_forecast.sample_count} seeded samples`);
    } finally {
      setObstruction(draftObstruction);
      setPlaying(false);
      setTime(6.2);
      setCounterfactualRunning(false);
      setCounterfactualOpen(false);
      window.setTimeout(() => setToast(""), 3200);
    }
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vector Field home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>VECTOR FIELD</b><small>AUTONOMOUS MOTION LAB</small></span>
        </a>
        <div className="scenario-meta">
          <span className="status-pill"><i /> STORY MODE</span>
          <div><small>SCENARIO</small><strong>SF–MARKET–0142</strong></div>
          <div className="wide-only"><small>CONTEXT</small><strong>Urban · dusk · occluded</strong></div>
        </div>
        <div className="header-actions">
          <span className={`api-status ${apiStatus}`}><i />{apiStatus === "connected" ? "API LIVE" : apiStatus === "local" ? "LOCAL ENGINE" : "CONNECTING"}</span>
          <a href="https://github.com/waymo-research/waymo-open-dataset" target="_blank" rel="noreferrer">DATA ADAPTER ↗</a>
        </div>
      </header>

      <section className="workspace" id="top">
        <aside className="left-rail panel">
          <div className="panel-heading"><span>SCENE ACTORS</span><small>04 TRACKED</small></div>
          <div className="actor-list">
            {ACTORS.map((item) => (
              <button
                key={item.id}
                className={`actor-row ${selectedActor === item.id ? "active" : ""}`}
                onClick={() => setSelectedActor(item.id)}
                aria-pressed={selectedActor === item.id}
              >
                <span className={`actor-dot ${item.color}`} />
                <span><strong>{item.id}</strong><small>{item.type}</small></span>
                <em>{item.speed}</em>
              </button>
            ))}
          </div>
          <div className="divider" />
          <div className="panel-heading"><span>VISUAL LAYERS</span><small>{Object.values(layers).filter(Boolean).length} / 5</small></div>
          <div className="layer-list">
            {(Object.keys(layers) as Array<keyof LayerState>).map((key) => (
              <label key={key}>
                <span>{key === "detections" ? "Detections + points" : key === "trajectories" ? "Probability tubes" : key === "occupancy" ? "Occupancy + collision" : key === "occlusion" ? "Visibility mask" : "Observed tracks"}</span>
                <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />
                <i />
              </label>
            ))}
          </div>
          <div className="legend-block">
            <span>FORECAST HORIZON</span>
            <div className="gradient-bar" />
            <div><small>NOW</small><small>+3s</small><small>+8s</small></div>
          </div>
        </aside>

        <section className="viewport-panel">
          <SceneCanvas
            time={time}
            obstruction={obstruction}
            layers={layers}
            forecasts={forecast.forecasts}
            risk={risk}
            selectedActor={selectedActor}
            onSelectActor={setSelectedActor}
          />
          <div className="view-badge">BIRD’S-EYE · 42 M AGL</div>
          <div className="scene-title">
            <span>INTERSECTION 04 / NORTHBOUND</span>
            <strong>Occluded crosswalk emergence</strong>
          </div>
          <div className="model-chip">
            <i />
            <span><small>ACTIVE MODEL · {forecast.sample_count} SAMPLES</small><strong>{modelLabel(forecast.model).toUpperCase()}</strong></span>
            <em>{forecast.latency_ms ? `${forecast.latency_ms}ms` : "local"}</em>
          </div>
          <div className="risk-callout">
            <span className="crosshair" />
            <div><small>PEDESTRIAN CONFLICT</small><strong>{Math.round(risk.collision_probability * 100)}% risk</strong><em>TTC {risk.expected_ttc_s.toFixed(1)}s</em></div>
          </div>
          <div className="orientation"><span>N</span><i /><small>ORBIT ENABLED</small></div>
          <div className="timeline">
            <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? "Ⅱ" : "▶"}</button>
            <span className="timecode">00:{time.toFixed(1).padStart(4, "0")}</span>
            <input
              aria-label="Scenario time"
              type="range"
              min="0"
              max="12"
              step="0.1"
              value={time}
              onChange={(event) => { setTime(Number(event.target.value)); setPlaying(false); }}
            />
            {[0.5, 1, 2].map((item) => (
              <button key={item} className={speed === item ? "active" : ""} aria-pressed={speed === item} onClick={() => setSpeed(item)}>{item}×</button>
            ))}
          </div>
        </section>

        <aside className="right-rail panel">
          <div className="panel-heading"><span>SELECTED ACTOR</span><small>{actor.id}</small></div>
          <div className="actor-card">
            <span className={`actor-avatar ${actor.color}`}>{actor.type === "Pedestrian" ? "P" : actor.type === "Cyclist" ? "C" : "V"}</span>
            <div><strong>{actor.type}</strong><small>Track age 4.8s · {actor.speed}</small></div>
          </div>
          <div className="metric-pair">
            <div><small>UNCERTAINTY</small><strong>{actorForecast.entropy.toFixed(2)}</strong><em>mode entropy</em></div>
            <div><small>VISIBILITY</small><strong>{Math.round(visibility * 100)}%</strong><em>{visibility < 0.5 ? "occluded" : "visible"}</em></div>
          </div>
          <div className="distribution">
            <div className="panel-heading"><span>FUTURE MODES</span><small>8 SEC</small></div>
            {actorForecast.modes.map((mode, index) => (
              <div className="mode-row" key={mode.label}>
                <span><i className={index === 0 ? "mode-a" : index === 1 ? "mode-b" : "mode-c"} />{mode.label}</span>
                <div><b style={{ width: `${mode.probability * 100}%` }} /></div>
                <em>{mode.probability.toFixed(2)}</em>
              </div>
            ))}
          </div>
          <div className="risk-summary">
            <div className="gauge" style={{ "--risk": `${risk.collision_probability * 100}%` } as React.CSSProperties}><span>{Math.round(risk.collision_probability * 100)}</span><small>RISK</small></div>
            <div><small>COLLISION LIKELIHOOD</small><strong>{risk.severity.toUpperCase()}</strong><em>Deterministic synthetic conflict model</em></div>
          </div>
          <button className="counterfactual-button" onClick={openCounterfactual}>
            <span>⌁</span><div><strong>RUN COUNTERFACTUAL</strong><small>Move or remove obstruction</small></div><em>→</em>
          </button>
        </aside>
      </section>

      <section className="evidence-strip">
        <div className="evidence-title"><small>SYNTHETIC EVAL FIXTURE</small><strong>Accuracy · calibration · latency</strong></div>
        {metrics.map((row, index) => (
          <div className={`model-row ${index === 0 ? "active" : ""}`} key={row.model}>
            <span>{index === 0 && <i />}{modelLabel(row.model)}</span>
            <div><small>minADE ↓</small><strong>{row.min_ade_m.toFixed(2)}m</strong></div>
            <div><small>MISS ↓</small><strong>{(row.miss_rate * 100).toFixed(1)}%</strong></div>
            <div><small>ECE ↓</small><strong>{row.expected_calibration_error.toFixed(3)}</strong></div>
            <div><small>BRIER ↓</small><strong>{row.brier_score.toFixed(3)}</strong></div>
            <em>{row.p95_latency_ms}ms</em>
          </div>
        ))}
        <div className="ood-card"><small>OOD PROXY / {actor.id}</small><strong>{actorForecast.ood_score.toFixed(2)}</strong><span className={actorForecast.ood_score > 0.3 ? "warn" : ""}>{actorForecast.ood_score > 0.3 ? "ELEVATED" : "IN RANGE"}</span><p>Occlusion + interaction proximity drive this bounded proxy.</p></div>
      </section>

      <footer>
        <span>Deterministic portfolio surrogate · not a driving system</span>
        <span>Seed 42 · 10 Hz · ENU coordinates</span>
        <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">OPEN API DOCS ↗</a>
      </footer>

      {counterfactualOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setCounterfactualOpen(false)}>
          <section className="counterfactual-modal" role="dialog" aria-modal="true" aria-labelledby="cf-title" onKeyDown={(event) => { if (event.key === "Escape") setCounterfactualOpen(false); }}>
            <button className="modal-close" onClick={() => setCounterfactualOpen(false)} aria-label="Close" autoFocus>×</button>
            <small>CAUSAL SCENE EDITOR / 01</small>
            <h2 id="cf-title">What if the delivery van were elsewhere?</h2>
            <p>Reposition the obstruction and rerun the same 128 seeded mode samples. Actor intent stays fixed; only scene visibility changes.</p>
            <div className="cf-options">
              {([
                ["present", "Keep in place", "31% pedestrian visibility", "Baseline rerun"],
                ["shifted", "Shift 8m north", "72% pedestrian visibility", "Forecast rerun"],
                ["removed", "Remove van", "96% pedestrian visibility", "Forecast rerun"],
              ] as const).map(([mode, title, detail, result]) => (
                <button key={mode} className={draftObstruction === mode ? "active" : ""} aria-pressed={draftObstruction === mode} onClick={() => setDraftObstruction(mode)}>
                  <span className={`mini-scene ${mode}`}><i /><b /></span>
                  <strong>{title}</strong><small>{detail}</small><em>{result}</em>
                </button>
              ))}
            </div>
            <div className="cf-comparison">
              <span><small>APPLIED RISK</small><strong>{Math.round(risk.collision_probability * 100)}%</strong></span>
              <i>→</i>
              <span><small>SELECTED EDIT</small><strong>{draftObstruction}</strong></span>
              <span><small>CONTROL</small><strong>seed 42</strong></span>
            </div>
            <button className="run-button" onClick={runCounterfactual} disabled={counterfactualRunning}>
              {counterfactualRunning ? "RERUNNING…" : "RERUN 128 SAMPLES"} <span>↗</span>
            </button>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status" aria-live="polite"><i />{toast}</div>}
    </main>
  );
}
