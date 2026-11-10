import React, { useState } from 'react';
import {
  Layers,
  Download,
  Upload,
  Plus,
  Trash2,
  MapPin,
  Check,
  Building,
  Home,
  Boxes,
} from 'lucide-react';
import { Landmark, SpatialMap, WallSegment } from '../types';
import { PRESET_MAPS } from '../utils/storage';

interface EnvironmentManagerProps {
  currentMap: SpatialMap;
  onSelectPreset: (preset: SpatialMap) => void;
  onUpdateMap: (updated: SpatialMap) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
}

export const EnvironmentManager: React.FC<EnvironmentManagerProps> = ({
  currentMap,
  onSelectPreset,
  onUpdateMap,
  onExportJson,
  onImportJson,
}) => {
  const [showAddWall, setShowAddWall] = useState(false);
  const [showAddLandmark, setShowAddLandmark] = useState(false);

  // New wall form state
  const [wallX1, setWallX1] = useState(2);
  const [wallY1, setWallY1] = useState(2);
  const [wallX2, setWallX2] = useState(6);
  const [wallY2, setWallY2] = useState(2);
  const [wallMaterial, setWallMaterial] = useState<'drywall' | 'brick' | 'concrete' | 'glass'>('brick');

  // New landmark state
  const [lmName, setLmName] = useState('');
  const [lmCat, setLmCat] = useState<'entrance' | 'exit' | 'desk' | 'meeting' | 'amenity' | 'custom'>('desk');
  const [lmX, setLmX] = useState(currentMap.widthMeters / 2);
  const [lmY, setLmY] = useState(currentMap.heightMeters / 2);

  const handleCreateWall = (e: React.FormEvent) => {
    e.preventDefault();
    const attenuationMap = {
      glass: 2,
      drywall: 3.5,
      brick: 5.5,
      concrete: 12,
    };

    const newWall: WallSegment = {
      id: `wall-${Date.now()}`,
      x1: Number(wallX1),
      y1: Number(wallY1),
      x2: Number(wallX2),
      y2: Number(wallY2),
      material: wallMaterial,
      attenuationDbm: attenuationMap[wallMaterial],
    };

    onUpdateMap({
      ...currentMap,
      walls: [...currentMap.walls, newWall],
    });
    setShowAddWall(false);
  };

  const handleCreateLandmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lmName.trim()) return;

    const colorMap = {
      entrance: '#10B981',
      exit: '#EF4444',
      desk: '#06B6D4',
      meeting: '#8B5CF6',
      amenity: '#F59E0B',
      custom: '#3B82F6',
    };

    const newLm: Landmark = {
      id: `lm-${Date.now()}`,
      name: lmName.trim(),
      category: lmCat,
      x: Number(lmX),
      y: Number(lmY),
      color: colorMap[lmCat],
    };

    onUpdateMap({
      ...currentMap,
      landmarks: [...currentMap.landmarks, newLm],
    });
    setLmName('');
    setShowAddLandmark(false);
  };

  const handleRemoveWall = (id: string) => {
    onUpdateMap({
      ...currentMap,
      walls: currentMap.walls.filter((w) => w.id !== id),
    });
  };

  const handleRemoveLandmark = (id: string) => {
    onUpdateMap({
      ...currentMap,
      landmarks: currentMap.landmarks.filter((l) => l.id !== id),
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Layers className="h-5 w-5 text-cyan-400" />
            <span>Configuración del Entorno & Plano Arquitectónico</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Define las dimensiones del espacio ({currentMap.widthMeters}m × {currentMap.heightMeters}m), muros y puntos de interés.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            <span>Importar JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <button
            onClick={onExportJson}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Exportar Plano Offline</span>
          </button>
        </div>
      </div>

      {/* Preset Templates */}
      <div>
        <h3 className="text-xs font-mono uppercase text-slate-400 tracking-wider mb-3">
          Plantillas Preconfiguradas:
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRESET_MAPS.map((preset) => {
            const isSelected = currentMap.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-cyan-500/80 bg-cyan-950/30 shadow-lg shadow-cyan-950/20'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-cyan-400">
                    {preset.id === 'preset-home' ? (
                      <Home className="h-4 w-4" />
                    ) : preset.id === 'preset-office' ? (
                      <Building className="h-4 w-4" />
                    ) : (
                      <Boxes className="h-4 w-4" />
                    )}
                    <span className="font-semibold text-xs text-slate-200">{preset.name}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-cyan-400" />}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                  <span>{preset.widthMeters}m × {preset.heightMeters}m</span>
                  <span>·</span>
                  <span>{preset.anchors.length} Balizas</span>
                  <span>·</span>
                  <span>{preset.walls.length} Muros</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Space Geometry Dimensions */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-xs font-semibold text-slate-200 mb-3">
          Dimensiones del Recinto:
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ancho (X) en Metros:</label>
            <input
              type="number"
              min="5"
              max="100"
              value={currentMap.widthMeters}
              onChange={(e) =>
                onUpdateMap({ ...currentMap, widthMeters: Math.max(5, Number(e.target.value)) })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Largo (Y) en Metros:</label>
            <input
              type="number"
              min="5"
              max="100"
              value={currentMap.heightMeters}
              onChange={(e) =>
                onUpdateMap({ ...currentMap, heightMeters: Math.max(5, Number(e.target.value)) })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Paso de Rejilla (Metros):</label>
            <input
              type="number"
              min="0.5"
              max="5"
              step="0.5"
              value={currentMap.gridStepMeters}
              onChange={(e) =>
                onUpdateMap({ ...currentMap, gridStepMeters: Math.max(0.5, Number(e.target.value)) })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Wall Partitions & Material RF Attenuation */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-200">
              Muros y Atenuación de Señal ({currentMap.walls.length}):
            </h3>
            <p className="text-[11px] text-slate-400">
              Cada muro absorbe decibelios (dBm) de las señales de radio al atravesarlo.
            </p>
          </div>
          <button
            onClick={() => setShowAddWall(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-cyan-400" />
            <span>Añadir Muro</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {currentMap.walls.map((wall, index) => (
            <div
              key={wall.id}
              className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs border border-slate-800 font-mono"
            >
              <div>
                <span className="text-slate-300 font-semibold">
                  Muro #{index + 1} ({wall.material})
                </span>
                <div className="text-[10px] text-slate-500">
                  ({wall.x1}m, {wall.y1}m) → ({wall.x2}m, {wall.y2}m) · -{wall.attenuationDbm}dBm
                </div>
              </div>
              <button
                onClick={() => handleRemoveWall(wall.id)}
                className="text-slate-500 hover:text-rose-400 p-1"
                title="Eliminar muro"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Landmarks / Points of Interest */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-200">
              Puntos de Referencia / Destinos ({currentMap.landmarks.length}):
            </h3>
            <p className="text-[11px] text-slate-400">
              Permite seleccionar destinos para obtener rumbo y distancia directa en el radar.
            </p>
          </div>
          <button
            onClick={() => setShowAddLandmark(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            <span>Añadir Destino</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {currentMap.landmarks.map((lm) => (
            <div
              key={lm.id}
              className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 text-xs border border-slate-800 font-mono"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: lm.color || '#10B981' }}
                />
                <div>
                  <div className="text-slate-200 font-medium font-sans">{lm.name}</div>
                  <div className="text-[10px] text-slate-500">
                    ({lm.x}m, {lm.y}m)
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRemoveLandmark(lm.id)}
                className="text-slate-500 hover:text-rose-400 p-1"
                title="Eliminar punto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Add Wall */}
      {showAddWall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100">Añadir Muro Arquitectónico</h3>
            <form onSubmit={handleCreateWall} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <label className="text-slate-400 text-[10px]">Inicio X1 (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={wallX1}
                    onChange={(e) => setWallX1(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px]">Inicio Y1 (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={wallY1}
                    onChange={(e) => setWallY1(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px]">Fin X2 (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={wallX2}
                    onChange={(e) => setWallX2(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px]">Fin Y2 (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={wallY2}
                    onChange={(e) => setWallY2(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-xs block mb-1">Material y Pérdida RF:</label>
                <select
                  value={wallMaterial}
                  onChange={(e) => setWallMaterial(e.target.value as 'drywall' | 'brick' | 'concrete' | 'glass')}
                  className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="glass">Vidrio / Cristal (-2 dBm)</option>
                  <option value="drywall">Pladur / Tabique ligero (-3.5 dBm)</option>
                  <option value="brick">Ladrillo estándar (-5.5 dBm)</option>
                  <option value="concrete">Hormigón armado (-12 dBm)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWall(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  Crear Muro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Landmark */}
      {showAddLandmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100">Añadir Punto de Referencia</h3>
            <form onSubmit={handleCreateLandmark} className="mt-3 space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1">Nombre del Punto:</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Mi Escritorio o Puerta de Salida"
                  value={lmName}
                  onChange={(e) => setLmName(e.target.value)}
                  className="w-full rounded bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 text-xs block mb-1">Categoría:</label>
                <select
                  value={lmCat}
                  onChange={(e) => setLmCat(e.target.value as any)}
                  className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="desk">Puesto de trabajo / Escritorio</option>
                  <option value="meeting">Sala de Reuniones</option>
                  <option value="entrance">Entrada / Recepción</option>
                  <option value="exit">Salida de Emergencia</option>
                  <option value="amenity">Área Común / Cocina</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <label className="text-slate-400 text-[10px]">Posición X (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={lmX}
                    onChange={(e) => setLmX(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px]">Posición Y (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={lmY}
                    onChange={(e) => setLmY(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLandmark(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Guardar Destino
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
