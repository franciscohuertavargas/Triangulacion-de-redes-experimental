export type SignalType = 'wifi' | 'bluetooth' | 'custom';

export interface AnchorBeacon {
  id: string;
  name: string;
  type: SignalType;
  macOrId?: string;
  frequency?: '2.4GHz' | '5GHz' | 'BLE';
  // Network grouping (devices on same network share color)
  networkId?: string; // Grouping key (e.g. SSID or group)
  networkName?: string; // Display name of the network
  networkColor?: string; // Hex color assigned to the network
  // Position in meters (local coordinate system)
  x: number;
  y: number;
  // Calibration parameters
  txPower: number; // RSSI at 1 meter (typically -50 to -65 dBm)
  pathLossExponent: number; // n (typically 2.0 to 3.5)
  // Current live measurement
  currentRssi: number; // in dBm
  lastUpdated: number; // timestamp
  isActive: boolean;
  color?: string;
}

export interface EstimatedPosition {
  x: number;
  y: number;
  accuracyRadius: number; // confidence margin in meters
  gdop: number; // Geometric dilution of precision
  algorithm: 'multilateration' | 'weighted_centroid' | 'single_proximity' | 'dead_reckoning';
  confidence: number; // 0 - 100%
  timestamp: number;
}

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  attenuationDbm: number; // Signal loss when passing through wall (e.g. 3-8 dBm)
  material: 'drywall' | 'brick' | 'concrete' | 'glass';
}

export interface Landmark {
  id: string;
  name: string;
  category: 'exit' | 'desk' | 'meeting' | 'entrance' | 'amenity' | 'custom';
  x: number;
  y: number;
  color?: string;
}

export interface GeoLocationPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  timestamp: number;
}

export interface RoomZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface SpatialMap {
  id: string;
  name: string;
  description: string;
  widthMeters: number;
  heightMeters: number;
  gridStepMeters: number;
  anchors: AnchorBeacon[];
  walls: WallSegment[];
  landmarks: Landmark[];
  zones?: RoomZone[];
  createdAt: number;
  // Geographic anchor for Google Maps projection
  originGeoLocation?: {
    lat: number;
    lng: number;
  };
  rotationDegrees?: number; // Rotation relative to North
}

export interface MotionState {
  isMoving: boolean;
  speedMps: number;
  motionType: 'stationary' | 'walking' | 'running' | 'turning';
  accelMagnitude: number;
  stepCadence: number; // steps per minute
  lastMotionTimestamp: number;
}

export interface SensorTelemetry {
  compassHeading: number | null; // 0 to 360 degrees
  pitch: number | null;
  roll: number | null;
  stepCount: number;
  strideLength: number; // in meters (default ~0.7)
  isSupported: boolean;
  permissionGranted: boolean;
  motionState: MotionState;
}

export interface BreadcrumbPoint {
  x: number;
  y: number;
  timestamp: number;
  geo?: GeoLocationPoint;
}

export interface RfSurveyRay {
  id: string;
  emitterId: string;
  emitterName: string;
  emitterX: number;
  emitterY: number;
  userX: number;
  userY: number;
  measuredRssi: number;
  expectedRssi: number;
  attenuationDrop: number;
  hasObstacle: boolean;
  piercePoint?: { x: number; y: number };
  timestamp: number;
}

export interface DetectedWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  attenuationDbm: number;
  material: 'drywall' | 'brick' | 'concrete' | 'glass';
  confidence: number; // 0 - 100%
  rayHitCount: number;
  lastUpdated: number;
}

export interface DiscoveredEmitter {
  id: string;
  name: string;
  type: SignalType;
  macOrId: string;
  frequency: string;
  currentRssi: number;
  txPower: number;
  pathLossExponent: number;
  x: number;
  y: number;
  isEstimated: boolean;
  networkName?: string;
  networkColor?: string;
}

export type RfPacketType =
  | 'beacon_frame'
  | 'probe_request'
  | 'probe_response'
  | 'qos_data'
  | 'ble_adv_ind'
  | 'ble_scan_rsp'
  | 'ble_heartbeat'
  | 'mesh_announce';

export interface RfTrafficPacket {
  id: string;
  timestamp: number;
  timestampStr: string; // HH:MM:SS
  deviceId: string;
  deviceName: string;
  macAddress: string;
  direction: 'TX' | 'RX'; // TX = Enviado, RX = Recibido
  sourceName: string;
  sourceMac: string;
  destinationName: string;
  destinationMac: string;
  signalType: SignalType;
  channel: string;
  frequency: string;
  packetType: RfPacketType;
  packetTypeLabel: string;
  protocolLevel: string; // 'MQTT' | 'DNS' | 'DHCP' | 'GATT' | 'WMM Video' | '802.11 Control'
  rssi: number;
  frameSizeBytes: number;
  sequenceNumber: number;
  vendor: string;
  protocol: string;
  security: string;
  relevantData: string; // Información relevante en lenguaje claro
  payloadSummary: string;
  rawHexSample: string;
  flags?: string[];
}

export interface DeviceTrafficStats {
  deviceId: string;
  deviceName: string;
  macAddress: string;
  vendor: string;
  frequency: string;
  channel: string;
  protocol: string;
  security: string;
  currentRssi: number;
  avgRssi: number;
  rssiHistory: number[]; // last 20 readings for sparkline
  packetsPerSecond: number;
  totalPacketsCount: number;
  txPacketsCount: number;
  rxPacketsCount: number;
  totalBytesCount: number;
  lastPacketTime: number;
  packetTypesCount: Record<string, number>;
  networkColor: string;
}
