import React from 'react';
import { Compass, Footprints, ShieldCheck, Activity } from 'lucide-react';
import { EstimatedPosition, SensorTelemetry } from '../types';

interface TelemetryBarProps {
  position: EstimatedPosition;
  telemetry: SensorTelemetry;
  activeAnchorsCount: number;
  totalAnchorsCount: number;
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  position,
  telemetry,
  activeAnchorsCount,
  totalAnchorsCount,
}) => {
  const headingDegrees = telemetry.compassHeading ?? 0;
  
  // Compass direction label
  const getCardinal = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const cardinal = getCardinal(headingDegrees);

  return (
    <div className="border-b border-slate-800 bg-[#0a0f1c] px-4 py-2 text-xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-2 gap-x-4">
        {/* Metric 1: Local Coordinates (X, Y) */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase text-slate-400">Coordenadas:</span>
          <div className="flex items-center gap-2 font-mono font-bold text-slate-100 tabular-nums">
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">
              X: <span className="text-cyan-400">{position.x.toFixed(2)}</span> m
            </span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">
              Y: <span className="text-cyan-400">{position.y.toFixed(2)}</span> m
            </span>
          </div>
        </div>

        {/* Metric 2: Estimated Accuracy & Confidence */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase text-slate-400">Margen Error:</span>
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className={`font-semibold ${position.accuracyRadius <= 1.5 ? 'text-emerald-400' : position.accuracyRadius <= 3.0 ? 'text-amber-400' : 'text-rose-400'}`}>
              ±{position.accuracyRadius.toFixed(1)} m
            </span>
            <span className="text-slate-400 text-[10px]">
              ({position.confidence}% conf.)
            </span>
          </div>
        </div>

        {/* Metric 3: Compass Heading */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Compass
              className="h-3.5 w-3.5 text-cyan-400 transition-transform duration-300"
              style={{ transform: `rotate(${headingDegrees}deg)` }}
            />
            <span className="text-[11px] font-mono uppercase text-slate-400">Rumbo:</span>
          </div>
          <span className="font-mono font-bold text-slate-100 tabular-nums">
            {headingDegrees.toString().padStart(3, '0')}° {cardinal}
          </span>
        </div>

        {/* Metric 4: Steps & Inertial Pedometry */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-slate-400">
            <Footprints className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono uppercase">Pasos:</span>
          </div>
          <span className="font-mono font-bold text-slate-100 tabular-nums">
            {telemetry.stepCount}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            (~{(telemetry.stepCount * telemetry.strideLength).toFixed(1)} m)
          </span>
        </div>

        {/* Metric 5: Active Radio Anchors (Triangulation Geometry) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-slate-400">
            <Activity className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-mono uppercase">Señales:</span>
          </div>
          <span className="font-mono font-semibold tabular-nums text-slate-200">
            {activeAnchorsCount}/{totalAnchorsCount}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            {activeAnchorsCount >= 3 ? (
              <span className="text-emerald-400">● 3D Fix</span>
            ) : activeAnchorsCount === 2 ? (
              <span className="text-amber-400">▲ 2D Fix</span>
            ) : (
              <span className="text-rose-400">✖ 1D Prox</span>
            )}
          </span>
        </div>

        {/* Metric 6: Real-time Motion Detection */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-semibold border ${
            telemetry.motionState.isMoving
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <span>{telemetry.motionState.isMoving ? '🚶' : '🧍'}</span>
            <span>
              {telemetry.motionState.isMoving
                ? `${telemetry.motionState.motionType === 'running' ? 'Corriendo' : 'Caminando'} · ${telemetry.motionState.speedMps} m/s`
                : 'Estacionario'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
