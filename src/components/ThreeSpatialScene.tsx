import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Maximize2,
  Eye,
  Layers,
  Compass,
  Radio,
  Footprints,
  RotateCcw,
} from 'lucide-react';
import { AnchorBeacon, BreadcrumbPoint, EstimatedPosition, Landmark, MotionState, SpatialMap } from '../types';

interface ThreeSpatialSceneProps {
  spatialMap: SpatialMap;
  position: EstimatedPosition;
  userHeading: number;
  breadcrumbs: BreadcrumbPoint[];
  targetLandmark: Landmark | null;
  motionState: MotionState;
  onUserManualMove?: (x: number, y: number) => void;
  onSimulateStep?: () => void;
}

export const ThreeSpatialScene: React.FC<ThreeSpatialSceneProps> = ({
  spatialMap,
  position,
  userHeading,
  breadcrumbs,
  targetLandmark,
  motionState,
  onUserManualMove,
  onSimulateStep,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [cameraMode, setCameraMode] = useState<'isometric' | 'topDown' | 'follow'>('isometric');
  const [showWaves, setShowWaves] = useState<boolean>(true);
  const [showWalls, setShowWalls] = useState<boolean>(true);

  // References to keep Three.js scene objects across renders without rebuilding WebGL context
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const userAvatarGroupRef = useRef<THREE.Group | null>(null);
  const breadcrumbLineRef = useRef<THREE.Line | null>(null);
  const targetMarkerRef = useRef<THREE.Group | null>(null);
  const anchorGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const waveMeshesRef = useRef<THREE.Mesh[]>([]);
  const wallsGroupRef = useRef<THREE.Group | null>(null);

  // Orbit drag state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const sphericalRef = useRef({ radius: 24, theta: Math.PI / 4, phi: Math.PI / 3 });
  const targetLookAtRef = useRef(new THREE.Vector3(spatialMap.widthMeters / 2, 0, spatialMap.heightMeters / 2));

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    // 1. Scene & Background
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#070b13');
    scene.fog = new THREE.FogExp2('#070b13', 0.025);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 150);
    cameraRef.current = camera;
    camera.position.set(spatialMap.widthMeters / 2 + 12, 16, spatialMap.heightMeters / 2 + 14);
    camera.lookAt(targetLookAtRef.current);

    // 3. Renderer with ACES Filmic Tone Mapping
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 4. Procedural Studio Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight('#38bdf8', '#0f172a', 0.65);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fff7ed', 1.4);
    dirLight.position.set(spatialMap.widthMeters + 5, 20, spatialMap.heightMeters + 8);
    dirLight.castShadow = !isSoftwareGl;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -spatialMap.widthMeters;
    dirLight.shadow.camera.right = spatialMap.widthMeters;
    dirLight.shadow.camera.top = spatialMap.heightMeters;
    dirLight.shadow.camera.bottom = -spatialMap.heightMeters;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // 6. Floor & Metric Grid
    const floorGeo = new THREE.PlaneGeometry(spatialMap.widthMeters, spatialMap.heightMeters);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0b1120',
      roughness: 0.75,
      metalness: 0.15,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(spatialMap.widthMeters / 2, 0, spatialMap.heightMeters / 2);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Subtle Grid on Floor
    const gridHelper = new THREE.GridHelper(
      Math.max(spatialMap.widthMeters, spatialMap.heightMeters),
      Math.max(spatialMap.widthMeters, spatialMap.heightMeters),
      '#06B6D4',
      '#1e293b'
    );
    gridHelper.position.set(spatialMap.widthMeters / 2, 0.01, spatialMap.heightMeters / 2);
    scene.add(gridHelper);

    // 7. Architectural Walls (Extruded 3D Partitions)
    const wallsGroup = new THREE.Group();
    wallsGroupRef.current = wallsGroup;
    scene.add(wallsGroup);

    const wallHeight = 2.4;
    for (const wall of spatialMap.walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      const isGlass = wall.material === 'glass';
      const wallGeo = new THREE.BoxGeometry(length, wallHeight, isGlass ? 0.08 : 0.22);
      const wallMat = new THREE.MeshStandardMaterial({
        color: isGlass ? '#38bdf8' : wall.material === 'drywall' ? '#94a3b8' : '#cbd5e1',
        transparent: isGlass,
        opacity: isGlass ? 0.45 : 0.95,
        roughness: isGlass ? 0.1 : 0.8,
        metalness: isGlass ? 0.9 : 0.1,
      });

      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(
        (wall.x1 + wall.x2) / 2,
        wallHeight / 2,
        (wall.y1 + wall.y2) / 2
      );
      wallMesh.rotation.y = -angle;
      wallMesh.castShadow = !isSoftwareGl;
      wallMesh.receiveShadow = true;
      wallsGroup.add(wallMesh);
    }

    // 8. Composite 5-Part User Surveyor Avatar
    const avatarGroup = new THREE.Group();
    userAvatarGroupRef.current = avatarGroup;

    // Part 1: Contact shadow plane directly beneath avatar
    const shadowGeo = new THREE.CircleGeometry(0.7, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.015;
    avatarGroup.add(shadowMesh);

    // Part 2: Body / Torso
    const torsoGeo = new THREE.CylinderGeometry(0.28, 0.35, 0.9, 16);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.5,
      metalness: 0.6,
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.position.y = 0.6;
    torsoMesh.castShadow = true;
    avatarGroup.add(torsoMesh);

    // Part 3: Visor / Head with Emissive Glow
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.2,
      metalness: 0.8,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.25;
    headMesh.castShadow = true;
    avatarGroup.add(headMesh);

    // Part 4: Emissive Visor Screen
    const visorGeo = new THREE.BoxGeometry(0.26, 0.12, 0.15);
    const visorMat = new THREE.MeshBasicMaterial({
      color: '#06B6D4',
    });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 1.25, 0.18);
    avatarGroup.add(visorMesh);

    // Part 5: Directional Forward Radar Needle / Torch
    const needleGeo = new THREE.ConeGeometry(0.12, 0.6, 12);
    needleGeo.rotateX(Math.PI / 2);
    const needleMat = new THREE.MeshBasicMaterial({ color: '#06B6D4' });
    const needleMesh = new THREE.Mesh(needleGeo, needleMat);
    needleMesh.position.set(0, 0.7, 0.7);
    avatarGroup.add(needleMesh);

    // Uncertainty Accuracy Ring on Ground
    const accGeo = new THREE.RingGeometry(0.9, 1.05, 32);
    const accMat = new THREE.MeshBasicMaterial({
      color: '#06B6D4',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const accMesh = new THREE.Mesh(accGeo, accMat);
    accMesh.rotation.x = -Math.PI / 2;
    accMesh.position.y = 0.02;
    avatarGroup.add(accMesh);

    avatarGroup.position.set(position.x, 0, position.y);
    scene.add(avatarGroup);

    // 9. Composite Anchor Models (Wi-Fi AP & BLE Beacons)
    const anchorMap = new Map<string, THREE.Group>();
    anchorGroupsRef.current = anchorMap;
    waveMeshesRef.current = [];

    for (const anchor of spatialMap.anchors) {
      const ancGroup = new THREE.Group();
      ancGroup.position.set(anchor.x, 0, anchor.y);

      const colorHex = anchor.networkColor || anchor.color || '#06B6D4';

      // Base Puck / Chassis
      const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.18, 16);
      const baseMat = new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.7,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.09;
      ancGroup.add(baseMesh);

      // Antenna or Beacon Dome
      if (anchor.type === 'wifi') {
        // Dual Antennas
        const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
        const antMat = new THREE.MeshStandardMaterial({ color: '#475569' });
        const ant1 = new THREE.Mesh(antGeo, antMat);
        ant1.position.set(-0.15, 0.45, 0);
        ant1.rotation.z = 0.2;
        const ant2 = new THREE.Mesh(antGeo, antMat);
        ant2.position.set(0.15, 0.45, 0);
        ant2.rotation.z = -0.2;
        ancGroup.add(ant1);
        ancGroup.add(ant2);
      } else {
        // BLE Glowing Dome
        const domeGeo = new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        domeMesh.position.y = 0.18;
        ancGroup.add(domeMesh);
      }

      // Emissive Indicator Ring
      const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.1;
      ancGroup.add(ringMesh);

      // Volumetric Signal Propagation Sphere (Wave)
      const waveGeo = new THREE.SphereGeometry(3.0, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const waveMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      const waveMesh = new THREE.Mesh(waveGeo, waveMat);
      waveMesh.position.y = 0.05;
      waveMeshesRef.current.push(waveMesh);
      ancGroup.add(waveMesh);

      scene.add(ancGroup);
      anchorMap.set(anchor.id, ancGroup);
    }

    // 10. Animation Loop with Exponential Damping
    let frameId = 0;
    const clock = new THREE.Clock();

    const tick = () => {
      const dt = clock.getDelta();

      // Update User Position & Heading smoothly
      if (userAvatarGroupRef.current) {
        userAvatarGroupRef.current.position.x += (position.x - userAvatarGroupRef.current.position.x) * 0.15;
        userAvatarGroupRef.current.position.z += (position.y - userAvatarGroupRef.current.position.z) * 0.15;

        // Heading rotation (in Three.js, rotation around Y)
        const targetRotY = -((userHeading - 90) * Math.PI) / 180;
        userAvatarGroupRef.current.rotation.y = THREE.MathUtils.damp(
          userAvatarGroupRef.current.rotation.y,
          targetRotY,
          8,
          dt
        );
      }

      // Camera Follow / Orbit behavior
      if (cameraRef.current) {
        if (cameraMode === 'follow' && userAvatarGroupRef.current) {
          const userPos = userAvatarGroupRef.current.position;
          const offsetDist = 9;
          const offsetHeight = 6;
          const headingRad = -((userHeading - 90) * Math.PI) / 180;

          const targetCamX = userPos.x - offsetDist * Math.sin(headingRad);
          const targetCamZ = userPos.z - offsetDist * Math.cos(headingRad);

          cameraRef.current.position.x = THREE.MathUtils.damp(cameraRef.current.position.x, targetCamX, 4, dt);
          cameraRef.current.position.y = THREE.MathUtils.damp(cameraRef.current.position.y, offsetHeight, 4, dt);
          cameraRef.current.position.z = THREE.MathUtils.damp(cameraRef.current.position.z, targetCamZ, 4, dt);
          cameraRef.current.lookAt(userPos.x, 1, userPos.z);
        } else if (cameraMode === 'topDown') {
          const targetX = spatialMap.widthMeters / 2;
          const targetZ = spatialMap.heightMeters / 2;
          cameraRef.current.position.x = THREE.MathUtils.damp(cameraRef.current.position.x, targetX, 5, dt);
          cameraRef.current.position.y = THREE.MathUtils.damp(cameraRef.current.position.y, 22, 5, dt);
          cameraRef.current.position.z = THREE.MathUtils.damp(cameraRef.current.position.z, targetZ + 0.01, 5, dt);
          cameraRef.current.lookAt(targetX, 0, targetZ);
        }
      }

      // Pulse waves animation
      for (const w of waveMeshesRef.current) {
        w.scale.x = 1 + 0.08 * Math.sin(clock.getElapsedTime() * 2.5);
        w.scale.z = w.scale.x;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    // Resize Observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [spatialMap.id]);

  // Toggle waves visibility
  useEffect(() => {
    for (const w of waveMeshesRef.current) {
      w.visible = showWaves;
    }
  }, [showWaves]);

  // Toggle walls visibility
  useEffect(() => {
    if (wallsGroupRef.current) {
      wallsGroupRef.current.visible = showWalls;
    }
  }, [showWalls]);

  // Orbit controls pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cameraMode === 'follow') return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || cameraMode === 'follow' || !cameraRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    sphericalRef.current.theta -= dx * 0.008;
    sphericalRef.current.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, sphericalRef.current.phi - dy * 0.008));

    const s = sphericalRef.current;
    const look = targetLookAtRef.current;
    cameraRef.current.position.set(
      look.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta),
      look.y + s.radius * Math.cos(s.phi),
      look.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta)
    );
    cameraRef.current.lookAt(look);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (cameraMode === 'follow' || !cameraRef.current) return;
    sphericalRef.current.radius = Math.max(8, Math.min(45, sphericalRef.current.radius + e.deltaY * 0.02));
    const s = sphericalRef.current;
    const look = targetLookAtRef.current;
    cameraRef.current.position.set(
      look.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta),
      look.y + s.radius * Math.cos(s.phi),
      look.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta)
    );
    cameraRef.current.lookAt(look);
  };

  return (
    <div
      className="relative flex-1 w-full min-h-[460px] h-[calc(100vh-130px)] sm:h-[calc(100vh-115px)] overflow-hidden bg-[#070b13] select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Center Status Pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 shadow-xl backdrop-blur-md">
        <span className="font-mono text-xs font-semibold text-cyan-400">3D Three.js Studio</span>
        <span className="text-slate-600 font-mono">·</span>
        <span className="font-mono text-xs text-slate-300">
          {motionState.isMoving ? (
            <span className="text-emerald-400 font-bold">🚶 En Movimiento ({motionState.speedMps} m/s)</span>
          ) : (
            <span className="text-slate-400">🧍 Estacionario</span>
          )}
        </span>
      </div>

      {/* Unified Bottom Control Dock (<= 15% viewport footprint) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-2">
          {/* Camera Presets */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCameraMode('isometric')}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                cameraMode === 'isometric'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Isométrica
            </button>
            <button
              onClick={() => setCameraMode('topDown')}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                cameraMode === 'topDown'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Cenital
            </button>
            <button
              onClick={() => setCameraMode('follow')}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                cameraMode === 'follow'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Seguimiento 3D
            </button>
          </div>

          {/* Layer toggles */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowWalls(!showWalls)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                showWalls
                  ? 'border-cyan-500 bg-cyan-950/80 text-cyan-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
              title="Alternar Muros 3D"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowWaves(!showWaves)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                showWaves
                  ? 'border-cyan-500 bg-cyan-950/80 text-cyan-300'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
              title="Alternar Ondas RF 3D"
            >
              <Radio className="h-3.5 w-3.5" />
            </button>
            {onSimulateStep && (
              <button
                onClick={onSimulateStep}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-xs font-mono font-semibold transition-colors"
                title="Avanzar un paso"
              >
                <Footprints className="h-3.5 w-3.5" />
                <span>+1 Paso</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
