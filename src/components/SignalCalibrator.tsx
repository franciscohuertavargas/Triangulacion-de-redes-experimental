import React, { useState } from 'react';
import {
  Compass,
  Footprints,
  Sliders,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { AnchorBeacon } from '../types';
import { UserCalibrationSettings } from '../utils/storage';

interface SignalCalibratorProps {
  anchors: AnchorBeacon[];
  calibrationSettings: UserCalibrationSettings;
  onSaveCalibration: (settings: UserCalibrationSettings) => void;
  onRequestSensorsPermission: () => Promise<boolean>;
  sensorPermissionGranted: boolean;
  onBatchUpdateAnchors: (updatedAnchors: AnchorBeacon[]) => void;
}

export const SignalCalibrator: React.FC<SignalCalibratorProps> = ({
  anchors,
  calibrationSettings,
  onSaveCalibration,
  onRequestSensorsPermission,
  sensorPermissionGranted,
  onBatchUpdateAnchors,
}) => {
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>(
    anchors[0]?.id || ''
  );
  const [step1Rssi, setStep1Rssi] = useState<number>(-48);
  const [step2Dist, setStep2Dist] = useState<number>(3.0);
  const [step2Rssi, setStep2Rssi] = useState<number>(-62);
  const [computedN, setComputedN] = useState<number | null>(null);
  const [calibratedSuccess, setCalibratedSuccess] = useState<boolean>(false);

  // Settings form
  const [localSettings, setLocalSettings] = useState<UserCalibrationSettings>(calibrationSettings);

  const selectedAnchor = anchors.find((a) => a.id === selectedAnchorId);

  // Calculate empirical n
  const calculateEmpiricalN = () => {
    // n = (TxPower - RSSI) / (10 * log10(d))
    const delta = step1Rssi - step2Rssi;
    const logDist = 10 * Math.log10(step2Dist);
    if (logDist <= 0) return;
    const n = Math.max(1.8, Math.min(4.5, Math.round((delta / logDist) * 10) / 10));
    setComputedN(n);
  };

  const applyCalibrationToAnchor = () => {
    if (!selectedAnchor || computedN === null) return;
    const updated = anchors.map((a) => {
      if (a.id === selectedAnchor.id) {
        return {
          ...a,
          txPower: step1Rssi,
          pathLossExponent: computedN,
        };
      }
      return a;
    });
    onBatchUpdateAnchors(updated);
    setCalibratedSuccess(true);
    setTimeout(() => setCalibratedSuccess(false), 3000);
  };

  const handleSaveGlobal = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCalibration(localSettings);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="border-b border-slate-800 pb-5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Sliders className="h-5 w-5 text-cyan-400" />
          <span>Calibración Empírica de Radio & Sensores</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Ajusta los parámetros físicos del modelo de propagación para obtener máxima precisión en tu edificio real.
        </p>
      </div>

      {/* Sensor Permission Card for Mobile Devices */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Sensores Inerciales del Dispositivo
              </h3>
              <p className="text-xs text-slate-400">
                Brújula magnética (rumbo) y acelerómetro para conteo de pasos (PDR).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {sensorPermissionGranted ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <ShieldCheck className="h-4 w-4" />
                <span>Sensores Conectados</span>
              </div>
            ) : (
              <button
                onClick={onRequestSensorsPermission}
                className="rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
              >
                Activar Sensores Móviles
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guided 2-Step RF Calibration Assistant */}
      <div className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
            <Target className="h-4 w-4" />
            <span>Asistente de Calibración de Baliza (Site Survey)</span>
          </div>
          <select
            value={selectedAnchorId}
            onChange={(e) => setSelectedAnchorId(e.target.value)}
            className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-200 font-mono"
          >
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1 */}
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-mono">
                1
              </span>
              <span>Paso 1: Medición a 1 metro</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sitúate a 1 metro de distancia física de la baliza sin obstáculos intermedios y anota la potencia recibida:
            </p>
            <div className="flex items-center gap-2 pt-1 font-mono text-xs">
              <span className="text-slate-400">Potencia RSSI a 1m:</span>
              <input
                type="number"
                value={step1Rssi}
                onChange={(e) => setStep1Rssi(Number(e.target.value))}
                className="w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-100"
              />
              <span className="text-slate-500">dBm</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3.5 space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-mono">
                2
              </span>
              <span>Paso 2: Medición a distancia</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Aléjate unos metros conocidos (ej. 3m o 4m) en la misma sala e introduce el RSSI observado:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Distancia:</span>
                <input
                  type="number"
                  step="0.5"
                  value={step2Dist}
                  onChange={(e) => setStep2Dist(Number(e.target.value))}
                  className="w-14 rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-slate-100"
                />
                <span className="text-slate-500">m</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">RSSI:</span>
                <input
                  type="number"
                  value={step2Rssi}
                  onChange={(e) => setStep2Rssi(Number(e.target.value))}
                  className="w-16 rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-slate-100"
                />
                <span className="text-slate-500">dBm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button to Compute Exponent */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={calculateEmpiricalN}
            className="w-full sm:w-auto rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors"
          >
            Calcular Exponente Físico (n)
          </button>

          {computedN !== null && (
            <div className="flex items-center gap-3">
              <div className="text-xs font-mono">
                <span className="text-slate-400">Exponente Calculado: </span>
                <strong className="text-cyan-400 font-bold text-sm">n = {computedN}</strong>
              </div>
              <button
                onClick={applyCalibrationToAnchor}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Aplicar a Baliza</span>
              </button>
            </div>
          )}

          {calibratedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">
              ¡Calibración aplicada con éxito!
            </span>
          )}
        </div>
      </div>

      {/* Global RF & Pedestrian Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-4">
          Ajustes Globales de Navegación & Fusión Sensorial
        </h3>

        <form onSubmit={handleSaveGlobal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Longitud Media del Paso (PDR):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.02"
                  min="0.4"
                  max="1.2"
                  value={localSettings.strideLengthMeters}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      strideLengthMeters: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
                <span className="text-xs text-slate-400 font-mono">metros</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Adulto promedio: 0.70m a 0.76m.
              </span>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Exponente de Pérdida por Defecto:
              </label>
              <input
                type="number"
                step="0.1"
                min="1.8"
                max="4.0"
                value={localSettings.defaultPathLossExponent}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    defaultPathLossExponent: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                2.0 (aire libre) a 3.2 (oficina densa).
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={localSettings.useDeadReckoningFusion}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    useDeadReckoningFusion: e.target.checked,
                  })
                }
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
              />
              <span>Fusión Inercial Kalman (combina pasos físicos con trilateración)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={localSettings.rfNoiseSimulated}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    rfNoiseSimulated: e.target.checked,
                  })
                }
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
              />
              <span>Simulación de Desvanecimiento Multitrayecto (Multipath Rayleigh Noise)</span>
            </label>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-colors shadow-sm"
            >
              Guardar Configuración
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
