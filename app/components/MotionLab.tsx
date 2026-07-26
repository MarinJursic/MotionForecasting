"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalEvidenceCounterfactual,
  fetchEvidenceCounterfactual,
  ObstructionMode,
} from "../lib/motion-domain";
import {
  analyzeConflict,
  formatScenarioTime,
  interpolateActor,
  observedPath,
  REAL_SCENARIOS,
  ScenarioActor,
} from "../lib/scenarios";

type Theme = "dark" | "light";
type EngineState = "ready" | "connected" | "local";
type VideoState = "loading" | "ready" | "buffering" | "error";

const API_URL = process.env.NEXT_PUBLIC_MOTION_API_URL ?? "http://127.0.0.1:8000";
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SPEEDS = [0.5, 1, 1.5];

function interventionLabel(mode: ObstructionMode) {
  if (mode === "shifted") return "Improved condition";
  if (mode === "removed") return "Unobstructed condition";
  return "Recorded context";
}

function fixtureBand(value: number) {
  if (value >= 0.58) return "Higher review band";
  if (value >= 0.4) return "Review band";
  return "Lower review band";
}

function actorPosition(actor: ScenarioActor, time: number) {
  const state = interpolateActor(actor, time);
  return state ? { x: state.x + state.w / 2, y: state.y + state.h } : null;
}

function trackWindow(actor: ScenarioActor) {
  return `${formatScenarioTime(actor.keyframes[0].t)}–${formatScenarioTime(actor.keyframes.at(-1)!.t)}`;
}

export function MotionLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const frameCallbackRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [scenarioIndex, setScenarioIndex] = useState(1);
  const scenario = REAL_SCENARIOS[scenarioIndex];
  const conflict = useMemo(() => analyzeConflict(scenario), [scenario]);
  const [time, setTime] = useState(scenario.defaultTime);
  const [playing, setPlaying] = useState(true);
  const [videoState, setVideoState] = useState<VideoState>("loading");
  const [speed, setSpeed] = useState(1);
  const [selectedActor, setSelectedActor] = useState(scenario.conflict.actorIds[0]);
  const [showContextTracks, setShowContextTracks] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("ready");
  const [counterfactualOpen, setCounterfactualOpen] = useState(false);
  const [counterfactualRunning, setCounterfactualRunning] = useState(false);
  const [obstruction, setObstruction] = useState<ObstructionMode>("present");
  const [draftObstruction, setDraftObstruction] = useState<ObstructionMode>("present");
  const [evidenceResult, setEvidenceResult] = useState(() =>
    createLocalEvidenceCounterfactual(scenario.id, scenario.conflict.actorIds[0], "present"),
  );
  const [notice, setNotice] = useState("Camera evidence and image-plane relationship are synchronized");

  useEffect(() => {
    const stored = window.localStorage.getItem("vector-field-theme");
    const preferred: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.theme = preferred;
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoState("loading");
    video.pause();
    video.load();
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

  useEffect(() => {
    if (!counterfactualOpen) return;
    closeButtonRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCounterfactualOpen(false);
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.removeEventListener("keydown", handleDialogKeys);
      previousFocusRef.current?.focus();
    };
  }, [counterfactualOpen]);

  const pairActors = useMemo(
    () => [conflict.actorA, conflict.actorB],
    [conflict],
  );
  const displayedActors = showContextTracks ? scenario.actors : pairActors;
  const activeActors = useMemo(
    () =>
      displayedActors.flatMap((actor) => {
        const current = interpolateActor(actor, time);
        return current ? [current] : [];
      }),
    [displayedActors, time],
  );
  const selectedTrack =
    scenario.actors.find((actor) => actor.id === selectedActor) ?? conflict.actorA;
  const pairPositions = pairActors.map((actor) => actorPosition(actor, time));
  const draftEvidenceResult = useMemo(
    () => createLocalEvidenceCounterfactual(scenario.id, selectedTrack.id, draftObstruction),
    [draftObstruction, scenario.id, selectedTrack.id],
  );
  const riskLabel = fixtureBand(evidenceResult.counterfactual_risk);
  const orderedModes = [...evidenceResult.mode_probabilities].sort(
    (left, right) => right.probability - left.probability,
  );

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("vector-field-theme", next);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const prepareVideo = (video: HTMLVideoElement) => {
    video.currentTime = scenario.defaultTime;
    video.playbackRate = speed;
    void video.play().catch(() => {
      setPlaying(false);
      setVideoState("ready");
    });
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
    setNotice(`${actorId} is now the focal reviewed track`);
  };

  const chooseScenario = (index: number) => {
    const nextScenario = REAL_SCENARIOS[index];
    const nextActor = nextScenario.conflict.actorIds[0];
    setScenarioIndex(index);
    setTime(nextScenario.defaultTime);
    setPlaying(true);
    setSpeed(1);
    setObstruction("present");
    setDraftObstruction("present");
    setSelectedActor(nextActor);
    setEvidenceResult(createLocalEvidenceCounterfactual(nextScenario.id, nextActor, "present"));
    setNotice(`Opened ${nextScenario.location} · curated reviewed pair ready`);
  };

  const openCounterfactual = () => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setDraftObstruction(obstruction);
    setCounterfactualOpen(true);
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
      setEngineState("connected");
      setNotice(`${interventionLabel(draftObstruction)} applied to ${selectedTrack.id}`);
    } catch {
      const response = createLocalEvidenceCounterfactual(
        scenario.id,
        selectedTrack.id,
        draftObstruction,
      );
      setEvidenceResult(response);
      setEngineState("local");
      setNotice(`Matching local fixture applied to ${selectedTrack.id}`);
    } finally {
      setObstruction(draftObstruction);
      setCounterfactualRunning(false);
      setCounterfactualOpen(false);
    }
  };

  return (
    <main className="motion-review" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vector Field home">
          <span className="brand-mark">VF</span>
          <span><strong>Vector Field</strong><small>Pair review</small></span>
        </a>
        <nav className="scenario-switcher" aria-label="Real-world scenarios">
          {REAL_SCENARIOS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={scenarioIndex === index ? "active" : ""}
              aria-pressed={scenarioIndex === index}
              onClick={() => chooseScenario(index)}
            >
              <span>{item.location.split(",")[0]}</span>
              <small>{item.conflict.encounter}</small>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`engine-pill ${engineState}`}>
            <i />{engineState === "connected" ? "API" : engineState === "local" ? "Local parity" : "Offline ready"}
          </span>
          <button type="button" className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <section className="review-intro">
        <div>
          <p>{scenario.code} · {scenario.date}</p>
          <h1>{scenario.conflict.title}</h1>
          <span>{scenario.location} · {scenario.context}</span>
        </div>
        <div className="review-state">
          <small>Review state</small>
          <strong>{conflict.simultaneous ? "Tracks overlap in time" : "Time-separated control"}</strong>
          <span>{scenario.conflict.note}</span>
        </div>
      </section>

      <section className="review-layout">
        <article className="camera-card" aria-label="Synchronized real-world motion evidence">
          <header className="card-header">
            <div><span>01</span><div><strong>Watch the evidence</strong><small>Licensed source footage · reviewed demonstration tracks</small></div></div>
            <label className="context-toggle">
              <input
                type="checkbox"
                checked={showContextTracks}
                onChange={(event) => setShowContextTracks(event.target.checked)}
              />
              <span>Other tracks</span>
            </label>
          </header>

          <div className="video-stage">
            <video
              key={scenario.id}
              ref={videoRef}
              muted
              loop
              playsInline
              preload="metadata"
              poster={`${PUBLIC_BASE_PATH}${scenario.poster}`}
              onLoadedMetadata={(event) => prepareVideo(event.currentTarget)}
              onCanPlay={() => setVideoState("ready")}
              onWaiting={() => setVideoState("buffering")}
              onPlaying={() => {
                setPlaying(true);
                setVideoState("ready");
              }}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onError={() => {
                setVideoState("error");
                setNotice("The bundled evidence clip could not be opened");
              }}
            >
              <source src={`${PUBLIC_BASE_PATH}${scenario.mp4}`} type="video/mp4" />
              <source src={`${PUBLIC_BASE_PATH}${scenario.video}`} type="video/webm" />
            </video>
            <div className="video-shade" aria-hidden="true" />
            {videoState !== "ready" && (
              <div className={`video-state ${videoState}`} role="status" aria-live="polite">
                {videoState === "error"
                  ? "Evidence unavailable"
                  : videoState === "buffering"
                    ? "Buffering evidence…"
                    : "Preparing evidence…"}
              </div>
            )}
            <svg
              className="camera-overlay"
              viewBox="0 0 100 56.25"
              preserveAspectRatio="none"
              aria-label="Frame-aligned reviewed track boxes"
            >
              {activeActors.map((actor) => (
                <g
                  key={actor.id}
                  className={`camera-detection ${actor.color} ${selectedActor === actor.id ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select curated reviewed track ${actor.id}, ${actor.label}`}
                  onClick={() => selectEvidenceActor(actor.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectEvidenceActor(actor.id);
                    }
                  }}
                >
                  <rect x={actor.x} y={actor.y} width={actor.w} height={actor.h} vectorEffect="non-scaling-stroke" />
                  <text x={actor.x} y={Math.max(2, actor.y - 0.8)}>{actor.id}</text>
                </g>
              ))}
            </svg>
            <div className="source-badge">REAL FOOTAGE · {scenario.license}</div>
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
          </div>

          <footer className="camera-footer">
            <span role="status" aria-live="polite">{notice}</span>
            <a href={scenario.sourceUrl} target="_blank" rel="noreferrer">
              {scenario.creator} · source ↗
            </a>
          </footer>
        </article>

        <article className="conflict-card" aria-label="Evidence-derived image-plane relationship">
          <header className="card-header">
            <div><span>02</span><div><strong>Read the relationship</strong><small>Image-plane traces from the curated reviewed pair</small></div></div>
            <span className={`overlap-badge ${conflict.simultaneous ? "review" : "clear"}`}>
              {conflict.simultaneous ? "Simultaneous" : "Separated"}
            </span>
          </header>

          <div className="conflict-map">
            <svg viewBox="0 0 100 60" role="img" aria-label={`${scenario.conflict.title} image-plane track relationship`}>
              <defs>
                <marker id="arrow-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="arrow-a" />
                </marker>
                <marker id="arrow-b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="arrow-b" />
                </marker>
              </defs>
              <rect width="100" height="60" className="map-surface" />
              <circle cx={conflict.zone.x} cy={conflict.zone.y} r="7" className="conflict-zone" />
              <circle cx={conflict.zone.x} cy={conflict.zone.y} r="1.7" className="conflict-core" />
              {pairActors.map((actor, index) => (
                <g key={actor.id} className={`map-track track-${index}`}>
                  <polyline
                    points={observedPath(actor)}
                    markerEnd={`url(#arrow-${index === 0 ? "a" : "b"})`}
                  />
                  {actor.keyframes.map((frame) => (
                    <circle
                      key={`${actor.id}-${frame.t}`}
                      cx={frame.x + frame.w / 2}
                      cy={frame.y + frame.h}
                      r="0.9"
                    />
                  ))}
                  {pairPositions[index] && (
                    <circle
                      className="current-position"
                      role="button"
                      tabIndex={0}
                      aria-label={`Select curated reviewed track ${actor.id}, ${actor.label}`}
                      cx={pairPositions[index]!.x}
                      cy={pairPositions[index]!.y}
                      r={selectedActor === actor.id ? 3 : 2.3}
                      onClick={() => selectEvidenceActor(actor.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectEvidenceActor(actor.id);
                        }
                      }}
                    />
                  )}
                </g>
              ))}
            </svg>
            <div className="map-caption">
              <strong>Evidence-derived image plane</strong>
              <span>Relative camera traces only · no road geometry or physical distance</span>
            </div>
          </div>

          <div className="pair-list" aria-label="Curated reviewed pair">
            {pairActors.map((actor, index) => (
              <button
                type="button"
                key={actor.id}
                className={selectedActor === actor.id ? "active" : ""}
                onClick={() => {
                  selectEvidenceActor(actor.id);
                  const [start, end] = scenario.conflict.reviewWindow;
                  if (time < start || time > end) seek((start + end) / 2);
                }}
              >
                <i className={`pair-color pair-${index}`} />
                <span><strong>{index === 0 ? "A" : "B"} · {actor.label}</strong><small>{actor.id} · visible {trackWindow(actor)}</small></span>
                <em>{selectedActor === actor.id ? "FOCAL" : "VIEW"}</em>
              </button>
            ))}
          </div>

          <dl className="relationship-facts">
            <div>
              <dt>{conflict.simultaneous ? "Closest reviewed moment" : "Annotation timing"}</dt>
              <dd>
                {conflict.simultaneous
                  ? `Observed at ${formatScenarioTime(conflict.closestTime ?? 0)}`
                  : "Track windows do not overlap"}
              </dd>
            </div>
            <div><dt>Selected evidence</dt><dd>{selectedTrack.id} · curated demonstration track</dd></div>
            <div><dt>Review condition</dt><dd>{interventionLabel(obstruction)}</dd></div>
          </dl>
        </article>
      </section>

      <section className="decision-strip">
        <div className="decision-copy">
          <span>03</span>
          <div>
            <small>Fixture outcome for {selectedTrack.id}</small>
            <strong>{riskLabel}</strong>
            <p>Authored deterministic fixture · qualitative band · research UI only</p>
          </div>
        </div>
        <div className="mode-summary" aria-label="Fixture future modes">
          {orderedModes.map((mode, index) => (
            <div key={mode.label}>
              <span>{index === 0 ? "Primary" : "Alternate"}</span>
              <strong>{mode.label}</strong>
            </div>
          ))}
        </div>
        <button type="button" className="test-button" onClick={openCounterfactual}>
          <span>Test visibility assumption</span>
          <small>Hold clip and track constant →</small>
        </button>
      </section>

      {counterfactualOpen && (
        <div className="counterfactual-scrim" role="presentation" onMouseDown={() => setCounterfactualOpen(false)}>
          <section
            ref={dialogRef}
            className="counterfactual-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="counterfactual-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div><span>Controlled comparison</span><h2 id="counterfactual-title">Change visibility, not the evidence</h2></div>
              <button ref={closeButtonRef} type="button" onClick={() => setCounterfactualOpen(false)} aria-label="Close comparison">×</button>
            </header>
            <p>The real clip and reviewed track remain unchanged. Only the deterministic fixture&apos;s visibility context changes for <strong>{selectedTrack.id}</strong>.</p>
            <div className="intervention-options">
              {([
                ["present", "Recorded", "Use the reviewed context"],
                ["shifted", "Improved", "Increase fixture visibility"],
                ["removed", "Unobstructed", "Test the maximum-visibility fixture"],
              ] as const).map(([value, label, detail]) => (
                <button
                  type="button"
                  key={value}
                  className={draftObstruction === value ? "active" : ""}
                  aria-pressed={draftObstruction === value}
                  onClick={() => setDraftObstruction(value)}
                >
                  <i /><span><strong>{label}</strong><small>{detail}</small></span>
                </button>
              ))}
            </div>
            <div className="counterfactual-summary">
              <span>Recorded <strong>{fixtureBand(draftEvidenceResult.baseline_risk)}</strong></span>
              <i>→</i>
              <span>Comparison <strong>{fixtureBand(draftEvidenceResult.counterfactual_risk)}</strong></span>
            </div>
            <button type="button" className="run-intervention" onClick={runCounterfactual} disabled={counterfactualRunning}>
              {counterfactualRunning ? "Running deterministic comparison…" : "Apply comparison"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
