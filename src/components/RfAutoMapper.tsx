import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Wand2,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Radio,
  Footprints,
  Layers,
  Flame,
  AlertTriangle,
  Download,
  Plus,
  Compass,
  Cpu,
  Scan,
  Sparkles,
} from 'lucide-react';
import {
  AnchorBeacon,
  DetectedWall,
  DiscoveredEmitter,
  EstimatedPosition,
  RfSurveyRay,
  SpatialMap,
  WallSegment,
} from '../types';
import { evaluateRfRay, RfTomographyEngine } from '../utils/rfSurveyor';

interface RfAutoMapperProps {
  currentMap: SpatialMap;
  position: EstimatedPosition;
  userHeading: number;
  onApplyGeneratedMap: (newMap: SpatialMap) => void;
  onRequestBLEDevice?: () => void;
  isBLEScanning?: boolean;
}

export const RfAutoMapper: React.FC<RfAutoMapperProps> = ({
  currentMap,
  position,
  userHeading,
  onApplyGeneratedMap,
  onRequestBLEDevice,
  isBLEScanning = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(42);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 30 });

  // Surveying Engine State
  const [isSurveying, setIsSurveying] = useState<boolean>(true);
  const [isAutoPatrolling, setIsAutoPatrolling] = useState<boolean>(false);
  const [surveyUserPos, setSurveyUserPos] = useState<{ x: number; y: number }>({
    x: position.x || currentMap.widthMeters / 2,
    y: position.y || currentMap.heightMeters / 2,
  });

  // Detection threshold (excess loss in dBm to consider a wall obstacle)
  const [lossThresholdDbm, setLossThresholdDbm] = useState<number>(4.2);

  // Emitters in the environment
  const [emitters, setEmitters] = useState<DiscoveredEmitter[]>(() => {
    return currentMap.anchors.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      macOrId: a.macOrId || `DEV-${a.id.slice(-4).toUpperCase()}`,
      frequency: a.frequency || '5GHz',
      currentRssi: a.currentRssi || -60,
      txPower: a.txPower || -48,
      pathLossExponent: a.pathLossExponent || 2.6,
      x: a.x,
      y: a.y,
      isEstimated: false,
      networkName: a.networkName,
      networkColor: a.networkColor || a.color || '#06B6D4',
    }));
  });

  // Tomography engine instance
  const engineRef = useRef<RfTomographyEngine>(
    new RfTomographyEngine(currentMap.widthMeters, currentMap.heightMeters, 0.4)
  );

  const [activeRays, setActiveRays] = useState<RfSurveyRay[]>([]);
  const [detectedWalls, setDetectedWalls] = useState<DetectedWall[]>([]);
  const [totalRayScans, setTotalRayScans] = useState<number>(0);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(Date.now());

  // Auto-fit function
  const fitView = useCallback(() => {
    const el = containerRef.current;
    const w = el?.clientWidth || window.innerWidth || 1000;
    const h = el?.clientHeight || Math.max(300, window.innerHeight - 130);

    const pad = w < 640 ? 20 : 40;
    const sx = (w - pad * 2) / currentMap.widthMeters;
    const sy = (h - pad * 2) / currentMap.heightMeters;
    const fitScale = Math.min(sx, sy);

    setScale(fitScale);
    setPan({
      x: Math.round((w - currentMap.widthMeters * fitScale) / 2),
      y: Math.round((h - currentMap.heightMeters * fitScale) / 2),
    });
  }, [currentMap.widthMeters, currentMap.heightMeters]);

  useEffect(() => {
    fitView();
    const handleResize = () => fitView();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitView]);

  // Coordinate transform helpers
  const toScreen = useCallback(
    (x: number, y: number) => ({
      screenX: pan.x + x * scale,
      screenY: pan.y + y * scale,
    }),
    [pan, scale]
  );

  const toMeters = useCallback(
    (sx: number, sy: number) => ({
      x: Math.max(0.5, Math.min(currentMap.widthMeters - 0.5, (sx - pan.x) / scale)),
      y: Math.max(0.5, Math.min(currentMap.heightMeters - 0.5, (sy - pan.y) / scale)),
    }),
    [pan, scale, currentMap.widthMeters, currentMap.heightMeters]
  );

  /**
   * Conducts an RF scan from current survey location against all known emitters
   */
  const conductRfScan = useCallback(
    (targetX: number, targetY: number) => {
      const engine = engineRef.current;
      const newRays: RfSurveyRay[] = [];

      emitters.forEach((emitter) => {
        // Compute actual received RSSI including ground-truth wall obstacles from currentMap
        const dx = targetX - emitter.x;
        const dy = targetY - emitter.y;
        const dist = Math.max(0.4, Math.hypot(dx, dy));

        let realWallLoss = 0;
        for (const wall of currentMap.walls) {
          // Check if line segment from emitter to user intersects a wall
          const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
            (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
          const intersects =
            ccw(emitter.x, emitter.y, wall.x1, wall.y1, wall.x2, wall.y2) !==
              ccw(targetX, targetY, wall.x1, wall.y1, wall.x2, wall.y2) &&
            ccw(emitter.x, emitter.y, targetX, targetY, wall.x1, wall.y1) !==
              ccw(emitter.x, emitter.y, targetX, targetY, wall.x2, wall.y2);

          if (intersects) {
            realWallLoss += wall.attenuationDbm;
          }
        }

        // Base log-distance RSSI + attenuation + slight random multipath noise
        const baseRssi = emitter.txPower - 10 * emitter.pathLossExponent * Math.log10(dist);
        const noise = (Math.random() - 0.5) * 1.5;
        const measuredRssi = Math.round((baseRssi - realWallLoss + noise) * 10) / 10;

        // Evaluate with Tomography algorithm
        const ray = evaluateRfRay(emitter, targetX, targetY, measuredRssi, lossThresholdDbm);
        newRays.push(ray);
        engine.castRay(ray);
      });

      setActiveRays(newRays);
      setDetectedWalls([...engine.detectedWalls]);
      setTotalRayScans((prev) => prev + newRays.length);
      setLastScanTimestamp(Date.now());
    },
    [emitters, currentMap.walls, lossThresholdDbm]
  );

  // Trigger scan when survey position changes
  useEffect(() => {
    if (isSurveying) {
      conductRfScan(surveyUserPos.x, surveyUserPos.y);
    }
  }, [surveyUserPos.x, surveyUserPos.y, isSurveying, conductRfScan]);

  // Automated Patrol / Walk around the house to reveal the floor plan
  useEffect(() => {
    if (!isAutoPatrolling) return;

    // Waypoints that cover different rooms across the house
    const waypoints = [
      { x: 2.0, y: 2.5 },
      { x: 4.5, y: 2.5 },
      { x: 5.5, y: 4.0 },
      { x: 2.5, y: 7.0 },
      { x: 4.0, y: 8.5 },
      { x: 7.5, y: 7.0 },
      { x: 7.5, y: 3.0 },
      { x: 10.5, y: 2.5 },
      { x: 12.0, y: 3.5 },
      { x: 11.5, y: 7.5 },
      { x: 10.0, y: 8.5 },
      { x: 5.0, y: 5.0 },
    ];

    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % waypoints.length;
      const target = waypoints[currentIdx];
      // Jitter slightly for realistic walk paths
      const jx = target.x + (Math.random() - 0.5) * 0.4;
      const jy = target.y + (Math.random() - 0.5) * 0.4;
      setSurveyUserPos({ x: jx, y: jy });
    }, 1100);

    return () => clearInterval(interval);
  }, [isAutoPatrolling]);

  // Click on canvas to walk and survey
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const m = toMeters(sx, sy);
    setSurveyUserPos(m);
  };

  // Add a newly discovered emitter
  const handleAddNewDiscoveredDevice = () => {
    const newId = `dev-${Date.now()}`;
    const rx = Math.round((2.0 + Math.random() * (currentMap.widthMeters - 4.0)) * 10) / 10;
    const ry = Math.round((2.0 + Math.random() * (currentMap.heightMeters - 4.0)) * 10) / 10;

    const deviceTypes = [
      { name: 'AP Wi-Fi 6 Mesh', type: 'wifi' as const, freq: '5GHz', tx: -46, color: '#06B6D4' },
      { name: 'Repetidor Dual-Band', type: 'wifi' as const, freq: '2.4GHz', tx: -48, color: '#3B82F6' },
      { name: 'Smart TV BLE Gateway', type: 'bluetooth' as const, freq: 'BLE', tx: -58, color: '#8B5CF6' },
      { name: 'Enchufe Inteligente IoT', type: 'wifi' as const, freq: '2.4GHz', tx: -52, color: '#F59E0B' },
      { name: 'Sensor Presencia BLE', type: 'bluetooth' as const, freq: 'BLE', tx: -60, color: '#10B981' },
    ];

    const pick = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
    const newEmitter: DiscoveredEmitter = {
      id: newId,
      name: `${pick.name} #${emitters.length + 1}`,
      type: pick.type,
      macOrId: `${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}`,
      frequency: pick.freq,
      currentRssi: -65,
      txPower: pick.tx,
      pathLossExponent: 2.6,
      x: rx,
      y: ry,
      isEstimated: true,
      networkName: pick.name.split(' ')[0],
      networkColor: pick.color,
    };

    setEmitters((prev) => [...prev, newEmitter]);
    conductRfScan(surveyUserPos.x, surveyUserPos.y);
  };

  // Reset survey session
  const handleResetSurvey = () => {
    engineRef.current.reset(currentMap.widthMeters, currentMap.heightMeters);
    setActiveRays([]);
    setDetectedWalls([]);
    setTotalRayScans(0);
    setIsAutoPatrolling(false);
  };

  // Convert detected walls into full SpatialMap and activate
  const handleApplyToActiveMap = () => {
    const fullPlan = engineRef.current.generateFullFloorPlan('Plano Generado por Levantamiento RF');

    // Create anchor beacons from emitters
    const newAnchors: AnchorBeacon[] = emitters.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      macOrId: e.macOrId,
      frequency: e.frequency as any,
      x: e.x,
      y: e.y,
      txPower: e.txPower,
      pathLossExponent: e.pathLossExponent,
      currentRssi: e.currentRssi,
      lastUpdated: Date.now(),
      isActive: true,
      networkName: e.networkName,
      networkColor: e.networkColor,
      color: e.networkColor,
    }));

    const generatedSpatialMap: SpatialMap = {
      id: `rf-plan-${Date.now()}`,
      name: `Levantamiento RF (${fullPlan.estimatedAreaM2} m²)`,
      description: `Plano arquitectónico generado automáticamente por detección tomográfica de pérdida de señal en paredes (${detectedWalls.length} muros detectados).`,
      widthMeters: currentMap.widthMeters,
      heightMeters: currentMap.heightMeters,
      gridStepMeters: 1,
      anchors: newAnchors,
      walls: fullPlan.walls,
      landmarks: currentMap.landmarks,
      zones: currentMap.zones,
      createdAt: Date.now(),
    };

    onApplyGeneratedMap(generatedSpatialMap);
  };

  const origin = toScreen(0, 0);
  const roomW = currentMap.widthMeters * scale;
  const roomH = currentMap.heightMeters * scale;
  const userScr = toScreen(surveyUserPos.x, surveyUserPos.y);

  // Statistics
  const obstructedRaysCount = activeRays.filter((r) => r.hasObstacle).length;
  const clearRaysCount = activeRays.filter((r) => !r.hasObstacle).length;

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden bg-[#070b13]">
      {/* LEFT: Live Tomographic Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 h-full min-h-[420px] overflow-hidden bg-[#060910] cursor-crosshair select-none"
      >
        {/* Top HUD Banner */}
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-slate-950/90 px-3 py-1.5 shadow-2xl backdrop-blur-md">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
              <Wand2 className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Levantamiento RF & SLAM
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {isSurveying ? 'Mapeando Señales' : 'En Pausa'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {detectedWalls.length} paredes detectadas · {totalRayScans} rayos analizados
              </p>
            </div>
          </div>

          {/* Quick HUD controls */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              onClick={() => setIsAutoPatrolling(!isAutoPatrolling)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono font-medium border shadow-lg transition-colors ${
                isAutoPatrolling
                  ? 'border-amber-500 bg-amber-950/80 text-amber-300'
                  : 'border-slate-700 bg-slate-900/95 text-slate-300 hover:bg-slate-800'
              }`}
              title="Simular recorrido caminando por todas las habitaciones"
            >
              <Footprints className="h-3.5 w-3.5 text-amber-400" />
              <span>{isAutoPatrolling ? 'Detener Paseo' : 'Paseo Auto'}</span>
            </button>

            <button
              onClick={() => setIsSurveying(!isSurveying)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono font-medium border shadow-lg transition-colors ${
                isSurveying
                  ? 'border-emerald-500 bg-emerald-950/80 text-emerald-300'
                  : 'border-slate-700 bg-slate-900/95 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isSurveying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isSurveying ? 'Pausar' : 'Reanudar'}</span>
            </button>

            <button
              onClick={handleResetSurvey}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
              title="Reiniciar levantamiento"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* SVG Live Tomographic Canvas */}
        <svg className="w-full h-full block absolute inset-0" onClick={handleCanvasClick}>
          <defs>
            <radialGradient id="rayHitGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>

            <pattern id="surveyGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(56, 189, 248, 0.04)" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Room Area Bounds */}
          <rect
            x={origin.screenX}
            y={origin.screenY}
            width={roomW}
            height={roomH}
            fill="#090f1d"
            stroke="#1e293b"
            strokeWidth="2"
            rx="4"
          />
          <rect
            x={origin.screenX}
            y={origin.screenY}
            width={roomW}
            height={roomH}
            fill="url(#surveyGrid)"
          />

          {/* 1. Tomographic Ray Beams from Emitters to User */}
          {activeRays.map((ray) => {
            const eScr = toScreen(ray.emitterX, ray.emitterY);
            const isObstacle = ray.hasObstacle;
            const strokeColor = isObstacle ? '#F43F5E' : '#10B981';

            return (
              <g key={ray.id}>
                {/* Ray Beam */}
                <line
                  x1={eScr.screenX}
                  y1={eScr.screenY}
                  x2={userScr.screenX}
                  y2={userScr.screenY}
                  stroke={strokeColor}
                  strokeWidth={isObstacle ? 2.5 : 1.5}
                  strokeDasharray={isObstacle ? '4 3' : undefined}
                  strokeOpacity={isObstacle ? 0.85 : 0.4}
                />

                {/* Wall Piercing Alert Point */}
                {isObstacle && ray.piercePoint && (() => {
                  const pScr = toScreen(ray.piercePoint.x, ray.piercePoint.y);
                  return (
                    <g>
                      <circle cx={pScr.screenX} cy={pScr.screenY} r="7" fill="url(#rayHitGrad)" />
                      <circle cx={pScr.screenX} cy={pScr.screenY} r="3" fill="#F43F5E" />
                    </g>
                  );
                })()}

                {/* Attenuation Drop Tag */}
                {isObstacle && (
                  <text
                    x={(eScr.screenX + userScr.screenX) / 2}
                    y={(eScr.screenY + userScr.screenY) / 2 - 6}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-bold fill-rose-400 drop-shadow pointer-events-none"
                  >
                    -{ray.attenuationDrop} dBm (Pared)
                  </text>
                )}
              </g>
            );
          })}

          {/* 2. Detected & Formed Walls (Live Generated Plan) */}
          {detectedWalls.map((wall) => {
            const p1 = toScreen(wall.x1, wall.y1);
            const p2 = toScreen(wall.x2, wall.y2);

            const matColor =
              wall.material === 'concrete'
                ? '#F59E0B'
                : wall.material === 'brick'
                ? '#38BDF8'
                : wall.material === 'glass'
                ? '#06B6D4'
                : '#94A3B8';

            return (
              <g key={wall.id}>
                {/* Glow Backdrop */}
                <line
                  x1={p1.screenX}
                  y1={p1.screenY}
                  x2={p2.screenX}
                  y2={p2.screenY}
                  stroke={matColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                {/* Core Wall Line */}
                <line
                  x1={p1.screenX}
                  y1={p1.screenY}
                  x2={p2.screenX}
                  y2={p2.screenY}
                  stroke={matColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {/* Wall Info Tag */}
                <text
                  x={(p1.screenX + p2.screenX) / 2}
                  y={(p1.screenY + p2.screenY) / 2 - 8}
                  textAnchor="middle"
                  className="font-mono text-[8px] font-bold fill-white drop-shadow pointer-events-none uppercase"
                >
                  {wall.material} · {wall.confidence}%
                </text>
              </g>
            );
          })}

          {/* 3. Discovered Signal Emitters */}
          {emitters.map((emitter) => {
            const eScr = toScreen(emitter.x, emitter.y);
            const colorHex = emitter.networkColor || '#06B6D4';

            return (
              <g key={emitter.id} className="cursor-pointer">
                {/* RF Radiation Pulse */}
                <circle
                  cx={eScr.screenX}
                  cy={eScr.screenY}
                  r="24"
                  fill="none"
                  stroke={colorHex}
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  className="animate-pulse"
                />

                {/* Node Symbol */}
                <circle cx={eScr.screenX} cy={eScr.screenY} r="12" fill="#0f172a" stroke={colorHex} strokeWidth="2" />
                <circle cx={eScr.screenX} cy={eScr.screenY} r="4" fill={colorHex} />

                {/* Emitter Info */}
                <text
                  x={eScr.screenX}
                  y={eScr.screenY - 16}
                  textAnchor="middle"
                  className="font-mono text-[10px] font-bold fill-slate-100 drop-shadow"
                >
                  {emitter.name}
                </text>
                <text
                  x={eScr.screenX}
                  y={eScr.screenY + 22}
                  textAnchor="middle"
                  className="font-mono text-[8px] font-medium fill-slate-400"
                >
                  {emitter.frequency} · TX: {emitter.txPower} dBm
                </text>
              </g>
            );
          })}

          {/* 4. User Surveyor Position */}
          <g>
            <circle
              cx={userScr.screenX}
              cy={userScr.screenY}
              r="18"
              fill="#06B6D4"
              fillOpacity="0.2"
              className="animate-ping"
            />
            <circle cx={userScr.screenX} cy={userScr.screenY} r="9" fill="#06B6D4" stroke="#FFFFFF" strokeWidth="2.5" />
            <circle cx={userScr.screenX} cy={userScr.screenY} r="3" fill="#FFFFFF" />

            <text
              x={userScr.screenX}
              y={userScr.screenY - 15}
              textAnchor="middle"
              className="font-mono text-[10px] font-bold fill-cyan-300 drop-shadow"
            >
              SONDA ({surveyUserPos.x.toFixed(1)}m, {surveyUserPos.y.toFixed(1)}m)
            </text>
          </g>
        </svg>

        {/* Bottom Floating Legend / Instructions */}
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs font-mono shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Ruta Directa (LOS)</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <span>Pared Detectada (Pérdida RF)</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 text-[10px] hidden sm:inline">
            Toca el plano para mover la sonda y trazar muros
          </span>
        </div>
      </div>

      {/* RIGHT: Survey Telemetry & Map Synthesis Panel */}
      <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-slate-800 bg-[#080d18] p-4 flex flex-col gap-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
              Auto-Mapeo Tomográfico
            </h2>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 font-semibold">
            {detectedWalls.length} Muros
          </span>
        </div>

        {/* Synthesis Primary Action */}
        <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 p-3.5 space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold text-cyan-300 uppercase">
              Plano en Construcción
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">
              {Math.min(98, detectedWalls.length * 20 + 15)}% Completitud
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Cada vez que te desplazas o caminas, la sonda compara la potencia esperada contra la recibida. Si hay una caída brusca de señal, deduce una pared intermedia.
          </p>
          <button
            onClick={handleApplyToActiveMap}
            disabled={detectedWalls.length === 0}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-mono font-bold transition-all shadow-lg ${
              detectedWalls.length > 0
                ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Aplicar y Activar Plano en la App</span>
          </button>
        </div>

        {/* Detection Sensitivity Slider */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between font-mono">
            <span className="text-slate-300 text-[11px] font-semibold">Umbral de Pérdida por Pared</span>
            <span className="text-cyan-400 font-bold">{lossThresholdDbm} dBm</span>
          </div>
          <input
            type="range"
            min="2.5"
            max="10.0"
            step="0.5"
            value={lossThresholdDbm}
            onChange={(e) => {
              setLossThresholdDbm(parseFloat(e.target.value));
              conductRfScan(surveyUserPos.x, surveyUserPos.y);
            }}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-400">
            <span>Alta Sensibilidad (Tabiques)</span>
            <span>Muros de Carga (Hormigón)</span>
          </div>
        </div>

        {/* Live Discovered Emitters List */}
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-slate-300 uppercase">
              Dispositivos Emisores ({emitters.length})
            </span>
            <button
              onClick={handleAddNewDiscoveredDevice}
              className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-0.5 text-[10px] font-mono text-cyan-300 transition-colors border border-cyan-500/30"
              title="Detectar o simular un nuevo emisor cercano"
            >
              <Plus className="h-3 w-3" />
              <span>Nuevo Emisor</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {emitters.map((emitter) => (
              <div
                key={emitter.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: emitter.networkColor || '#06B6D4' }}
                  />
                  <div className="flex flex-col">
                    <span className="font-mono text-[11px] font-medium text-slate-200">
                      {emitter.name}
                    </span>
                    <span className="font-mono text-[9px] text-slate-400">
                      {emitter.type.toUpperCase()} · {emitter.frequency} · ({emitter.x}m, {emitter.y}m)
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[11px] font-semibold text-cyan-400">
                  {emitter.currentRssi} dBm
                </span>
              </div>
            ))}
          </div>

          {onRequestBLEDevice && (
            <button
              onClick={onRequestBLEDevice}
              disabled={isBLEScanning}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 py-2 text-xs font-mono text-slate-300 transition-colors mt-2"
            >
              <Radio className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isBLEScanning ? 'Escaneando Bluetooth...' : 'Escanear Físico BLE'}</span>
            </button>
          )}
        </div>

        {/* Detected Walls Details */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1.5 text-xs">
          <span className="font-mono text-[11px] font-semibold text-slate-300 uppercase block">
            Muros & Estructura Calculada
          </span>
          {detectedWalls.length === 0 ? (
            <p className="text-[10px] text-slate-400 leading-tight">
              Aún no se han detectado muros suficientes. Camina por la casa tocando el plano o activa "Paseo Auto" para que las pérdidas de señal dibujen las paredes.
            </p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {detectedWalls.map((wall, idx) => (
                <div
                  key={wall.id}
                  className="flex items-center justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px] font-mono border border-slate-800/80"
                >
                  <span className="text-slate-300 font-semibold">
                    Pared #{idx + 1} ({wall.material})
                  </span>
                  <span className="text-amber-400 font-bold">-{wall.attenuationDbm} dBm</span>
                  <span className="text-emerald-400">{wall.confidence}% conf.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
