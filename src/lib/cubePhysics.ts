import * as THREE from 'three';
import { soundEngine } from '@/lib/audio/soundEngine';
import { UIObstacleAABB } from '@/lib/uiObstacles';
import { sessionPhysicsConfig } from '@/lib/sessionPhysics';
import { selectRevertPattern, computePatternDelays } from '@/lib/revertPatterns';
import { SpatialHash } from '@/lib/spatialHash';

// Haptic vibration throttling
let lastVibrateTime = 0;
let activePointerCount = 0;

if (typeof window !== 'undefined') {
  const handlePointerDown = () => {
    activePointerCount++;
  };
  const handlePointerUp = () => {
    activePointerCount = Math.max(0, activePointerCount - 1);
  };
  window.addEventListener('pointerdown', handlePointerDown, { passive: true });
  window.addEventListener('pointerup', handlePointerUp, { passive: true });
  window.addEventListener('pointercancel', handlePointerUp, { passive: true });
}

function triggerHaptic(durationMs: number = 12, isDirectTap: boolean = false) {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
  if (!isDirectTap && activePointerCount <= 0) return;
  const now = performance.now();
  if (now - lastVibrateTime > 90) {
    lastVibrateTime = now;
    try {
      navigator.vibrate(durationMs);
    } catch (e) {}
  }
}

export interface PhysicsGridData {
  cols: number;
  rows: number;
  cubeSize: number;
  gap: number;
  positions: Float32Array;        // 3 * N (current positions)
  velocities: Float32Array;       // 3 * N (current velocities)
  rotations: Float32Array;        // 3 * N (Euler angles X, Y, Z)
  angularVelocities: Float32Array;// 3 * N (angular velocity X, Y, Z)
  targetPositions: Float32Array;  // 3 * N (original picture positions)
  colors: Float32Array;           // 3 * N (RGB color)
  activeFlags: Uint8Array;        // N (1 = active physics, 0 = at rest)
  totalCubes: number;
}

// Ease-out-back: slight overshoot past target then settle — gives each
// cube a satisfying "snap" landing with a ~10% overshoot.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class CubePhysicsEngine {
  public grid: PhysicsGridData;
  public isDisturbed: boolean = false;
  public isReverting: boolean = false;

  private revertElapsed: number = 0;
  private revertStartPositions: Float32Array;
  private revertStartRotations: Float32Array;

  // Staggered revert pattern system
  private revertDelays: Float32Array;
  private revertGatherFlags: Float32Array;
  private revertHasGather: boolean = false;
  private revertTotalDuration: number = 2.4;
  private revertStaggerWindow: number = 1.85;
  private revertCubeTweenDuration: number = 0.55;
  private lastPatternIndex: number | null = null;

  private gatherWorldX: number = 0;
  private gatherWorldY: number = 0;
  private gatherWorldZ: number = 0;

  // Dense list of indices currently under simulation, for O(active) updates.
  private activeIndices: Int32Array;
  private activeCount: number = 0;

  // Per-cube dirty flags so we only rebuild matrices that actually moved.
  private matrixDirty: Uint8Array;
  private allMatricesDirty: boolean = true;

  private restSpeedThreshold: number = 0.02;

  // Broad-phase acceleration structure, rebuilt each frame over every cube so
  // flying cubes can collide with cubes still resting in the picture.
  private spatialHash: SpatialHash;

  // Collision geometry, derived from the *rendered* cube size so that what the
  // player sees touching is what the simulation treats as touching.
  private renderedSize: number = 0;
  private contactDistance: number = 0;

  // Impact accounting for a single well-mixed audio hit per frame.
  private frameImpactCount: number = 0;
  private frameImpactPeak: number = 0;

  private dummyObject: THREE.Object3D;
  private tempColor: THREE.Color;
  private colorsUploaded: boolean = false;

  constructor(cols: number, rows: number, cubeSize: number = 0.15, gap: number = 0.02) {
    const totalCubes = cols * rows;

    this.grid = {
      cols,
      rows,
      cubeSize,
      gap,
      positions: new Float32Array(totalCubes * 3),
      velocities: new Float32Array(totalCubes * 3),
      rotations: new Float32Array(totalCubes * 3),
      angularVelocities: new Float32Array(totalCubes * 3),
      targetPositions: new Float32Array(totalCubes * 3),
      colors: new Float32Array(totalCubes * 3),
      activeFlags: new Uint8Array(totalCubes),
      totalCubes,
    };

    this.revertStartPositions = new Float32Array(totalCubes * 3);
    this.revertStartRotations = new Float32Array(totalCubes * 3);
    this.revertDelays = new Float32Array(totalCubes);
    this.revertGatherFlags = new Float32Array(totalCubes * 3);
    this.activeIndices = new Int32Array(totalCubes);
    this.matrixDirty = new Uint8Array(totalCubes);

    this.dummyObject = new THREE.Object3D();
    this.tempColor = new THREE.Color();

    this.recomputeCollisionGeometry();
    this.spatialHash = new SpatialHash(totalCubes, this.contactDistance);
  }

  /**
   * Collision size tracks the rendered size (stride x 1.02), not the nominal
   * cubeSize. The old engine used cubeSize * 0.95 while drawing cubes 15%
   * larger, so cubes visibly overlapped long before they registered a hit.
   */
  private recomputeCollisionGeometry() {
    const stride = this.grid.cubeSize + this.grid.gap;
    this.renderedSize = stride * 1.02;
    this.contactDistance = this.renderedSize * 0.94;
  }

  public setRestSpeedThreshold(threshold: number) {
    this.restSpeedThreshold = threshold;
  }

  public getRenderedSize(): number {
    return this.renderedSize;
  }

  /**
   * Rebuilds the broad-phase index over every cube.
   *
   * Must be called before any hash query. `update()` returns early when nothing
   * is in motion, so relying on it alone left the index empty on a resting
   * picture — which made the very first tap on fresh artwork do nothing.
   */
  private rebuildBroadphase() {
    this.spatialHash.setCellSize(this.contactDistance);
    this.spatialHash.build(this.grid.positions, this.grid.totalCubes);
  }
  /**
   * Percentage of cubes displaced from their target position (Chaos Stat).
   */
  public getChaosPercentage(): number {
    const { positions, targetPositions, totalCubes, cubeSize } = this.grid;
    if (totalCubes === 0) return 0;

    let displaced = 0;
    const thresholdSq = Math.pow(cubeSize * 0.4, 2);

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;
      const dx = positions[i3] - targetPositions[i3];
      const dy = positions[i3 + 1] - targetPositions[i3 + 1];
      const dz = positions[i3 + 2] - targetPositions[i3 + 2];
      if (dx * dx + dy * dy + dz * dz > thresholdSq) {
        displaced++;
      }
    }

    return Math.round((displaced / totalCubes) * 100);
  }

  /**
   * Exports current disturbed cube offsets for saving challenge links.
   */
  public getDisturbedPositions(): Array<{ i: number; x: number; y: number; z: number; rx: number; ry: number; rz: number }> {
    const { positions, rotations, targetPositions, totalCubes, cubeSize } = this.grid;
    const result = [];
    const thresholdSq = Math.pow(cubeSize * 0.2, 2);

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;
      const dx = positions[i3] - targetPositions[i3];
      const dy = positions[i3 + 1] - targetPositions[i3 + 1];
      const dz = positions[i3 + 2] - targetPositions[i3 + 2];

      if (
        dx * dx + dy * dy + dz * dz > thresholdSq ||
        rotations[i3] !== 0 || rotations[i3 + 1] !== 0 || rotations[i3 + 2] !== 0
      ) {
        result.push({
          i,
          x: positions[i3],
          y: positions[i3 + 1],
          z: positions[i3 + 2],
          rx: rotations[i3],
          ry: rotations[i3 + 1],
          rz: rotations[i3 + 2],
        });
      }
    }
    return result;
  }

  /**
   * Restores disturbed cube positions from API data for challenge pages.
   */
  public restoreDisturbedState(savedOffsets: any) {
    if (!savedOffsets || savedOffsets.length === 0) return;
    const { positions, rotations, totalCubes } = this.grid;

    if (Array.isArray(savedOffsets) && typeof savedOffsets[0] === 'number') {
      // Flat format: [i, x, y, z, rx, ry, rz, ...]
      for (let idx = 0; idx + 6 < savedOffsets.length; idx += 7) {
        const i = savedOffsets[idx];
        if (i >= 0 && i < totalCubes) {
          const i3 = i * 3;
          positions[i3] = savedOffsets[idx + 1];
          positions[i3 + 1] = savedOffsets[idx + 2];
          positions[i3 + 2] = savedOffsets[idx + 3];
          rotations[i3] = savedOffsets[idx + 4];
          rotations[i3 + 1] = savedOffsets[idx + 5];
          rotations[i3 + 2] = savedOffsets[idx + 6];
          this.activateCube(i);
        }
      }
    } else {
      for (const item of savedOffsets) {
        if (item.i >= 0 && item.i < totalCubes) {
          const i3 = item.i * 3;
          positions[i3] = item.x;
          positions[i3 + 1] = item.y;
          positions[i3 + 2] = item.z;
          rotations[i3] = item.rx;
          rotations[i3 + 1] = item.ry;
          rotations[i3 + 2] = item.rz;
          this.activateCube(item.i);
        }
      }
    }
    this.isDisturbed = true;
    this.allMatricesDirty = true;
  }

  /**
   * Initializes or updates the cube grid positions & colors from sampled data.
   */
  public initFromData(
    cols: number,
    rows: number,
    colors: Float32Array,
    cubeSize: number = 0.15,
    gap: number = 0.02
  ) {
    const totalCubes = cols * rows;
    this.grid.cols = cols;
    this.grid.rows = rows;
    this.grid.cubeSize = cubeSize;
    this.grid.gap = gap;
    this.grid.totalCubes = totalCubes;

    this.grid.positions = new Float32Array(totalCubes * 3);
    this.grid.velocities = new Float32Array(totalCubes * 3);
    this.grid.rotations = new Float32Array(totalCubes * 3);
    this.grid.angularVelocities = new Float32Array(totalCubes * 3);
    this.grid.targetPositions = new Float32Array(totalCubes * 3);
    this.grid.colors = colors;
    this.grid.activeFlags = new Uint8Array(totalCubes);

    this.revertStartPositions = new Float32Array(totalCubes * 3);
    this.revertStartRotations = new Float32Array(totalCubes * 3);
    this.revertDelays = new Float32Array(totalCubes);
    this.revertGatherFlags = new Float32Array(totalCubes * 3);
    this.activeIndices = new Int32Array(totalCubes);
    this.matrixDirty = new Uint8Array(totalCubes);

    this.activeCount = 0;
    this.isDisturbed = false;
    this.isReverting = false;
    this.lastPatternIndex = null;
    this.colorsUploaded = false;
    this.allMatricesDirty = true;

    this.recomputeCollisionGeometry();
    this.spatialHash = new SpatialHash(totalCubes, this.contactDistance);

    const stride = cubeSize + gap;
    const offsetX = ((cols - 1) * stride) / 2;
    const offsetY = ((rows - 1) * stride) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const i3 = i * 3;
        const x = c * stride - offsetX;
        const y = (rows - 1 - r) * stride - offsetY;

        this.grid.targetPositions[i3] = x;
        this.grid.targetPositions[i3 + 1] = y;
        this.grid.targetPositions[i3 + 2] = 0;

        this.grid.positions[i3] = x;
        this.grid.positions[i3 + 1] = y;
        this.grid.positions[i3 + 2] = 0;
      }
    }
  }

  private activateCube(index: number) {
    if (this.grid.activeFlags[index] === 0) {
      this.grid.activeFlags[index] = 1;
      this.activeIndices[this.activeCount++] = index;
      this.isDisturbed = true;
    }
  }

  private deactivateCube(index: number, activeListIndex: number) {
    this.grid.activeFlags[index] = 0;
    // Swap-with-last keeps the active list dense in O(1).
    const lastIndex = this.activeIndices[this.activeCount - 1];
    this.activeIndices[activeListIndex] = lastIndex;
    this.activeCount--;
  }
  /**
   * Pointer hit test: shoves cubes inside the interaction radius.
   *
   * Uses the spatial hash rather than scanning all N cubes, and pushes cubes
   * along the swipe direction (not just radially outward) so a drag feels like
   * dragging a hand through blocks instead of a uniform explosion.
   */
  public applyPointerImpulse(
    pointerPos: THREE.Vector3,
    pointerVel: THREE.Vector2,
    radius: number = 0.6,
    strength: number = 4.0
  ) {
    if (this.isReverting) return;

    const { positions, velocities, angularVelocities } = this.grid;
    const speed = pointerVel.length();
    const impulseMag = strength * sessionPhysicsConfig.impulseResponse * (1.0 + Math.min(speed * 0.75, 3.0));
    const radiusSq = radius * radius;

    // The index must reflect current positions before querying it. On a resting
    // picture update() skips its rebuild, so do it here.
    this.rebuildBroadphase();

    // Query the hash over the cells the interaction sphere covers.
    const hash = this.spatialHash;
    const minCx = hash.cellCoord(pointerPos.x - radius);
    const maxCx = hash.cellCoord(pointerPos.x + radius);
    const minCy = hash.cellCoord(pointerPos.y - radius);
    const maxCy = hash.cellCoord(pointerPos.y + radius);
    // Search a deep column in Z so we always find cubes even if they pop up
    const minCz = hash.cellCoord(pointerPos.z - radius * 10);
    const maxCz = hash.cellCoord(pointerPos.z + radius * 10);

    let touched = 0;
    let peak = 0;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const bucket = hash.hashCell(cx, cy, cz);
          const end = hash.bucketEnd(bucket);

          for (let e = hash.bucketStart(bucket); e < end; e++) {
            const i = hash.entryAt(e);
            const i3 = i * 3;

            const dx = positions[i3] - pointerPos.x;
            const dy = positions[i3 + 1] - pointerPos.y;
            const dz = positions[i3 + 2] - pointerPos.z;

            // Ignore Z distance so a swipe hits the cube "under" the finger on screen
            const distSq = dx * dx + dy * dy;
            if (distSq >= radiusSq) continue;

            const dist = Math.max(Math.sqrt(distSq), 0.001);
            // Smooth falloff — squared so the centre of the swipe bites harder.
            const falloff = 1.0 - dist / radius;
            const factor = falloff * falloff;

            const nx = dx / dist;
            const ny = dy / dist;

            // Radial shove plus the swipe's own direction, so cubes travel with
            // the finger and pile up ahead of it.
            const pushX = (nx * 0.55 + pointerVel.x * 0.85) * factor * impulseMag;
            const pushY = (ny * 0.55 + pointerVel.y * 0.85) * factor * impulseMag;
            // Cubes lift slightly off the floor but stay mostly flat
            const pushZ = (0.15 + falloff * 0.2) * factor * impulseMag * 0.4;

            this.activateCube(i);
            velocities[i3] += pushX;
            velocities[i3 + 1] += pushY;
            velocities[i3 + 2] += pushZ;

            // Tumble scales with how hard the cube was hit.
            const spin = factor * impulseMag * 1.6;
            angularVelocities[i3] += (Math.random() - 0.5) * spin;
            angularVelocities[i3 + 1] += (Math.random() - 0.5) * spin;
            angularVelocities[i3 + 2] += (Math.random() - 0.5) * spin;

            this.matrixDirty[i] = 1;
            touched++;
            if (factor > peak) peak = factor;
          }
        }
      }
    }

    if (touched > 0) {
      // One scaled sound for the whole swipe, rather than one per cube.
      soundEngine.playCubeCluster(touched, impulseMag * peak, 'scrape');
      triggerHaptic(10, false);
    }
  }

  /**
   * Blows the whole picture apart from its centre.
   */
  public triggerDisperse() {
    // Cancelling a revert mid-flight has to clear the active list too, or cubes
    // that were mid-tween keep stale active entries and never settle.
    if (this.isReverting) {
      this.isReverting = false;
      this.activeCount = 0;
      this.grid.activeFlags.fill(0);
    }

    const { totalCubes, targetPositions, velocities, angularVelocities } = this.grid;
    const response = sessionPhysicsConfig.impulseResponse;

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;

      let dx = targetPositions[i3];
      let dy = targetPositions[i3 + 1];
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.001) {
        const randomAngle = Math.random() * Math.PI * 2;
        dx = Math.cos(randomAngle);
        dy = Math.sin(randomAngle);
        dist = 1;
      }

      const dirX = dx / dist;
      const dirY = dy / dist;

      const spreadAngle = (Math.random() - 0.5) * 0.9;
      const cosA = Math.cos(spreadAngle);
      const sinA = Math.sin(spreadAngle);

      const vxDir = dirX * cosA - dirY * sinA;
      const vyDir = dirX * sinA + dirY * cosA;

      // Cubes slide outward mostly on the floor
      const centreBias = 1.35 - Math.min(dist / 3.0, 0.55);
      const speed = (8.0 + Math.random() * 10.0) * centreBias * response;
      const popZ = (0.6 + Math.random() * 1.4) * response;

      this.activateCube(i);

      velocities[i3] += vxDir * speed;
      velocities[i3 + 1] += vyDir * speed;
      velocities[i3 + 2] += popZ;

      angularVelocities[i3] += (Math.random() - 0.5) * 22;
      angularVelocities[i3 + 1] += (Math.random() - 0.5) * 22;
      angularVelocities[i3 + 2] += (Math.random() - 0.5) * 22;
    }

    this.isDisturbed = true;
    this.allMatricesDirty = true;
    soundEngine.playDisperseBlast();
    triggerHaptic(28, true);
  }

  /**
   * Starts the Revert animation with a randomly chosen stagger pattern.
   */
  public triggerRevert() {
    if (!this.isDisturbed || this.isReverting) return;

    const { positions, rotations, totalCubes, cols, rows, cubeSize, gap } = this.grid;
    this.revertStartPositions.set(positions);
    this.revertStartRotations.set(rotations);
    this.revertElapsed = 0;

    const patternIdx = selectRevertPattern(this.lastPatternIndex);
    this.lastPatternIndex = patternIdx;

    this.revertGatherFlags.fill(0);
    this.revertHasGather = computePatternDelays(
      patternIdx,
      rows,
      cols,
      this.revertDelays,
      this.revertGatherFlags,
    );

    if (patternIdx === 0) {
      this.revertStaggerWindow = 0;
      this.revertCubeTweenDuration = 0.75;
      this.revertTotalDuration = 0.75;
    } else {
      this.revertStaggerWindow = 1.85;
      this.revertCubeTweenDuration = 0.55;
      this.revertTotalDuration = this.revertStaggerWindow + this.revertCubeTweenDuration;
    }

    if (this.revertHasGather) {
      const stride = cubeSize + gap;
      this.gatherWorldX = 0;
      this.gatherWorldY = -((rows - 1) * stride) / 2;
      this.gatherWorldZ = 1.5;
    }

    soundEngine.playRevertStart();
    this.isReverting = true;
  }
  /**
   * Main physics step.
   *
   * Order matters: integrate, resolve static geometry (viewport + UI), then
   * resolve cube-vs-cube contacts against a freshly built broad-phase, then
   * decide what may sleep.
   */
  public update(
    dt: number,
    obstacles?: UIObstacleAABB[],
    viewportBounds?: { minX: number; maxX: number; minY: number; maxY: number }
  ) {
    if (this.isReverting) {
      this.updateRevert(dt);
      return;
    }

    if (this.activeCount === 0) return;

    const {
      positions,
      velocities,
      rotations,
      angularVelocities,
      totalCubes,
    } = this.grid;

    this.frameImpactCount = 0;
    this.frameImpactPeak = 0;

    // Air drag. Lighter than before so cubes carry momentum across the canvas
    // and actually reach each other — the old value killed motion in ~0.3s.
    const damping = Math.pow(sessionPhysicsConfig.friction, dt * 60);
    const angularDamping = Math.pow(0.18, dt);
    const restSpeedThreshold = this.restSpeedThreshold;
    const halfCube = this.renderedSize * 0.5;

    // 1. Integrate active cubes and resolve static geometry.
    for (let a = 0; a < this.activeCount; a++) {
      const i = this.activeIndices[a];
      const i3 = i * 3;

      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
      positions[i3 + 2] += velocities[i3 + 2] * dt;

      rotations[i3] += angularVelocities[i3] * dt;
      rotations[i3 + 1] += angularVelocities[i3 + 1] * dt;
      rotations[i3 + 2] += angularVelocities[i3 + 2] * dt;

      velocities[i3] *= damping;
      velocities[i3 + 1] *= damping;
      velocities[i3 + 2] *= damping;

      angularVelocities[i3] *= angularDamping;
      angularVelocities[i3 + 1] *= angularDamping;
      angularVelocities[i3 + 2] *= angularDamping;

      this.matrixDirty[i] = 1;

      if (viewportBounds) {
        const restitution = sessionPhysicsConfig.bounceDamping;

        if (positions[i3] - halfCube < viewportBounds.minX) {
          positions[i3] = viewportBounds.minX + halfCube;
          if (velocities[i3] < 0) {
            velocities[i3] = -velocities[i3] * restitution;
            this.registerImpact(Math.abs(velocities[i3]));
          }
        } else if (positions[i3] + halfCube > viewportBounds.maxX) {
          positions[i3] = viewportBounds.maxX - halfCube;
          if (velocities[i3] > 0) {
            velocities[i3] = -velocities[i3] * restitution;
            this.registerImpact(Math.abs(velocities[i3]));
          }
        }

        if (positions[i3 + 1] - halfCube < viewportBounds.minY) {
          positions[i3 + 1] = viewportBounds.minY + halfCube;
          if (velocities[i3 + 1] < 0) {
            velocities[i3 + 1] = -velocities[i3 + 1] * restitution;
            this.registerImpact(Math.abs(velocities[i3 + 1]));
          }
        } else if (positions[i3 + 1] + halfCube > viewportBounds.maxY) {
          positions[i3 + 1] = viewportBounds.maxY - halfCube;
          if (velocities[i3 + 1] > 0) {
            velocities[i3 + 1] = -velocities[i3 + 1] * restitution;
            this.registerImpact(Math.abs(velocities[i3 + 1]));
          }
        }

        // The screen acts as a solid floor at Z=0
        if (positions[i3 + 2] < 0.0) {
          positions[i3 + 2] = 0.0;
          if (velocities[i3 + 2] < 0) velocities[i3 + 2] = -velocities[i3 + 2] * restitution;
        } else if (positions[i3 + 2] > 2.0) {
          positions[i3 + 2] = 2.0;
          if (velocities[i3 + 2] > 0) velocities[i3 + 2] = -velocities[i3 + 2] * restitution;
        }
      }

      if (obstacles && obstacles.length > 0) {
        this.resolveObstacles(i3, halfCube, obstacles);
      }
    }

    // 2. Rebuild the broad-phase over every cube — resting cubes must be
    //    collidable, otherwise flying cubes pass through the intact picture.
    this.rebuildBroadphase();

    // 3. Resolve cube-vs-cube contacts for everything currently in motion.
    //    Iterating a snapshot count keeps newly-woken cubes out of this pass so
    //    each contact is resolved once per frame.
    const movingCount = this.activeCount;
    for (let a = 0; a < movingCount; a++) {
      this.resolveCubeContacts(this.activeIndices[a]);
    }

    // 4. Sleep pass — walk backwards so swap-with-last removal is safe.
    for (let a = this.activeCount - 1; a >= 0; a--) {
      const i = this.activeIndices[a];
      const i3 = i * 3;

      const speedSq =
        velocities[i3] * velocities[i3] +
        velocities[i3 + 1] * velocities[i3 + 1] +
        velocities[i3 + 2] * velocities[i3 + 2];
      const angSpeedSq =
        angularVelocities[i3] * angularVelocities[i3] +
        angularVelocities[i3 + 1] * angularVelocities[i3 + 1] +
        angularVelocities[i3 + 2] * angularVelocities[i3 + 2];

      if (
        speedSq < restSpeedThreshold * restSpeedThreshold &&
        angSpeedSq < restSpeedThreshold * restSpeedThreshold
      ) {
        velocities[i3] = 0;
        velocities[i3 + 1] = 0;
        velocities[i3 + 2] = 0;
        angularVelocities[i3] = 0;
        angularVelocities[i3 + 1] = 0;
        angularVelocities[i3 + 2] = 0;
        this.deactivateCube(i, a);
      }
    }

    // One mixed impact sound per frame instead of a burst of identical knocks.
    if (this.frameImpactCount > 0) {
      soundEngine.playCubeCluster(this.frameImpactCount, this.frameImpactPeak, 'knock');
      if (this.frameImpactPeak > 2.5) {
        triggerHaptic(14, false);
      }
    }
  }

  private registerImpact(magnitude: number) {
    this.frameImpactCount++;
    if (magnitude > this.frameImpactPeak) this.frameImpactPeak = magnitude;
  }

  /**
   * Pushes a cube out of any UI obstacle it has entered, along the axis of least
   * penetration.
   */
  private resolveObstacles(i3: number, halfCube: number, obstacles: UIObstacleAABB[]) {
    const { positions, velocities, angularVelocities } = this.grid;
    const restitution = 0.5;

    for (let o = 0; o < obstacles.length; o++) {
      const obs = obstacles[o];

      if (
        positions[i3] + halfCube < obs.minX || positions[i3] - halfCube > obs.maxX ||
        positions[i3 + 1] + halfCube < obs.minY || positions[i3 + 1] - halfCube > obs.maxY ||
        positions[i3 + 2] + halfCube < obs.minZ || positions[i3 + 2] - halfCube > obs.maxZ
      ) {
        continue;
      }

      const overlapLeft = (positions[i3] + halfCube) - obs.minX;
      const overlapRight = obs.maxX - (positions[i3] - halfCube);
      const overlapBottom = (positions[i3 + 1] + halfCube) - obs.minY;
      const overlapTop = obs.maxY - (positions[i3 + 1] - halfCube);
      const overlapBack = (positions[i3 + 2] + halfCube) - obs.minZ;
      const overlapFront = obs.maxZ - (positions[i3 + 2] - halfCube);

      const minOverlap = Math.min(
        overlapLeft, overlapRight, overlapBottom, overlapTop, overlapBack, overlapFront
      );

      // Only count a sound when the cube was actually moving into the surface,
      // otherwise a cube resting against a button re-triggers a knock forever.
      let impactSpeed = 0;

      if (minOverlap === overlapLeft) {
        positions[i3] = obs.minX - halfCube;
        if (velocities[i3] > 0) { impactSpeed = velocities[i3]; velocities[i3] *= -restitution; }
      } else if (minOverlap === overlapRight) {
        positions[i3] = obs.maxX + halfCube;
        if (velocities[i3] < 0) { impactSpeed = -velocities[i3]; velocities[i3] *= -restitution; }
      } else if (minOverlap === overlapBottom) {
        positions[i3 + 1] = obs.minY - halfCube;
        if (velocities[i3 + 1] > 0) { impactSpeed = velocities[i3 + 1]; velocities[i3 + 1] *= -restitution; }
      } else if (minOverlap === overlapTop) {
        positions[i3 + 1] = obs.maxY + halfCube;
        if (velocities[i3 + 1] < 0) { impactSpeed = -velocities[i3 + 1]; velocities[i3 + 1] *= -restitution; }
      } else if (minOverlap === overlapBack) {
        positions[i3 + 2] = obs.minZ - halfCube;
        if (velocities[i3 + 2] > 0) { impactSpeed = velocities[i3 + 2]; velocities[i3 + 2] *= -restitution; }
      } else {
        positions[i3 + 2] = obs.maxZ + halfCube;
        if (velocities[i3 + 2] < 0) { impactSpeed = -velocities[i3 + 2]; velocities[i3 + 2] *= -restitution; }
      }

      if (impactSpeed > 0.25) {
        angularVelocities[i3] += (Math.random() - 0.5) * impactSpeed * 2;
        angularVelocities[i3 + 1] += (Math.random() - 0.5) * impactSpeed * 2;
        this.registerImpact(impactSpeed);
      }
    }
  }
  /**
   * Resolves contacts between cube `i` and every cube genuinely near it.
   *
   * This is what makes cubes hit and displace each other. Two parts, both
   * required: positional separation so blocks never interpenetrate, and an
   * impulse exchange along the contact normal so momentum transfers — a fast
   * cube slams into a resting one, knocks it loose, and loses speed doing it.
   */
  private resolveCubeContacts(i: number) {
    const { positions, velocities, angularVelocities } = this.grid;
    const i3 = i * 3;

    const contact = this.contactDistance;
    const contactSq = contact * contact;
    const hash = this.spatialHash;
    const restitution = sessionPhysicsConfig.bounceDamping;

    const cx = hash.cellCoord(positions[i3]);
    const cy = hash.cellCoord(positions[i3 + 1]);
    const cz = hash.cellCoord(positions[i3 + 2]);

    // 3x3x3 neighbourhood: with cell size == contact distance, no contact can
    // be missed and no farther cell needs checking.
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bucket = hash.hashCell(cx + ox, cy + oy, cz + oz);
          const end = hash.bucketEnd(bucket);

          for (let e = hash.bucketStart(bucket); e < end; e++) {
            const j = hash.entryAt(e);
            // Skip self, and skip the mirrored pair so each contact resolves once.
            if (j <= i) continue;

            const j3 = j * 3;

            const dx = positions[i3] - positions[j3];
            const dy = positions[i3 + 1] - positions[j3 + 1];
            const dz = positions[i3 + 2] - positions[j3 + 2];
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq >= contactSq || distSq < 1e-9) continue;

            const dist = Math.sqrt(distSq);
            const overlap = contact - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            const jIsResting = this.grid.activeFlags[j] === 0;

            // --- Positional separation ---
            // A resting cube is treated as heavier: the moving cube gives up
            // most of the correction. That keeps the intact picture from being
            // shoved around by a single graze while still letting hard hits
            // punch cubes out of it.
            const iShare = jIsResting ? 0.8 : 0.5;
            const jShare = 1 - iShare;

            positions[i3] += nx * overlap * iShare;
            positions[i3 + 1] += ny * overlap * iShare;
            positions[i3 + 2] += nz * overlap * iShare;

            positions[j3] -= nx * overlap * jShare;
            positions[j3 + 1] -= ny * overlap * jShare;
            positions[j3 + 2] -= nz * overlap * jShare;

            // --- Impulse exchange ---
            const relVx = velocities[i3] - velocities[j3];
            const relVy = velocities[i3 + 1] - velocities[j3 + 1];
            const relVz = velocities[i3 + 2] - velocities[j3 + 2];

            // Closing speed along the normal. Negative means separating already.
            const normalSpeed = relVx * nx + relVy * ny + relVz * nz;

            this.matrixDirty[i] = 1;
            this.matrixDirty[j] = 1;

            if (normalSpeed >= 0) {
              // Not approaching — separation above was enough. Still wake the
              // neighbour so a resting cube pushed off-grid can settle properly.
              if (jIsResting && overlap > contact * 0.08) {
                this.activateCube(j);
              }
              continue;
            }

            // Equal-mass elastic response scaled by restitution.
            const impulse = -(1 + restitution) * normalSpeed * 0.5;

            velocities[i3] += nx * impulse;
            velocities[i3 + 1] += ny * impulse;
            velocities[i3 + 2] += nz * impulse;

            this.activateCube(j);
            velocities[j3] -= nx * impulse;
            velocities[j3 + 1] -= ny * impulse;
            velocities[j3 + 2] -= nz * impulse;

            // Glancing hits set cubes spinning; the tangential part of the
            // relative velocity drives how much.
            const tangentX = relVx - nx * normalSpeed;
            const tangentY = relVy - ny * normalSpeed;
            const spin = Math.min(Math.sqrt(tangentX * tangentX + tangentY * tangentY), 6) * 0.9;

            if (spin > 0.05) {
              angularVelocities[i3 + 2] -= tangentX * 0.35;
              angularVelocities[j3 + 2] += tangentX * 0.35;
              angularVelocities[i3] += tangentY * 0.25;
              angularVelocities[j3] -= tangentY * 0.25;
            }

            const impactStrength = -normalSpeed;
            if (impactStrength > 0.35) {
              this.registerImpact(impactStrength);
            }
          }
        }
      }
    }
  }

  /**
   * Handles the stagger-patterned revert back to target positions & rotations.
   */
  private updateRevert(dt: number) {
    this.revertElapsed += dt;

    const { positions, rotations, targetPositions, totalCubes } = this.grid;
    const staggerWindow = this.revertStaggerWindow;
    const cubeTween = this.revertCubeTweenDuration;
    const hasGather = this.revertHasGather;
    const gatherX = this.gatherWorldX;
    const gatherY = this.gatherWorldY;
    const gatherZ = this.gatherWorldZ;

    let allDone = true;

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;
      const cubeDelay = this.revertDelays[i] * staggerWindow;
      const cubeElapsed = this.revertElapsed - cubeDelay;

      if (cubeElapsed < 0) {
        allDone = false;
        continue;
      }

      const t = Math.min(cubeElapsed / cubeTween, 1.0);
      if (t < 1.0) allDone = false;

      const ease = easeOutBack(t);

      if (hasGather && this.revertGatherFlags[i3] > 0) {
        const phase1End = 0.45;
        if (t < phase1End) {
          const e1 = easeOutBack(t / phase1End);
          positions[i3] = this.revertStartPositions[i3] + (gatherX - this.revertStartPositions[i3]) * e1;
          positions[i3 + 1] = this.revertStartPositions[i3 + 1] + (gatherY - this.revertStartPositions[i3 + 1]) * e1;
          positions[i3 + 2] = this.revertStartPositions[i3 + 2] + (gatherZ - this.revertStartPositions[i3 + 2]) * e1;
        } else {
          const e2 = easeOutBack((t - phase1End) / (1 - phase1End));
          positions[i3] = gatherX + (targetPositions[i3] - gatherX) * e2;
          positions[i3 + 1] = gatherY + (targetPositions[i3 + 1] - gatherY) * e2;
          positions[i3 + 2] = gatherZ + (targetPositions[i3 + 2] - gatherZ) * e2;
        }
      } else {
        positions[i3] = this.revertStartPositions[i3] + (targetPositions[i3] - this.revertStartPositions[i3]) * ease;
        positions[i3 + 1] = this.revertStartPositions[i3 + 1] + (targetPositions[i3 + 1] - this.revertStartPositions[i3 + 1]) * ease;
        positions[i3 + 2] = this.revertStartPositions[i3 + 2] + (targetPositions[i3 + 2] - this.revertStartPositions[i3 + 2]) * ease;
      }

      rotations[i3] = this.revertStartRotations[i3] * (1 - ease);
      rotations[i3 + 1] = this.revertStartRotations[i3 + 1] * (1 - ease);
      rotations[i3 + 2] = this.revertStartRotations[i3 + 2] * (1 - ease);
    }

    this.allMatricesDirty = true;

    if (allDone) {
      // Snap to exact targets to clear easeOutBack overshoot residue.
      for (let i = 0; i < totalCubes; i++) {
        const i3 = i * 3;
        positions[i3] = targetPositions[i3];
        positions[i3 + 1] = targetPositions[i3 + 1];
        positions[i3 + 2] = targetPositions[i3 + 2];
        rotations[i3] = 0;
        rotations[i3 + 1] = 0;
        rotations[i3 + 2] = 0;
      }

      this.isReverting = false;
      this.isDisturbed = false;
      this.activeCount = 0;
      this.grid.activeFlags.fill(0);
      this.grid.velocities.fill(0);
      this.grid.angularVelocities.fill(0);
      soundEngine.playRevertComplete();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('unravel-revert-complete'));
      }
    }
  }

  /** Normalized disturbance level (0 at rest, 1 at high chaos). */
  public getDisturbanceLevel(): number {
    if (this.grid.totalCubes === 0) return 0;
    return Math.min(this.activeCount / (this.grid.totalCubes * 0.4), 1.0);
  }

  /**
   * Writes cube transforms into the InstancedMesh.
   *
   * Only cubes flagged dirty get their matrix recomposed — with a few dozen
   * cubes moving out of a few thousand, that is the difference between a
   * full-grid rebuild every frame and touching just what changed. Colours are
   * static per creation, so they upload exactly once.
   */
  public updateInstancedMesh(mesh: THREE.InstancedMesh) {
    const { positions, rotations, colors, totalCubes } = this.grid;
    const renderedSize = this.renderedSize;
    const full = this.allMatricesDirty;

    for (let i = 0; i < totalCubes; i++) {
      if (!full && this.matrixDirty[i] === 0) continue;

      const i3 = i * 3;
      this.dummyObject.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      this.dummyObject.rotation.set(rotations[i3], rotations[i3 + 1], rotations[i3 + 2]);
      this.dummyObject.scale.setScalar(renderedSize);
      this.dummyObject.updateMatrix();
      mesh.setMatrixAt(i, this.dummyObject.matrix);
      this.matrixDirty[i] = 0;
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.allMatricesDirty = false;

    if (!this.colorsUploaded) {
      for (let i = 0; i < totalCubes; i++) {
        const i3 = i * 3;
        this.tempColor.setRGB(colors[i3], colors[i3 + 1], colors[i3 + 2], THREE.SRGBColorSpace);
        mesh.setColorAt(i, this.tempColor);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.colorsUploaded = true;
    }
  }

  /** Forces a full matrix rebuild — used after a WebGL context restore. */
  public markAllDirty() {
    this.allMatricesDirty = true;
    this.colorsUploaded = false;
  }
}
