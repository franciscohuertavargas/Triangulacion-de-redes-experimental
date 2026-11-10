import { AnchorBeacon, DetectedWall, DiscoveredEmitter, RfSurveyRay, WallSegment } from '../types';
import { linesIntersect } from './trilateration';

/**
 * Evaluates an individual RF signal ray from an emitter to the user receiver.
 * Detects whether excess signal loss indicates an obstacle/wall along the line of sight.
 */
export function evaluateRfRay(
  emitter: DiscoveredEmitter | AnchorBeacon,
  userX: number,
  userY: number,
  measuredRssi: number,
  thresholdDbm: number = 4.0
): RfSurveyRay {
  const dx = userX - emitter.x;
  const dy = userY - emitter.y;
  const dist = Math.max(0.4, Math.hypot(dx, dy));

  // Theoretical log-distance path loss without obstacles
  const expectedRssi = emitter.txPower - 10 * emitter.pathLossExponent * Math.log10(dist);
  const attenuationDrop = Math.round((expectedRssi - measuredRssi) * 10) / 10;

  const hasObstacle = attenuationDrop >= thresholdDbm;

  // Candidate piercing point along the ray (midpoint or weighted by distance)
  let piercePoint: { x: number; y: number } | undefined = undefined;
  if (hasObstacle) {
    const fraction = 0.5; // midpoint default approximation for tomographic accumulation
    piercePoint = {
      x: Math.round((emitter.x + dx * fraction) * 10) / 10,
      y: Math.round((emitter.y + dy * fraction) * 10) / 10,
    };
  }

  return {
    id: `ray-${emitter.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    emitterId: emitter.id,
    emitterName: emitter.name,
    emitterX: emitter.x,
    emitterY: emitter.y,
    userX,
    userY,
    measuredRssi,
    expectedRssi: Math.round(expectedRssi * 10) / 10,
    attenuationDrop,
    hasObstacle,
    piercePoint,
    timestamp: Date.now(),
  };
}

/**
 * 2D Tomographic Grid Accumulator for RF SLAM
 */
export class RfTomographyEngine {
  public gridWidth: number;
  public gridHeight: number;
  public cellSize: number;
  public cols: number;
  public rows: number;
  public densityGrid: Float32Array; // Higher positive values = high obstacle confidence
  public hitCountGrid: Int32Array;
  public clearCountGrid: Int32Array;
  public raysHistory: RfSurveyRay[] = [];
  public detectedWalls: DetectedWall[] = [];

  constructor(widthMeters: number, heightMeters: number, cellSize: number = 0.5) {
    this.gridWidth = widthMeters;
    this.gridHeight = heightMeters;
    this.cellSize = cellSize;
    this.cols = Math.ceil(widthMeters / cellSize);
    this.rows = Math.ceil(heightMeters / cellSize);
    this.densityGrid = new Float32Array(this.cols * this.rows);
    this.hitCountGrid = new Int32Array(this.cols * this.rows);
    this.clearCountGrid = new Int32Array(this.cols * this.rows);
  }

  public reset(widthMeters: number, heightMeters: number) {
    this.gridWidth = widthMeters;
    this.gridHeight = heightMeters;
    this.cols = Math.ceil(widthMeters / this.cellSize);
    this.rows = Math.ceil(heightMeters / this.cellSize);
    this.densityGrid = new Float32Array(this.cols * this.rows);
    this.hitCountGrid = new Int32Array(this.cols * this.rows);
    this.clearCountGrid = new Int32Array(this.cols * this.rows);
    this.raysHistory = [];
    this.detectedWalls = [];
  }

  /**
   * Casts a ray through the discrete grid (Bresenham-like DDA)
   */
  public castRay(ray: RfSurveyRay) {
    // Keep last 150 rays for live visualization
    this.raysHistory.push(ray);
    if (this.raysHistory.length > 150) {
      this.raysHistory.shift();
    }

    const x0 = ray.emitterX / this.cellSize;
    const y0 = ray.emitterY / this.cellSize;
    const x1 = ray.userX / this.cellSize;
    const y1 = ray.userY / this.cellSize;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = Math.floor(x0);
    let cy = Math.floor(y0);
    const targetX = Math.floor(x1);
    const targetY = Math.floor(y1);

    const visitedCells: number[] = [];

    while (true) {
      if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
        visitedCells.push(cy * this.cols + cx);
      }
      if (cx === targetX && cy === targetY) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }

    if (visitedCells.length === 0) return;

    if (ray.hasObstacle) {
      // Ray experienced significant attenuation: cells in the middle receive obstacle weight
      const weight = Math.min(1.5, Math.max(0.5, ray.attenuationDrop / 6.0));
      // Distribute weight around the central 60% of the ray
      const startIdx = Math.floor(visitedCells.length * 0.2);
      const endIdx = Math.ceil(visitedCells.length * 0.8);

      for (let i = startIdx; i < endIdx; i++) {
        const idx = visitedCells[i];
        this.densityGrid[idx] += weight;
        this.hitCountGrid[idx] += 1;
      }
    } else {
      // Clear line of sight: decrement density because no wall exists on a clear path
      for (const idx of visitedCells) {
        this.densityGrid[idx] = Math.max(0, this.densityGrid[idx] - 0.35);
        this.clearCountGrid[idx] += 1;
      }
    }

    // Periodically cluster and extract walls
    this.extractWalls();
  }

  /**
   * Clusters obstacle cells into continuous linear wall segments
   */
  public extractWalls() {
    const walls: DetectedWall[] = [];
    const minThreshold = 2.0; // minimum density score to be considered a wall cell

    // 1. Detect Horizontal Wall Segments
    for (let r = 1; r < this.rows - 1; r++) {
      let runStartCol = -1;
      let runWeight = 0;
      let runHitCount = 0;

      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        const val = this.densityGrid[idx];

        if (val >= minThreshold) {
          if (runStartCol === -1) {
            runStartCol = c;
            runWeight = 0;
            runHitCount = 0;
          }
          runWeight += val;
          runHitCount += this.hitCountGrid[idx];
        } else {
          if (runStartCol !== -1) {
            const lengthMeters = (c - runStartCol) * this.cellSize;
            if (lengthMeters >= 1.5) {
              const avgLoss = Math.round((runWeight / (c - runStartCol)) * 3.5 * 10) / 10;
              walls.push({
                id: `wall-h-${r}-${runStartCol}`,
                x1: Math.round(runStartCol * this.cellSize * 10) / 10,
                y1: Math.round(r * this.cellSize * 10) / 10,
                x2: Math.round(c * this.cellSize * 10) / 10,
                y2: Math.round(r * this.cellSize * 10) / 10,
                attenuationDbm: Math.max(3.5, Math.min(14, avgLoss)),
                material: this.determineMaterial(avgLoss),
                confidence: Math.min(96, Math.max(45, Math.round(runHitCount * 8 + lengthMeters * 5))),
                rayHitCount: runHitCount,
                lastUpdated: Date.now(),
              });
            }
            runStartCol = -1;
          }
        }
      }

      if (runStartCol !== -1) {
        const lengthMeters = (this.cols - runStartCol) * this.cellSize;
        if (lengthMeters >= 1.5) {
          const avgLoss = Math.round((runWeight / (this.cols - runStartCol)) * 3.5 * 10) / 10;
          walls.push({
            id: `wall-h-${r}-${runStartCol}`,
            x1: Math.round(runStartCol * this.cellSize * 10) / 10,
            y1: Math.round(r * this.cellSize * 10) / 10,
            x2: Math.round(this.cols * this.cellSize * 10) / 10,
            y2: Math.round(r * this.cellSize * 10) / 10,
            attenuationDbm: Math.max(3.5, Math.min(14, avgLoss)),
            material: this.determineMaterial(avgLoss),
            confidence: Math.min(96, Math.max(45, Math.round(runHitCount * 8 + lengthMeters * 5))),
            rayHitCount: runHitCount,
            lastUpdated: Date.now(),
          });
        }
      }
    }

    // 2. Detect Vertical Wall Segments
    for (let c = 1; c < this.cols - 1; c++) {
      let runStartRow = -1;
      let runWeight = 0;
      let runHitCount = 0;

      for (let r = 0; r < this.rows; r++) {
        const idx = r * this.cols + c;
        const val = this.densityGrid[idx];

        if (val >= minThreshold) {
          if (runStartRow === -1) {
            runStartRow = r;
            runWeight = 0;
            runHitCount = 0;
          }
          runWeight += val;
          runHitCount += this.hitCountGrid[idx];
        } else {
          if (runStartRow !== -1) {
            const lengthMeters = (r - runStartRow) * this.cellSize;
            if (lengthMeters >= 1.5) {
              const avgLoss = Math.round((runWeight / (r - runStartRow)) * 3.5 * 10) / 10;
              walls.push({
                id: `wall-v-${c}-${runStartRow}`,
                x1: Math.round(c * this.cellSize * 10) / 10,
                y1: Math.round(runStartRow * this.cellSize * 10) / 10,
                x2: Math.round(c * this.cellSize * 10) / 10,
                y2: Math.round(r * this.cellSize * 10) / 10,
                attenuationDbm: Math.max(3.5, Math.min(14, avgLoss)),
                material: this.determineMaterial(avgLoss),
                confidence: Math.min(96, Math.max(45, Math.round(runHitCount * 8 + lengthMeters * 5))),
                rayHitCount: runHitCount,
                lastUpdated: Date.now(),
              });
            }
            runStartRow = -1;
          }
        }
      }

      if (runStartRow !== -1) {
        const lengthMeters = (this.rows - runStartRow) * this.cellSize;
        if (lengthMeters >= 1.5) {
          const avgLoss = Math.round((runWeight / (this.rows - runStartRow)) * 3.5 * 10) / 10;
          walls.push({
            id: `wall-v-${c}-${runStartRow}`,
            x1: Math.round(c * this.cellSize * 10) / 10,
            y1: Math.round(runStartRow * this.cellSize * 10) / 10,
            x2: Math.round(c * this.cellSize * 10) / 10,
            y2: Math.round(this.rows * this.cellSize * 10) / 10,
            attenuationDbm: Math.max(3.5, Math.min(14, avgLoss)),
            material: this.determineMaterial(avgLoss),
            confidence: Math.min(96, Math.max(45, Math.round(runHitCount * 8 + lengthMeters * 5))),
            rayHitCount: runHitCount,
            lastUpdated: Date.now(),
          });
        }
      }
    }

    // Merge near-duplicate parallel walls within 1.0m
    this.detectedWalls = this.filterAndMergeWalls(walls);
  }

  private filterAndMergeWalls(rawWalls: DetectedWall[]): DetectedWall[] {
    const merged: DetectedWall[] = [];

    for (const w of rawWalls) {
      // Check if a similar parallel wall is already included
      const existing = merged.find((m) => {
        const isHoriz = Math.abs(w.y1 - w.y2) < 0.1 && Math.abs(m.y1 - m.y2) < 0.1;
        const isVert = Math.abs(w.x1 - w.x2) < 0.1 && Math.abs(m.x1 - m.x2) < 0.1;

        if (isHoriz && Math.abs(w.y1 - m.y1) < 0.8) {
          return !(w.x2 < m.x1 - 0.5 || w.x1 > m.x2 + 0.5);
        }
        if (isVert && Math.abs(w.x1 - m.x1) < 0.8) {
          return !(w.y2 < m.y1 - 0.5 || w.y1 > m.y2 + 0.5);
        }
        return false;
      });

      if (!existing) {
        merged.push(w);
      } else {
        // Expand existing segment
        existing.x1 = Math.min(existing.x1, w.x1);
        existing.x2 = Math.max(existing.x2, w.x2);
        existing.y1 = Math.min(existing.y1, w.y1);
        existing.y2 = Math.max(existing.y2, w.y2);
        existing.confidence = Math.min(98, existing.confidence + 5);
        existing.rayHitCount += w.rayHitCount;
      }
    }

    return merged;
  }

  private determineMaterial(lossDbm: number): 'drywall' | 'brick' | 'concrete' | 'glass' {
    if (lossDbm < 4.5) return 'glass';
    if (lossDbm < 6.8) return 'drywall';
    if (lossDbm < 10.0) return 'brick';
    return 'concrete';
  }

  /**
   * Generates a complete floor plan with outer perimeter and interior partitions
   */
  public generateFullFloorPlan(name: string = 'Plano Auto-Generado por RF'): {
    walls: WallSegment[];
    widthMeters: number;
    heightMeters: number;
    estimatedAreaM2: number;
  } {
    // Determine bounds from detected walls or defaults
    let minX = 0.5;
    let maxX = this.gridWidth - 0.5;
    let minY = 0.5;
    let maxY = this.gridHeight - 0.5;

    if (this.detectedWalls.length > 0) {
      minX = Math.max(0.5, Math.min(...this.detectedWalls.map((w) => Math.min(w.x1, w.x2))) - 0.5);
      maxX = Math.min(this.gridWidth - 0.5, Math.max(...this.detectedWalls.map((w) => Math.max(w.x1, w.x2))) + 0.5);
      minY = Math.max(0.5, Math.min(...this.detectedWalls.map((w) => Math.min(w.y1, w.y2))) - 0.5);
      maxY = Math.min(this.gridHeight - 0.5, Math.max(...this.detectedWalls.map((w) => Math.max(w.y1, w.y2))) + 0.5);
    }

    const perimeterWalls: WallSegment[] = [
      { id: 'perim-north', x1: minX, y1: minY, x2: maxX, y2: minY, attenuationDbm: 12, material: 'concrete' },
      { id: 'perim-east', x1: maxX, y1: minY, x2: maxX, y2: maxY, attenuationDbm: 12, material: 'concrete' },
      { id: 'perim-south', x1: maxX, y1: maxY, x2: minX, y2: maxY, attenuationDbm: 12, material: 'concrete' },
      { id: 'perim-west', x1: minX, y1: maxY, x2: minX, y2: minY, attenuationDbm: 12, material: 'concrete' },
    ];

    const interiorWalls: WallSegment[] = this.detectedWalls.map((w, idx) => ({
      id: `wall-rf-${idx + 1}`,
      x1: Math.max(minX, Math.min(maxX, w.x1)),
      y1: Math.max(minY, Math.min(maxY, w.y1)),
      x2: Math.max(minX, Math.min(maxX, w.x2)),
      y2: Math.max(minY, Math.min(maxY, w.y2)),
      attenuationDbm: w.attenuationDbm,
      material: w.material,
    }));

    const fullWalls = [...perimeterWalls, ...interiorWalls];
    const widthMeters = Math.round((maxX - minX + 1.0) * 10) / 10;
    const heightMeters = Math.round((maxY - minY + 1.0) * 10) / 10;
    const estimatedAreaM2 = Math.round(widthMeters * heightMeters);

    return {
      walls: fullWalls,
      widthMeters: Math.max(10, widthMeters),
      heightMeters: Math.max(8, heightMeters),
      estimatedAreaM2,
    };
  }
}
