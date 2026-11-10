import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map as GoogleMapComponent,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Compass,
  Layers,
  Crosshair,
  Wifi,
  Navigation,
  ShieldCheck,
  AlertCircle,
  Footprints,
} from 'lucide-react';
import { AnchorBeacon, BreadcrumbPoint, EstimatedPosition, MotionState, SpatialMap } from '../types';

interface GoogleMapsViewProps {
  spatialMap: SpatialMap;
  position: EstimatedPosition;
  userHeading: number;
  breadcrumbs: BreadcrumbPoint[];
  motionState: MotionState;
  onSimulateStep?: () => void;
}

// Convert local metric coordinates (x, y) relative to building origin into global Lat/Lng
function localMetersToLatLng(
  xMeters: number,
  yMeters: number,
  originLat: number,
  originLng: number,
  rotationDeg: number = 0
): { lat: number; lng: number } {
  // Rotate around origin if building is oriented at an angle
  const rad = (rotationDeg * Math.PI) / 180;
  const rotX = xMeters * Math.cos(rad) - yMeters * Math.sin(rad);
  const rotY = xMeters * Math.sin(rad) + yMeters * Math.cos(rad);

  const metersPerLat = 111139;
  const metersPerLng = 111139 * Math.cos((originLat * Math.PI) / 180);

  // In local space, +Y is south or forward; in Lat/Lng +Lat is North
  return {
    lat: originLat - rotY / metersPerLat,
    lng: originLng + rotX / metersPerLng,
  };
}

export const GoogleMapsView: React.FC<GoogleMapsViewProps> = ({
  spatialMap,
  position,
  userHeading,
  breadcrumbs,
  motionState,
  onSimulateStep,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Default origin: Madrid / user locale fallback if real GPS is loading
  const [deviceGps, setDeviceGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [isWatchingGps, setIsWatchingGps] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('hybrid');

  // Building geographic anchor (uses real GPS if detected, or default landmark)
  const defaultOrigin = useMemo(
    () => spatialMap.originGeoLocation || { lat: 40.4168, lng: -3.7038 },
    [spatialMap.originGeoLocation]
  );

  const buildingOrigin = deviceGps ? { lat: deviceGps.lat, lng: deviceGps.lng } : defaultOrigin;

  // Real device GPS listener via navigator.geolocation
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setIsWatchingGps(true);
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setDeviceGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          console.warn('Geolocation error or permission denied', err);
          setIsWatchingGps(false);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Listen to GMP Quota Exceeded event
  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // Projected current position on Earth
  const userGeo = useMemo(() => {
    return localMetersToLatLng(
      position.x,
      position.y,
      buildingOrigin.lat,
      buildingOrigin.lng,
      spatialMap.rotationDegrees || 0
    );
  }, [position.x, position.y, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees]);

  // Projected Building Footprint Corners on Earth
  const buildingCorners = useMemo(() => {
    const p1 = localMetersToLatLng(0, 0, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees || 0);
    const p2 = localMetersToLatLng(spatialMap.widthMeters, 0, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees || 0);
    const p3 = localMetersToLatLng(spatialMap.widthMeters, spatialMap.heightMeters, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees || 0);
    const p4 = localMetersToLatLng(0, spatialMap.heightMeters, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees || 0);
    return [p1, p2, p3, p4];
  }, [buildingOrigin, spatialMap.widthMeters, spatialMap.heightMeters, spatialMap.rotationDegrees]);

  // Projected Breadcrumbs Trail on Earth
  const pathCoordinates = useMemo(() => {
    return breadcrumbs.map((b) =>
      localMetersToLatLng(b.x, b.y, buildingOrigin.lat, buildingOrigin.lng, spatialMap.rotationDegrees || 0)
    );
  }, [breadcrumbs, buildingOrigin, spatialMap.rotationDegrees]);

  // Draw Polylines and Building Polygon using Maps API
  const MapPolylineController = () => {
    const map = useMap();
    const polygonRef = useRef<google.maps.Polygon | null>(null);
    const polylineRef = useRef<google.maps.Polyline | null>(null);

    useEffect(() => {
      if (!map) return;

      // Building Outline Polygon
      if (polygonRef.current) polygonRef.current.setMap(null);
      polygonRef.current = new google.maps.Polygon({
        paths: buildingCorners,
        strokeColor: '#06B6D4',
        strokeOpacity: 0.9,
        strokeWeight: 2.5,
        fillColor: '#080c14',
        fillOpacity: 0.35,
        map,
      });

      // User Movement Trail Polyline
      if (polylineRef.current) polylineRef.current.setMap(null);
      if (pathCoordinates.length > 1) {
        polylineRef.current = new google.maps.Polyline({
          path: pathCoordinates,
          geodesic: true,
          strokeColor: '#F59E0B',
          strokeOpacity: 0.85,
          strokeWeight: 3.5,
          map,
        });
      }

      return () => {
        if (polygonRef.current) polygonRef.current.setMap(null);
        if (polylineRef.current) polylineRef.current.setMap(null);
      };
    }, [map, buildingCorners, pathCoordinates]);

    return null;
  };

  return (
    <div className="relative flex-1 w-full min-h-[460px] h-[calc(100vh-130px)] sm:h-[calc(100vh-115px)] overflow-hidden bg-[#070b13] flex flex-col">
      {/* Quota Exceeded Top Notification Banner (Skill section 8 required) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 shadow-2xl backdrop-blur-md text-xs font-mono">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <MapPin className="h-4 w-4" />
            <span>Google Maps Real</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 tabular-nums">
            Lat: {userGeo.lat.toFixed(5)}°, Lng: {userGeo.lng.toFixed(5)}°
          </span>
          {isWatchingGps && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>GPS Activo (±{deviceGps?.accuracy?.toFixed(0) || 5}m)</span>
            </span>
          )}
        </div>

        {/* Map Type Toggle */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/90 p-1 shadow-2xl backdrop-blur-md">
          <button
            onClick={() => setMapType('hybrid')}
            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              mapType === 'hybrid'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Satélite
          </button>
          <button
            onClick={() => setMapType('roadmap')}
            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              mapType === 'roadmap'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mapa Callejero
          </button>
        </div>
      </div>

      {/* Google Maps Container */}
      <div className="w-full h-full flex-1">
        <APIProvider apiKey={apiKey}>
          <GoogleMapComponent
            defaultCenter={userGeo}
            defaultZoom={19}
            mapTypeId={mapType}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
          >
            <MapPolylineController />

            {/* AdvancedMarker for User Real-time Position */}
            <AdvancedMarker position={userGeo} title="Ubicación Actual Triangulada">
              <div className="relative flex items-center justify-center">
                <div
                  className="h-10 w-10 rounded-full border-2 border-cyan-400 bg-cyan-500/20 shadow-lg flex items-center justify-center transition-transform duration-300"
                  style={{ transform: `rotate(${userHeading}deg)` }}
                >
                  <Navigation className="h-5 w-5 text-cyan-300 fill-cyan-400" />
                </div>
                <div className="absolute -bottom-5 rounded bg-slate-950/90 border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 whitespace-nowrap shadow-md">
                  Tú (Interior: {position.x.toFixed(1)}m, {position.y.toFixed(1)}m)
                </div>
              </div>
            </AdvancedMarker>

            {/* AdvancedMarkers for Anchors mapped to Earth */}
            {spatialMap.anchors.map((anchor) => {
              const anchorGeo = localMetersToLatLng(
                anchor.x,
                anchor.y,
                buildingOrigin.lat,
                buildingOrigin.lng,
                spatialMap.rotationDegrees || 0
              );
              const colorHex = anchor.networkColor || anchor.color || '#06B6D4';

              return (
                <AdvancedMarker key={anchor.id} position={anchorGeo} title={anchor.name}>
                  <div className="flex flex-col items-center">
                    <div
                      className="h-7 w-7 rounded-lg border flex items-center justify-center shadow-lg"
                      style={{
                        backgroundColor: `${colorHex}25`,
                        borderColor: colorHex,
                        color: colorHex,
                      }}
                    >
                      <Wifi className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[9px] font-mono rounded bg-slate-950/80 px-1 py-0.2 text-slate-300 mt-0.5 whitespace-nowrap">
                      {anchor.name}
                    </span>
                  </div>
                </AdvancedMarker>
              );
            })}
          </GoogleMapComponent>
        </APIProvider>
      </div>

      {/* Bottom Floating Telemetry & Motion Strip */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-400 uppercase">Estado Dinámico:</span>
            <div className="text-sm font-bold">
              {motionState.isMoving ? (
                <span className="text-emerald-400">🚶 {motionState.motionType === 'running' ? 'Corriendo' : 'Caminando'} · {motionState.speedMps} m/s</span>
              ) : (
                <span className="text-slate-400">🧍 Estacionario</span>
              )}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-400 uppercase">Plano Real:</span>
            <div className="text-xs font-semibold text-cyan-300">
              {spatialMap.name} ({spatialMap.widthMeters}m × {spatialMap.heightMeters}m)
            </div>
          </div>
          {onSimulateStep && (
            <button
              onClick={onSimulateStep}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md ml-auto"
            >
              <Footprints className="h-3.5 w-3.5" />
              <span>Simular Paso (+0.7m)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
