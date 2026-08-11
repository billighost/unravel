globalThis.window = { addEventListener(){}, removeEventListener(){}, dispatchEvent(){} } as any;
globalThis.performance = globalThis.performance ?? ({ now: () => 0 } as any);
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){} } as any;
const THREE = await import('three');
const { CubePhysicsEngine } = await import('./src/lib/cubePhysics');

const cols=12, rows=12, cubeSize=0.18, gap=0.02;
const e = new CubePhysicsEngine(cols, rows, cubeSize, gap);
e.initFromData(cols, rows, new Float32Array(cols*rows*3).fill(0.5), cubeSize, gap);
const bounds={minX:-20,maxX:20,minY:-20,maxY:20};
e.applyPointerImpulse(new THREE.Vector3(0,0,0), new THREE.Vector2(3,0), 0.6, 5.5);

const active = () => { let n=0; for(let i=0;i<e.grid.totalCubes;i++) if(e.grid.activeFlags[i]) n++; return n; };
for (const frames of [60,150,300,600,1200,2400]) {
  while ((globalThis as any).__f = ((globalThis as any).__f||0), 0) {}
  // step up to the checkpoint
  for (let i=0;i<frames - ((globalThis as any).__done||0); i++) e.update(1/60,[],bounds);
  (globalThis as any).__done = frames;
  let maxSpeed=0;
  for(let i=0;i<e.grid.totalCubes;i++){
    const s=Math.hypot(e.grid.velocities[i*3],e.grid.velocities[i*3+1],e.grid.velocities[i*3+2]);
    if(s>maxSpeed) maxSpeed=s;
  }
  console.log(`frame ${String(frames).padStart(5)}  active=${String(active()).padStart(4)}  level=${e.getDisturbanceLevel().toFixed(4)}  maxSpeed=${maxSpeed.toFixed(5)}`);
}
