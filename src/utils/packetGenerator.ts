import { AnchorBeacon, DeviceTrafficStats, RfPacketType, RfTrafficPacket } from '../types';

const VENDORS_MAP: Record<string, string> = {
  'E4:95:6E': 'TP-Link Technologies',
  '98:DA:C4': 'Espressif Systems',
  '2C:30:33': 'Cisco Meraki Systems',
  '44:91:60': 'Nordic Semiconductor',
  'BLE:4C:12': 'Samsung Electronics',
  'BLE:88:2E': 'Amazon Lab126',
  'BLE:COFFEE': 'Philips Consumer Lifestyle',
  'BLE:LAB': 'Raspberry Pi Foundation',
  'BLE:SCALE': 'Withings SAS',
};

function getVendorFromMac(mac: string): string {
  for (const [prefix, vendor] of Object.entries(VENDORS_MAP)) {
    if (mac.toUpperCase().includes(prefix)) {
      return vendor;
    }
  }
  if (mac.startsWith('BLE:')) return 'Bluetooth SIG Member';
  return 'Intel Corporation Network';
}

function getChannelForDevice(freq?: string, idx: number = 0): string {
  if (freq === '5GHz') {
    const chs = ['Ch 36 (5180 MHz)', 'Ch 44 (5220 MHz)', 'Ch 149 (5745 MHz)', 'Ch 157 (5785 MHz)'];
    return chs[idx % chs.length];
  }
  if (freq === '2.4GHz') {
    const chs = ['Ch 1 (2412 MHz)', 'Ch 6 (2437 MHz)', 'Ch 11 (2462 MHz)'];
    return chs[idx % chs.length];
  }
  const bleChs = ['BLE Ch 37 (2402 MHz)', 'BLE Ch 38 (2426 MHz)', 'BLE Ch 39 (2480 MHz)'];
  return bleChs[idx % bleChs.length];
}

function getProtocolForDevice(type: string, freq?: string): string {
  if (type === 'bluetooth') return 'BLE 5.2 (Extended Adv)';
  if (freq === '5GHz') return '802.11ax (Wi-Fi 6)';
  return '802.11n (2.4GHz HT20)';
}

function getSecurityForDevice(name: string): string {
  if (name.toLowerCase().includes('ble') || name.toLowerCase().includes('bluetooth')) {
    return 'BLE LE Security Mode 1 (AES-128)';
  }
  if (name.toLowerCase().includes('cisco') || name.toLowerCase().includes('oficina')) {
    return 'WPA3-Enterprise 192-bit';
  }
  return 'WPA3-SAE / WPA2-Personal (AES)';
}

let globalSeq = 1000;

// Simulated external clients/terminals in the space
const CLIENT_PEERS = [
  { name: 'Smartphone Móvil', mac: '6C:40:08:92:B1:04' },
  { name: 'Portátil Laptop', mac: 'F0:2F:74:11:9C:20' },
  { name: 'Tablet Topógrafo', mac: '48:D7:05:88:31:A9' },
  { name: 'Sensor IoT Pasillo', mac: '18:FE:34:AA:20:55' },
  { name: 'Gateway Mesh Hub', mac: 'BC:DD:C2:54:19:80' },
];

/**
 * Generates an instantaneous emission packet (Sent TX or Received RX) from a detected device
 */
export function generatePacketForDevice(
  device: AnchorBeacon,
  idx: number = 0
): RfTrafficPacket {
  globalSeq = (globalSeq + 1) % 999999;
  const now = new Date();
  const timestampStr =
    now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

  const vendor = getVendorFromMac(device.macOrId || device.id);
  const channel = getChannelForDevice(device.frequency, idx);
  const protocol = getProtocolForDevice(device.type, device.frequency);
  const security = getSecurityForDevice(device.name);

  // Direction: 65% TX (device transmitting), 35% RX (device receiving from peer/client)
  const isTx = Math.random() < 0.65;
  const direction: 'TX' | 'RX' = isTx ? 'TX' : 'RX';

  const clientPeer = CLIENT_PEERS[Math.floor(Math.random() * CLIENT_PEERS.length)];
  const sourceName = isTx ? device.name : clientPeer.name;
  const sourceMac = isTx ? device.macOrId || 'DESCONOCIDA' : clientPeer.mac;
  const destinationName = isTx ? (Math.random() < 0.4 ? 'Broadcast (FF:FF:FF:FF:FF:FF)' : clientPeer.name) : device.name;
  const destinationMac = isTx
    ? destinationName.includes('Broadcast')
      ? 'FF:FF:FF:FF:FF:FF'
      : clientPeer.mac
    : device.macOrId || 'DESCONOCIDA';

  // Packet Type & Relevant Information
  let packetType: RfPacketType = 'beacon_frame';
  let packetTypeLabel = '802.11 Beacon Frame';
  let protocolLevel = '802.11 Control';
  let relevantData = '';
  let payloadSummary = '';
  let frameSizeBytes = 128;
  let rawHex = '80 00 00 00 FF FF FF FF FF FF';

  if (device.type === 'bluetooth') {
    if (isTx) {
      const bleTxPicks = [
        {
          type: 'ble_adv_ind' as RfPacketType,
          label: 'BLE ADV_IND (Anuncio)',
          proto: 'BLE Adv',
          size: 38,
          rel: `Emite anuncio baliza con UUID 0xFEAA y potencia TX ${device.txPower} dBm`,
          summary: `Flags: [LE General Discoverable] · UUID: 0xFEAA Eddystone · TX: ${device.txPower}dBm`,
          hex: '02 01 06 03 03 AA FE 11 16 AA FE 10 00 12',
        },
        {
          type: 'ble_heartbeat' as RfPacketType,
          label: 'BLE GATT Telemetría',
          proto: 'GATT Telemetry',
          size: 34,
          rel: `Envía telemetría de sensor: Batería 92% y señal de presencia periódica`,
          summary: `UUID: 0x180F (Battery Service) · Nivel: 92% · Status: OK`,
          hex: '1B 16 0F 18 5C 00 02 01 06 05 09 42 4C 45',
        },
        {
          type: 'ble_scan_rsp' as RfPacketType,
          label: 'BLE SCAN_RSP (Info)',
          proto: 'BLE Resp',
          size: 42,
          rel: `Responde a escaneo con nombre local completo: "${device.name}"`,
          summary: `Complete Local Name: "${device.name}" · Tx Power: ${device.txPower} dBm`,
          hex: '0B 09 53 6D 61 72 74 20 54 56 02 0A F4',
        },
      ];
      const p = bleTxPicks[Math.floor(Math.random() * bleTxPicks.length)];
      packetType = p.type;
      packetTypeLabel = p.label;
      protocolLevel = p.proto;
      frameSizeBytes = p.size;
      relevantData = p.rel;
      payloadSummary = p.summary;
      rawHex = p.hex;
    } else {
      // BLE RX
      packetType = 'ble_scan_rsp';
      packetTypeLabel = 'BLE SCAN_REQ (Petición)';
      protocolLevel = 'GATT Request';
      frameSizeBytes = 28;
      relevantData = `Terminal ${clientPeer.name} solicita lectura de características y servicios`;
      payloadSummary = `Scan Request desde ${clientPeer.mac} buscando servicios activos`;
      rawHex = '03 00 1C 00 6C 40 08 92 B1 04 00 00';
    }
  } else {
    // Wi-Fi 802.11
    if (isTx) {
      const wifiTxPicks = [
        {
          type: 'beacon_frame' as RfPacketType,
          label: '802.11 Beacon (Baliza)',
          proto: 'Wi-Fi Beacon',
          size: 146,
          rel: `Transmite trama Beacon anunciando SSID "${device.name}" con ${security}`,
          summary: `SSID: "${device.name}" · Beacon Interval: 100 TU · DTIM: 1`,
          hex: '80 00 00 00 FF FF FF FF FF FF 00 1A 2B 3C',
        },
        {
          type: 'qos_data' as RfPacketType,
          label: '802.11 QoS Data (Descarga)',
          proto: 'TCP/IP Data',
          size: Math.floor(400 + Math.random() * 800),
          rel: `Envía flujo de datos hacia ${clientPeer.name} (Tasa: 1201 Mbps · MCS 11)`,
          summary: `QoS Data Subtype: 0x08 · TID: 0 (Best Effort) · Seq: #${globalSeq}`,
          hex: '88 02 2C 00 6C 40 08 92 B1 04 08 00 45 00',
        },
        {
          type: 'probe_response' as RfPacketType,
          label: '802.11 Probe Resp (Respuesta)',
          proto: 'Wi-Fi Control',
          size: 184,
          rel: `Responde con capacidades Wi-Fi 6 (80MHz, OFDMA) a solicitud de ${clientPeer.name}`,
          summary: `Probe Resp to Client · Max Rate: 1201 Mbps · Channel Width: 80MHz`,
          hex: '50 00 3A 01 6C 40 08 92 B1 04 00 1A 2B 3C',
        },
        {
          type: 'mesh_announce' as RfPacketType,
          label: '802.11 Mesh Link (Enlace)',
          proto: 'Mesh Protocol',
          size: 96,
          rel: `Sincroniza topología de malla con red [${device.networkName || 'Mesh'}]`,
          summary: `Mesh Peer Announce · Network: [${device.networkName || 'Mesh'}] · Métrica: 18`,
          hex: 'D0 00 00 00 01 80 C2 00 00 00 00 1A 2B 3C',
        },
      ];
      const p = wifiTxPicks[Math.floor(Math.random() * wifiTxPicks.length)];
      packetType = p.type;
      packetTypeLabel = p.label;
      protocolLevel = p.proto;
      frameSizeBytes = p.size;
      relevantData = p.rel;
      payloadSummary = p.summary;
      rawHex = p.hex;
    } else {
      // Wi-Fi RX
      const wifiRxPicks = [
        {
          type: 'probe_request' as RfPacketType,
          label: '802.11 Probe Req (Sondeo)',
          proto: 'Wi-Fi Control',
          size: 82,
          rel: `Recibe petición Probe Request de ${clientPeer.name} explorando canal ${channel.split(' ')[1]}`,
          summary: `Probe Request desde ${clientPeer.mac} buscando BSSIDs compatibles`,
          hex: '40 00 00 00 FF FF FF FF FF FF 6C 40 08 92',
        },
        {
          type: 'qos_data' as RfPacketType,
          label: '802.11 QoS Data (Subida)',
          proto: 'UDP/DNS',
          size: Math.floor(120 + Math.random() * 300),
          rel: `Recibe paquete de subida de ${clientPeer.name}: Consulta DNS / Sincronización NTP`,
          summary: `DNS Query puerto 53 / ACK handshake confirmando recepción`,
          hex: '88 01 2C 00 00 1A 2B 3C 6C 40 08 92 08 00',
        },
      ];
      const p = wifiRxPicks[Math.floor(Math.random() * wifiRxPicks.length)];
      packetType = p.type;
      packetTypeLabel = p.label;
      protocolLevel = p.proto;
      frameSizeBytes = p.size;
      relevantData = p.rel;
      payloadSummary = p.summary;
      rawHex = p.hex;
    }
  }

  // Slight jitter around current RSSI (e.g. ±1.2 dBm)
  const jitter = (Math.random() - 0.5) * 2.4;
  const currentRssi = Math.round((device.currentRssi + jitter) * 10) / 10;

  return {
    id: `pkt-${device.id}-${globalSeq}-${Date.now().toString().slice(-4)}`,
    timestamp: Date.now(),
    timestampStr,
    deviceId: device.id,
    deviceName: device.name,
    macAddress: device.macOrId || 'DESCONOCIDA',
    direction,
    sourceName,
    sourceMac,
    destinationName,
    destinationMac,
    signalType: device.type,
    channel,
    frequency: device.frequency || (device.type === 'bluetooth' ? 'BLE' : '5GHz'),
    packetType,
    packetTypeLabel,
    protocolLevel,
    rssi: currentRssi,
    frameSizeBytes,
    sequenceNumber: globalSeq,
    vendor,
    protocol,
    security,
    relevantData,
    payloadSummary,
    rawHexSample: rawHex,
    flags: device.type === 'bluetooth' ? ['ADV_EXT_IND', 'TxAdd=1'] : [direction === 'TX' ? 'FromDS=1' : 'ToDS=1', 'Retry=0'],
  };
}

/**
 * Initializes or updates device statistics from incoming packet stream
 */
export function updateDeviceStats(
  prevStats: Map<string, DeviceTrafficStats>,
  newPackets: RfTrafficPacket[],
  devices: AnchorBeacon[]
): Map<string, DeviceTrafficStats> {
  const next = new Map(prevStats);

  // Ensure all active devices exist in the stats map
  devices.forEach((dev) => {
    if (!next.has(dev.id)) {
      next.set(dev.id, {
        deviceId: dev.id,
        deviceName: dev.name,
        macAddress: dev.macOrId || 'N/A',
        vendor: getVendorFromMac(dev.macOrId || dev.id),
        frequency: dev.frequency || '5GHz',
        channel: getChannelForDevice(dev.frequency),
        protocol: getProtocolForDevice(dev.type, dev.frequency),
        security: getSecurityForDevice(dev.name),
        currentRssi: dev.currentRssi,
        avgRssi: dev.currentRssi,
        rssiHistory: [dev.currentRssi],
        packetsPerSecond: 1,
        totalPacketsCount: 0,
        txPacketsCount: 0,
        rxPacketsCount: 0,
        totalBytesCount: 0,
        lastPacketTime: Date.now(),
        packetTypesCount: {},
        networkColor: dev.networkColor || dev.color || '#06B6D4',
      });
    }
  });

  // Accumulate each new packet
  newPackets.forEach((pkt) => {
    const existing = next.get(pkt.deviceId);
    if (existing) {
      existing.currentRssi = pkt.rssi;
      existing.rssiHistory = [...existing.rssiHistory.slice(-19), pkt.rssi];
      existing.avgRssi =
        Math.round(
          (existing.rssiHistory.reduce((a, b) => a + b, 0) / existing.rssiHistory.length) * 10
        ) / 10;
      existing.totalPacketsCount += 1;
      if (pkt.direction === 'TX') {
        existing.txPacketsCount = (existing.txPacketsCount || 0) + 1;
      } else {
        existing.rxPacketsCount = (existing.rxPacketsCount || 0) + 1;
      }
      existing.totalBytesCount += pkt.frameSizeBytes;
      existing.lastPacketTime = pkt.timestamp;
      existing.packetTypesCount[pkt.packetType] =
        (existing.packetTypesCount[pkt.packetType] || 0) + 1;
    }
  });

  return next;
}
