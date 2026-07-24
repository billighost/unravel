import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;     // 0 to maxLife
  maxLife: number;  // seconds (~0.3s)
  scale: number;
  active: boolean;
}

export class ImpactParticleSystem {
  public mesh: THREE.InstancedMesh;
  private particles: Particle[];
  private maxParticles: number;
  private dummy: THREE.Object3D;
  private frameSpawnCount: number = 0;
  private maxSpawnsPerFrame: number = 3;

  constructor(scene: THREE.Scene, maxParticles: number = 120) {
    this.maxParticles = Math.max(maxParticles, 10);
    const geometry = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.dummy = new THREE.Object3D();
    this.particles = [];

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        maxLife: 0.3,
        scale: 0,
        active: false,
      });
      this.dummy.position.set(0, 0, -1000);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public setMaxSpawnsPerFrame(count: number) {
    this.maxSpawnsPerFrame = count;
  }

  public resetFrameCounter() {
    this.frameSpawnCount = 0;
  }

  public spawnPuff(position: THREE.Vector3, count: number = 5) {
    if (this.frameSpawnCount >= this.maxSpawnsPerFrame) return;
    this.frameSpawnCount++;

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = position.x + (Math.random() - 0.5) * 0.05;
        p.y = position.y + (Math.random() - 0.5) * 0.05;
        p.z = position.z + (Math.random() - 0.5) * 0.05;

        // Outward explosion velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 1.5;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.vz = (Math.random() - 0.2) * speed * 0.8;

        p.life = 0;
        p.maxLife = 0.25 + Math.random() * 0.1;
        p.scale = 0.8 + Math.random() * 0.5;
        spawned++;
      }
    }
  }

  public update(dt: number) {
    let needsUpdate = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          this.dummy.position.set(0, 0, -1000);
          this.dummy.scale.setScalar(0);
          this.dummy.updateMatrix();
          this.mesh.setMatrixAt(i, this.dummy.matrix);
          needsUpdate = true;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;

          const progress = p.life / p.maxLife;
          const currentScale = p.scale * (1.0 - progress);

          this.dummy.position.set(p.x, p.y, p.z);
          this.dummy.scale.setScalar(Math.max(currentScale, 0.001));
          this.dummy.updateMatrix();
          this.mesh.setMatrixAt(i, this.dummy.matrix);
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
