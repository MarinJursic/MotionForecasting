"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  ActorForecast,
  ObstructionMode,
  RiskSummary,
} from "../lib/motion-domain";
import { replayActorPositions } from "../lib/motion-domain";

export type LayerState = {
  detections: boolean;
  trajectories: boolean;
  occupancy: boolean;
  occlusion: boolean;
  tracks: boolean;
};

type SceneCanvasProps = {
  time: number;
  obstruction: ObstructionMode;
  layers: LayerState;
  forecasts: ActorForecast[];
  risk: RiskSummary;
  selectedActor: string;
  onSelectActor: (actor: string) => void;
  theme: "dark" | "light";
};

const actorColors: Record<string, number> = {
  ego: 0xf7f8f2,
  vehicle: 0x4cc9f0,
  pedestrian: 0xffd166,
  cyclist: 0xb8ff6a,
};

function roundedBox(width: number, height: number, depth: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function line(points: THREE.Vector3[], color: number, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.75, gapSize: 0.55 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const result = new THREE.Line(geometry, material);
  if (dashed) result.computeLineDistances();
  return result;
}

function trajectoryTube(
  points: THREE.Vector3[],
  covarianceTrace: number[],
  color: number,
  probability: number,
) {
  const tube = new THREE.Group();
  const opacity = 0.18 + probability * 0.72;
  points.slice(0, -1).forEach((point, index) => {
    const nextPoint = points[index + 1];
    const standardDeviation = Math.sqrt(Math.max(covarianceTrace[index + 1] ?? 0, 0));
    const radius = 0.055 + probability * 0.13 + Math.min(standardDeviation, 1.5) * 0.055;
    tube.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(point, nextPoint), 4, radius, 8, false),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
  });
  return tube;
}

const actorIdColors: Record<string, number> = {
  "ego-01": actorColors.ego,
  "veh-27": actorColors.vehicle,
  "ped-04": actorColors.pedestrian,
  "cyc-09": actorColors.cyclist,
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose();
    }
  });
}

export function SceneCanvas({ time, obstruction, layers, forecasts, risk, selectedActor, onSelectActor, theme }: SceneCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ time, obstruction, layers, forecasts, risk, selectedActor });
  const onSelectRef = useRef(onSelectActor);

  useEffect(() => {
    stateRef.current = { time, obstruction, layers, forecasts, risk, selectedActor };
    onSelectRef.current = onSelectActor;
  }, [time, obstruction, layers, forecasts, risk, selectedActor, onSelectActor]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const lightTheme = theme === "light";
    const palette = lightTheme
      ? {
          background: 0xdce8e2,
          fog: 0xdce8e2,
          ground: 0xc8d9d0,
          road: 0x6e7d78,
          marking: 0xf7faf8,
          buildingA: 0xa8bbb2,
          buildingB: 0xb8c9c1,
          windows: 0x5f8276,
          points: 0x176c58,
        }
      : {
          background: 0x07100f,
          fog: 0x07100f,
          ground: 0x0b1714,
          road: 0x182322,
          marking: 0xaab3aa,
          buildingA: 0x13231f,
          buildingB: 0x182824,
          windows: 0x5c8f83,
          points: 0x68b8a5,
        };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.background);
    scene.fog = new THREE.FogExp2(palette.fog, lightTheme ? 0.009 : 0.014);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 400);
    camera.position.set(29, 34, 36);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lightTheme ? 1.14 : 0.98;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 22;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(
      lightTheme ? 0xf5fff9 : 0xa8d8ca,
      lightTheme ? 0x789188 : 0x0a1411,
      lightTheme ? 2.7 : 2.1,
    ));
    const sun = new THREE.DirectionalLight(lightTheme ? 0xfff8df : 0xffffff, lightTheme ? 3.2 : 2.8);
    sun.position.set(-18, 32, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.14;
    ground.receiveShadow = true;
    scene.add(ground);

    const roadMaterial = new THREE.MeshStandardMaterial({ color: palette.road, roughness: 0.94 });
    const roadA = new THREE.Mesh(new THREE.PlaneGeometry(20, 92), roadMaterial);
    roadA.rotation.x = -Math.PI / 2;
    roadA.position.y = -0.08;
    scene.add(roadA);
    const roadB = new THREE.Mesh(new THREE.PlaneGeometry(92, 20), roadMaterial);
    roadB.rotation.x = -Math.PI / 2;
    roadB.position.y = -0.07;
    scene.add(roadB);

    const markings = new THREE.Group();
    for (let i = -42; i <= 42; i += 7) {
      const dashA = roundedBox(0.16, 0.025, 3.2, palette.marking);
      dashA.position.set(0, 0, i);
      markings.add(dashA);
      const dashB = roundedBox(3.2, 0.025, 0.16, palette.marking);
      dashB.position.set(i, 0, 0);
      markings.add(dashB);
    }
    for (let i = -7.5; i <= 7.5; i += 1.5) {
      const crossing = roundedBox(0.7, 0.03, 5.4, palette.marking);
      crossing.position.set(i, 0.02, 14);
      markings.add(crossing);
    }
    scene.add(markings);

    const signal = new THREE.Group();
    const signalPole = roundedBox(0.16, 3.8, 0.16, 0x77847f);
    signalPole.position.y = 1.9;
    signal.add(signalPole);
    const signalHead = roundedBox(0.68, 1.55, 0.58, 0x111816);
    signalHead.position.y = 3.65;
    signal.add(signalHead);
    const greenLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x66ff9a }),
    );
    greenLight.position.set(0, 3.25, 0.31);
    signal.add(greenLight);
    signal.position.set(-9, 0, 10);
    scene.add(signal);

    const buildings = new THREE.Group();
    [
      [-22, -23, 15, 13, 9],
      [23, -23, 17, 14, 12],
      [-24, 25, 14, 15, 7],
      [26, 26, 18, 13, 10],
    ].forEach(([x, z, w, d, h], index) => {
      const building = roundedBox(w, h, d, index % 2 ? palette.buildingB : palette.buildingA);
      building.position.set(x, h / 2, z);
      buildings.add(building);
      for (let row = 1.5; row < h - 1; row += 2.6) {
        const windowStrip = roundedBox(w * 0.72, 0.05, 0.12, palette.windows);
        windowStrip.position.set(x, row, z + d / 2 + 0.07);
        buildings.add(windowStrip);
      }
    });
    scene.add(buildings);

    const actorGroup = new THREE.Group();
    scene.add(actorGroup);
    const detectionGroup = new THREE.Group();
    scene.add(detectionGroup);

    const ego = roundedBox(2.15, 0.9, 4.3, actorColors.ego);
    ego.userData.actorId = "ego-01";
    actorGroup.add(ego);

    const sedan = roundedBox(2, 0.8, 4.1, actorColors.vehicle);
    sedan.userData.actorId = "veh-27";
    actorGroup.add(sedan);

    const van = roundedBox(2.5, 2.35, 5.3, 0xe8b65d);
    van.userData.actorId = "van-12";
    actorGroup.add(van);

    const pedestrian = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.8, 5, 10),
      new THREE.MeshStandardMaterial({ color: actorColors.pedestrian }),
    );
    body.position.y = 0.72;
    pedestrian.add(body);
    pedestrian.userData.actorId = "ped-04";
    pedestrian.traverse((object) => (object.userData.actorId = "ped-04"));
    actorGroup.add(pedestrian);

    const cyclist = new THREE.Group();
    const cycleBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.65, 5, 10),
      new THREE.MeshStandardMaterial({ color: actorColors.cyclist }),
    );
    cycleBody.position.y = 0.7;
    cyclist.add(cycleBody);
    for (const z of [-0.72, 0.72]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.08, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0x151a18 }),
      );
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.42, z);
      cyclist.add(wheel);
    }
    cyclist.userData.actorId = "cyc-09";
    cyclist.traverse((object) => (object.userData.actorId = "cyc-09"));
    actorGroup.add(cyclist);

    const detectionMaterial = (color: number) => new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.58,
      depthTest: false,
    });
    const detectionBoxes = {
      ego: new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.25, 4.6), detectionMaterial(actorColors.ego)),
      sedan: new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.15, 4.4), detectionMaterial(actorColors.vehicle)),
      van: new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.65, 5.6), detectionMaterial(0xe8b65d)),
      pedestrian: new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.8, 0.75), detectionMaterial(actorColors.pedestrian)),
      cyclist: new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 2.05), detectionMaterial(actorColors.cyclist)),
      signal: new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.8, 0.82), detectionMaterial(0x66ff9a)),
    };
    Object.values(detectionBoxes).forEach((box) => {
      box.renderOrder = 5;
      detectionGroup.add(box);
    });

    const pointPositions: number[] = [];
    for (let index = 0; index < 620; index += 1) {
      const along = -44 + (index % 155) * (88 / 154);
      const lane = Math.floor(index / 155);
      const lateral = -8.5 + lane * 5.7 + Math.sin(index * 2.17) * 0.32;
      const swap = index % 2 === 0;
      pointPositions.push(
        swap ? lateral : along,
        0.13 + ((index * 17) % 7) * 0.012,
        swap ? along : lateral,
      );
    }
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pointPositions, 3));
    const sensorPoints = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({
        color: palette.points,
        size: 0.08,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    detectionGroup.add(sensorPoints);
    detectionBoxes.signal.position.set(-9, 3.55, 10);

    const tracks = new THREE.Group();
    tracks.add(
      line([new THREE.Vector3(-5.2, 0.08, -38), new THREE.Vector3(-5.2, 0.08, 38)], actorColors.ego, 0.5, true),
      line([new THREE.Vector3(-38, 0.08, -5), new THREE.Vector3(38, 0.08, -5)], actorColors.vehicle, 0.5, true),
      line([new THREE.Vector3(0, 0.08, 14), new THREE.Vector3(18, 0.08, 14)], actorColors.pedestrian, 0.65, true),
      line([new THREE.Vector3(5.4, 0.08, 38), new THREE.Vector3(5.4, 0.08, -38)], actorColors.cyclist, 0.48, true),
    );
    scene.add(tracks);

    const future = new THREE.Group();
    scene.add(future);

    const occupancy = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const intensity = 1 - i / 9;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(2.2 + i * 0.55, 48),
        new THREE.MeshBasicMaterial({
          color: i < 3 ? 0xff5b55 : i < 6 ? 0xffa149 : 0xffd166,
          transparent: true,
          opacity: 0.07 + intensity * 0.035,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(-5.2 + i * 0.18, 0.1 + i * 0.002, 14 - i * 0.15);
      occupancy.add(disc);
    }
    [
      [-3.6, 14, -1, 0],
      [-4.5, 13.2, -0.8, 0.15],
      [-5.2, 12.3, 0, 1],
      [-2.7, 14, -1, 0],
    ].forEach(([x, z, dx, dz]) => {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(dx, 0, dz).normalize(),
        new THREE.Vector3(x, 0.2, z),
        2.3,
        0xff895e,
        0.6,
        0.35,
      );
      occupancy.add(arrow);
    });
    scene.add(occupancy);

    const occlusionGeometry = new THREE.BufferGeometry();
    occlusionGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        -3.45, 0.12, 13.65,
        -0.95, 0.12, 13.65,
        1.6, 0.12, 28,
        -2.3, 0.12, 28,
      ], 3),
    );
    occlusionGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    occlusionGeometry.computeVertexNormals();
    const occlusion = new THREE.Mesh(
      occlusionGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xb38cff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    scene.add(occlusion);

    const scan = new THREE.Mesh(
      new THREE.RingGeometry(4, 4.16, 64),
      new THREE.MeshBasicMaterial({ color: 0x59ffcf, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
    );
    scan.rotation.x = -Math.PI / 2;
    scan.position.y = 0.14;
    scene.add(scan);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickHandler = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(actorGroup.children, true).find((item) => item.object.userData.actorId);
      if (hit?.object.userData.actorId) onSelectRef.current(hit.object.userData.actorId);
    };
    renderer.domElement.addEventListener("pointerup", clickHandler);

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    let renderedForecasts: ActorForecast[] | null = null;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const {
        time: t,
        obstruction: mode,
        layers: layerState,
        forecasts: currentForecasts,
        risk: currentRisk,
        selectedActor: selected,
      } = stateRef.current;
      if (renderedForecasts !== currentForecasts) {
        future.children.forEach((child) => disposeObject(child));
        future.clear();
        currentForecasts.forEach((actorForecast) => {
          actorForecast.modes.forEach((modeForecast) => {
            const points = modeForecast.points.map(
              (point) => new THREE.Vector3(point.x, 0.24, point.y),
            );
            if (points.length < 2) return;
            future.add(
              trajectoryTube(
                points,
                modeForecast.covariance_trace,
                actorIdColors[actorForecast.actor_id] ?? 0xffffff,
                modeForecast.probability,
              ),
            );
          });
        });
        renderedForecasts = currentForecasts;
      }
      // Forecasts are anchored at replay t=6.2s. Before that instant actors
      // converge on the tube origins; after it they follow the "continue"
      // realization while the full forecast fan stays fixed for comparison.
      const actorPositions = replayActorPositions(t);
      ego.position.set(actorPositions["ego-01"][0], 0.45, actorPositions["ego-01"][1]);
      sedan.position.set(actorPositions["veh-27"][0], 0.4, actorPositions["veh-27"][1]);
      sedan.rotation.y = Math.PI / 2;
      van.visible = mode !== "removed";
      van.position.set(-2.2, 1.18, mode === "shifted" ? 19 : 11);
      van.rotation.y = 0;
      pedestrian.position.set(actorPositions["ped-04"][0], 0, actorPositions["ped-04"][1]);
      pedestrian.rotation.y = Math.PI / 2;
      cyclist.position.set(actorPositions["cyc-09"][0], 0, actorPositions["cyc-09"][1]);
      detectionBoxes.ego.position.copy(ego.position);
      detectionBoxes.sedan.position.copy(sedan.position);
      detectionBoxes.sedan.rotation.copy(sedan.rotation);
      detectionBoxes.van.visible = mode !== "removed";
      detectionBoxes.van.position.copy(van.position);
      detectionBoxes.van.rotation.copy(van.rotation);
      detectionBoxes.pedestrian.position.set(pedestrian.position.x, 0.9, pedestrian.position.z);
      detectionBoxes.cyclist.position.set(cyclist.position.x, 0.9, cyclist.position.z);
      detectionGroup.visible = layerState.detections;
      tracks.visible = layerState.tracks;
      future.visible = layerState.trajectories;
      occupancy.visible = layerState.occupancy;
      occlusion.visible = layerState.occlusion && mode === "present";
      const emergence = 0.35 + Math.min(1, Math.max(0, (t - 4.8) / 2.2)) * 0.65;
      const riskScale = 0.4 + currentRisk.collision_probability * 0.85;
      occupancy.scale.setScalar(riskScale * emergence * (0.97 + Math.sin(elapsed * 2.2) * 0.03));
      occupancy.rotation.y = elapsed * 0.06;
      scan.scale.setScalar(0.84 + ((elapsed * 0.48) % 1) * 0.34);
      scan.material.opacity = 0.52 - ((elapsed * 0.48) % 1) * 0.34;
      scan.position.x = ego.position.x;
      scan.position.z = ego.position.z;
      actorGroup.children.forEach((actor) => {
        const actorId = actor.userData.actorId;
        const isSelected = actorId === selected;
        actor.scale.lerp(new THREE.Vector3(isSelected ? 1.12 : 1, isSelected ? 1.12 : 1, isSelected ? 1.12 : 1), 0.15);
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerup", clickHandler);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      mount.removeChild(renderer.domElement);
    };
  }, [theme]);

  return (
    <div
      className="scene-canvas"
      ref={mountRef}
      role="application"
      tabIndex={0}
      onKeyDown={(event) => {
        const actorIds = ["ego-01", "veh-27", "ped-04", "cyc-09"];
        const index = actorIds.indexOf(selectedActor);
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          onSelectActor(actorIds[(index + 1) % actorIds.length]);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          onSelectActor(actorIds[(index - 1 + actorIds.length) % actorIds.length]);
        }
      }}
      aria-label="Interactive 3D bird’s-eye scenario. Drag to orbit, scroll to zoom, click an actor, or use arrow keys to change the selected actor."
    />
  );
}
