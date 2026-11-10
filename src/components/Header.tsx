import React, { useState } from 'react';
import {
  Activity,
  Radio,
  Download,
  ShieldCheck,
  Compass,
  HelpCircle,
  Box,
  MapPin,
  Layers,
  Sliders,
  Wand2,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export type AppTab = 'radar' | 'surveyor' | 'three3d' | 'googlemaps' | 'anchors' | 'environment' | 'calibration';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeAnchorsCount: number;
  isTrafficPanelOpen?: boolean;
  onToggleTrafficPanel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeAnchorsCount,
  isTrafficPanelOpen,
  onToggleTrafficPanel,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#080c14]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm">
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono leading-tight">
              Triangula
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Offline & GPS Hybrid</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Desktop */}
        <nav className="hidden md:flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1">
          <button
            onClick={() => setActiveTab('radar')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'radar'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Radar 2D</span>
          </button>

          <button
            onClick={() => setActiveTab('surveyor')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'surveyor'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5 text-cyan-400" />
            <span>Auto-Plano RF</span>
          </button>

          <button
            onClick={() => setActiveTab('three3d')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'three3d'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Box className="h-3.5 w-3.5 text-cyan-400" />
            <span>3D Three.js</span>
          </button>

          <button
            onClick={() => setActiveTab('googlemaps')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'googlemaps'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 text-amber-400" />
            <span>Google Maps</span>
          </button>

          <button
            onClick={() => setActiveTab('anchors')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'anchors'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Señales ({activeAnchorsCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('environment')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'environment'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Plano</span>
          </button>

          <button
            onClick={() => setActiveTab('calibration')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'calibration'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Calibrar</span>
          </button>
        </nav>

        {/* Right Action Zone */}
        <div className="flex items-center gap-2">
          {/* Live RF Traffic Side Panel Button */}
          {onToggleTrafficPanel && (
            <button
              onClick={onToggleTrafficPanel}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-mono font-medium transition-all shadow-sm ${
                isTrafficPanelOpen
                  ? 'border-cyan-500 bg-cyan-950/80 text-cyan-300 ring-1 ring-cyan-500/50'
                  : 'border-slate-800 bg-slate-900/90 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
              title="Abrir panel lateral de tráfico y paquetes RF en tiempo real"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
              <span className="hidden sm:inline">Tráfico RF</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            </button>
          )}

          <button
            onClick={() => setShowHelpModal(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            title="Cómo funciona la triangulación"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* PWA Install Button */}
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 transition-colors shadow-sm shadow-cyan-900/30"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Instalar</span>
            </button>
          )}

          {isIOS && !isInstalled && (
            <button
              onClick={() => setShowIOSModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>iOS</span>
            </button>
          )}

          {isInstalled && (
            <div className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 font-mono">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Offline</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-800/80 bg-slate-900/90 px-1 py-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('radar')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'radar' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Radar 2D</span>
        </button>

        <button
          onClick={() => setActiveTab('surveyor')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'surveyor' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Wand2 className="h-3.5 w-3.5 text-cyan-400" />
          <span>Auto-Plano</span>
        </button>

        <button
          onClick={() => setActiveTab('three3d')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'three3d' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Box className="h-3.5 w-3.5 text-cyan-400" />
          <span>3D Studio</span>
        </button>

        <button
          onClick={() => setActiveTab('googlemaps')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'googlemaps' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <MapPin className="h-3.5 w-3.5 text-amber-400" />
          <span>Maps Real</span>
        </button>

        <button
          onClick={() => setActiveTab('anchors')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'anchors' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          <span>Redes ({activeAnchorsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('environment')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'environment' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Plano</span>
        </button>

        <button
          onClick={() => setActiveTab('calibration')}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'calibration' ? 'text-cyan-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Calibrar</span>
        </button>
      </div>

      {/* iOS Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Instalar en iPhone / iPad</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Para usar esta aplicación 100% desconectado en interiores:
            </p>
            <ol className="mt-3 list-decimal pl-4 text-xs text-slate-400 space-y-1.5">
              <li>Toca el botón <strong>Compartir</strong> en Safari.</li>
              <li>Selecciona <strong>Añadir a la pantalla de inicio</strong>.</li>
              <li>Abre la app desde la pantalla de inicio sin conexión.</li>
            </ol>
            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full rounded-lg bg-cyan-600 py-2 text-xs font-medium text-white hover:bg-cyan-500 transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide font-mono">
                Tecnología de Posicionamiento Interior & Satelital
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="mt-4 space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>Triangula</strong> combina 4 niveles de sensado y visualización para una experiencia integral:
              </p>

              <div className="space-y-2">
                <h4 className="font-semibold text-cyan-300">1. Radar 2D con Mapa de Calor GDOP:</h4>
                <p className="text-slate-400">
                  Visualiza en tiempo real las zonas de alta precisión (verde/cian) frente a zonas ciegas (rojo) según la densidad y dispersión angular de las balizas activas.
                </p>

                <h4 className="font-semibold text-indigo-300">2. Agrupación Cromática por Red Wi-Fi/BLE:</h4>
                <p className="text-slate-400">
                  Los dispositivos y repetidores conectados a una misma red comparten el mismo color distintivo y líneas de enlace de topología.
                </p>

                <h4 className="font-semibold text-emerald-300">3. Escena 3D Procedural con Three.js:</h4>
                <p className="text-slate-400">
                  Un avatar 3D con visor y antena reacciona a tus pasos y giros de brújula con iluminación PBR de estudio y ondas volumétricas.
                </p>

                <h4 className="font-semibold text-amber-300">4. Geolocalización Global en Google Maps:</h4>
                <p className="text-slate-400">
                  Proyecta el plano interior del edificio sobre las coordenadas GPS reales del planeta en vista satelital e híbrida, dibujando la ruta física del usuario.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="mt-6 w-full rounded-lg bg-slate-800 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
