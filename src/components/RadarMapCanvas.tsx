import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  MapPin,
  Radio,
  Navigation,
  Crosshair,
  Flame,
  Footprints,
  Scan,
  Wand2,
} from 'lucide-react';
import { AnchorBeacon, BreadcrumbPoint, EstimatedPosition, Landmark, MotionState, SpatialMap } from '../types';
import { generatePrecisionHeatmapDataUrl, rssiToDistance, linesIntersect } from '../utils/trilateration';

interface RadarMapCanvasProps {
  spatialMap: SpatialMap;
  position: EstimatedPosition;
  userHeading: number;
  breadcrumbs: BreadcrumbPoint[];
  targetLandmark: Landmark | null;
  setTargetLandmark: (landmark: Landmark | null) => void;
  motionState: MotionState;
  onUserManualMove?: (x: number, y: number) => void;
  onSimulateStep?: () => void;
  onRotateHeading?: (deltaDeg: number) => void;
  onSelectAnchor?: (anchor: AnchorBeacon) => void;
  onOpenSurveyor?: () => void;
}

export const RadarMapCanvas: React.FC<RadarMapCanvasProps> = ({
  spatialMap,
  position,
  userHeading,
  breadcrumbs,
  targetLandmark,
  setTargetLandmark,
  motionState,
  onUserManualMove,
  onSimulateStep,
  onRotateHeading,
  onSelectAnchor,
  onOpenSurveyor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // View presentation mode: 'fill' (fills entire canvas background edge-to-edge), 'fit' (contains with padding)
  const [viewMode, setViewMode] = useState<'fill' | 'fit'>('fill');

  // Initial scale and pan computed to fill or fit screen immediately on first render
  const [scale, setScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 50;
    const w = window.innerWidth || 1000;
    const h = Math.max(300, (window.innerHeight || 750) - 105);
    const sx = w / spatialMap.widthMeters;
    const sy = h / spatialMap.heightMeters;
    return Math.max(sx, sy); // default to filling background
  });

  const [pan, setPan] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const w = window.innerWidth || 1000;
    const h = Math.max(300, (window.innerHeight || 750) - 105);
    const sx = w / spatialMap.widthMeters;
    const sy = h / spatialMap.heightMeters;
    const initialScale = Math.max(sx, sy);
    return {
      x: Math.round((w - spatialMap.widthMeters * initialScale) / 2),
      y: Math.round((h - spatialMap.heightMeters * initialScale) / 2),
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number }>({
    clientX: 0,
    clientY: 0,
    panX: 0,
    panY: 0,
  });
  const totalDragDistanceRef = useRef<number>(0);

  // Toggle states
  const [showPrecisionHeatmap, setShowPrecisionHeatmap] = useState<boolean>(true);
  const [showRings, setShowRings] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [showNetworkLinks, setShowNetworkLinks] = useState<boolean>(true);
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorBeacon | null>(null);

  /**
   * Fits or fills the map onto the container without clipping or awkward margins
   */
  const fitToView = useCallback(
    (mode: 'fill' | 'fit' = viewMode) => {
      const container = containerRef.current;
      const clientWidth = container?.clientWidth || window.innerWidth || 1000;
      const clientHeight = container?.clientHeight || Math.max(320, window.innerHeight - 105);

      if (clientWidth <= 0 || clientHeight <= 0) return;

      if (mode === 'fill') {
        // FILL BACKGROUND MODE: Expands the floor plan and heatmap to cover 100% of viewport background
        const scaleX = clientWidth / spatialMap.widthMeters;
        const scaleY = clientHeight / spatialMap.heightMeters;
        const fillScale = Math.max(scaleX, scaleY);

        setScale(fillScale);
        const roomPixelW = spatialMap.widthMeters * fillScale;
        const roomPixelH = spatialMap.heightMeters * fillScale;

        setPan({
          x: Math.round((clientWidth - roomPixelW) / 2),
          y: Math.round((clientHeight - roomPixelH) / 2),
        });
      } else {
        // FIT / CONTAIN MODE: Fits the full room inside the screen with comfortable padding
        const padX = clientWidth < 640 ? 16 : 40;
        const padY = clientWidth < 640 ? 20 : 40;

        const availableWidth = Math.max(120, clientWidth - padX * 2);
        const availableHeight = Math.max(120, clientHeight - padY * 2);

        const scaleX = availableWidth / spatialMap.widthMeters;
        const scaleY = availableHeight / spatialMap.heightMeters;
        const fitScale = Math.min(scaleX, scaleY);

        setScale(fitScale);
        const roomPixelW = spatialMap.widthMeters * fitScale;
        const roomPixelH = spatialMap.heightMeters * fitScale;

        setPan({
          x: Math.round((clientWidth - roomPixelW) / 2),
          y: Math.round((clientHeight - roomPixelH) / 2),
        });
      }
    },
    [spatialMap.widthMeters, spatialMap.heightMeters, viewMode]
  );

  /**
   * Centers the viewport directly on the user position
   */
  const centerOnUser = useCallback(() => {
    const container = containerRef.current;
    const clientWidth = container?.clientWidth || window.innerWidth || 1000;
    const clientHeight = container?.clientHeight || Math.max(320, window.innerHeight - 105);

    setPan({
      x: Math.round(clientWidth / 2 - position.x * scale),
      y: Math.round(clientHeight / 2 - position.y * scale),
    });
  }, [position.x, position.y, scale]);

  // Run auto-fit on mount, map change, and container resize
  useEffect(() => {
    fitToView(viewMode);

    // Redo after short delay to handle initial flex layout stabilization
    const rafId = requestAnimationFrame(() => fitToView(viewMode));
    const timer1 = setTimeout(() => fitToView(viewMode), 60);
    const timer2 = setTimeout(() => fitToView(viewMode), 240);

    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      fitToView(viewMode);
    });
    observer.observe(el);

    const handleWindowResize = () => fitToView(viewMode);
    window.addEventListener('resize', handleWindowResize);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [spatialMap.id, spatialMap.widthMeters, spatialMap.heightMeters, fitToView, viewMode]);

  // Convert real-world meter coordinates to screen pixels
  const toScreen = useCallback(
    (x: number, y: number) => {
      return {
        screenX: pan.x + x * scale,
        screenY: pan.y + y * scale,
      };
    },
    [pan, scale]
  );

  // Convert screen coordinates to meters
  const toMeters = useCallback(
    (screenX: number, screenY: number) => {
      const rawX = (screenX - pan.x) / scale;
      const rawY = (screenY - pan.y) / scale;
      return {
        x: Math.max(0, Math.min(spatialMap.widthMeters, Math.round(rawX * 10) / 10)),
        y: Math.max(0, Math.min(spatialMap.heightMeters, Math.round(rawY * 10) / 10)),
      };
    },
    [pan, scale, spatialMap.widthMeters, spatialMap.heightMeters]
  );

  // Pointer events for universal Mouse & Touch Dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    setIsDragging(true);
    totalDragDistanceRef.current = 0;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.clientX;
    const deltaY = e.clientY - dragStartRef.current.clientY;
    totalDragDistanceRef.current += Math.hypot(deltaX, deltaY);

    setPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Mouse wheel zoom centered at pointer position
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomMultiplier = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prevScale) => {
      const nextScale = Math.max(10, Math.min(220, prevScale * zoomMultiplier));
      const ratio = nextScale / prevScale;
      setPan((prevPan) => ({
        x: Math.round(mouseX - (mouseX - prevPan.x) * ratio),
        y: Math.round(mouseY - (mouseY - prevPan.y) * ratio),
      }));
      return nextScale;
    });
  };

  // Zoom button handler
  const handleZoom = (deltaFactor: number) => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const centerX = clientWidth / 2;
    const centerY = clientHeight / 2;

    setScale((prevScale) => {
      const nextScale = Math.max(10, Math.min(220, prevScale * deltaFactor));
      const ratio = nextScale / prevScale;
      setPan((prevPan) => ({
        x: Math.round(centerX - (centerX - prevPan.x) * ratio),
        y: Math.round(centerY - (centerY - prevPan.y) * ratio),
      }));
      return nextScale;
    });
  };

  // Click on map to relocate or walk user
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (totalDragDistanceRef.current > 6) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const meters = toMeters(clickX, clickY);

    if (onUserManualMove) {
      onUserManualMove(meters.x, meters.y);
    }
  };

  // User position on screen
  const userScreen = toScreen(position.x, position.y);
  const accuracyScreenRadius = Math.max(12, position.accuracyRadius * scale);

  // Generate 2D Precision Heatmap (GDOP + Active Anchor Density)
  const precisionHeatmapUrl = useMemo(() => {
    return generatePrecisionHeatmapDataUrl(
      spatialMap.anchors,
      spatialMap.widthMeters,
      spatialMap.heightMeters,
      80,
      60
    );
  }, [spatialMap.anchors, spatialMap.widthMeters, spatialMap.heightMeters]);

  // Group Anchors by Network to render connecting topology links
  const networkTopologyLinks = useMemo(() => {
    const netGroups = new Map<string, AnchorBeacon[]>();
    for (const a of spatialMap.anchors) {
      if (!a.isActive) continue;
      const key = a.networkId || a.networkName || a.type;
      if (!netGroups.has(key)) netGroups.set(key, []);
      netGroups.get(key)!.push(a);
    }

    const links: { a1: AnchorBeacon; a2: AnchorBeacon; color: string; netName: string }[] = [];
    for (const [_, nodes] of netGroups.entries()) {
      if (nodes.length > 1) {
        for (let i = 0; i < nodes.length - 1; i++) {
          links.push({
            a1: nodes[i],
            a2: nodes[i + 1],
            color: nodes[i].networkColor || nodes[i].color || '#06B6D4',
            netName: nodes[i].networkName || 'Misma Red',
          });
        }
      }
    }
    return links;
  }, [spatialMap.anchors]);

  // Metric grid lines
  const gridLines = useMemo(() => {
    const lines = [];
    const step = spatialMap.gridStepMeters;
    // Vertical lines
    for (let x = 0; x <= spatialMap.widthMeters; x += step) {
      const p1 = toScreen(x, 0);
      const p2 = toScreen(x, spatialMap.heightMeters);
      const isMajor = x % 5 === 0;
      lines.push(
        <g key={`vx-${x}`}>
          <line
            x1={p1.screenX}
            y1={p1.screenY}
            x2={p2.screenX}
            y2={p2.screenY}
            stroke={isMajor ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.1)'}
            strokeWidth={isMajor ? 1.5 : 1}
            strokeDasharray={isMajor ? undefined : '3 3'}
          />
          {isMajor && (
            <text
              x={p1.screenX}
              y={p1.screenY - 8}
              textAnchor="middle"
              className="font-mono text-[10px] font-semibold fill-cyan-400 select-none"
            >
              {x}m
            </text>
          )}
        </g>
      );
    }

    // Horizontal lines
    for (let y = 0; y <= spatialMap.heightMeters; y += step) {
      const p1 = toScreen(0, y);
      const p2 = toScreen(spatialMap.widthMeters, y);
      const isMajor = y % 5 === 0;
      lines.push(
        <g key={`hy-${y}`}>
          <line
            x1={p1.screenX}
            y1={p1.screenY}
            x2={p2.screenX}
            y2={p2.screenY}
            stroke={isMajor ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.1)'}
            strokeWidth={isMajor ? 1.5 : 1}
            strokeDasharray={isMajor ? undefined : '3 3'}
          />
          {isMajor && (
            <text
              x={p1.screenX - 8}
              y={p1.screenY + 3.5}
              textAnchor="end"
              className="font-mono text-[10px] font-semibold fill-cyan-400 select-none"
            >
              {y}m
            </text>
          )}
        </g>
      );
    }
    return lines;
  }, [spatialMap.widthMeters, spatialMap.heightMeters, spatialMap.gridStepMeters, toScreen]);

  // Target navigation vector
  const navigationVector = useMemo(() => {
    if (!targetLandmark) return null;
    const targetScreen = toScreen(targetLandmark.x, targetLandmark.y);
    const dx = targetLandmark.x - position.x;
    const dy = targetLandmark.y - position.y;
    const distanceMeters = Math.hypot(dx, dy);
    // Bearing angle relative to North
    const bearingRad = Math.atan2(dx, -dy);
    const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;

    return {
      targetScreen,
      distanceMeters,
      bearingDeg,
    };
  }, [targetLandmark, position.x, position.y, toScreen]);

  const origin = toScreen(0, 0);
  const roomWidth = spatialMap.widthMeters * scale;
  const roomHeight = spatialMap.heightMeters * scale;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full min-h-0 overflow-hidden bg-[#070b13] select-none touch-none cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Infinite Blueprint Radar Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.1) 0%, transparent 70%), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      {/* Top Center Controls Ribbon */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-md">
        <span className="px-2 font-mono text-xs font-semibold text-slate-200 whitespace-nowrap">
          {spatialMap.name} ({spatialMap.widthMeters}m × {spatialMap.heightMeters}m)
        </span>
        <div className="h-4 w-px bg-slate-700 mx-0.5" />

        {/* View Mode: Llenar Fondo (Full Background) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setViewMode('fill');
            fitToView('fill');
          }}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
            viewMode === 'fill'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Extender el mapa a todo el fondo de la pantalla"
        >
          <Scan className="h-3.5 w-3.5" />
          <span>Llenar Fondo</span>
        </button>

        {/* View Mode: Ajustar Plano (Contain with margin) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setViewMode('fit');
            fitToView('fit');
          }}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
            viewMode === 'fit'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Ajustar y centrar plano con márgenes"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span>Ajustar Vista</span>
        </button>

        {/* Center on User */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            centerOnUser();
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Centrar vista en mi posición actual"
        >
          <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Centrar en Mí</span>
        </button>

        {/* Auto-Mapear RF Shortcut */}
        {onOpenSurveyor && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSurveyor();
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono font-semibold bg-gradient-to-r from-cyan-600/30 to-indigo-600/30 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/40 transition-colors shadow-sm"
            title="Abrir herramienta de Auto-Levantamiento de planos por pérdida de señal"
          >
            <Wand2 className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
            <span className="hidden sm:inline">Auto-Mapear RF</span>
          </button>
        )}
      </div>

      {/* Main Vector SVG Canvas */}
      <svg
        className="w-full h-full block absolute inset-0"
        onClick={handleCanvasClick}
      >
        <defs>
          {/* Flashlight View Cone Gradient */}
          <radialGradient id="viewConeGrad" cx="0%" cy="50%" r="100%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#06B6D4" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
          </radialGradient>

          {/* User Ripple Filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Ambient Blueprint Grid Pattern */}
          <pattern id="blueprintGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(56, 189, 248, 0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* 1. Outer Room Floor Surface & Background */}
        <g>
          {/* Base Floor with Architectural Blueprint Pattern */}
          <rect
            x={origin.screenX}
            y={origin.screenY}
            width={roomWidth}
            height={roomHeight}
            fill="#0c1322"
            stroke="#1e293b"
            strokeWidth="3"
            rx="4"
          />
          <rect
            x={origin.screenX}
            y={origin.screenY}
            width={roomWidth}
            height={roomHeight}
            fill="url(#blueprintGrid)"
          />

          {/* 2. Architectural Room Zones (Salón, Cocina, Pasillos, etc.) */}
          {spatialMap.zones?.map((zone) => {
            const zOrigin = toScreen(zone.x, zone.y);
            const zW = zone.width * scale;
            const zH = zone.height * scale;

            return (
              <g key={zone.id}>
                <rect
                  x={zOrigin.screenX}
                  y={zOrigin.screenY}
                  width={zW}
                  height={zH}
                  fill={zone.color || 'rgba(6, 182, 212, 0.05)'}
                  stroke="rgba(56, 189, 248, 0.15)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  rx="3"
                />
                <text
                  x={zOrigin.screenX + zW / 2}
                  y={zOrigin.screenY + zH / 2}
                  textAnchor="middle"
                  className="font-mono text-[11px] font-semibold fill-slate-400/70 select-none uppercase tracking-wider pointer-events-none"
                >
                  {zone.name}
                </text>
              </g>
            );
          })}

          {/* 3. GDOP Precision Heatmap Overlay Image */}
          {showPrecisionHeatmap && precisionHeatmapUrl && (
            <image
              href={precisionHeatmapUrl}
              x={origin.screenX}
              y={origin.screenY}
              width={roomWidth}
              height={roomHeight}
              preserveAspectRatio="none"
              opacity="0.65"
              style={{ mixBlendMode: 'screen' }}
            />
          )}

          {/* Glowing Room Corner L-Brackets */}
          <path
            d={`M ${origin.screenX} ${origin.screenY + 28} L ${origin.screenX} ${origin.screenY} L ${origin.screenX + 28} ${origin.screenY}`}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="3.5"
          />
          <path
            d={`M ${origin.screenX + roomWidth - 28} ${origin.screenY} L ${origin.screenX + roomWidth} ${origin.screenY} L ${origin.screenX + roomWidth} ${origin.screenY + 28}`}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="3.5"
          />
          <path
            d={`M ${origin.screenX} ${origin.screenY + roomHeight - 28} L ${origin.screenX} ${origin.screenY + roomHeight} L ${origin.screenX + 28} ${origin.screenY + roomHeight}`}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="3.5"
          />
          <path
            d={`M ${origin.screenX + roomWidth - 28} ${origin.screenY + roomHeight} L ${origin.screenX + roomWidth} ${origin.screenY + roomHeight} L ${origin.screenX + roomWidth} ${origin.screenY + roomHeight - 28}`}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="3.5"
          />

          {/* Exterior Room Dimension Callouts */}
          <text
            x={origin.screenX + roomWidth / 2}
            y={origin.screenY - 10}
            textAnchor="middle"
            className="font-mono text-xs font-bold fill-cyan-400 select-none drop-shadow"
          >
            ← {spatialMap.widthMeters} m →
          </text>
          <text
            x={origin.screenX - 12}
            y={origin.screenY + roomHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${origin.screenX - 12} ${origin.screenY + roomHeight / 2})`}
            className="font-mono text-xs font-bold fill-cyan-400 select-none drop-shadow"
          >
            ← {spatialMap.heightMeters} m →
          </text>
        </g>

        {/* 4. Metric Grid Lines */}
        {gridLines}

        {/* 5. Network Topology Links (Connecting anchors on same network) */}
        {showNetworkLinks &&
          networkTopologyLinks.map((link, idx) => {
            const p1 = toScreen(link.a1.x, link.a1.y);
            const p2 = toScreen(link.a2.x, link.a2.y);
            return (
              <g key={`net-link-${idx}`}>
                <line
                  x1={p1.screenX}
                  y1={p1.screenY}
                  x2={p2.screenX}
                  y2={p2.screenY}
                  stroke={link.color}
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  strokeOpacity="0.8"
                />
                <circle cx={(p1.screenX + p2.screenX) / 2} cy={(p1.screenY + p2.screenY) / 2} r="3" fill={link.color} />
              </g>
            );
          })}

        {/* 6. Walls and Partitions */}
        {spatialMap.walls.map((wall) => {
          const p1 = toScreen(wall.x1, wall.y1);
          const p2 = toScreen(wall.x2, wall.y2);
          const isGlass = wall.material === 'glass';
          const isDrywall = wall.material === 'drywall';

          return (
            <g key={wall.id}>
              {/* Wall Shadow / Base */}
              <line
                x1={p1.screenX}
                y1={p1.screenY}
                x2={p2.screenX}
                y2={p2.screenY}
                stroke="#030712"
                strokeWidth={isGlass ? 5 : 8}
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* Wall Surface Line */}
              <line
                x1={p1.screenX}
                y1={p1.screenY}
                x2={p2.screenX}
                y2={p2.screenY}
                stroke={isGlass ? '#38bdf8' : isDrywall ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={isGlass ? 2.5 : 5}
                strokeDasharray={isGlass ? '6 3' : undefined}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* 7. Range Rings */}
        {showRings &&
          spatialMap.anchors
            .filter((a) => a.isActive)
            .map((anchor) => {
              const scr = toScreen(anchor.x, anchor.y);
              const colorHex = anchor.networkColor || anchor.color || '#06B6D4';
              const estimatedDistMeters = rssiToDistance(
                anchor.currentRssi,
                anchor.txPower,
                anchor.pathLossExponent
              );
              const radiusPixels = estimatedDistMeters * scale;

              const hasWallInterference = spatialMap.walls.some((w) =>
                linesIntersect(anchor.x, anchor.y, position.x, position.y, w.x1, w.y1, w.x2, w.y2)
              );

              return (
                <g key={`ring-${anchor.id}`}>
                  <circle
                    cx={scr.screenX}
                    cy={scr.screenY}
                    r={radiusPixels}
                    fill="none"
                    stroke={hasWallInterference ? '#F43F5E' : colorHex}
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    strokeOpacity={hasWallInterference ? 0.75 : 0.55}
                  />
                  <line
                    x1={scr.screenX}
                    y1={scr.screenY}
                    x2={userScreen.screenX}
                    y2={userScreen.screenY}
                    stroke={hasWallInterference ? '#F43F5E' : colorHex}
                    strokeWidth={hasWallInterference ? 2 : 1.2}
                    strokeDasharray={hasWallInterference ? '4 2' : '2 4'}
                    strokeOpacity={hasWallInterference ? 0.85 : 0.35}
                  />
                  {hasWallInterference && (
                    <text
                      x={(scr.screenX + userScreen.screenX) / 2}
                      y={(scr.screenY + userScreen.screenY) / 2 - 4}
                      textAnchor="middle"
                      className="font-mono text-[8px] font-bold fill-rose-400 pointer-events-none drop-shadow"
                    >
                      Pérdida Pared
                    </text>
                  )}
                </g>
              );
            })}

        {/* 8. Landmarks */}
        {showLandmarks &&
          spatialMap.landmarks.map((lm) => {
            const scr = toScreen(lm.x, lm.y);
            const isSelected = targetLandmark?.id === lm.id;

            return (
              <g
                key={lm.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setTargetLandmark(isSelected ? null : lm);
                }}
              >
                {isSelected && (
                  <circle
                    cx={scr.screenX}
                    cy={scr.screenY}
                    r="20"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    className="animate-spin origin-center"
                  />
                )}
                <rect
                  x={scr.screenX - 11}
                  y={scr.screenY - 11}
                  width="22"
                  height="22"
                  rx="6"
                  fill={lm.color || '#10B981'}
                  fillOpacity="0.25"
                  stroke={lm.color || '#10B981'}
                  strokeWidth="2"
                />
                <circle cx={scr.screenX} cy={scr.screenY} r="3.5" fill={lm.color || '#10B981'} />
                <text
                  x={scr.screenX}
                  y={scr.screenY + 20}
                  textAnchor="middle"
                  className="font-mono text-[10px] font-semibold fill-slate-200 drop-shadow"
                >
                  {lm.name}
                </text>
              </g>
            );
          })}

        {/* 9. Breadcrumbs Trail */}
        {breadcrumbs.length > 1 && (
          <path
            d={breadcrumbs
              .map((pt, idx) => {
                const s = toScreen(pt.x, pt.y);
                return `${idx === 0 ? 'M' : 'L'} ${s.screenX} ${s.screenY}`;
              })
              .join(' ')}
            fill="none"
            stroke="#06B6D4"
            strokeWidth="3"
            strokeDasharray="3 3"
            strokeOpacity="0.7"
          />
        )}

        {/* 10. Target Destination Vector */}
        {navigationVector && (
          <line
            x1={userScreen.screenX}
            y1={userScreen.screenY}
            x2={navigationVector.targetScreen.screenX}
            y2={navigationVector.targetScreen.screenY}
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeDasharray="6 3"
            strokeOpacity="0.9"
          />
        )}

        {/* 11. Anchor Nodes with Network Color Grouping */}
        {spatialMap.anchors.map((anchor) => {
          const scr = toScreen(anchor.x, anchor.y);
          const colorHex = anchor.networkColor || anchor.color || '#06B6D4';
          const isHovered = hoveredAnchor?.id === anchor.id;

          return (
            <g
              key={anchor.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredAnchor(anchor)}
              onMouseLeave={() => setHoveredAnchor(null)}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectAnchor) onSelectAnchor(anchor);
              }}
            >
              {anchor.isActive && (
                <circle
                  cx={scr.screenX}
                  cy={scr.screenY}
                  r={isHovered ? 24 : 18}
                  fill="none"
                  stroke={colorHex}
                  strokeWidth="1.5"
                  strokeOpacity={isHovered ? '0.9' : '0.45'}
                />
              )}

              {/* Node Badge */}
              <circle
                cx={scr.screenX}
                cy={scr.screenY}
                r="13"
                fill="#0f172a"
                stroke={anchor.isActive ? colorHex : '#475569'}
                strokeWidth="2.5"
              />

              <circle
                cx={scr.screenX}
                cy={scr.screenY}
                r="4.5"
                fill={anchor.isActive ? colorHex : '#475569'}
              />

              {/* Anchor Name & Network Tag */}
              <text
                x={scr.screenX}
                y={scr.screenY - 18}
                textAnchor="middle"
                className="font-mono text-[11px] font-bold fill-slate-100 pointer-events-none drop-shadow-md"
              >
                {anchor.name}
              </text>
              {anchor.networkName && (
                <text
                  x={scr.screenX}
                  y={scr.screenY + 20}
                  textAnchor="middle"
                  className="font-mono text-[9px] font-semibold pointer-events-none drop-shadow-md"
                  fill={colorHex}
                >
                  [{anchor.networkName}]
                </text>
              )}
              <text
                x={scr.screenX}
                y={scr.screenY + 32}
                textAnchor="middle"
                className="font-mono text-[9px] font-medium fill-slate-300 pointer-events-none drop-shadow-md"
              >
                {anchor.currentRssi} dBm · {rssiToDistance(anchor.currentRssi, anchor.txPower, anchor.pathLossExponent).toFixed(1)}m
              </text>
            </g>
          );
        })}

        {/* 12. USER POSITION & REAL-TIME MOTION MARKER */}
        <g>
          {/* Accuracy Margin Circle */}
          <circle
            cx={userScreen.screenX}
            cy={userScreen.screenY}
            r={accuracyScreenRadius}
            fill="#06B6D4"
            fillOpacity={motionState.isMoving ? '0.18' : '0.09'}
            stroke="#06B6D4"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeOpacity="0.65"
          />

          {/* Real-time Dynamic Motion Ring (Active when moving) */}
          {motionState.isMoving && (
            <circle
              cx={userScreen.screenX}
              cy={userScreen.screenY}
              r={accuracyScreenRadius + 6}
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeDasharray="8 6"
              className="animate-spin origin-center"
            />
          )}

          {/* Compass Vision Cone */}
          {(() => {
            const coneAngle = 55;
            const coneDist = Math.max(45, 2.0 * scale);
            const headingRad = ((userHeading - 90) * Math.PI) / 180;
            const leftRad = headingRad - (coneAngle / 2 * Math.PI) / 180;
            const rightRad = headingRad + (coneAngle / 2 * Math.PI) / 180;

            const x1 = userScreen.screenX;
            const y1 = userScreen.screenY;
            const x2 = x1 + coneDist * Math.cos(leftRad);
            const y2 = y1 + coneDist * Math.sin(leftRad);
            const x3 = x1 + coneDist * Math.cos(rightRad);
            const y3 = y1 + coneDist * Math.sin(rightRad);

            return (
              <path
                d={`M ${x1} ${y1} L ${x2} ${y2} A ${coneDist} ${coneDist} 0 0 1 ${x3} ${y3} Z`}
                fill="url(#viewConeGrad)"
                pointerEvents="none"
              />
            );
          })()}

          {/* Heading Direction Arrow */}
          {(() => {
            const rad = ((userHeading - 90) * Math.PI) / 180;
            const needleLen = 26;
            const nx = userScreen.screenX + needleLen * Math.cos(rad);
            const ny = userScreen.screenY + needleLen * Math.sin(rad);

            return (
              <line
                x1={userScreen.screenX}
                y1={userScreen.screenY}
                x2={nx}
                y2={ny}
                stroke={motionState.isMoving ? '#10B981' : '#06B6D4'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            );
          })()}

          {/* Pulsing Core */}
          <circle
            cx={userScreen.screenX}
            cy={userScreen.screenY}
            r="14"
            fill={motionState.isMoving ? '#10B981' : '#06B6D4'}
            fillOpacity="0.3"
            className="animate-ping"
          />
          <circle
            cx={userScreen.screenX}
            cy={userScreen.screenY}
            r="8.5"
            fill={motionState.isMoving ? '#10B981' : '#06B6D4'}
            stroke="#FFFFFF"
            strokeWidth="2.5"
            filter="url(#glow)"
          />
          <circle cx={userScreen.screenX} cy={userScreen.screenY} r="3" fill="#FFFFFF" />

          {/* User Coordinates & Live Speed */}
          <text
            x={userScreen.screenX}
            y={userScreen.screenY - 18}
            textAnchor="middle"
            className="font-mono text-[11px] font-bold fill-cyan-300 drop-shadow-lg select-none pointer-events-none"
          >
            TÚ ({position.x.toFixed(1)}m, {position.y.toFixed(1)}m)
            {motionState.isMoving && ` · ${motionState.speedMps} m/s`}
          </text>
        </g>
      </svg>

      {/* Floating Canvas Controls (Top Right) */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-20">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoom(1.25);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/95 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
          title="Acercar (Zoom In)"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoom(0.8);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/95 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            fitToView('fill');
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors shadow-lg ${
            viewMode === 'fill'
              ? 'border-cyan-500 bg-cyan-950 text-cyan-300'
              : 'border-slate-700 bg-slate-900/95 text-slate-300 hover:bg-slate-800'
          }`}
          title="Llenar todo el fondo de pantalla"
        >
          <Scan className="h-4 w-4" />
        </button>
        <div className="h-px bg-slate-800 my-0.5" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPrecisionHeatmap(!showPrecisionHeatmap);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors shadow-lg ${
            showPrecisionHeatmap
              ? 'border-emerald-500 bg-emerald-950 text-emerald-300'
              : 'border-slate-700 bg-slate-900/95 text-slate-400 hover:text-slate-200'
          }`}
          title="Alternar Mapa de Calor de Precisión (GDOP & Densidad)"
        >
          <Flame className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowNetworkLinks(!showNetworkLinks);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors shadow-lg ${
            showNetworkLinks
              ? 'border-cyan-500 bg-cyan-950 text-cyan-300'
              : 'border-slate-700 bg-slate-900/95 text-slate-400 hover:text-slate-200'
          }`}
          title="Alternar Topología de Redes (Misma Red = Mismo Color)"
        >
          <Layers className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowRings(!showRings);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors shadow-lg ${
            showRings
              ? 'border-cyan-500 bg-cyan-950 text-cyan-300'
              : 'border-slate-700 bg-slate-900/95 text-slate-400 hover:text-slate-200'
          }`}
          title="Alternar Círculos de Distancia"
        >
          <Radio className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLandmarks(!showLandmarks);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors shadow-lg ${
            showLandmarks
              ? 'border-cyan-500 bg-cyan-950 text-cyan-300'
              : 'border-slate-700 bg-slate-900/95 text-slate-400 hover:text-slate-200'
          }`}
          title="Alternar Puntos de Interés"
        >
          <MapPin className="h-4 w-4" />
        </button>
      </div>

      {/* GDOP Precision Heatmap Legend (Top Right below controls) */}
      {showPrecisionHeatmap && (
        <div className="absolute top-44 right-3 z-20 rounded-lg border border-slate-800 bg-slate-950/90 p-2 text-[10px] font-mono shadow-2xl backdrop-blur-md space-y-1">
          <div className="font-semibold text-slate-300 uppercase text-[9px] flex items-center gap-1">
            <Flame className="h-3 w-3 text-cyan-400" />
            <span>Precisión Estimada</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Alta (±0.8m · ≥4 balizas)</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>Media (±2.0m · 3 balizas)</span>
          </div>
          <div className="flex items-center gap-1.5 text-orange-400">
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            <span>Baja (±4.0m · 2 balizas)</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>Zona Ciega (&lt;2 balizas)</span>
          </div>
        </div>
      )}

      {/* Floating Instructions & Walk Controls (Bottom Left) */}
      <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-2 max-w-[280px] sm:max-w-xs">
        <div className="rounded-lg border border-slate-800 bg-slate-950/90 backdrop-blur-md p-2.5 text-[11px] text-slate-300 shadow-2xl space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase">
            <span className="text-cyan-400">Control & Detección de Movimiento</span>
            <span className={motionState.isMoving ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {motionState.isMoving ? '● Moviéndose' : '○ Quieto'}
            </span>
          </div>
          <p className="text-slate-400 text-[10px] leading-tight">
            Arrastra el plano para moverte libremente. Toca en cualquier punto para caminar hacia allí y recalcular el mapa de calor.
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            {onSimulateStep && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSimulateStep();
                }}
                className="flex-1 flex items-center justify-center gap-1 rounded bg-slate-800 hover:bg-slate-700 py-1 text-[10px] font-mono font-medium text-slate-100 transition-colors"
              >
                <Footprints className="h-3.5 w-3.5 text-emerald-400" />
                <span>+1 Paso</span>
              </button>
            )}
            {onRotateHeading && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotateHeading(-30);
                  }}
                  className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-mono text-slate-200 transition-colors"
                  title="Girar 30° Izquierda"
                >
                  ↺ -30°
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotateHeading(30);
                  }}
                  className="rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-mono text-slate-200 transition-colors"
                  title="Girar 30° Derecha"
                >
                  ↻ +30°
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Target Landmark Alert (Bottom Right) */}
      {navigationVector && targetLandmark && (
        <div className="absolute bottom-3 right-3 z-20 rounded-lg border border-amber-500/40 bg-slate-950/95 backdrop-blur-md p-3 text-xs shadow-2xl flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Navigation
              className="h-4 w-4 transition-transform duration-300"
              style={{
                transform: `rotate(${navigationVector.bearingDeg - userHeading}deg)`,
              }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono text-amber-400 font-semibold">
              Destino Seleccionado
            </span>
            <span className="font-semibold text-slate-100">{targetLandmark.name}</span>
            <span className="font-mono text-[11px] text-slate-300 tabular-nums">
              Distancia: <strong className="text-amber-300">{navigationVector.distanceMeters.toFixed(1)} m</strong> · Rumbo: {navigationVector.bearingDeg.toFixed(0)}°
            </span>
          </div>
          <button
            onClick={() => setTargetLandmark(null)}
            className="ml-2 text-slate-400 hover:text-slate-200 text-sm font-bold"
            title="Cancelar destino"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
