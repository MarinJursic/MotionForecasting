"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  actorState,
  CONFLICT_POINT,
  estimateConflict,
  FIXTURE_DURATION_S,
  forecastPoints,
  Intervention,
  interventionLabel,
  observedPoints,
  OVERHEAD_ACTORS,
  OVERHEAD_SOURCE,
} from "../lib/overhead-scenario";

type Theme = "dark" | "light";
type Stage = "watch" | "conflict" | "test";

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PRIMARY_ACTORS = OVERHEAD_ACTORS.slice(0, 2);
const STAGES: Array<{ id: Stage; number: string; title: string; copy: string }> = [
  {
    id: "watch",
    number: "01",
    title: "Watch",
    copy: "Follow the three tracks",
  },
  {
    id: "conflict",
    number: "02",
    title: "Conflict",
    copy: "Read one crossing event",
  },
  {
    id: "test",
    number: "03",
    title: "Test",
    copy: "Separate their arrival times",
  },
];

function formatTime(value: number) {
  return `${value.toFixed(1)} s`;
}

function velocityLabel(value: number) {
  return `${value.toFixed(1)} m/s · ${Math.round(value * 3.6)} km/h`;
}

export function MotionLab() {
  const animationRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [stage, setStage] = useState<Stage>("watch");
  const [time, setTime] = useState(2.45);
  const [playing, setPlaying] = useState(true);
  const [selectedActor, setSelectedActor] = useState(PRIMARY_ACTORS[0].id);
  const [intervention, setIntervention] = useState<Intervention>("recorded");
  const [showContext, setShowContext] = useState(true);
  const [notice, setNotice] = useState(
    "Playing the authored eight-second intersection fixture",
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("crossing-lab-theme");
    const preferred: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.theme = preferred;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setNotice("Fixture paused because reduced motion is enabled");
    }
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!playing) {
      previousTimeRef.current = null;
      return;
    }
    const tick = (timestamp: number) => {
      if (previousTimeRef.current !== null) {
        const elapsed = Math.min((timestamp - previousTimeRef.current) / 1000, 0.1);
        setTime((current) => {
          const next = current + elapsed;
          return next > FIXTURE_DURATION_S ? 0 : next;
        });
      }
      previousTimeRef.current = timestamp;
      animationRef.current = window.requestAnimationFrame(tick);
    };
    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = null;
      previousTimeRef.current = null;
    };
  }, [playing]);

  const estimate = useMemo(
    () => estimateConflict(intervention, time),
    [intervention, time],
  );
  const actors = showContext ? OVERHEAD_ACTORS : PRIMARY_ACTORS;
  const selected =
    OVERHEAD_ACTORS.find((actor) => actor.id === selectedActor) ??
    PRIMARY_ACTORS[0];
  const selectedState = actorState(selected, time, intervention);

  const setReviewStage = (next: Stage) => {
    setStage(next);
    if (next !== "test") {
      setIntervention("recorded");
    }
    if (next === "conflict") {
      setTime(2.45);
      setPlaying(false);
      setNotice("Observed flow restored and paused before the shared conflict point");
    } else if (next === "test") {
      setTime(2.45);
      setPlaying(false);
      setNotice("Choose a control and compare the arrival gap");
    } else {
      setPlaying(true);
      setNotice("Playing the authored eight-second intersection fixture");
    }
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("crossing-lab-theme", next);
  };

  const restart = () => {
    setTime(0);
    setPlaying(true);
    setNotice("Restarted from the beginning of the fixture");
  };

  const applyIntervention = (next: Intervention) => {
    setIntervention(next);
    setTime(2.45);
    setPlaying(false);
    setNotice(`${interventionLabel(next)} is now shown on the intersection`);
  };

  return (
    <main className="crossing-app" id="top">
      <header className="app-header">
        <a className="wordmark" href="#top" aria-label="Crossing Lab home">
          <span aria-hidden="true">CL</span>
          <div>
            <strong>Crossing Lab</strong>
            <small>Intersection motion review</small>
          </div>
        </a>
        <div className="source-line">
          <span className="live-dot" aria-hidden="true" />
          <span>Overhead fixture</span>
          <i aria-hidden="true" />
          <span>{OVERHEAD_SOURCE.location}</span>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          <span aria-hidden="true">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </header>

      <section className="hero-copy">
        <p>One intersection. One potential conflict.</p>
        <h1>See who arrives first.</h1>
        <span>
          Real overhead photography with clearly labeled, authored trajectory
          fixtures for explaining movement—not an automatic crash detector.
        </span>
      </section>

      <nav className="stage-nav" aria-label="Review steps">
        {STAGES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={stage === item.id ? "active" : ""}
            aria-current={stage === item.id ? "step" : undefined}
            onClick={() => setReviewStage(item.id)}
          >
            <span>{item.number}</span>
            <strong>{item.title}</strong>
            <small>{item.copy}</small>
          </button>
        ))}
      </nav>

      <section className="workspace">
        <article className="intersection-view" aria-label="Overhead intersection review">
          <header className="view-toolbar">
            <div>
              <span className="eyebrow">Camera 04 · elevated still</span>
              <strong>Vancouver crossing study</strong>
            </div>
            <label className="context-control">
              <input
                type="checkbox"
                checked={showContext}
                onChange={(event) => {
                  setShowContext(event.target.checked);
                  if (!event.target.checked && selectedActor === "P-04") {
                    setSelectedActor(PRIMARY_ACTORS[0].id);
                  }
                  setNotice(
                    event.target.checked
                      ? "Pedestrian context track visible"
                      : selectedActor === "P-04"
                        ? "Pedestrian hidden; V-21 is now selected"
                        : "Showing the primary vehicle pair only",
                  );
                }}
              />
              <span>Pedestrian context</span>
            </label>
          </header>

          <div className="intersection-canvas">
            <img
              src={`${PUBLIC_BASE_PATH}${OVERHEAD_SOURCE.image}`}
              alt="Elevated night photograph looking down on a Vancouver intersection"
            />
            <div className="image-treatment" aria-hidden="true" />
            <svg
              className="track-layer"
              viewBox="0 0 1000 667"
              role="img"
              aria-label="Authored vehicle and pedestrian trajectories over the real intersection photograph"
            >
              <defs>
                <filter id="track-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.55" />
                </filter>
                <marker
                  id="velocity-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>

              <g className={`conflict-marker ${estimate.band}`}>
                <circle cx={CONFLICT_POINT.x} cy={CONFLICT_POINT.y} r="45" />
                <circle cx={CONFLICT_POINT.x} cy={CONFLICT_POINT.y} r="7" />
                <text x={CONFLICT_POINT.x + 57} y={CONFLICT_POINT.y - 7}>
                  CONFLICT POINT
                </text>
                <text x={CONFLICT_POINT.x + 57} y={CONFLICT_POINT.y + 16}>
                  arrival gap {estimate.arrivalGap.toFixed(2)} s
                </text>
              </g>

              {actors.map((actor) => {
                const state = actorState(actor, time, intervention);
                const vectorLength =
                  actor.kind === "pedestrian"
                    ? 34
                    : Math.max(44, state.velocityMs * 7);
                const isSelected = selectedActor === actor.id;
                return (
                  <g
                    key={actor.id}
                    className={`actor-track ${actor.color} ${isSelected ? "selected" : ""}`}
                  >
                    <polyline
                      className="observed-track"
                      points={observedPoints(actor, intervention)}
                    />
                    <polyline
                      className="forecast-track"
                      points={forecastPoints(actor, time, intervention)}
                    />
                    <line
                      className="velocity-vector"
                      x1={state.x}
                      y1={state.y}
                      x2={state.x + state.direction.x * vectorLength}
                      y2={state.y + state.direction.y * vectorLength}
                      markerEnd="url(#velocity-arrow)"
                    />
                    <g
                      className="actor-hit"
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Select ${actor.label}, ${velocityLabel(state.velocityMs)}`}
                      onClick={() => {
                        setSelectedActor(actor.id);
                        setNotice(`${actor.id} selected for the detail readout`);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedActor(actor.id);
                          setNotice(`${actor.id} selected for the detail readout`);
                        }
                      }}
                      transform={`translate(${state.x} ${state.y}) rotate(${state.headingDeg})`}
                    >
                      {actor.kind === "vehicle" ? (
                        <rect x="-20" y="-10" width="40" height="20" rx="6" />
                      ) : (
                        <circle r="9" />
                      )}
                      <text
                        className="actor-label"
                        x="0"
                        y="-19"
                        transform={`rotate(${-state.headingDeg})`}
                      >
                        {actor.id}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            <div className="media-badges">
              <span>REAL PHOTOGRAPH · {OVERHEAD_SOURCE.license}</span>
              <span>AUTHORED TRACK FIXTURE · NOT DETECTION</span>
            </div>

            <div className="timeline">
              <button
                type="button"
                className="play-button"
                onClick={() => {
                  setPlaying((current) => !current);
                  setNotice(playing ? "Fixture paused" : "Fixture playing");
                }}
                aria-label={playing ? "Pause trajectory fixture" : "Play trajectory fixture"}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <span>{formatTime(time)}</span>
              <input
                type="range"
                min="0"
                max={FIXTURE_DURATION_S}
                step="0.01"
                value={time}
                aria-label="Fixture time"
                onChange={(event) => {
                  setPlaying(false);
                  setTime(Number(event.target.value));
                  setNotice("Fixture positioned with the timeline");
                }}
              />
              <span>{formatTime(FIXTURE_DURATION_S)}</span>
              <button type="button" className="restart-button" onClick={restart}>
                Restart
              </button>
            </div>
          </div>

          <footer className="view-footer">
            <span role="status" aria-live="polite">
              {notice}
            </span>
            <a href={OVERHEAD_SOURCE.sourceUrl} target="_blank" rel="noreferrer">
              {OVERHEAD_SOURCE.creator} · source ↗
            </a>
          </footer>
        </article>

        <aside className="analysis-panel" aria-label={`${stage} review panel`}>
          {stage === "watch" && (
            <section className="panel-section watch-panel">
              <header>
                <span className="step-kicker">01 · Watch</span>
                <h2>Three road users, one shared frame.</h2>
                <p>
                  Solid lines are reviewed history. Dotted lines are constant-motion
                  fixture forecasts. Arrows show heading and speed.
                </p>
              </header>
              <div className="actor-list">
                {actors.map((actor) => {
                  const state = actorState(actor, time, intervention);
                  return (
                    <button
                      type="button"
                      key={actor.id}
                      className={selectedActor === actor.id ? "active" : ""}
                      aria-pressed={selectedActor === actor.id}
                      onClick={() => {
                        setSelectedActor(actor.id);
                        setNotice(`${actor.id} selected for the detail readout`);
                      }}
                    >
                      <i className={actor.color} />
                      <span>
                        <strong>{actor.id} · {actor.label}</strong>
                        <small>
                          {velocityLabel(state.velocityMs)} · heading{" "}
                          {Math.round(state.headingDeg)}°
                        </small>
                      </span>
                      <em>{Math.round(actor.confidence * 100)}%</em>
                    </button>
                  );
                })}
              </div>
              <dl className="selected-readout">
                <div>
                  <dt>Selected track</dt>
                  <dd>{selected.id}</dd>
                </div>
                <div>
                  <dt>Estimated velocity</dt>
                  <dd>{velocityLabel(selectedState.velocityMs)}</dd>
                </div>
                <div>
                  <dt>Heading</dt>
                  <dd>{Math.round(selectedState.headingDeg)}° image-plane</dd>
                </div>
              </dl>
              <p className="method-note">
                Track confidence and kinematics belong to the authored demonstration
                fixture. They were not inferred from this single photograph.
              </p>
            </section>
          )}

          {stage === "conflict" && (
            <section className="panel-section conflict-panel">
              <header>
                <span className="step-kicker">02 · Conflict</span>
                <h2>
                  The paths meet {estimate.arrivalGap.toFixed(2)} seconds apart.
                </h2>
                <p>
                  Time-to-conflict is the remaining fixture time for each path to
                  reach the same image-plane point.
                </p>
              </header>
              <div
                className={`likelihood-block ${estimate.band}`}
                style={{ "--risk": `${estimate.likelihood * 3.6}deg` } as React.CSSProperties}
              >
                <div className="risk-ring">
                  <span>{estimate.likelihood}%</span>
                  <small>±{estimate.uncertainty} pts</small>
                </div>
                <div>
                  <span>Illustrative collision likelihood</span>
                  <strong>{estimate.band}</strong>
                  <small>
                    plausible fixture range {estimate.range[0]}–{estimate.range[1]}%
                  </small>
                </div>
              </div>
              <div className="arrival-table">
                {PRIMARY_ACTORS.map((actor, index) => {
                  const state = actorState(actor, time, intervention);
                  const ttc = index === 0 ? estimate.actorATtc : estimate.actorBTtc;
                  const arrival =
                    index === 0 ? estimate.actorAArrival : estimate.actorBArrival;
                  return (
                    <div key={actor.id}>
                      <i className={actor.color} />
                      <span>
                        <strong>{actor.id}</strong>
                        <small>{velocityLabel(state.velocityMs)}</small>
                      </span>
                      <span>
                        <small>Time to conflict</small>
                        <strong>{formatTime(ttc)}</strong>
                      </span>
                      <span>
                        <small>Fixture arrival</small>
                        <strong>{formatTime(arrival)}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="plain-language">
                <span>What this means</span>
                <p>{estimate.summary}</p>
              </div>
              <p className="method-note">
                This percentage is an illustrative scenario score with an authored
                uncertainty band—not a calibrated estimate of a real crash. TTC uses
                the fixture paths and constant-motion assumption, not physical
                photogrammetry.
              </p>
              <button
                type="button"
                className="primary-action"
                onClick={() => setReviewStage("test")}
              >
                Test a safer timing
                <span aria-hidden="true">→</span>
              </button>
            </section>
          )}

          {stage === "test" && (
            <section className="panel-section test-panel">
              <header>
                <span className="step-kicker">03 · Test</span>
                <h2>Change one control.</h2>
                <p>
                  The photo and through vehicle stay fixed. Only the turning
                  vehicle&apos;s authored arrival timing changes.
                </p>
              </header>
              <div className="intervention-list" role="group" aria-label="Timing intervention">
                {(
                  [
                    {
                      id: "recorded",
                      title: "Observed flow",
                      copy: "No control applied",
                    },
                    {
                      id: "early-brake",
                      title: "Early brake",
                      copy: "Turn vehicle slows before entry",
                    },
                    {
                      id: "protected-turn",
                      title: "Protected turn",
                      copy: "Turn waits for a separate phase",
                    },
                  ] as const
                ).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={intervention === item.id ? "active" : ""}
                    aria-pressed={intervention === item.id}
                    onClick={() => applyIntervention(item.id)}
                  >
                    <i />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.copy}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="comparison">
                <div>
                  <span>Observed</span>
                  <strong>42% <small>±9</small></strong>
                  <em>0.23 s gap</em>
                </div>
                <span aria-hidden="true">→</span>
                <div className={estimate.band}>
                  <span>{interventionLabel(intervention)}</span>
                  <strong>
                    {estimate.likelihood}% <small>±{estimate.uncertainty}</small>
                  </strong>
                  <em>{estimate.arrivalGap.toFixed(2)} s gap</em>
                </div>
              </div>
              <div className="plain-language">
                <span>Result</span>
                <p>{estimate.summary}</p>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  setTime(0);
                  setPlaying(true);
                  setNotice(`${interventionLabel(intervention)} replay started`);
                }}
              >
                Replay this timing
                <span aria-hidden="true">↻</span>
              </button>
              <p className="method-note">
                Compare directionally. The score is deterministic, illustrative,
                and not validated for roadway decision-making.
              </p>
            </section>
          )}
        </aside>
      </section>

      <footer className="research-boundary">
        <div>
          <strong>Research boundary</strong>
          <span>
            Real CC0 photograph · authored trajectories · no perception model · no
            planning or actuation
          </span>
        </div>
        <a
          href="https://highways.dot.gov/turner-fairbank-highway-research-center/software/ssam"
          target="_blank"
          rel="noreferrer"
        >
          FHWA surrogate-safety context ↗
        </a>
      </footer>
    </main>
  );
}
