import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Activity,
  X,
  Play,
  Pause,
  Trash2,
  Download,
  Filter,
  Wifi,
  Bluetooth,
  Radio,
  Cpu,
  Layers,
  Shield,
  ChevronDown,
  ChevronRight,
  Terminal,
  BarChart2,
  Maximize2,
  Minimize2,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDown,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AnchorBeacon, DeviceTrafficStats, RfTrafficPacket } from '../types';
import { generatePacketForDevice, updateDeviceStats } from '../utils/packetGenerator';

interface TrafficSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  devices: AnchorBeacon[];
}

export const TrafficSidePanel: React.FC<TrafficSidePanelProps> = ({
  isOpen,
  onClose,
  devices,
}) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'devices' | 'spectrum'>('stream');
  const [isCapturing, setIsCapturing] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Packets stream
  const [packets, setPackets] = useState<RfTrafficPacket[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all'); // 'all' | 'wifi' | 'bluetooth'
  const [filterDirection, setFilterDirection] = useState<'all' | 'TX' | 'RX'>('all');

  // Expanded packet hex inspection
  const [inspectedPacketId, setInspectedPacketId] = useState<string | null>(null);

  // Device telemetry stats
  const [deviceStats, setDeviceStats] = useState<Map<string, DeviceTrafficStats>>(new Map());

  // SCROLLBAR & USER SCROLL INTENT STATE
  // If the user scrolls up, we lock scrolling position so they can browse freely while scanning continues!
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);
  const [unreadNewPacketsCount, setUnreadNewPacketsCount] = useState<number>(0);

  // 1-SECOND REAL-TIME PACKET GENERATION & BACKGROUND SCANNING
  useEffect(() => {
    if (!isCapturing || devices.length === 0) return;

    const interval = setInterval(() => {
      const activeDevices = devices.filter((d) => d.isActive);
      if (activeDevices.length === 0) return;

      // Generate a packet for each active device every second
      const newBatch: RfTrafficPacket[] = activeDevices.map((dev, idx) =>
        generatePacketForDevice(dev, idx)
      );

      setPackets((prev) => {
        const next = [...prev, ...newBatch];
        // Keep up to 300 packets for extended scrolling
        return next.slice(-300);
      });

      // Update aggregate device stats
      setDeviceStats((prev) => updateDeviceStats(prev, newBatch, activeDevices));

      // If user is scrolled up reading earlier packets, increment unread counter
      if (isUserScrolledUp) {
        setUnreadNewPacketsCount((prev) => prev + newBatch.length);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isCapturing, devices, isUserScrolledUp]);

  // Handle User Scroll in the Stream Container
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Calculate distance from bottom
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    // If within 40px of bottom, user is at the bottom -> resume auto-scroll
    if (distanceFromBottom < 40) {
      if (isUserScrolledUp) {
        setIsUserScrolledUp(false);
        setUnreadNewPacketsCount(0);
      }
    } else {
      // User scrolled up to inspect previous packets -> freeze auto-scroll
      if (!isUserScrolledUp) {
        setIsUserScrolledUp(true);
      }
    }
  };

  // Auto-scroll only when user is at the bottom
  useEffect(() => {
    if (!isUserScrolledUp && activeTab === 'stream' && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [packets, isUserScrolledUp, activeTab]);

  // Scroll to bottom manually
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setIsUserScrolledUp(false);
      setUnreadNewPacketsCount(0);
    }
  };

  // Filtered packets
  const filteredPackets = useMemo(() => {
    return packets.filter((p) => {
      if (selectedDeviceId !== 'all' && p.deviceId !== selectedDeviceId) return false;
      if (filterType !== 'all' && p.signalType !== filterType) return false;
      if (filterDirection !== 'all' && p.direction !== filterDirection) return false;
      return true;
    });
  }, [packets, selectedDeviceId, filterType, filterDirection]);

  // Metrics
  const currentPps = isCapturing ? devices.filter((d) => d.isActive).length : 0;
  const totalBytes = useMemo(() => {
    return packets.reduce((acc, p) => acc + p.frameSizeBytes, 0);
  }, [packets]);

  // Export Packet Capture Log (JSON)
  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(packets, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `captura_trafico_rf_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <aside
      className={`fixed top-14 bottom-0 right-0 z-40 flex flex-col border-l border-slate-800 bg-[#070c16]/98 backdrop-blur-xl shadow-2xl transition-all duration-300 ${
        isExpanded ? 'w-full md:w-[720px]' : 'w-full sm:w-[480px] md:w-[540px]'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800/90 px-3.5 py-2.5 bg-slate-950/80">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Activity className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
                Tráfico RF & Paquetes
              </span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                {currentPps} pkt/s
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              Escaneo en segundo plano activo · {(totalBytes / 1024).toFixed(1)} KB capturados
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCapturing(!isCapturing)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isCapturing
                ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
            }`}
            title={isCapturing ? 'Pausar escaneo' : 'Reanudar escaneo en segundo plano'}
          >
            {isCapturing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => {
              setPackets([]);
              setUnreadNewPacketsCount(0);
            }}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            title="Limpiar captura"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleExportJson}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Descargar registro de paquetes JSON"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden sm:block"
            title={isExpanded ? 'Contraer panel' : 'Expandir panel ancho'}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Cerrar panel lateral"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs font-mono">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('stream')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
              activeTab === 'stream'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3 w-3" />
            <span>Paquetes TX/RX ({filteredPackets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
              activeTab === 'devices'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3 w-3" />
            <span>Dispositivos ({devices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('spectrum')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
              activeTab === 'spectrum'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="h-3 w-3" />
            <span>Canales RF</span>
          </button>
        </div>

        {/* Scroll status pill */}
        {activeTab === 'stream' && (
          <span className="text-[10px] text-slate-400">
            {isUserScrolledUp ? (
              <span className="text-amber-400 font-semibold">Desplazamiento libre activo</span>
            ) : (
              <span className="text-emerald-400">Auto-scroll activo</span>
            )}
          </span>
        )}
      </div>

      {/* 3. Filtering Toolbar (Direction TX/RX & Device Filters) */}
      {activeTab === 'stream' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-900/40 px-3 py-1.5 text-xs font-mono">
          {/* Direction Filter: TX (Enviados) vs RX (Recibidos) */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 uppercase">Flujo:</span>
            <button
              onClick={() => setFilterDirection('all')}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                filterDirection === 'all'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterDirection('TX')}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                filterDirection === 'TX'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:bg-emerald-950/50'
              }`}
              title="Mostrar solo paquetes enviados (TX)"
            >
              <ArrowUpRight className="h-2.5 w-2.5" />
              <span>TX Enviados</span>
            </button>
            <button
              onClick={() => setFilterDirection('RX')}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                filterDirection === 'RX'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-amber-400 hover:bg-amber-950/50'
              }`}
              title="Mostrar solo paquetes recibidos (RX)"
            >
              <ArrowDownLeft className="h-2.5 w-2.5" />
              <span>RX Recibidos</span>
            </button>
          </div>

          {/* Device & Protocol filters */}
          <div className="flex items-center gap-2">
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-cyan-500 max-w-[130px] truncate"
            >
              <option value="all">Todos los dispositivos</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  filterType === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterType('wifi')}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  filterType === 'wifi' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Wi-Fi
              </button>
              <button
                onClick={() => setFilterType('bluetooth')}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  filterType === 'bluetooth' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                BLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN SCROLLABLE STREAM AREA */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {activeTab === 'stream' && (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-full w-full overflow-y-auto p-3 space-y-2 select-text"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#334155 #0b1120',
            }}
          >
            {filteredPackets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 text-xs space-y-2">
                <Terminal className="h-8 w-8 text-slate-600 animate-pulse" />
                <p>Capturando paquetes enviados y recibidos en segundo plano...</p>
                <p className="text-[10px] text-slate-400">
                  Las emisiones de cada dispositivo aparecerán aquí a cada segundo.
                </p>
              </div>
            ) : (
              filteredPackets.map((pkt) => {
                const isInspected = inspectedPacketId === pkt.id;
                const isBle = pkt.signalType === 'bluetooth';
                const isTx = pkt.direction === 'TX';

                return (
                  <div
                    key={pkt.id}
                    onClick={() => setInspectedPacketId(isInspected ? null : pkt.id)}
                    className={`rounded-xl border p-2.5 text-xs transition-all cursor-pointer font-mono ${
                      isInspected
                        ? 'border-cyan-500 bg-slate-900 shadow-lg'
                        : isTx
                        ? 'border-emerald-500/20 bg-slate-950/80 hover:border-emerald-500/50 hover:bg-slate-900/60'
                        : 'border-amber-500/20 bg-slate-950/80 hover:border-amber-500/50 hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Top Row: Direction Pill, Timestamp, Protocol Level, Signal */}
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* TX vs RX Direction Badge */}
                        <span
                          className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            isTx
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isTx ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}
                          <span>{isTx ? 'TX ENVIADO' : 'RX RECIBIDO'}</span>
                        </span>

                        <span className="text-[10px] text-slate-400">
                          {pkt.timestampStr}
                        </span>

                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                            isBle
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {isBle ? 'BLE' : 'Wi-Fi'}
                        </span>
                      </div>

                      {/* RSSI & Frame Bytes */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-bold text-[10px] ${
                            pkt.rssi >= -65
                              ? 'text-emerald-400'
                              : pkt.rssi >= -80
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {pkt.rssi} dBm
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {pkt.frameSizeBytes} B
                        </span>
                        {isInspected ? (
                          <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Source -> Destination Trajectory Row */}
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-300">
                      <span className="text-slate-400 text-[10px]">De:</span>
                      <strong className="text-slate-100 truncate max-w-[140px] sm:max-w-[180px]">
                        {pkt.sourceName}
                      </strong>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-400 text-[10px]">Para:</span>
                      <strong className="text-slate-100 truncate max-w-[140px] sm:max-w-[180px]">
                        {pkt.destinationName}
                      </strong>
                    </div>

                    {/* RELEVANT OPERATIONAL INFORMATION (Highlighted in Clear Language) */}
                    <div className="mt-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80 px-2 py-1.5 text-[11px] text-cyan-200 leading-snug">
                      <span className="text-cyan-400 font-bold mr-1.5">● Info:</span>
                      {pkt.relevantData}
                    </div>

                    {/* Protocol & Technical Summary */}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span className="text-slate-400 font-medium">{pkt.packetTypeLabel}</span>
                      <span>{pkt.channel}</span>
                    </div>

                    {/* Expandable Hex Dump & Deep Technical Fields */}
                    {isInspected && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-2 text-[10px]">
                        <div className="grid grid-cols-2 gap-2 text-slate-300 bg-slate-950 p-2 rounded border border-slate-800">
                          <div>
                            <span className="text-slate-400 block text-[9px]">MAC ORIGEN</span>
                            <span className="text-cyan-300 font-bold">{pkt.sourceMac}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">MAC DESTINO</span>
                            <span className="text-cyan-300 font-bold">{pkt.destinationMac}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">FABRICANTE (VENDOR)</span>
                            <span className="text-slate-200">{pkt.vendor}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">SEGURIDAD / CIFRADO</span>
                            <span className="text-slate-200">{pkt.security}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[9px] uppercase font-bold block mb-0.5">
                            Volcado Hexadecimal de Trama (Payload Hex Sample):
                          </span>
                          <div className="bg-black/90 rounded p-2 text-[10px] text-emerald-400 font-mono tracking-wider break-all border border-emerald-950 select-all">
                            {pkt.rawHexSample}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* FLOATING PILL: Shown when user scrolls up to easily jump back to live packets */}
        {activeTab === 'stream' && isUserScrolledUp && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-2 rounded-full border border-cyan-500 bg-cyan-950/95 px-3.5 py-1.5 text-xs font-mono font-bold text-cyan-300 shadow-2xl backdrop-blur-md hover:bg-cyan-900 transition-all cursor-pointer animate-bounce"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span>
                {unreadNewPacketsCount > 0 ? `${unreadNewPacketsCount} nuevos paquetes · ` : ''}Ir al final en vivo
              </span>
            </button>
          </div>
        )}

        {/* TAB 2: DETECTED EMITTING DEVICES PROFILES */}
        {activeTab === 'devices' && (
          <div
            className="h-full w-full overflow-y-auto p-3 space-y-3 font-mono"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#334155 #0b1120',
            }}
          >
            {devices.map((device) => {
              const stats = deviceStats.get(device.id);
              const color = device.networkColor || device.color || '#06B6D4';
              const isBle = device.type === 'bluetooth';

              return (
                <div
                  key={device.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-3 shadow-xl"
                >
                  {/* Top Bar: Name, MAC, Status */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-100 text-xs">
                            {device.name}
                          </h3>
                          {device.networkName && (
                            <span
                              className="rounded px-1.5 py-0.2 text-[9px] font-bold"
                              style={{
                                backgroundColor: `${color}20`,
                                color: color,
                                border: `1px solid ${color}40`,
                              }}
                            >
                              {device.networkName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          BSSID / MAC: <strong className="text-slate-300">{device.macOrId || 'N/A'}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xs font-bold ${
                          device.currentRssi >= -65
                            ? 'text-emerald-400'
                            : device.currentRssi >= -80
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {device.currentRssi} dBm
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        TX Potencia: {device.txPower} dBm
                      </span>
                    </div>
                  </div>

                  {/* Hardware & Bidirectional Traffic Telemetry Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-slate-400 block text-[9px]">PAQUETES TX (ENVIADOS)</span>
                      <span className="text-emerald-400 font-bold">
                        {stats?.txPacketsCount || 0} frames ↑
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">PAQUETES RX (RECIBIDOS)</span>
                      <span className="text-amber-400 font-bold">
                        {stats?.rxPacketsCount || 0} frames ↓
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">CANAL RADIO</span>
                      <span className="text-cyan-400 font-semibold">
                        {stats?.channel || (isBle ? 'BLE Ch 37' : 'Ch 36 (5GHz)')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">FABRICANTE</span>
                      <span className="text-slate-200 truncate block">
                        {stats?.vendor || 'Dispositivo Wi-Fi/BLE'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">TOTAL TRANSFERIDO</span>
                      <span className="text-cyan-300 font-bold">
                        {((stats?.totalBytesCount || 0) / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">CIFRADO</span>
                      <span className="text-slate-200 truncate block">{stats?.security}</span>
                    </div>
                  </div>

                  {/* 20-Second Live Signal Sparkline Chart */}
                  {stats && stats.rssiHistory.length > 1 && (
                    <div>
                      <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1">
                        <span>Historial de Señal RSSI a cada segundo:</span>
                        <span className="text-cyan-400">Promedio: {stats.avgRssi} dBm</span>
                      </div>
                      <div className="h-9 w-full bg-slate-950 rounded border border-slate-800/80 p-1 flex items-end gap-1">
                        {stats.rssiHistory.map((val, i) => {
                          const pct = Math.max(10, Math.min(100, ((val + 95) / 60) * 100));
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-t transition-all duration-300"
                              style={{
                                height: `${pct}%`,
                                backgroundColor: color,
                                opacity: 0.4 + (i / stats.rssiHistory.length) * 0.6,
                              }}
                              title={`${val} dBm`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: RF SPECTRUM & CHANNELS DISTRIBUTION */}
        {activeTab === 'spectrum' && (
          <div
            className="h-full w-full overflow-y-auto p-3 space-y-4 font-mono text-xs"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#334155 #0b1120',
            }}
          >
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
              <span className="font-bold text-slate-200 text-xs uppercase block">
                Ocupación y Canales del Espectro
              </span>
              <p className="text-[10px] text-slate-400">
                Visualización de emisiones de radio en tiempo real clasificadas por frecuencia y canal.
              </p>

              {/* 2.4 GHz Band */}
              <div className="space-y-1 pt-2">
                <span className="text-[10px] text-cyan-400 font-bold block">
                  Banda 2.4 GHz (Canales 1, 6, 11)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {['Canal 1 (2412 MHz)', 'Canal 6 (2437 MHz)', 'Canal 11 (2462 MHz)'].map((ch, idx) => (
                    <div key={idx} className="rounded bg-slate-900 border border-slate-800 p-2 text-center">
                      <span className="text-[10px] text-slate-300 font-semibold block">{ch.split(' ')[1]}</span>
                      <span className="text-[9px] text-slate-400 block">{ch.split(' ')[2]}</span>
                      <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${(idx + 1) * 32}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5 GHz Band */}
              <div className="space-y-1 pt-3">
                <span className="text-[10px] text-indigo-400 font-bold block">
                  Banda 5 GHz (UNII-1 & UNII-3)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {['Canal 36 (5180 MHz)', 'Canal 44 (5220 MHz)', 'Canal 149 (5745 MHz)'].map((ch, idx) => (
                    <div key={idx} className="rounded bg-slate-900 border border-slate-800 p-2 text-center">
                      <span className="text-[10px] text-slate-300 font-semibold block">{ch.split(' ')[1]}</span>
                      <span className="text-[9px] text-slate-400 block">{ch.split(' ')[2]}</span>
                      <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(idx + 2) * 28}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bluetooth Advertising Channels */}
              <div className="space-y-1 pt-3">
                <span className="text-[10px] text-emerald-400 font-bold block">
                  Canales Publicitarios BLE (37, 38, 39)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {['BLE Ch 37 (2402 MHz)', 'BLE Ch 38 (2426 MHz)', 'BLE Ch 39 (2480 MHz)'].map((ch, idx) => (
                    <div key={idx} className="rounded bg-slate-900 border border-slate-800 p-2 text-center">
                      <span className="text-[10px] text-slate-300 font-semibold block">{ch.split(' ')[2]}</span>
                      <span className="text-[9px] text-slate-400 block">{ch.split(' ')[3]}</span>
                      <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: '45%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
