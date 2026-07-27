import * as THREE from 'three';
import { soundEngine } from '@/lib/audio/soundEngine';
import { UIObstacleAABB } from '@/lib/uiObstacles';
import { sessionPhysicsConfig } from '@/lib/sessionPhysics';
import { selectRevertPattern, computePatternDelays } from '@/lib/revertPatterns';

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
  window.addEventListener('touchstart', handlePointerDown, { passive: true });
  window.addEventListener('pointerup', handlePointerUp, { passive: true });
  window.addEventListener('touchend', handlePointerUp, { passive: true });
  window.addEventListener('pointercancel', handlePointerUp, { passive: true });
  window.addEventListener('touchcancel', handlePointerUp, { passive: true });
}

function triggerHaptic(durationMs: number = 12, isDirectTap: boolean = false) {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    if (!isDirectTap && activePointerCount <= 0) return;
    const now = performance.now();
    if (now - lastVibrateTime > 120) {
      lastVibrateTime = now;
      try {
        navigator.vibrate(durationMs);
      } catch (e) {}
    }
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

  // Staggered revert pattern system (V23)
  private revertDelays: Float32Array;          // Per-cube normalised delay [0,1]
  private revertGatherFlags: Float32Array;     // Per-cube gather-point data (3*N); [0]=flag
  private revertHasGather: boolean = false;    // True when active pattern uses gather points
  private revertTotalDuration: number = 2.4;   // Full reveal window (seconds)
  private revertStaggerWindow: number = 1.85;  // Portion of window for stagger spread
  private revertCubeTweenDuration: number = 0.55; // Each cube's individual tween length
  private lastPatternIndex: number | null = null;

  // Gather-point world coordinates for convergent-gather pattern
  private gatherWorldX: number = 0;
  private gatherWorldY: number = 0;
  private gatherWorldZ: number = 0;

  // Active indices array for O(active_count) updates
  private activeIndices: Int32Array;
  private activeCount: number = 0;

  // Configurable rest speed threshold for adaptive quality scaling
  private restSpeedThreshold: number = 0.02;

  // Temporary objects for Three.js matrix updates without allocations
  private dummyObject: THREE.Object3D;
  private tempVec3: THREE.Vector3;
  private tempColor: THREE.Color;

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

    this.dummyObject = new THREE.Object3D();
    this.tempVec3 = new THREE.Vector3();
    this.tempColor = new THREE.Color();
  }

  public setRestSpeedThreshold(threshold: number) {
    this.restSpeedThreshold = threshold;
  }

  /**
   * Calculates the percentage of cubes displaced from their target position (Chaos Stat).
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
   * Exports array of current disturbed cube offsets for saving challenge links.
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

      if (dx * dx + dy * dy + dz * dz > thresholdSq || rotations[i3] !== 0 || rotations[i3 + 1] !== 0 || rotations[i3 + 2] !== 0) {
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
  public restoreDisturbedState(savedOffsets: Array<{ i: number; x: number; y: number; z: number; rx: number; ry: number; rz: number }>) {
    if (!savedOffsets || savedOffsets.length === 0) return;
    const { positions, rotations, totalCubes } = this.grid;

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
    this.isDisturbed = true;
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
    this.activeCount = 0;
    this.isDisturbed = false;
    this.isReverting = false;
    this.lastPatternIndex = null;

    const stride = cubeSize + gap;
    const offsetX = ((cols - 1) * stride) / 2;
    const offsetY = ((rows - 1) * stride) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const i3 = i * 3;
        const x = c * stride - offsetX;
        const y = (rows - 1 - r) * stride - offsetY;
        const z = 0;

        this.grid.targetPositions[i3] = x;
        this.grid.targetPositions[i3 + 1] = y;
        this.grid.targetPositions[i3 + 2] = z;

        this.grid.positions[i3] = x;
        this.grid.positions[i3 + 1] = y;
        this.grid.positions[i3 + 2] = z;
      }
    }
  }

  /**
   * Activates a specific cube index for physics simulation.
   */
  private activateCube(index: number) {
    if (this.grid.activeFlags[index] === 0) {
      this.grid.activeFlags[index] = 1;
      this.activeIndices[this.activeCount++] = index;
      this.isDisturbed = true;
    }
  }

  /**
   * Deactivates a cube (drops back to "at rest" state).
   */
  private deactivateCube(index: number, activeListIndex: number) {
    this.grid.activeFlags[index] = 0;
    // Swap with last active index to maintain dense active list in O(1)
    const lastIndex = this.activeIndices[this.activeCount - 1];
    this.activeIndices[activeListIndex] = lastIndex;
    this.activeCount--;
  }

  /**
   * Pointer hit test: applies impulse to cubes within interaction radius.
   */
  public applyPointerImpulse(
    pointerPos: THREE.Vector3,
    pointerVel: THREE.Vector2,
    radius: number = 0.6,
    strength: number = 4.0
  ) {
    if (this.isReverting) return;

    const { positions, velocities, angularVelocities, totalCubes } = this.grid;
    const speed = pointerVel.length();
    const impulseMag = strength * (1.0 + Math.min(speed * 0.1, 3.0));

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;
      const dx = positions[i3] - pointerPos.x;
      const dy = positions[i3 + 1] - pointerPos.y;
      const dz = positions[i3 + 2] - pointerPos.z;

      const distSq = dx * dx + dy * dy + dz * dz * 0.1;

      if (distSq < radius * radius) {
        const dist = Math.max(Math.sqrt(distSq), 0.001);
        const factor = (1.0 - dist / radius);
        
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = Math.sin(dist * 10) * 0.5 + 0.5;

        const pushX = (nx * 0.7 + pointerVel.x * 0.05) * factor * impulseMag;
        const pushY = (ny * 0.7 + pointerVel.y * 0.05) * factor * impulseMag;
        const pushZ = nz * factor * impulseMag * 0.8;

        this.activateCube(i);
        velocities[i3] += pushX;
        velocities[i3 + 1] += pushY;
        velocities[i3 + 2] += pushZ;

        angularVelocities[i3] += (Math.random() - 0.5) * factor * 10;
        angularVelocities[i3 + 1] += (Math.random() - 0.5) * factor * 10;
        angularVelocities[i3 + 2] += (Math.random() - 0.5) * factor * 10;

        if (impulseMag > 1.0 && factor > 0.3) {
          soundEngine.playCubeKnock(impulseMag);
          triggerHaptic(12, false);
        }
      }
    }
  }

  /**
   * Applies a randomized outward impulse to every cube in the grid,
   * shattering the picture outward from the grid center.
   */
  public triggerDisperse() {
    if (this.isReverting) {
      this.isReverting = false;
    }

    const { totalCubes, targetPositions, velocities, angularVelocities } = this.grid;

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

      const speed = 4.5 + Math.random() * 5.5;
      const popZ = 1.0 + Math.random() * 4.0;

      this.activateCube(i);

      velocities[i3] += vxDir * speed;
      velocities[i3 + 1] += vyDir * speed;
      velocities[i3 + 2] += popZ;

      angularVelocities[i3] += (Math.random() - 0.5) * 12;
      angularVelocities[i3 + 1] += (Math.random() - 0.5) * 12;
      angularVelocities[i3 + 2] += (Math.random() - 0.5) * 12;
    }

    this.isDisturbed = true;
    soundEngine.playCubeKnock(3.5);
    triggerHaptic(20, true);
  }

  /**
   * Starts the Revert animation, smoothly easing cubes back to their original positions.
   * V23: Selects a random stagger pattern and computes per-cube delays in a single pass.
   */
  public triggerRevert() {
    if (!this.isDisturbed || this.isReverting) return;

    const { positions, rotations, targetPositions, totalCubes, cols, rows, cubeSize, gap } = this.grid;
    this.revertStartPositions.set(positions);
    this.revertStartRotations.set(rotations);
    this.revertElapsed = 0;

    // Select pattern (no immediate repeat)
    const patternIdx = selectRevertPattern(this.lastPatternIndex);
    this.lastPatternIndex = patternIdx;

    // Compute per-cube delays
    this.revertGatherFlags.fill(0);
    this.revertHasGather = computePatternDelays(
      patternIdx,
      rows,
      cols,
      this.revertDelays,
      this.revertGatherFlags,
    );

    // Set timing: simultaneous (idx 0) uses original fast duration; others use cinematic window
    if (patternIdx === 0) {
      this.revertStaggerWindow = 0;
      this.revertCubeTweenDuration = 0.75;
      this.revertTotalDuration = 0.75;
    } else {
      this.revertStaggerWindow = 1.85;
      this.revertCubeTweenDuration = 0.55;
      this.revertTotalDuration = this.revertStaggerWindow + this.revertCubeTweenDuration;
    }

    // Pre-compute gather-point world coordinates (bottom-center of grid)
    if (this.revertHasGather) {
      const stride = cubeSize + gap;
      this.gatherWorldX = 0; // center X
      this.gatherWorldY = -((rows - 1) * stride) / 2; // bottom Y
      this.gatherWorldZ = 1.5; // slightly forward for visual drama
    }

    this.isReverting = true;
  }

  /**
   * Main Physics Update loop called every frame.
   * Supports full-viewport edge collisions and solid UI obstacle AABB bounces.
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
      cols,
      rows,
      cubeSize,
      positions,
      velocities,
      rotations,
      angularVelocities,
    } = this.grid;

    const damping = Math.pow(0.05, dt);
    const angularDamping = Math.pow(0.02, dt);
    const restSpeedThreshold = this.restSpeedThreshold;
    const restAngThreshold = this.restSpeedThreshold;
    const minDistance = cubeSize * 0.95;
    const minDistanceSq = minDistance * minDistance;
    const halfCube = cubeSize * 0.5;

    // 1. Update positions & rotations for active cubes
    for (let a = this.activeCount - 1; a >= 0; a--) {
      const i = this.activeIndices[a];
      const i3 = i * 3;

      // Position integration
      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
      positions[i3 + 2] += velocities[i3 + 2] * dt;

      // Rotation integration
      rotations[i3] += angularVelocities[i3] * dt;
      rotations[i3 + 1] += angularVelocities[i3 + 1] * dt;
      rotations[i3 + 2] += angularVelocities[i3 + 2] * dt;

      // Damping
      velocities[i3] *= damping;
      velocities[i3 + 1] *= damping;
      velocities[i3 + 2] *= damping;

      angularVelocities[i3] *= angularDamping;
      angularVelocities[i3 + 1] *= angularDamping;
      angularVelocities[i3 + 2] *= angularDamping;

      // Viewport Static Boundary Collisions (Edges of screen)
      if (viewportBounds) {
        const bounceRestitution = 0.55;

        if (positions[i3] - halfCube < viewportBounds.minX) {
          positions[i3] = viewportBounds.minX + halfCube;
          if (velocities[i3] < 0) velocities[i3] = -velocities[i3] * bounceRestitution;
        } else if (positions[i3] + halfCube > viewportBounds.maxX) {
          positions[i3] = viewportBounds.maxX - halfCube;
          if (velocities[i3] > 0) velocities[i3] = -velocities[i3] * bounceRestitution;
        }

        if (positions[i3 + 1] - halfCube < viewportBounds.minY) {
          positions[i3 + 1] = viewportBounds.minY + halfCube;
          if (velocities[i3 + 1] < 0) velocities[i3 + 1] = -velocities[i3 + 1] * bounceRestitution;
        } else if (positions[i3 + 1] + halfCube > viewportBounds.maxY) {
          positions[i3 + 1] = viewportBounds.maxY - halfCube;
          if (velocities[i3 + 1] > 0) velocities[i3 + 1] = -velocities[i3 + 1] * bounceRestitution;
        }

        if (positions[i3 + 2] < -3.0) {
          positions[i3 + 2] = -3.0;
          if (velocities[i3 + 2] < 0) velocities[i3 + 2] = -velocities[i3 + 2] * bounceRestitution;
        } else if (positions[i3 + 2] > 6.0) {
          positions[i3 + 2] = 6.0;
          if (velocities[i3 + 2] > 0) velocities[i3 + 2] = -velocities[i3 + 2] * bounceRestitution;
        }
      }

      // UI Obstacle Collisions (Buttons, Panels)
      if (obstacles && obstacles.length > 0) {
        for (let o = 0; o < obstacles.length; o++) {
          const obs = obstacles[o];

          if (
            positions[i3] + halfCube >= obs.minX &&
            positions[i3] - halfCube <= obs.maxX &&
            positions[i3 + 1] + halfCube >= obs.minY &&
            positions[i3 + 1] - halfCube <= obs.maxY &&
            positions[i3 + 2] + halfCube >= obs.minZ &&
            positions[i3 + 2] - halfCube <= obs.maxZ
          ) {
            const overlapLeft = (positions[i3] + halfCube) - obs.minX;
            const overlapRight = obs.maxX - (positions[i3] - halfCube);
            const overlapBottom = (positions[i3 + 1] + halfCube) - obs.minY;
            const overlapTop = obs.maxY - (positions[i3 + 1] - halfCube);
            const overlapBack = (positions[i3 + 2] + halfCube) - obs.minZ;
            const overlapFront = obs.maxZ - (positions[i3 + 2] - halfCube);

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapBottom, overlapTop, overlapBack, overlapFront);
            const bounceRestitution = 0.5;

            if (minOverlap === overlapLeft) {
              positions[i3] = obs.minX - halfCube;
              if (velocities[i3] > 0) velocities[i3] *= -bounceRestitution;
            } else if (minOverlap === overlapRight) {
              positions[i3] = obs.maxX + halfCube;
              if (velocities[i3] < 0) velocities[i3] *= -bounceRestitution;
            } else if (minOverlap === overlapBottom) {
              positions[i3 + 1] = obs.minY - halfCube;
              if (velocities[i3 + 1] > 0) velocities[i3 + 1] *= -bounceRestitution;
            } else if (minOverlap === overlapTop) {
              positions[i3 + 1] = obs.maxY + halfCube;
              if (velocities[i3 + 1] < 0) velocities[i3 + 1] *= -bounceRestitution;
            } else if (minOverlap === overlapBack) {
              positions[i3 + 2] = obs.minZ - halfCube;
              if (velocities[i3 + 2] > 0) velocities[i3 + 2] *= -bounceRestitution;
            } else if (minOverlap === overlapFront) {
              positions[i3 + 2] = obs.maxZ + halfCube;
              if (velocities[i3 + 2] < 0) velocities[i3 + 2] *= -bounceRestitution;
            }

            angularVelocities[i3] += (Math.random() - 0.5) * 5;
            angularVelocities[i3 + 1] += (Math.random() - 0.5) * 5;

            soundEngine.playCubeKnock(0.7);
          }
        }
      }

      // Spatial Grid collision check: check 8-neighbor cells
      const r = Math.floor(i / cols);
      const c = i % cols;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

          const j = nr * cols + nc;
          const j3 = j * 3;

          const dx = positions[i3] - positions[j3];
          const dy = positions[i3 + 1] - positions[j3 + 1];
          const dz = positions[i3 + 2] - positions[j3 + 2];
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < minDistanceSq && distSq > 0.000001) {
            const dist = Math.sqrt(distSq);
            const overlap = minDistance - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            const sep = overlap * 0.5;
            positions[i3] += nx * sep;
            positions[i3 + 1] += ny * sep;
            positions[i3 + 2] += nz * sep;

            positions[j3] -= nx * sep;
            positions[j3 + 1] -= ny * sep;
            positions[j3 + 2] -= nz * sep;

            const relVx = velocities[i3] - velocities[j3];
            const relVy = velocities[i3 + 1] - velocities[j3 + 1];
            const relVz = velocities[i3 + 2] - velocities[j3 + 2];
            const impulse = (relVx * nx + relVy * ny + relVz * nz) * 0.5;

            if (impulse > 0) {
              velocities[i3] -= nx * impulse;
              velocities[i3 + 1] -= ny * impulse;
              velocities[i3 + 2] -= nz * impulse;

              this.activateCube(j);
              velocities[j3] += nx * impulse;
              velocities[j3 + 1] += ny * impulse;
              velocities[j3 + 2] += nz * impulse;

              angularVelocities[j3] += (Math.random() - 0.5) * impulse * 5;
              angularVelocities[j3 + 1] += (Math.random() - 0.5) * impulse * 5;

              if (impulse > 0.6) {
                soundEngine.playCubeKnock(impulse);
              }
            }
          }
        }
      }

      // Check resting criteria using configurable threshold
      const speedSq =
        velocities[i3] * velocities[i3] +
        velocities[i3 + 1] * velocities[i3 + 1] +
        velocities[i3 + 2] * velocities[i3 + 2];
      const angSpeedSq =
        angularVelocities[i3] * angularVelocities[i3] +
        angularVelocities[i3 + 1] * angularVelocities[i3 + 1] +
        angularVelocities[i3 + 2] * angularVelocities[i3 + 2];

      if (speedSq < restSpeedThreshold * restSpeedThreshold && angSpeedSq < restAngThreshold * restAngThreshold) {
        velocities[i3] = 0;
        velocities[i3 + 1] = 0;
        velocities[i3 + 2] = 0;
        angularVelocities[i3] = 0;
        angularVelocities[i3 + 1] = 0;
        angularVelocities[i3 + 2] = 0;
        this.deactivateCube(i, a);
      }
    }
  }

  /**
   * Handles stagger-patterned Revert back to original target positions & rotations.
   * V23: Per-cube delays drive the stagger; easeOutBack gives satisfying snap landings.
   * Convergent-gather pattern (#20) uses a two-phase path through a gather waypoint.
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
        // Cube hasn't started yet — keep at start position
        allDone = false;
        continue;
      }

      const t = Math.min(cubeElapsed / cubeTween, 1.0);

      if (t < 1.0) {
        allDone = false;
      }

      const ease = easeOutBack(t);

      if (hasGather && this.revertGatherFlags[i3] > 0) {
        // Convergent-gather: two-phase path through gather waypoint
        const phase1End = 0.45;
        if (t < phase1End) {
          // Phase 1: start → gather point
          const t1 = t / phase1End;
          const e1 = easeOutBack(t1);
          positions[i3] = this.revertStartPositions[i3] + (gatherX - this.revertStartPositions[i3]) * e1;
          positions[i3 + 1] = this.revertStartPositions[i3 + 1] + (gatherY - this.revertStartPositions[i3 + 1]) * e1;
          positions[i3 + 2] = this.revertStartPositions[i3 + 2] + (gatherZ - this.revertStartPositions[i3 + 2]) * e1;
        } else {
          // Phase 2: gather point → target
          const t2 = (t - phase1End) / (1 - phase1End);
          const e2 = easeOutBack(t2);
          positions[i3] = gatherX + (targetPositions[i3] - gatherX) * e2;
          positions[i3 + 1] = gatherY + (targetPositions[i3 + 1] - gatherY) * e2;
          positions[i3 + 2] = gatherZ + (targetPositions[i3 + 2] - gatherZ) * e2;
        }
        // Rotation: lerp toward 0 across the full t range
        rotations[i3] = this.revertStartRotations[i3] * (1 - ease);
        rotations[i3 + 1] = this.revertStartRotations[i3 + 1] * (1 - ease);
        rotations[i3 + 2] = this.revertStartRotations[i3 + 2] * (1 - ease);
      } else {
        // Standard path: straight lerp from start to target with easeOutBack
        positions[i3] = this.revertStartPositions[i3] + (targetPositions[i3] - this.revertStartPositions[i3]) * ease;
        positions[i3 + 1] = this.revertStartPositions[i3 + 1] + (targetPositions[i3 + 1] - this.revertStartPositions[i3 + 1]) * ease;
        positions[i3 + 2] = this.revertStartPositions[i3 + 2] + (targetPositions[i3 + 2] - this.revertStartPositions[i3 + 2]) * ease;

        rotations[i3] = this.revertStartRotations[i3] * (1 - ease);
        rotations[i3 + 1] = this.revertStartRotations[i3 + 1] * (1 - ease);
        rotations[i3 + 2] = this.revertStartRotations[i3 + 2] * (1 - ease);
      }
    }

    if (allDone) {
      // Snap everything to exact target (handles overshoot residue from easeOutBack)
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

  /**
   * Returns normalized disturbance level (0.0 at rest to 1.0 at high chaos).
   */
  public getDisturbanceLevel(): number {
    if (this.grid.totalCubes === 0) return 0;
    return Math.min(this.activeCount / (this.grid.totalCubes * 0.4), 1.0);
  }

  /**
   * Directly updates the Three.js InstancedMesh matrices and colors.
   */
  public updateInstancedMesh(mesh: THREE.InstancedMesh) {
    const { positions, rotations, colors, totalCubes, cubeSize, gap } = this.grid;
    const stride = cubeSize + gap;
    const renderedSize = stride * 1.02; // 2% overlap to prevent anti-aliasing gaps

    for (let i = 0; i < totalCubes; i++) {
      const i3 = i * 3;

      this.dummyObject.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      this.dummyObject.rotation.set(rotations[i3], rotations[i3 + 1], rotations[i3 + 2]);
      this.dummyObject.scale.setScalar(renderedSize);
      this.dummyObject.updateMatrix();

      mesh.setMatrixAt(i, this.dummyObject.matrix);

      this.tempColor.setRGB(colors[i3], colors[i3 + 1], colors[i3 + 2], THREE.SRGBColorSpace);
      mesh.setColorAt(i, this.tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
