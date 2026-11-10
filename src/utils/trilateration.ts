import { AnchorBeacon, EstimatedPosition, WallSegment } from '../types';

/**
 * Calculates estimated distance in meters from RSSI using the Log-Distance Path Loss model:
 * RSSI = TxPower - 10 * n * log10(d)
 * => d = 10 ^ ((TxPower - RSSI) / (10 * n))
 */
export function rssiToDistance(
  rssi: number,
  txPower: number = -50,
  pathLossExponent: number = 2.5
): number {
  if (rssi >= 0) return 0.1;
  const exponent = (txPower - rssi) / (10 * pathLossExponent);
  const distance = Math.pow(10, exponent);
  // Clamp between 0.1m and 60m for realistic indoor signals
  return Math.max(0.1, Math.min(60, distance));
}

/**
 * Simulates expected RSSI given a transmitter location and a receiver location,
 * including wall intersections and shadow fading.
 */
export function distanceToExpectedRssi(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  txPower: number = -50,
  pathLossExponent: number = 2.5,
  walls: WallSegment[] = []
): { rssi: number; distance: number; wallLoss: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(0.15, Math.hypot(dx, dy));
  
  // Calculate wall attenuation
  let wallLoss = 0;
  for (const wall of walls) {
    if (linesIntersect(x1, y1, x2, y2, wall.x1, wall.y1, wall.x2, wall.y2)) {
      wallLoss += wall.attenuationDbm;
    }
  }

  const baseRssi = txPower - 10 * pathLossExponent * Math.log10(distance);
  const totalRssi = Math.round((baseRssi - wallLoss) * 10) / 10;
  return { rssi: totalRssi, distance, wallLoss };
}

/**
 * Line segment intersection check
 */
export function linesIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };
  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

/**
 * Multi-beacon Triangulation / Multilateration Engine
 * Uses Weighted Linear Multilateration followed by Gauss-Newton gradient refinement.
 */
export function solveTrilateration(
  activeAnchors: AnchorBeacon[],
  bounds: { width: number; height: number },
  lastKnownPos?: { x: number; y: number }
): EstimatedPosition {
  const timestamp = Date.now();

  // Filter only anchors with valid RSSI measurements
  const valid = activeAnchors.filter(
    (a) => a.isActive && a.currentRssi < 0 && a.currentRssi > -105
  );

  if (valid.length === 0) {
    return {
      x: lastKnownPos ? lastKnownPos.x : bounds.width / 2,
      y: lastKnownPos ? lastKnownPos.y : bounds.height / 2,
      accuracyRadius: 15,
      gdop: 9.9,
      algorithm: 'dead_reckoning',
      confidence: 10,
      timestamp,
    };
  }

  // 1 Anchor: Proximity estimate
  if (valid.length === 1) {
    const a = valid[0];
    const dist = rssiToDistance(a.currentRssi, a.txPower, a.pathLossExponent);
    return {
      x: a.x,
      y: a.y,
      accuracyRadius: Math.max(2.5, dist),
      gdop: 8.0,
      algorithm: 'single_proximity',
      confidence: 30,
      timestamp,
    };
  }

  // Calculate estimated distance for each anchor
  const anchorsWithDist = valid.map((a) => {
    const dist = rssiToDistance(a.currentRssi, a.txPower, a.pathLossExponent);
    // Weight inversely proportional to distance (closer anchors are exponentially more reliable)
    const weight = 1 / Math.max(0.2, Math.pow(dist, 1.2));
    return { ...a, dist, weight };
  });

  // Sort anchors by strongest signal (lowest distance)
  anchorsWithDist.sort((a, b) => a.dist - b.dist);

  // 2 Anchors: Weighted interpolation along baseline
  if (anchorsWithDist.length === 2) {
    const [a1, a2] = anchorsWithDist;
    const totalW = a1.weight + a2.weight;
    const ratio1 = a2.weight / totalW;
    const estX = a1.x * ratio1 + a2.x * (1 - ratio1);
    const estY = a1.y * ratio1 + a2.y * (1 - ratio1);

    return {
      x: Math.max(0.5, Math.min(bounds.width - 0.5, estX)),
      y: Math.max(0.5, Math.min(bounds.height - 0.5, estY)),
      accuracyRadius: (a1.dist + a2.dist) * 0.4,
      gdop: 5.5,
      algorithm: 'weighted_centroid',
      confidence: 50,
      timestamp,
    };
  }

  // 3 or more Anchors: Linear Multilateration + Non-linear Refinement
  const n = anchorsWithDist.length;
  const k = anchorsWithDist[n - 1]; // Reference anchor (last one)

  // Construct A matrix and b vector:
  // 2(x_i - x_k)x + 2(y_i - y_k)y = (r_k^2 - r_i^2) - (x_k^2 - x_i^2) - (y_k^2 - y_i^2)
  let ata00 = 0;
  let ata01 = 0;
  let ata10 = 0;
  let ata11 = 0;
  let atb0 = 0;
  let atb1 = 0;

  for (let i = 0; i < n - 1; i++) {
    const ai = anchorsWithDist[i];
    const w = ai.weight;

    const row0 = 2 * (ai.x - k.x);
    const row1 = 2 * (ai.y - k.y);
    const bi =
      (k.dist * k.dist - ai.dist * ai.dist) +
      (ai.x * ai.x - k.x * k.x) +
      (ai.y * ai.y - k.y * k.y);

    ata00 += w * row0 * row0;
    ata01 += w * row0 * row1;
    ata10 += w * row1 * row0;
    ata11 += w * row1 * row1;

    atb0 += w * row0 * bi;
    atb1 += w * row1 * bi;
  }

  const det = ata00 * ata11 - ata01 * ata10;
  let initialX = bounds.width / 2;
  let initialY = bounds.height / 2;

  if (Math.abs(det) > 1e-6) {
    initialX = (ata11 * atb0 - ata01 * atb1) / det;
    initialY = (-ata10 * atb0 + ata00 * atb1) / det;
  } else {
    // Collinear fallback: weighted center
    let sumWx = 0;
    let sumWy = 0;
    let sumW = 0;
    for (const a of anchorsWithDist) {
      sumWx += a.x * a.weight;
      sumWy += a.y * a.weight;
      sumW += a.weight;
    }
    initialX = sumWx / sumW;
    initialY = sumWy / sumW;
  }

  // Non-linear Gauss-Newton optimization steps to minimize residual error
  let currentX = Math.max(0.2, Math.min(bounds.width - 0.2, initialX));
  let currentY = Math.max(0.2, Math.min(bounds.height - 0.2, initialY));

  const maxIter = 12;
  for (let iter = 0; iter < maxIter; iter++) {
    let jtj00 = 0;
    let jtj01 = 0;
    let jtj11 = 0;
    let jtr0 = 0;
    let jtr1 = 0;

    for (const a of anchorsWithDist) {
      const dx = currentX - a.x;
      const dy = currentY - a.y;
      const currentDist = Math.max(0.01, Math.hypot(dx, dy));
      const residual = currentDist - a.dist;
      const jx = dx / currentDist;
      const jy = dy / currentDist;
      const w = a.weight;

      jtj00 += w * jx * jx;
      jtj01 += w * jx * jy;
      jtj11 += w * jy * jy;
      jtr0 += w * jx * residual;
      jtr1 += w * jy * residual;
    }

    const iterDet = jtj00 * jtj11 - jtj01 * jtj01;
    if (Math.abs(iterDet) < 1e-7) break;

    const deltaX = (jtj11 * jtr0 - jtj01 * jtr1) / iterDet;
    const deltaY = (-jtj01 * jtr0 + jtj00 * jtr1) / iterDet;

    // Damped step
    currentX -= 0.6 * deltaX;
    currentY -= 0.6 * deltaY;

    currentX = Math.max(0.2, Math.min(bounds.width - 0.2, currentX));
    currentY = Math.max(0.2, Math.min(bounds.height - 0.2, currentY));

    if (Math.hypot(deltaX, deltaY) < 0.02) break;
  }

  // Compute residual error & Geometric Dilution of Precision (GDOP)
  let totalResidual = 0;
  for (const a of anchorsWithDist) {
    const estimatedDist = Math.hypot(currentX - a.x, currentY - a.y);
    totalResidual += Math.abs(estimatedDist - a.dist);
  }
  const meanResidual = totalResidual / n;

  // GDOP estimate based on angle distribution around point
  const angles = anchorsWithDist.map((a) => Math.atan2(a.y - currentY, a.x - currentX));
  angles.sort((a, b) => a - b);
  let maxAngleGap = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = i === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[i + 1];
    maxAngleGap = Math.max(maxAngleGap, next - angles[i]);
  }
  // Smaller max gap means anchors surround the user better -> lower GDOP (good)
  const gdop = Math.min(9.9, Math.max(1.2, (maxAngleGap / Math.PI) * 2.2));

  // Error radius in meters (typically 0.8m to 4m depending on anchors and noise)
  const accuracyRadius = Math.max(0.6, Math.min(8.0, meanResidual * 0.9 * (gdop / 2)));
  const confidence = Math.max(15, Math.min(98, Math.round(100 - accuracyRadius * 12 - (gdop - 1.5) * 8)));

  return {
    x: Math.round(currentX * 100) / 100,
    y: Math.round(currentY * 100) / 100,
    accuracyRadius: Math.round(accuracyRadius * 10) / 10,
    gdop: Math.round(gdop * 10) / 10,
    algorithm: 'multilateration',
    confidence,
    timestamp,
  };
}

/**
 * 2D Kalman Filter state for spatial smoothing
 */
export class KalmanPositionFilter {
  private x: number;
  private y: number;
  private vx: number = 0;
  private vy: number = 0;
  private p: number = 2.0; // Error covariance
  private q: number = 0.15; // Process noise
  private r: number = 1.2; // Measurement noise
  private initialized: boolean = false;

  constructor(initialX: number = 0, initialY: number = 0) {
    this.x = initialX;
    this.y = initialY;
  }

  public update(measurementX: number, measurementY: number, accuracy: number): { x: number; y: number } {
    if (!this.initialized) {
      this.x = measurementX;
      this.y = measurementY;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    // Prediction
    this.x += this.vx;
    this.y += this.vy;
    this.p += this.q;

    // Measurement noise dynamically scales with reported accuracy
    const dynamicR = Math.max(0.4, accuracy * 0.8);
    const k = this.p / (this.p + dynamicR);

    // Update
    const resX = measurementX - this.x;
    const resY = measurementY - this.y;

    this.x += k * resX;
    this.y += k * resY;

    // Velocity decay
    this.vx = 0.5 * this.vx + 0.5 * (k * resX);
    this.vy = 0.5 * this.vy + 0.5 * (k * resY);

    this.p = (1 - k) * this.p;

    return { x: this.x, y: this.y };
  }

  public reset(newX: number, newY: number) {
    this.x = newX;
    this.y = newY;
    this.vx = 0;
    this.vy = 0;
    this.p = 2.0;
  }
}

export interface PrecisionGridPoint {
  x: number;
  y: number;
  score: number; // 0 (dead zone) to 1 (high precision)
  anchorCount: number;
  gdop: number;
}

/**
 * Computes a spatial precision heatmap across the room grid based on active anchor density and GDOP.
 * Returns a Data URL of an offscreen canvas for super-fast SVG rendering.
 */
export function generatePrecisionHeatmapDataUrl(
  activeAnchors: AnchorBeacon[],
  widthMeters: number,
  heightMeters: number,
  resX: number = 72,
  resY: number = 52
): string {
  if (typeof document === 'undefined') return '';

  const validAnchors = activeAnchors.filter((a) => a.isActive);
  const canvas = document.createElement('canvas');
  canvas.width = resX;
  canvas.height = resY;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(resX, resY);
  const data = imgData.data;

  const dx = widthMeters / resX;
  const dy = heightMeters / resY;

  for (let py = 0; py < resY; py++) {
    const worldY = (py + 0.5) * dy;
    for (let px = 0; px < resX; px++) {
      const worldX = (px + 0.5) * dx;

      // Find anchors in radio range
      let count = 0;
      let totalDist = 0;
      const angles: number[] = [];

      for (const a of validAnchors) {
        const d = Math.hypot(worldX - a.x, worldY - a.y);
        // Max reception range considered ~24m
        if (d <= 24) {
          count++;
          totalDist += d;
          angles.push(Math.atan2(a.y - worldY, a.x - worldX));
        }
      }

      let score = 0;
      if (count === 0) {
        score = 0.05; // Dead zone
      } else if (count === 1) {
        score = 0.15; // 1D proximity only
      } else if (count === 2) {
        score = 0.35; // 2-anchor ambiguous corridor
      } else {
        // >= 3 anchors: calculate angular GDOP spread
        angles.sort((a, b) => a - b);
        let maxAngleGap = 0;
        for (let i = 0; i < angles.length; i++) {
          const next = i === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[i + 1];
          maxAngleGap = Math.max(maxAngleGap, next - angles[i]);
        }
        const gdop = Math.min(8.0, Math.max(1.2, (maxAngleGap / Math.PI) * 2.2));
        const avgDist = totalDist / count;

        // Base score increases with more anchors, drops with high GDOP or large distance
        const densityBonus = Math.min(0.4, (count - 3) * 0.12);
        const gdopPenalty = (gdop - 1.5) * 0.14;
        const distPenalty = (avgDist / 20) * 0.15;

        score = Math.max(0.2, Math.min(0.98, 0.65 + densityBonus - gdopPenalty - distPenalty));
      }

      // Map score to color ramp
      // score >= 0.75: Cyan/Emerald (high accuracy)
      // score 0.45-0.74: Amber/Yellow (medium accuracy)
      // score 0.25-0.44: Orange (low accuracy)
      // score < 0.25: Crimson Red (blind spot / dead zone)
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (score >= 0.7) {
        // Cyan to Emerald
        const t = (score - 0.7) / 0.3;
        r = Math.round(6 * (1 - t) + 16 * t);
        g = Math.round(182 * (1 - t) + 185 * t);
        b = Math.round(212 * (1 - t) + 129 * t);
        a = 110;
      } else if (score >= 0.45) {
        // Yellow/Amber to Cyan
        const t = (score - 0.45) / 0.25;
        r = Math.round(245 * (1 - t) + 6 * t);
        g = Math.round(158 * (1 - t) + 182 * t);
        b = Math.round(11 * (1 - t) + 212 * t);
        a = 95;
      } else if (score >= 0.25) {
        // Orange to Amber
        const t = (score - 0.25) / 0.2;
        r = 249;
        g = Math.round(115 * (1 - t) + 158 * t);
        b = Math.round(22 * (1 - t) + 11 * t);
        a = 85;
      } else {
        // Crimson/Rose (Dead Zone)
        r = 244;
        g = 63;
        b = 94;
        a = 90;
      }

      const pixelIndex = (py * resX + px) * 4;
      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
