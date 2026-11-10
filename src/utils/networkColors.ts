import { AnchorBeacon } from '../types';

export const NETWORK_PALETTE = [
  { id: 'net-cyan', name: 'Cian Láser', color: '#06B6D4', glow: 'rgba(6, 182, 212, 0.4)' },
  { id: 'net-indigo', name: 'Índigo Real', color: '#6366F1', glow: 'rgba(99, 102, 241, 0.4)' },
  { id: 'net-emerald', name: 'Esmeralda', color: '#10B981', glow: 'rgba(16, 185, 129, 0.4)' },
  { id: 'net-amber', name: 'Ámbar Dorado', color: '#F59E0B', glow: 'rgba(245, 158, 11, 0.4)' },
  { id: 'net-fuchsia', name: 'Fucsia Neón', color: '#EC4899', glow: 'rgba(236, 72, 153, 0.4)' },
  { id: 'net-violet', name: 'Violeta Eléctrico', color: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.4)' },
  { id: 'net-teal', name: 'Turquesa Nórdico', color: '#14B8A6', glow: 'rgba(20, 184, 166, 0.4)' },
];

/**
 * Extracts or infers network group key from anchor name or properties
 * e.g. "Router Fibra 5G (Salón)" & "Repetidor Wi-Fi (Pasillo)" -> "Red Fibra"
 * "AP Cisco Meraki - Entrada" & "AP Cisco Meraki - Open Space" -> "Cisco Meraki"
 */
export function inferNetworkKey(anchor: AnchorBeacon): { key: string; displayName: string } {
  if (anchor.networkId) {
    return { key: anchor.networkId, displayName: anchor.networkName || anchor.networkId };
  }

  const name = anchor.name.toLowerCase();

  if (name.includes('cisco') || name.includes('meraki')) {
    return { key: 'net_cisco_meraki', displayName: 'Red Cisco Meraki' };
  }
  if (name.includes('fibra') || name.includes('repetidor') || name.includes('hogar')) {
    return { key: 'net_fibra_hogar', displayName: 'Red Wi-Fi Principal (Mesh)' };
  }
  if (name.includes('industrial') || name.includes('almacen')) {
    return { key: 'net_industrial_wlan', displayName: 'WLAN Industrial' };
  }
  if (anchor.type === 'bluetooth') {
    return { key: 'net_ble_beacons', displayName: 'Red Sensores BLE' };
  }

  // Fallback: extract base SSID / prefix
  const parts = anchor.name.split(/[-–_:(]/);
  const prefix = parts[0]?.trim() || 'Red Independiente';
  return { key: `net_${prefix.toLowerCase().replace(/\s+/g, '_')}`, displayName: prefix };
}

/**
 * Assigns consistent network colors across an array of anchors.
 * Anchors in the same network receive the same color; anchors in different networks receive distinct colors.
 */
export function assignNetworkColors(anchors: AnchorBeacon[]): AnchorBeacon[] {
  const networkMap = new Map<string, { color: string; displayName: string; index: number }>();
  let nextColorIndex = 0;

  // First pass: identify all unique networks
  for (const anchor of anchors) {
    const { key, displayName } = inferNetworkKey(anchor);
    if (!networkMap.has(key)) {
      const paletteItem = NETWORK_PALETTE[nextColorIndex % NETWORK_PALETTE.length];
      networkMap.set(key, {
        color: paletteItem.color,
        displayName,
        index: nextColorIndex,
      });
      nextColorIndex++;
    }
  }

  // Second pass: apply to anchors
  return anchors.map((anchor) => {
    const { key, displayName } = inferNetworkKey(anchor);
    const netInfo = networkMap.get(key);
    const assignedColor = netInfo ? netInfo.color : '#06B6D4';

    return {
      ...anchor,
      networkId: key,
      networkName: displayName,
      networkColor: assignedColor,
      color: assignedColor,
    };
  });
}
