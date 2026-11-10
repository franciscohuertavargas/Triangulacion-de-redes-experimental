/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header, AppTab } from './components/Header';
import { TelemetryBar } from './components/TelemetryBar';
import { RadarMapCanvas } from './components/RadarMapCanvas';
import { RfAutoMapper } from './components/RfAutoMapper';
import { ThreeSpatialScene } from './components/ThreeSpatialScene';
import { GoogleMapsView } from './components/GoogleMapsView';
import { AnchorDrawer } from './components/AnchorDrawer';
import { EnvironmentManager } from './components/EnvironmentManager';
import { SignalCalibrator } from './components/SignalCalibrator';
import { TrafficSidePanel } from './components/TrafficSidePanel';
import { useDeviceSensors } from './hooks/useDeviceSensors';
import { useBluetoothScanner } from './hooks/useBluetoothScanner';
import {
  AnchorBeacon,
  BreadcrumbPoint,
  EstimatedPosition,
  Landmark,
  SpatialMap,
} from './types';
import {
  solveTrilateration,
  KalmanPositionFilter,
  distanceToExpectedRssi,
} from './utils/trilateration';
import {
  getActiveMapId,
  getCalibrationSettings,
  getSavedMaps,
  saveCalibrationSettings,
  saveMaps,
  setActiveMapId,
  UserCalibrationSettings,
} from './utils/storage';

export default function App() {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<AppTab>('radar');

  // Live RF Traffic Side Panel state
  const [isTrafficPanelOpen, setIsTrafficPanelOpen] = useState<boolean>(true);

  // Calibration settings
  const [calibrationSettings, setCalibrationSettings] = useState<UserCalibrationSettings>(() =>
    getCalibrationSettings()
  );

  // Maps & Active Map state
  const [allMaps, setAllMaps] = useState<SpatialMap[]>(() => getSavedMaps());
  const [activeMapId, setActiveMapIdState] = useState<string>(() => getActiveMapId());

  const currentMap = allMaps.find((m) => m.id === activeMapId) || allMaps[0];

  // Sensors & Inertial dead reckoning hook (with live motion detection)
  const {
    telemetry,
    stepEventCount,
    requestSensorsPermission,
    simulateStep,
    setManualCompassHeading,
  } = useDeviceSensors(calibrationSettings.strideLengthMeters);

  // Bluetooth scanner hook
  const {
    isScanning: isBLEScanning,
    errorMsg: bleError,
    requestBLEDevice,
  } = useBluetoothScanner();

  // Ground truth & estimated positions
  const [truePosition, setTruePosition] = useState<{ x: number; y: number }>({
    x: currentMap.widthMeters / 2,
    y: currentMap.heightMeters / 2,
  });

  const [estimatedPosition, setEstimatedPosition] = useState<EstimatedPosition>({
    x: currentMap.widthMeters / 2,
    y: currentMap.heightMeters / 2,
    accuracyRadius: 1.2,
    gdop: 2.1,
    algorithm: 'multilateration',
    confidence: 85,
    timestamp: Date.now(),
  });

  // Breadcrumbs history
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbPoint[]>([]);

  // Target navigation landmark
  const [targetLandmark, setTargetLandmark] = useState<Landmark | null>(null);

  // Kalman filter reference for smooth tracking
  const kalmanRef = useRef<KalmanPositionFilter>(
    new KalmanPositionFilter(currentMap.widthMeters / 2, currentMap.heightMeters / 2)
  );

  // Update map in storage
  const handleUpdateCurrentMap = useCallback(
    (updatedMap: SpatialMap) => {
      setAllMaps((prev) => {
        const next = prev.map((m) => (m.id === updatedMap.id ? updatedMap : m));
        saveMaps(next);
        return next;
      });
    },
    []
  );

  // Switch preset / map
  const handleSelectPreset = useCallback((preset: SpatialMap) => {
    setActiveMapIdState(preset.id);
    setActiveMapId(preset.id);
    const newCenterX = preset.widthMeters / 2;
    const newCenterY = preset.heightMeters / 2;
    setTruePosition({ x: newCenterX, y: newCenterY });
    kalmanRef.current.reset(newCenterX, newCenterY);
    setBreadcrumbs([]);
    setTargetLandmark(null);
  }, []);

  // Update specific anchor
  const handleUpdateAnchor = useCallback(
    (updatedAnchor: AnchorBeacon) => {
      const updatedAnchors = currentMap.anchors.map((a) =>
        a.id === updatedAnchor.id ? updatedAnchor : a
      );
      handleUpdateCurrentMap({ ...currentMap, anchors: updatedAnchors });
    },
    [currentMap, handleUpdateCurrentMap]
  );

  // Add new anchor
  const handleAddAnchor = useCallback(
    (newAnchor: AnchorBeacon) => {
      handleUpdateCurrentMap({
        ...currentMap,
        anchors: [...currentMap.anchors, newAnchor],
      });
    },
    [currentMap, handleUpdateCurrentMap]
  );

  // Remove anchor
  const handleRemoveAnchor = useCallback(
    (id: string) => {
      handleUpdateCurrentMap({
        ...currentMap,
        anchors: currentMap.anchors.filter((a) => a.id !== id),
      });
    },
    [currentMap, handleUpdateCurrentMap]
  );

  // Batch update anchors (from calibration assistant)
  const handleBatchUpdateAnchors = useCallback(
    (updatedAnchors: AnchorBeacon[]) => {
      handleUpdateCurrentMap({ ...currentMap, anchors: updatedAnchors });
    },
    [currentMap, handleUpdateCurrentMap]
  );

  // Save calibration
  const handleSaveCalibration = useCallback((settings: UserCalibrationSettings) => {
    setCalibrationSettings(settings);
    saveCalibrationSettings(settings);
  }, []);

  // Recalculate radio wave signals received by terminal at current location
  const updateSignalsAtLocation = useCallback(
    (targetX: number, targetY: number) => {
      const updatedAnchors = currentMap.anchors.map((anchor) => {
        if (!anchor.isActive) return anchor;

        const { rssi } = distanceToExpectedRssi(
          anchor.x,
          anchor.y,
          targetX,
          targetY,
          anchor.txPower,
          anchor.pathLossExponent,
          currentMap.walls
        );

        // Add subtle multipath jitter if enabled
        const noise = calibrationSettings.rfNoiseSimulated
          ? (Math.random() - 0.5) * 1.8
          : 0;

        return {
          ...anchor,
          currentRssi: Math.round((rssi + noise) * 10) / 10,
          lastUpdated: Date.now(),
        };
      });

      // Solve trilateration from received signals
      const rawSolved = solveTrilateration(
        updatedAnchors,
        { width: currentMap.widthMeters, height: currentMap.heightMeters },
        truePosition
      );

      // Kalman filter smoothing
      const smoothed = kalmanRef.current.update(
        rawSolved.x,
        rawSolved.y,
        rawSolved.accuracyRadius
      );

      const finalPosition: EstimatedPosition = {
        ...rawSolved,
        x: Math.round(smoothed.x * 100) / 100,
        y: Math.round(smoothed.y * 100) / 100,
      };

      setEstimatedPosition(finalPosition);

      // Add to movement breadcrumb trail (every ~0.5m)
      setBreadcrumbs((prev) => {
        const last = prev[prev.length - 1];
        if (!last || Math.hypot(last.x - finalPosition.x, last.y - finalPosition.y) >= 0.5) {
          const next = [...prev, { x: finalPosition.x, y: finalPosition.y, timestamp: Date.now() }];
          return next.slice(-50); // Keep last 50 positions
        }
        return prev;
      });

      return updatedAnchors;
    },
    [
      currentMap.anchors,
      currentMap.walls,
      currentMap.widthMeters,
      currentMap.heightMeters,
      calibrationSettings.rfNoiseSimulated,
      truePosition,
    ]
  );

  // User manual click/tap to walk
  const handleUserManualMove = useCallback(
    (newX: number, newY: number) => {
      setTruePosition({ x: newX, y: newY });
      const updatedAnchors = updateSignalsAtLocation(newX, newY);
      handleUpdateCurrentMap({ ...currentMap, anchors: updatedAnchors });
    },
    [currentMap, handleUpdateCurrentMap, updateSignalsAtLocation]
  );

  // Footstep detected (real or simulated) -> Pedestrian Dead Reckoning
  useEffect(() => {
    if (stepEventCount === 0) return;

    const headingDeg = telemetry.compassHeading ?? 0;
    const rad = ((headingDeg - 90) * Math.PI) / 180;
    const stride = calibrationSettings.strideLengthMeters;

    const deltaX = stride * Math.cos(rad);
    const deltaY = stride * Math.sin(rad);

    setTruePosition((prev) => {
      const nextX = Math.max(0.5, Math.min(currentMap.widthMeters - 0.5, prev.x + deltaX));
      const nextY = Math.max(0.5, Math.min(currentMap.heightMeters - 0.5, prev.y + deltaY));
      const updatedAnchors = updateSignalsAtLocation(nextX, nextY);
      handleUpdateCurrentMap({ ...currentMap, anchors: updatedAnchors });
      return { x: nextX, y: nextY };
    });
  }, [stepEventCount]);

  // Initial calculation
  useEffect(() => {
    updateSignalsAtLocation(truePosition.x, truePosition.y);
  }, [activeMapId]);

  // Compass rotation buttons (for devices without physical compass)
  const handleRotateHeading = useCallback(
    (deltaDeg: number) => {
      const current = telemetry.compassHeading ?? 0;
      setManualCompassHeading(current + deltaDeg);
    },
    [telemetry.compassHeading, setManualCompassHeading]
  );

  // Export Map JSON
  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(currentMap, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${currentMap.name.replace(/\s+/g, '_')}_offline.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import Map JSON
  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed && parsed.widthMeters && Array.isArray(parsed.anchors)) {
          const newMap: SpatialMap = {
            ...parsed,
            id: `imported-${Date.now()}`,
          };
          setAllMaps((prev) => {
            const next = [...prev, newMap];
            saveMaps(next);
            return next;
          });
          handleSelectPreset(newMap);
        } else {
          alert('El archivo JSON no tiene el formato de mapa válido.');
        }
      } catch (err) {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const activeAnchorsCount = currentMap.anchors.filter((a) => a.isActive).length;

  return (
    <div className="h-screen flex flex-col bg-[#080c14] text-slate-100 antialiased overflow-hidden">
      {/* Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeAnchorsCount={activeAnchorsCount}
        isTrafficPanelOpen={isTrafficPanelOpen}
        onToggleTrafficPanel={() => setIsTrafficPanelOpen((prev) => !prev)}
      />

      {/* Real-time Scientific Telemetry Ribbon */}
      <TelemetryBar
        position={estimatedPosition}
        telemetry={telemetry}
        activeAnchorsCount={activeAnchorsCount}
        totalAnchorsCount={currentMap.anchors.length}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 flex flex-col min-h-0 w-full h-full relative overflow-hidden">
        {/* Tab 1: Radar 2D View with GDOP Precision Heatmap */}
        {activeTab === 'radar' && (
          <div className="flex-1 flex flex-col min-h-0 w-full h-full relative">
            <RadarMapCanvas
              spatialMap={currentMap}
              position={estimatedPosition}
              userHeading={telemetry.compassHeading ?? 0}
              breadcrumbs={breadcrumbs}
              targetLandmark={targetLandmark}
              setTargetLandmark={setTargetLandmark}
              motionState={telemetry.motionState}
              onUserManualMove={handleUserManualMove}
              onSimulateStep={simulateStep}
              onRotateHeading={handleRotateHeading}
              onSelectAnchor={(anchor) => {
                setActiveTab('anchors');
              }}
              onOpenSurveyor={() => setActiveTab('surveyor')}
            />
          </div>
        )}

        {/* Tab: Auto-Plano RF (RF Tomography / SLAM) */}
        {activeTab === 'surveyor' && (
          <div className="flex-1 flex flex-col min-h-0 w-full h-full relative">
            <RfAutoMapper
              currentMap={currentMap}
              position={estimatedPosition}
              userHeading={telemetry.compassHeading ?? 0}
              onApplyGeneratedMap={(newMap) => {
                setAllMaps((prev) => {
                  const next = [...prev, newMap];
                  saveMaps(next);
                  return next;
                });
                handleSelectPreset(newMap);
                setActiveTab('radar');
              }}
              onRequestBLEDevice={requestBLEDevice}
              isBLEScanning={isBLEScanning}
            />
          </div>
        )}

        {/* Tab 2: Three.js 3D Studio Spatial Scene */}
        {activeTab === 'three3d' && (
          <div className="flex-1 flex flex-col min-h-0">
            <ThreeSpatialScene
              spatialMap={currentMap}
              position={estimatedPosition}
              userHeading={telemetry.compassHeading ?? 0}
              breadcrumbs={breadcrumbs}
              targetLandmark={targetLandmark}
              motionState={telemetry.motionState}
              onUserManualMove={handleUserManualMove}
              onSimulateStep={simulateStep}
            />
          </div>
        )}

        {/* Tab 3: Google Maps Global Geographic View */}
        {activeTab === 'googlemaps' && (
          <div className="flex-1 flex flex-col min-h-0">
            <GoogleMapsView
              spatialMap={currentMap}
              position={estimatedPosition}
              userHeading={telemetry.compassHeading ?? 0}
              breadcrumbs={breadcrumbs}
              motionState={telemetry.motionState}
              onSimulateStep={simulateStep}
            />
          </div>
        )}

        {/* Tab 4: Signals & Network Beacons Manager */}
        {activeTab === 'anchors' && (
          <AnchorDrawer
            anchors={currentMap.anchors}
            onUpdateAnchor={handleUpdateAnchor}
            onAddAnchor={handleAddAnchor}
            onRemoveAnchor={handleRemoveAnchor}
            onRequestBLEDevice={requestBLEDevice}
            isBLEScanning={isBLEScanning}
            bleError={bleError}
            mapBounds={{
              width: currentMap.widthMeters,
              height: currentMap.heightMeters,
            }}
          />
        )}

        {/* Tab 5: Environment & Floor Plan Architecture */}
        {activeTab === 'environment' && (
          <EnvironmentManager
            currentMap={currentMap}
            onSelectPreset={handleSelectPreset}
            onUpdateMap={handleUpdateCurrentMap}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
          />
        )}

        {/* Tab 6: Physical RF & Pedestrian Calibration */}
        {activeTab === 'calibration' && (
          <SignalCalibrator
            anchors={currentMap.anchors}
            calibrationSettings={calibrationSettings}
            onSaveCalibration={handleSaveCalibration}
            onRequestSensorsPermission={requestSensorsPermission}
            sensorPermissionGranted={telemetry.permissionGranted}
            onBatchUpdateAnchors={handleBatchUpdateAnchors}
          />
        )}
      </main>

      {/* Live 1-Second RF Traffic & Device Telemetry Side Panel */}
      <TrafficSidePanel
        isOpen={isTrafficPanelOpen}
        onClose={() => setIsTrafficPanelOpen(false)}
        devices={currentMap.anchors}
      />
    </div>
  );
}
