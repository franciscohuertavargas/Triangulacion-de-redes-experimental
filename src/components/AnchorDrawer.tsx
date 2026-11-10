import React, { useState } from 'react';
import {
  Wifi,
  Bluetooth,
  Plus,
  Trash2,
  Sliders,
  Scan,
  RefreshCw,
  AlertCircle,
  Radio,
  Check,
} from 'lucide-react';
import { AnchorBeacon, SignalType } from '../types';
import { rssiToDistance } from '../utils/trilateration';

interface AnchorDrawerProps {
  anchors: AnchorBeacon[];
  onUpdateAnchor: (updated: AnchorBeacon) => void;
  onAddAnchor: (newAnchor: AnchorBeacon) => void;
  onRemoveAnchor: (id: string) => void;
  onRequestBLEDevice: () => Promise<AnchorBeacon | null>;
  isBLEScanning: boolean;
  bleError: string | null;
  mapBounds: { width: number; height: number };
}

export const AnchorDrawer: React.FC<AnchorDrawerProps> = ({
  anchors,
  onUpdateAnchor,
  onAddAnchor,
  onRemoveAnchor,
  onRequestBLEDevice,
  isBLEScanning,
  bleError,
  mapBounds,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnchor, setEditingAnchor] = useState<AnchorBeacon | null>(null);

  // New anchor form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<SignalType>('wifi');
  const [newFreq, setNewFreq] = useState<'2.4GHz' | '5GHz' | 'BLE'>('5GHz');
  const [newX, setNewX] = useState<number>(mapBounds.width / 2);
  const [newY, setNewY] = useState<number>(mapBounds.height / 2);
  const [newTxPower, setNewTxPower] = useState<number>(-50);
  const [newRssi, setNewRssi] = useState<number>(-62);
  const [newN, setNewN] = useState<number>(2.5);

  const handleScanBLE = async () => {
    const bleAnchor = await onRequestBLEDevice();
    if (bleAnchor) {
      onAddAnchor(bleAnchor);
    }
  };

  const handleCreateAnchor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newAnchor: AnchorBeacon = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      type: newType,
      frequency: newType === 'bluetooth' ? 'BLE' : newFreq,
      x: Number(newX),
      y: Number(newY),
      txPower: Number(newTxPower),
      pathLossExponent: Number(newN),
      currentRssi: Number(newRssi),
      lastUpdated: Date.now(),
      isActive: true,
      color: newType === 'wifi' ? '#06B6D4' : '#8B5CF6',
    };

    onAddAnchor(newAnchor);
    setShowAddModal(false);
    // Reset form
    setNewName('');
    setNewRssi(-60);
  };

  // Signal strength bar color & level
  const getSignalStrength = (rssi: number) => {
    if (rssi >= -55) return { label: 'Excelente', pct: 95, color: 'bg-emerald-500' };
    if (rssi >= -68) return { label: 'Buena', pct: 75, color: 'bg-cyan-500' };
    if (rssi >= -80) return { label: 'Aceptable', pct: 45, color: 'bg-amber-500' };
    return { label: 'Débil', pct: 20, color: 'bg-rose-500' };
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-400" />
            <span>Balizas de Señal & Redes Detectadas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Para triangular la posición se requieren al menos 3 señales activas (Wi-Fi o Bluetooth).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleScanBLE}
            disabled={isBLEScanning}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Bluetooth className="h-4 w-4" />
            <span>{isBLEScanning ? 'Buscando...' : 'Escanear Bluetooth Real'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Añadir Red / Baliza</span>
          </button>
        </div>
      </div>

      {/* Bluetooth Error Banner if any */}
      {bleError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{bleError}</span>
        </div>
      )}

      {/* Signal Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {anchors.map((anchor) => {
          const strength = getSignalStrength(anchor.currentRssi);
          const dist = rssiToDistance(anchor.currentRssi, anchor.txPower, anchor.pathLossExponent);

          return (
            <div
              key={anchor.id}
              className={`rounded-xl border p-4 transition-colors ${
                anchor.isActive
                  ? 'border-slate-800 bg-slate-900/60'
                  : 'border-slate-800/50 bg-slate-950/40 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg border"
                    style={{
                      backgroundColor: `${anchor.color || '#06B6D4'}15`,
                      borderColor: `${anchor.color || '#06B6D4'}35`,
                      color: anchor.color || '#06B6D4',
                    }}
                  >
                    {anchor.type === 'wifi' ? (
                      <Wifi className="h-5 w-5" />
                    ) : (
                      <Bluetooth className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      <span>{anchor.name}</span>
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                      <span>{anchor.frequency || anchor.type.toUpperCase()}</span>
                      <span aria-hidden="true">·</span>
                      <span>Pos: ({anchor.x.toFixed(1)}m, {anchor.y.toFixed(1)}m)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingAnchor(anchor)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                    title="Calibrar parámetros de radio"
                  >
                    <Sliders className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onRemoveAnchor(anchor.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                    title="Eliminar baliza"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* RSSI & Distance Telemetry */}
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-950/80 p-2.5 font-mono text-xs border border-slate-800/80">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Potencia RSSI:</span>
                  <div className="text-sm font-bold text-slate-200 tabular-nums">
                    {anchor.currentRssi} <span className="text-[10px] text-slate-400 font-normal">dBm</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Distancia Estimada:</span>
                  <div className="text-sm font-bold text-cyan-400 tabular-nums">
                    {dist.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">metros</span>
                  </div>
                </div>
              </div>

              {/* RSSI Signal Quality Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Calidad de enlace: {strength.label}</span>
                  <span className="tabular-nums">{strength.pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${strength.pct}%` }}
                  />
                </div>
              </div>

              {/* Active Toggle & Fast RSSI Slider */}
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={anchor.isActive}
                    onChange={(e) =>
                      onUpdateAnchor({ ...anchor, isActive: e.target.checked })
                    }
                    className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
                  />
                  <span>Incluir en Triangulación</span>
                </label>

                {/* Quick RSSI simulation scrubber */}
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-[10px] text-slate-400">dBm:</span>
                  <input
                    type="range"
                    min="-95"
                    max="-35"
                    step="1"
                    value={anchor.currentRssi}
                    onChange={(e) =>
                      onUpdateAnchor({
                        ...anchor,
                        currentRssi: Number(e.target.value),
                        lastUpdated: Date.now(),
                      })
                    }
                    className="w-24 accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add New Anchor */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-400" />
              <span>Añadir Nueva Baliza o Red Wi-Fi</span>
            </h3>

            <form onSubmit={handleCreateAnchor} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre de la Red o Dispositivo:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Router Salón 5G o Baliza BLE Sala 2"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tipo de Señal:
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as SignalType)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="wifi">Wi-Fi (AP Router)</option>
                    <option value="bluetooth">Bluetooth (BLE Beacon)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Frecuencia:
                  </label>
                  <select
                    value={newFreq}
                    onChange={(e) => setNewFreq(e.target.value as '2.4GHz' | '5GHz' | 'BLE')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="5GHz">5 GHz</option>
                    <option value="2.4GHz">2.4 GHz</option>
                    <option value="BLE">BLE (Bluetooth Low Energy)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Posición X (metros):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={mapBounds.width}
                    value={newX}
                    onChange={(e) => setNewX(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Posición Y (metros):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={mapBounds.height}
                    value={newY}
                    onChange={(e) => setNewY(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Potencia Tx a 1m (dBm):
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="-80"
                    max="-30"
                    value={newTxPower}
                    onChange={(e) => setNewTxPower(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Wi-Fi: -48, BLE: -59</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    RSSI Actual medido:
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="-95"
                    max="-30"
                    value={newRssi}
                    onChange={(e) => setNewRssi(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
                >
                  Guardar Baliza
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit / Calibrate Existing Anchor */}
      {editingAnchor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              <span>Calibrar Parámetros: {editingAnchor.name}</span>
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Posición X (m):
                  </label>
                  <input
                    type="number"
                    step="0.2"
                    value={editingAnchor.x}
                    onChange={(e) =>
                      setEditingAnchor({ ...editingAnchor, x: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Posición Y (m):
                  </label>
                  <input
                    type="number"
                    step="0.2"
                    value={editingAnchor.y}
                    onChange={(e) =>
                      setEditingAnchor({ ...editingAnchor, y: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Potencia Referencia a 1 metro (TxPower):</span>
                  <span className="font-mono text-cyan-400">{editingAnchor.txPower} dBm</span>
                </div>
                <input
                  type="range"
                  min="-75"
                  max="-35"
                  step="1"
                  value={editingAnchor.txPower}
                  onChange={(e) =>
                    setEditingAnchor({ ...editingAnchor, txPower: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Exponente de Pérdida de Trayectoria (n):</span>
                  <span className="font-mono text-cyan-400">{editingAnchor.pathLossExponent}</span>
                </div>
                <input
                  type="range"
                  min="1.8"
                  max="4.0"
                  step="0.1"
                  value={editingAnchor.pathLossExponent}
                  onChange={(e) =>
                    setEditingAnchor({
                      ...editingAnchor,
                      pathLossExponent: Number(e.target.value),
                    })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>2.0 (Espacio Abierto)</span>
                  <span>2.6 (Oficina/Paredes)</span>
                  <span>3.5 (Hormigón denso)</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingAnchor(null)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAnchor(editingAnchor);
                    setEditingAnchor(null);
                  }}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
                >
                  Aplicar Calibración
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
