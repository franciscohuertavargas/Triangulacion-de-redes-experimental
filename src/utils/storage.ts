import { SpatialMap } from '../types';
import { assignNetworkColors } from './networkColors';

const STORAGE_KEY_ACTIVE_MAP = 'triangula_active_map_id';
const STORAGE_KEY_MAPS = 'triangula_saved_maps';
const STORAGE_KEY_CALIBRATION = 'triangula_user_calibration';

export const PRESET_MAPS: SpatialMap[] = [
  {
    id: 'preset-home',
    name: 'Vivienda / Apartamento (80 m²)',
    description: 'Plano residencial con router fibra en salón, repetidor Wi-Fi en pasillo y 2 balizas BLE.',
    widthMeters: 14,
    heightMeters: 10,
    gridStepMeters: 1,
    anchors: [
      {
        id: 'anc-w1',
        name: 'Router Fibra 5G (Salón)',
        type: 'wifi',
        frequency: '5GHz',
        macOrId: 'E4:95:6E:A1:42:01',
        x: 3.5,
        y: 2.5,
        txPower: -48,
        pathLossExponent: 2.8,
        currentRssi: -58,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#06B6D4',
      },
      {
        id: 'anc-w2',
        name: 'Repetidor Wi-Fi (Pasillo)',
        type: 'wifi',
        frequency: '2.4GHz',
        macOrId: '98:DA:C4:B8:10:9F',
        x: 8.0,
        y: 5.5,
        txPower: -50,
        pathLossExponent: 2.6,
        currentRssi: -64,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#3B82F6',
      },
      {
        id: 'anc-b1',
        name: 'Smart TV BLE (Dormitorio Principal)',
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: 'BLE:4C:12:F0',
        x: 11.5,
        y: 2.8,
        txPower: -59,
        pathLossExponent: 2.4,
        currentRssi: -72,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#8B5CF6',
      },
      {
        id: 'anc-b2',
        name: 'Altavoz Inteligente (Cocina)',
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: 'BLE:88:2E:19',
        x: 3.0,
        y: 7.5,
        txPower: -58,
        pathLossExponent: 2.7,
        currentRssi: -66,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#10B981',
      },
    ],
    walls: [
      // Outer perimeter
      { id: 'w-out1', x1: 0.5, y1: 0.5, x2: 13.5, y2: 0.5, attenuationDbm: 10, material: 'concrete' },
      { id: 'w-out2', x1: 13.5, y1: 0.5, x2: 13.5, y2: 9.5, attenuationDbm: 10, material: 'concrete' },
      { id: 'w-out3', x1: 13.5, y1: 9.5, x2: 0.5, y2: 9.5, attenuationDbm: 10, material: 'concrete' },
      { id: 'w-out4', x1: 0.5, y1: 9.5, x2: 0.5, y2: 0.5, attenuationDbm: 10, material: 'concrete' },
      // Interior partition walls
      { id: 'w-in1', x1: 6.5, y1: 0.5, x2: 6.5, y2: 4.8, attenuationDbm: 4, material: 'brick' },
      { id: 'w-in2', x1: 0.5, y1: 5.2, x2: 5.5, y2: 5.2, attenuationDbm: 3, material: 'drywall' },
      { id: 'w-in3', x1: 9.5, y1: 4.5, x2: 13.5, y2: 4.5, attenuationDbm: 3, material: 'drywall' },
      { id: 'w-in4', x1: 9.5, y1: 4.5, x2: 9.5, y2: 9.5, attenuationDbm: 4, material: 'brick' },
    ],
    landmarks: [
      { id: 'lm1', name: 'Puerta Principal', category: 'entrance', x: 1.0, y: 5.0, color: '#10B981' },
      { id: 'lm2', name: 'Sofá / Salón', category: 'amenity', x: 3.5, y: 3.0, color: '#06B6D4' },
      { id: 'lm3', name: 'Mesa Comedor', category: 'amenity', x: 4.5, y: 4.0, color: '#3B82F6' },
      { id: 'lm4', name: 'Cama Principal', category: 'amenity', x: 11.5, y: 2.0, color: '#8B5CF6' },
      { id: 'lm5', name: 'Encimera Cocina', category: 'amenity', x: 2.5, y: 7.8, color: '#F59E0B' },
    ],
    zones: [
      { id: 'z1', name: 'Salón Principal', x: 0.5, y: 0.5, width: 6.0, height: 4.7, color: 'rgba(6, 182, 212, 0.08)' },
      { id: 'z2', name: 'Cocina & Barra', x: 0.5, y: 5.2, width: 5.0, height: 4.3, color: 'rgba(245, 158, 11, 0.08)' },
      { id: 'z3', name: 'Pasillo Distribuidor', x: 6.5, y: 0.5, width: 3.0, height: 9.0, color: 'rgba(59, 130, 246, 0.06)' },
      { id: 'z4', name: 'Dormitorio Principal', x: 9.5, y: 0.5, width: 4.0, height: 4.0, color: 'rgba(139, 92, 246, 0.08)' },
      { id: 'z5', name: 'Estudio / Baño', x: 9.5, y: 4.5, width: 4.0, height: 5.0, color: 'rgba(16, 185, 129, 0.08)' },
    ],
    createdAt: 1715000000000,
  },
  {
    id: 'preset-office',
    name: 'Oficina Coworking & Salas (180 m²)',
    description: 'Espacio diáfano con sala de juntas acristalada, despachos y 5 puntos de acceso.',
    widthMeters: 20,
    heightMeters: 14,
    gridStepMeters: 1,
    anchors: [
      {
        id: 'anc-of1',
        name: 'AP Cisco Meraki - Entrada',
        type: 'wifi',
        frequency: '5GHz',
        macOrId: '2C:30:33:41:88:AA',
        x: 3.0,
        y: 2.5,
        txPower: -45,
        pathLossExponent: 2.5,
        currentRssi: -52,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#06B6D4',
      },
      {
        id: 'anc-of2',
        name: 'AP Cisco Meraki - Open Space',
        type: 'wifi',
        frequency: '5GHz',
        macOrId: '2C:30:33:41:88:AB',
        x: 10.0,
        y: 7.0,
        txPower: -45,
        pathLossExponent: 2.4,
        currentRssi: -55,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#3B82F6',
      },
      {
        id: 'anc-of3',
        name: 'AP Cisco Meraki - Sala Juntas',
        type: 'wifi',
        frequency: '5GHz',
        macOrId: '2C:30:33:41:88:AC',
        x: 16.5,
        y: 3.0,
        txPower: -46,
        pathLossExponent: 2.6,
        currentRssi: -68,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#8B5CF6',
      },
      {
        id: 'anc-of4',
        name: 'Beacon BLE - Coffee Corner',
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: 'BLE:COFFEE:01',
        x: 4.0,
        y: 11.5,
        txPower: -58,
        pathLossExponent: 2.3,
        currentRssi: -62,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#F59E0B',
      },
      {
        id: 'anc-of5',
        name: 'Beacon BLE - Laboratorio',
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: 'BLE:LAB:09',
        x: 17.0,
        y: 11.5,
        txPower: -58,
        pathLossExponent: 2.5,
        currentRssi: -71,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#EC4899',
      },
    ],
    walls: [
      { id: 'wo1', x1: 0.5, y1: 0.5, x2: 19.5, y2: 0.5, attenuationDbm: 12, material: 'concrete' },
      { id: 'wo2', x1: 19.5, y1: 0.5, x2: 19.5, y2: 13.5, attenuationDbm: 12, material: 'concrete' },
      { id: 'wo3', x1: 19.5, y1: 13.5, x2: 0.5, y2: 13.5, attenuationDbm: 12, material: 'concrete' },
      { id: 'wo4', x1: 0.5, y1: 13.5, x2: 0.5, y2: 0.5, attenuationDbm: 12, material: 'concrete' },
      // Sala juntas glass partitions
      { id: 'wi1', x1: 14.0, y1: 0.5, x2: 14.0, y2: 6.0, attenuationDbm: 2, material: 'glass' },
      { id: 'wi2', x1: 14.0, y1: 6.0, x2: 19.5, y2: 6.0, attenuationDbm: 2, material: 'glass' },
      // Kitchen partition
      { id: 'wi3', x1: 0.5, y1: 9.0, x2: 7.0, y2: 9.0, attenuationDbm: 4, material: 'drywall' },
      { id: 'wi4', x1: 7.0, y1: 9.0, x2: 7.0, y2: 13.5, attenuationDbm: 4, material: 'drywall' },
    ],
    landmarks: [
      { id: 'lmo1', name: 'Recepción', category: 'entrance', x: 2.5, y: 3.5, color: '#10B981' },
      { id: 'lmo2', name: 'Sala de Juntas', category: 'meeting', x: 16.5, y: 3.0, color: '#8B5CF6' },
      { id: 'lmo3', name: 'Área Café', category: 'amenity', x: 3.5, y: 11.0, color: '#F59E0B' },
      { id: 'lmo4', name: 'Puesto de Trabajo #12', category: 'desk', x: 9.5, y: 7.0, color: '#06B6D4' },
      { id: 'lmo5', name: 'Salida de Emergencia', category: 'exit', x: 19.2, y: 9.5, color: '#EF4444' },
    ],
    zones: [
      { id: 'zo1', name: 'Recepción & Espera', x: 0.5, y: 0.5, width: 6.5, height: 8.5, color: 'rgba(6, 182, 212, 0.08)' },
      { id: 'zo2', name: 'Open Space Trabajo', x: 7.0, y: 0.5, width: 7.0, height: 13.0, color: 'rgba(59, 130, 246, 0.07)' },
      { id: 'zo3', name: 'Sala de Juntas VIP', x: 14.0, y: 0.5, width: 5.5, height: 5.5, color: 'rgba(139, 92, 246, 0.08)' },
      { id: 'zo4', name: 'Office Café & Break', x: 0.5, y: 9.0, width: 6.5, height: 4.5, color: 'rgba(245, 158, 11, 0.08)' },
      { id: 'zo5', name: 'Laboratorio Hardware', x: 14.0, y: 6.0, width: 5.5, height: 7.5, color: 'rgba(236, 72, 153, 0.08)' },
    ],
    createdAt: 1715000000001,
  },
  {
    id: 'preset-warehouse',
    name: 'Almacén / Nave Logística (400 m²)',
    description: 'Nave de gran envergadura con estanterías industriales y balizas perimetrales.',
    widthMeters: 28,
    heightMeters: 18,
    gridStepMeters: 2,
    anchors: [
      {
        id: 'anc-wh1',
        name: 'AP Industrial Nord - Muelle Carga',
        type: 'wifi',
        frequency: '2.4GHz',
        macOrId: '44:91:60:11:01',
        x: 4.0,
        y: 3.0,
        txPower: -42,
        pathLossExponent: 2.2,
        currentRssi: -56,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#06B6D4',
      },
      {
        id: 'anc-wh2',
        name: 'AP Industrial Sud - Pasillo Central',
        type: 'wifi',
        frequency: '2.4GHz',
        macOrId: '44:91:60:11:02',
        x: 14.0,
        y: 9.0,
        txPower: -42,
        pathLossExponent: 2.1,
        currentRssi: -50,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#3B82F6',
      },
      {
        id: 'anc-wh3',
        name: 'AP Industrial Est - Racks A',
        type: 'wifi',
        frequency: '5GHz',
        macOrId: '44:91:60:11:03',
        x: 24.0,
        y: 4.0,
        txPower: -44,
        pathLossExponent: 2.4,
        currentRssi: -62,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#F59E0B',
      },
      {
        id: 'anc-wh4',
        name: 'Beacon BLE - Báscula Pesaje',
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: 'BLE:SCALE:01',
        x: 23.0,
        y: 15.0,
        txPower: -55,
        pathLossExponent: 2.3,
        currentRssi: -68,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#10B981',
      },
    ],
    walls: [
      { id: 'wwh1', x1: 0.5, y1: 0.5, x2: 27.5, y2: 0.5, attenuationDbm: 15, material: 'concrete' },
      { id: 'wwh2', x1: 27.5, y1: 0.5, x2: 27.5, y2: 17.5, attenuationDbm: 15, material: 'concrete' },
      { id: 'wwh3', x1: 27.5, y1: 17.5, x2: 0.5, y2: 17.5, attenuationDbm: 15, material: 'concrete' },
      { id: 'wwh4', x1: 0.5, y1: 17.5, x2: 0.5, y2: 0.5, attenuationDbm: 15, material: 'concrete' },
    ],
    landmarks: [
      { id: 'lmw1', name: 'Muelle de Carga #1', category: 'entrance', x: 2.0, y: 3.5, color: '#10B981' },
      { id: 'lmw2', name: 'Estantería Rack 04', category: 'custom', x: 12.0, y: 5.0, color: '#F59E0B' },
      { id: 'lmw3', name: 'Zona de Picking', category: 'custom', x: 18.0, y: 11.0, color: '#06B6D4' },
      { id: 'lmw4', name: 'Salida de Emergencia Sur', category: 'exit', x: 27.0, y: 16.5, color: '#EF4444' },
    ],
    zones: [
      { id: 'zw1', name: 'Zona de Carga & Muelles', x: 0.5, y: 0.5, width: 8.0, height: 17.0, color: 'rgba(16, 185, 129, 0.08)' },
      { id: 'zw2', name: 'Pasillo Central de Racks', x: 8.5, y: 0.5, width: 10.0, height: 17.0, color: 'rgba(245, 158, 11, 0.08)' },
      { id: 'zw3', name: 'Área Picking & Embalaje', x: 18.5, y: 0.5, width: 9.0, height: 17.0, color: 'rgba(6, 182, 212, 0.08)' },
    ],
    createdAt: 1715000000002,
  },
];

export function getSavedMaps(): SpatialMap[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAPS);
    let maps = PRESET_MAPS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) maps = parsed;
    }
    // Ensure all anchors have consistent network colors and zones are preserved from presets
    return maps.map((m) => {
      const presetMatch = PRESET_MAPS.find((p) => p.id === m.id);
      return {
        ...m,
        zones: m.zones || presetMatch?.zones,
        anchors: assignNetworkColors(m.anchors),
      };
    });
  } catch {
    return PRESET_MAPS.map((m) => ({
      ...m,
      anchors: assignNetworkColors(m.anchors),
    }));
  }
}

export function saveMaps(maps: SpatialMap[]) {
  try {
    localStorage.setItem(STORAGE_KEY_MAPS, JSON.stringify(maps));
  } catch (err) {
    console.error('Failed to save maps to localStorage', err);
  }
}

export function getActiveMapId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY_ACTIVE_MAP);
    if (id) return id;
  } catch {}
  return PRESET_MAPS[0].id;
}

export function setActiveMapId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_MAP, id);
  } catch {}
}

export interface UserCalibrationSettings {
  defaultTxPowerWifi: number;
  defaultTxPowerBle: number;
  defaultPathLossExponent: number;
  strideLengthMeters: number;
  useDeadReckoningFusion: boolean;
  rfNoiseSimulated: boolean;
}

const DEFAULT_CALIBRATION: UserCalibrationSettings = {
  defaultTxPowerWifi: -48,
  defaultTxPowerBle: -59,
  defaultPathLossExponent: 2.6,
  strideLengthMeters: 0.72,
  useDeadReckoningFusion: true,
  rfNoiseSimulated: true,
};

export function getCalibrationSettings(): UserCalibrationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CALIBRATION);
    if (raw) return { ...DEFAULT_CALIBRATION, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CALIBRATION;
}

export function saveCalibrationSettings(settings: UserCalibrationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY_CALIBRATION, JSON.stringify(settings));
  } catch {}
}
