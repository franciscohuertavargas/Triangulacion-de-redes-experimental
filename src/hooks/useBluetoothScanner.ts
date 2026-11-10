import { useState, useCallback } from 'react';
import { AnchorBeacon } from '../types';

export interface DiscoveredBLEDevice {
  id: string;
  name: string;
  rssi?: number;
  connected?: boolean;
}

export function useBluetoothScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  });
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredBLEDevice[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Trigger browser's native Web Bluetooth scan/selection prompt
  const requestBLEDevice = useCallback(async (): Promise<AnchorBeacon | null> => {
    setErrorMsg(null);
    setIsScanning(true);

    try {
      const navBluetooth = (navigator as unknown as { bluetooth?: { requestDevice: (options: any) => Promise<any> } }).bluetooth;
      if (!navBluetooth) {
        throw new Error('Web Bluetooth no está soportado en este navegador o contexto.');
      }

      // Request device with common services or acceptAllDevices
      const device = await navBluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'battery_service'],
      });

      const newDiscovered: DiscoveredBLEDevice = {
        id: device.id,
        name: device.name || `Dispositivo BLE (${device.id.slice(0, 6)})`,
        connected: false,
      };

      setDiscoveredDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [...prev, newDiscovered];
      });

      // Construct an AnchorBeacon representation with default calibration
      const newAnchor: AnchorBeacon = {
        id: `ble-${device.id.replace(/[^a-zA-Z0-9]/g, '')}`,
        name: device.name ? `Baliza BLE: ${device.name}` : `Baliza BLE (${device.id.slice(0, 6)})`,
        type: 'bluetooth',
        frequency: 'BLE',
        macOrId: device.id,
        x: 5,
        y: 5,
        txPower: -59,
        pathLossExponent: 2.5,
        currentRssi: -62,
        lastUpdated: Date.now(),
        isActive: true,
        color: '#8B5CF6',
      };

      setIsScanning(false);
      return newAnchor;
    } catch (err: unknown) {
      setIsScanning(false);
      const message = err instanceof Error ? err.message : 'Error al buscar dispositivos Bluetooth';
      // If user cancelled, don't show as error
      if (message.includes('User cancelled') || message.includes('cancelled')) {
        setErrorMsg('Búsqueda cancelada por el usuario');
      } else {
        setErrorMsg(message);
      }
      return null;
    }
  }, []);

  return {
    isAvailable,
    isScanning,
    discoveredDevices,
    errorMsg,
    requestBLEDevice,
  };
}
