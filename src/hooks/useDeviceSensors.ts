import { useState, useEffect, useRef, useCallback } from 'react';
import { MotionState, SensorTelemetry } from '../types';

export function useDeviceSensors(strideLengthMeters: number = 0.72) {
  const [telemetry, setTelemetry] = useState<SensorTelemetry>({
    compassHeading: 0,
    pitch: 0,
    roll: 0,
    stepCount: 0,
    strideLength: strideLengthMeters,
    isSupported: false,
    permissionGranted: false,
    motionState: {
      isMoving: false,
      speedMps: 0,
      motionType: 'stationary',
      accelMagnitude: 9.81,
      stepCadence: 0,
      lastMotionTimestamp: Date.now(),
    },
  });

  const [stepEventCount, setStepEventCount] = useState<number>(0);
  const lastStepTimestampRef = useRef<number>(0);
  const recentStepTimestampsRef = useRef<number[]>([]);
  const accelHistoryRef = useRef<number[]>([]);
  const headingRef = useRef<number>(0);
  const motionTimerRef = useRef<number | null>(null);

  // Request permission for iOS Safari 13+
  const requestSensorsPermission = useCallback(async (): Promise<boolean> => {
    try {
      // @ts-expect-error iOS-specific API
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // @ts-expect-error iOS-specific API
        const orientationPerm = await DeviceOrientationEvent.requestPermission();
        if (orientationPerm !== 'granted') return false;
      }

      // @ts-expect-error iOS-specific API
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        // @ts-expect-error iOS-specific API
        const motionPerm = await DeviceMotionEvent.requestPermission();
        if (motionPerm !== 'granted') return false;
      }

      setTelemetry((prev) => ({ ...prev, permissionGranted: true }));
      return true;
    } catch (e) {
      console.warn('Sensors permission request failed', e);
      return false;
    }
  }, []);

  useEffect(() => {
    const isOrientationSupported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    const isMotionSupported = typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
    const isSupported = isOrientationSupported || isMotionSupported;

    setTelemetry((prev) => ({
      ...prev,
      isSupported,
      strideLength: strideLengthMeters,
    }));

    // Handle orientation (compass)
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;

      // iOS Safari provides webkitCompassHeading directly (0 = North)
      // @ts-expect-error iOS webkitCompassHeading
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        // @ts-expect-error iOS webkitCompassHeading
        heading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        // Android standard (alpha is rotation around z-axis in degrees)
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null) {
        headingRef.current = Math.round(heading);
        setTelemetry((prev) => ({
          ...prev,
          compassHeading: headingRef.current,
          pitch: e.beta ? Math.round(e.beta) : prev.pitch,
          roll: e.gamma ? Math.round(e.gamma) : prev.roll,
          permissionGranted: true,
        }));
      }
    };

    // Step and live motion detection via accelerometer
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const history = accelHistoryRef.current;
      history.push(magnitude);
      if (history.length > 25) history.shift();

      const now = Date.now();

      // Check if moving based on variance
      if (history.length >= 10) {
        const avg = history.reduce((a, b) => a + b, 0) / history.length;
        const variance = history.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / history.length;
        const current = history[history.length - 1];
        const previous = history[history.length - 2];

        // Detect step: peak > threshold, above average, and at least 300ms since last step
        const isPeak = current < previous && previous > avg + 1.7;
        let stepDetected = false;

        if (isPeak && now - lastStepTimestampRef.current > 300) {
          lastStepTimestampRef.current = now;
          stepDetected = true;
          recentStepTimestampsRef.current.push(now);
          // Keep only steps from last 10 seconds for cadence calculation
          recentStepTimestampsRef.current = recentStepTimestampsRef.current.filter((t) => now - t <= 10000);
          setStepEventCount((c) => c + 1);
        }

        // Calculate Cadence (steps per minute) and Speed (m/s)
        const recentSteps = recentStepTimestampsRef.current.filter((t) => now - t <= 6000);
        const cadence = recentSteps.length > 1 ? Math.round((recentSteps.length / 6) * 60) : 0;
        const isMoving = stepDetected || now - lastStepTimestampRef.current < 2500 || variance > 0.9;
        const speedMps = isMoving
          ? Math.max(0.6, Math.min(2.8, Math.round((cadence / 60) * strideLengthMeters * 10) / 10 || 1.1))
          : 0;

        let motionType: MotionState['motionType'] = 'stationary';
        if (isMoving) {
          motionType = speedMps > 1.8 ? 'running' : 'walking';
        }

        setTelemetry((prev) => ({
          ...prev,
          stepCount: stepDetected ? prev.stepCount + 1 : prev.stepCount,
          permissionGranted: true,
          motionState: {
            isMoving,
            speedMps,
            motionType,
            accelMagnitude: Math.round(magnitude * 100) / 100,
            stepCadence: cadence,
            lastMotionTimestamp: isMoving ? now : prev.motionState.lastMotionTimestamp,
          },
        }));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('devicemotion', handleMotion, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('devicemotion', handleMotion, true);
      if (motionTimerRef.current) clearInterval(motionTimerRef.current);
    };
  }, [strideLengthMeters]);

  const resetStepCount = useCallback(() => {
    setTelemetry((prev) => ({ ...prev, stepCount: 0 }));
    setStepEventCount(0);
    recentStepTimestampsRef.current = [];
  }, []);

  const simulateStep = useCallback(() => {
    const now = Date.now();
    lastStepTimestampRef.current = now;
    recentStepTimestampsRef.current.push(now);
    setStepEventCount((c) => c + 1);

    setTelemetry((prev) => ({
      ...prev,
      stepCount: prev.stepCount + 1,
      motionState: {
        isMoving: true,
        speedMps: 1.2,
        motionType: 'walking',
        accelMagnitude: 11.4,
        stepCadence: 90,
        lastMotionTimestamp: now,
      },
    }));

    // Reset moving state after 2.5s if no more steps
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    motionTimerRef.current = window.setTimeout(() => {
      setTelemetry((prev) => ({
        ...prev,
        motionState: {
          ...prev.motionState,
          isMoving: false,
          speedMps: 0,
          motionType: 'stationary',
          stepCadence: 0,
        },
      }));
    }, 2500);
  }, []);

  const setManualCompassHeading = useCallback((heading: number) => {
    headingRef.current = ((heading % 360) + 360) % 360;
    setTelemetry((prev) => ({
      ...prev,
      compassHeading: headingRef.current,
      motionState: {
        ...prev.motionState,
        isMoving: true,
        motionType: 'turning',
        lastMotionTimestamp: Date.now(),
      },
    }));
  }, []);

  return {
    telemetry,
    stepEventCount,
    requestSensorsPermission,
    resetStepCount,
    simulateStep,
    setManualCompassHeading,
  };
}
