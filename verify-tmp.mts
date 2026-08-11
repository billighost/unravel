// Verify the physics engine really transfers momentum between cubes.
// Stub the browser globals the engine touches at import time.
globalThis.window = { addEventListener(){}, removeEventListener(){}, dispatchEvent(){} } as any;
// navigator is a read-only getter in Node 24; the engine only feature-detects
// 'vibrate' in navigator, which is already false for the real global.
globalThis.performance = globalThis.performance ?? ({ now: () => 0 } as any);
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} } as any;

const THREE = await import('three');
const { CubePhysicsEngine } = await import('./src/lib/cubePhysics');

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ` — ${extra}` : ''));
  if (!cond) fail++;
};

const cols = 12, rows = 12, cubeSize = 0.18, gap = 0.02;
const mk = () => {
  const e = new CubePhysicsEngine(cols, rows, cubeSize, gap);
  e.initFromData(cols, rows, new Float32Array(cols * rows * 3).fill(0.5), cubeSize, gap);
  return e;
};
const bounds = { minX: -20, maxX: 20, minY: -20, maxY: 20 };
const step = (e: any, n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) e.update(dt, [], bounds); };

// --- 1. A launched cube must knock a RESTING neighbour into motion. ---
// This is the exact behaviour the old grid-index engine could not do.
const e1 = mk();
const target = 6 * cols + 6;          // interior cube
const shooter = 6 * cols + 2;         // same row, to its left
const before = { x: e1.grid.positions[target * 3], y: e1.grid.positions[target * 3 + 1] };
// Fire the shooter rightwards along the row.
e1.grid.velocities[shooter * 3] = 9;
(e1 as any).activateCube(shooter);
step(e1, 90);
const after = { x: e1.grid.positions[target * 3], y: e1.grid.positions[target * 3 + 1] };
const moved = Math.hypot(after.x - before.x, after.y - before.y);
check('resting cube is displaced by an incoming cube', moved > cubeSize * 0.25,
  `moved ${moved.toFixed(3)} world units`);

// --- 2. Momentum must transfer, not teleport: no cube ends up overlapping. ---
const e2 = mk();
e2.triggerDisperse();
step(e2, 240);
const rendered = e2.getRenderedSize();
const minAllowed = rendered * 0.9 * 0.9; // contact distance, with slack for one-frame settle
let worst = Infinity, overlaps = 0;
const P = e2.grid.positions, T = e2.grid.totalCubes;
for (let i = 0; i < T; i++) for (let j = i + 1; j < T; j++) {
  const dx=P[i*3]-P[j*3], dy=P[i*3+1]-P[j*3+1], dz=P[i*3+2]-P[j*3+2];
  const d = Math.hypot(dx, dy, dz);
  if (d < worst) worst = d;
  if (d < minAllowed) overlaps++;
}
check('no cubes interpenetrate after dispersal settles', overlaps === 0,
  `closest pair ${worst.toFixed(4)} vs min ${minAllowed.toFixed(4)}`);

// --- 3. Simulation must be stable: everything finite and eventually asleep. ---
const finite = Array.from(P).every(Number.isFinite) &&
               Array.from(e2.grid.velocities).every(Number.isFinite) &&
               Array.from(e2.grid.rotations).every(Number.isFinite);
check('no NaN/Infinity in simulation state', finite);
step(e2, 900);
check('cubes come to rest (disturbance decays)', e2.getDisturbanceLevel() < 0.02,
  `level ${e2.getDisturbanceLevel().toFixed(4)}`);

// --- 4. Revert must restore the exact original picture. ---
const e3 = mk();
const original = Float32Array.from(e3.grid.targetPositions);
e3.triggerDisperse();
step(e3, 120);
e3.triggerRevert();
for (let i = 0; i < 600 && e3.isReverting; i++) e3.update(1 / 60, [], bounds);
let maxErr = 0;
for (let i = 0; i < original.length; i++) maxErr = Math.max(maxErr, Math.abs(e3.grid.positions[i] - original[i]));
check('revert restores exact target positions', maxErr < 1e-6, `max error ${maxErr.toExponential(2)}`);
check('revert clears disturbed + reverting flags', !e3.isReverting && !e3.isDisturbed);
check('rotations reset to zero after revert', Array.from(e3.grid.rotations).every(r => r === 0));

// --- 5. Disperse during an in-flight revert must not desync the active list. ---
const e4 = mk();
e4.triggerDisperse();
step(e4, 30);
e4.triggerRevert();
step(e4, 10);
e4.triggerDisperse();       // interrupt mid-revert
step(e4, 300);
const stillFinite = Array.from(e4.grid.positions).every(Number.isFinite);
check('disperse interrupting revert stays consistent', !e4.isReverting && stillFinite);

// --- 6. Pointer impulse must wake only nearby cubes, and stay bounded. ---
const e5 = mk();
e5.applyPointerImpulse(new THREE.Vector3(0, 0, 0), new THREE.Vector2(3, 0), 0.6, 5.5);
let woken = 0;
for (let i = 0; i < e5.grid.totalCubes; i++) if (e5.grid.activeFlags[i]) woken++;
check('pointer impulse wakes a local patch, not the whole grid', woken > 0 && woken < e5.grid.totalCubes * 0.5,
  `${woken}/${e5.grid.totalCubes} cubes`);
step(e5, 300);
check('pointer-impulsed cubes settle without blowing up',
  Array.from(e5.grid.positions).every(Number.isFinite) && e5.getDisturbanceLevel() < 0.05);

console.log(fail === 0 ? '\nALL PHYSICS CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
