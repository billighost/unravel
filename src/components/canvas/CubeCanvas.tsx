'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAppStore } from '@/store/useAppStore';
import { CubePhysicsEngine } from '@/lib/cubePhysics';
import { soundEngine } from '@/lib/audio/soundEngine';
import { ImpactParticleSystem } from '@/lib/impactParticles';
import { uiObstacleManager } from '@/lib/uiObstacles';
import { qualityTierManager, QualityConfig } from '@/lib/qualityTier';
import { BrandLoader } from '@/components/ui/BrandLoader';

function drawBrandIconToCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  looseColor: string
) {
  ctx.save();
  const scale = size / 1024;
  const cell = 200 * scale;
  const gap = 40 * scale;
  const rx = 28 * scale;
  
  const startX = x + (size - (cell * 3 + gap * 2)) / 2;
  const startY = y + (size - (cell * 3 + gap * 2)) / 2;

  const roundedRect = (rx0: number, ry0: number, rw: number, rh: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(rx0 + r, ry0);
    ctx.lineTo(rx0 + rw - r, ry0);
    ctx.quadraticCurveTo(rx0 + rw, ry0, rx0 + rw, ry0 + r);
    ctx.lineTo(rx0 + rw, ry0 + rh - r);
    ctx.quadraticCurveTo(rx0 + rw, ry0 + rh, rx0 + rw - r, ry0 + rh);
    ctx.lineTo(rx0 + r, ry0 + rh);
    ctx.quadraticCurveTo(rx0, ry0 + rh, rx0, ry0 + rh - r);
    ctx.lineTo(rx0, ry0 + r);
    ctx.quadraticCurveTo(rx0, ry0, rx0 + r, ry0);
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = color;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 2 && col === 2) continue;
      const lx = startX + col * (cell + gap);
      const ly = startY + row * (cell + gap);
      roundedRect(lx, ly, cell, cell, rx);
    }
  }

  ctx.save();
  const lCenterX = startX + 2 * (cell + gap) + cell / 2;
  const lCenterY = startY + 2 * (cell + gap) + cell / 2;
  const offset = 46 * scale;
  ctx.translate(lCenterX + offset, lCenterY + offset);
  ctx.rotate(-14 * Math.PI / 180);
  ctx.translate(-lCenterX, -lCenterY);

  ctx.fillStyle = looseColor;
  const lx0 = startX + 2 * (cell + gap);
  const ly0 = startY + 2 * (cell + gap);
  roundedRect(lx0, ly0, cell, cell, rx);

  ctx.restore();
  ctx.restore();
}

interface CubeCanvasProps {
  onExportReady?: (exportFn: (options?: { transparent?: boolean }) => void) => void;
  initialDisturbedPositions?: number[] | null;
  shouldDisperseImmediately?: boolean;
}

export const CubeCanvas: React.FC<CubeCanvasProps> = ({
  onExportReady,
  initialDisturbedPositions,
  shouldDisperseImmediately = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridData = useAppStore((state) => state.gridData);
  const mode = useAppStore((state) => state.mode);
  const setIsDisturbed = useAppStore((state) => state.setIsDisturbed);

  const [isContextLost, setIsContextLost] = useState(false);
  const [qualityConfig, setQualityConfig] = useState<QualityConfig>(() => qualityTierManager.getConfig());
  const isRecordingRef = useRef(false);

  const physicsRef = useRef<CubePhysicsEngine | null>(null);
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particleSystemRef = useRef<ImpactParticleSystem | null>(null);

  // Pointer tracking (Multi-touch support)
  const activePointersRef = useRef<Map<number, { prevX: number; prevY: number; time: number; vel: THREE.Vector2 }>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const planeIntersectRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Tilt parallax tracking (Mobile DeviceOrientation)
  const targetTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mobile Device Orientation Tilt Parallax Setup
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Honor user prefers-reduced-motion OS preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;   // Front-to-back pitch tilt [-180, 180]
      const gamma = e.gamma ?? 0; // Left-to-right roll tilt [-90, 90]

      // Baseline resting angle for mobile device (around 45° pitch, 0° roll)
      const normBeta = Math.max(-1, Math.min(1, (beta - 45) / 45));
      const normGamma = Math.max(-1, Math.min(1, gamma / 45));

      // Subtle parallax offset range (max +-0.35 units)
      targetTiltRef.current.x = normGamma * 0.35;
      targetTiltRef.current.y = -normBeta * 0.35;
    };

    const setupTiltListener = async () => {
      if ('DeviceOrientationEvent' in window) {
        const DOE = DeviceOrientationEvent as any;
        if (typeof DOE.requestPermission === 'function') {
          const handleFirstGesture = async () => {
            try {
              const res = await DOE.requestPermission();
              if (res === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
              }
            } catch (_) {}
            window.removeEventListener('pointerdown', handleFirstGesture);
          };
          window.addEventListener('pointerdown', handleFirstGesture);
        } else {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      }
    };

    setupTiltListener();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // Subscribe to Adaptive Quality Tier changes & kick off startup frame-rate probe
  useEffect(() => {
    const unsubscribe = qualityTierManager.subscribe((newConfig) => {
      setQualityConfig(newConfig);

      if (rendererRef.current) {
        if (!isRecordingRef.current) {
          const effectiveDpr = Math.min(window.devicePixelRatio, newConfig.maxPixelRatio);
          rendererRef.current.setPixelRatio(effectiveDpr);
        }
        rendererRef.current.shadowMap.enabled = newConfig.shadows;
      }
    });

    qualityTierManager.startFrameProbe();

    // Listen for recording window state changes to temporarily optimize DPR & GPU readback
    const handleRecStart = () => {
      isRecordingRef.current = true;
      if (rendererRef.current) {
        // Temporarily cap pixel ratio during recording window to reduce raw GPU readback buffer size
        const recordingDpr = Math.min(window.devicePixelRatio, 1.25);
        rendererRef.current.setPixelRatio(recordingDpr);
      }
    };

    const handleRecStop = () => {
      isRecordingRef.current = false;
      if (rendererRef.current) {
        const config = qualityTierManager.getConfig();
        const normalDpr = Math.min(window.devicePixelRatio, config.maxPixelRatio);
        rendererRef.current.setPixelRatio(normalDpr);
      }
    };

    window.addEventListener('unravel-recording-start', handleRecStart);
    window.addEventListener('unravel-recording-stop', handleRecStop);

    return () => {
      unsubscribe();
      window.removeEventListener('unravel-recording-start', handleRecStart);
      window.removeEventListener('unravel-recording-stop', handleRecStop);
    };
  }, []);

  // Main Three.js Scene Setup & WebGL Context Loss Listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const currentConfig = qualityTierManager.getConfig();

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F7F6F2');
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 15);
    cameraRef.current = camera;

    // 3. Lighting setup (tuned for vivid sRGB accuracy)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
    dirLight.position.set(10, 15, 20);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xfff5ea, 0.15);
    dirLight2.position.set(-10, -10, 10);
    scene.add(dirLight2);

    // 4. Impact Particle System setup (adaptive pool size)
    const particles = new ImpactParticleSystem(scene, currentConfig.particlePoolSize);
    particleSystemRef.current = particles;

    // 5. Renderer setup with explicit sRGB output color space and high-performance power preference
    const renderer = new THREE.WebGLRenderer({
      antialias: currentConfig.antialias,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const initialDpr = Math.min(window.devicePixelRatio, currentConfig.maxPixelRatio);
    renderer.setPixelRatio(initialDpr);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = currentConfig.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // WebGL Context Loss Event Handling
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setIsContextLost(true);
    };

    const handleContextRestored = () => {
      setIsContextLost(false);
      if (physicsRef.current && instancedMeshRef.current && sceneRef.current) {
        physicsRef.current.updateInstancedMesh(instancedMeshRef.current);
      }
    };

    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('webglcontextlost', handleContextLost, false);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored, false);

    // Export handler creation with Chaos Stat + Watermark overlay
    if (onExportReady) {
      onExportReady((options?: { transparent?: boolean }) => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        const rend = rendererRef.current;
        const scn = sceneRef.current;
        const cam = cameraRef.current;

        const isTransparent = !!options?.transparent;
        const originalBg = scn.background;

        if (isTransparent) {
          scn.background = null;
          rend.setClearColor(0x000000, 0);
        }

        rend.render(scn, cam);

        // Capture WebGL canvas
        const webglCanvas = rend.domElement;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = webglCanvas.width;
        exportCanvas.height = webglCanvas.height;

        const ctx = exportCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(webglCanvas, 0, 0);

          // Get Chaos percentage
          const chaos = physicsRef.current ? physicsRef.current.getChaosPercentage() : 0;
          const fontSize = Math.max(16, Math.floor(exportCanvas.height * 0.026));

          // Draw bottom-right Watermark & Chaos Stat Overlay
          ctx.save();
          ctx.font = `700 ${fontSize}px "Pixelify Sans", monospace, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';

          const textMargin = fontSize;
          const textLine1 = chaos > 0 ? `${chaos}% DISTURBED` : 'PRISTINE ART';
          const textLine2 = 'UNRAVEL • unravel.app';

          // Measure textLine2 to place the icon to the left of it
          const textLine2Width = ctx.measureText(textLine2).width;
          const iconSize = fontSize * 0.95;
          const iconGap = fontSize * 0.4;
          const iconX = exportCanvas.width - textMargin - textLine2Width - iconSize - iconGap;
          const iconY = exportCanvas.height - textMargin - iconSize + (fontSize * 0.05);

          // Shadow for brand icon
          ctx.save();
          drawBrandIconToCanvas(ctx, iconX + 2, iconY + 2, iconSize, 'rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.7)');
          ctx.restore();

          // Foreground for brand icon
          ctx.save();
          drawBrandIconToCanvas(ctx, iconX, iconY, iconSize, '#FFFFFF', '#FF5252');
          ctx.restore();

          // Shadow for pixel aesthetic legibility
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillText(textLine1, exportCanvas.width - textMargin + 2, exportCanvas.height - textMargin - fontSize - 2);
          ctx.fillText(textLine2, exportCanvas.width - textMargin + 2, exportCanvas.height - textMargin + 2);

          ctx.fillStyle = '#FF5252';
          ctx.fillText(textLine1, exportCanvas.width - textMargin, exportCanvas.height - textMargin - fontSize - 4);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(textLine2, exportCanvas.width - textMargin, exportCanvas.height - textMargin);

          ctx.restore();
        }

        if (isTransparent) {
          scn.background = originalBg;
          rend.render(scn, cam);
        }

        const dataUrl = exportCanvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.download = `unravel-art-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      });
    }

    // Resize handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      uiObstacleManager.markDirty();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
      particles.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update InstancedMesh and Physics Engine whenever gridData changes
  useEffect(() => {
    if (!sceneRef.current || !gridData) return;

    if (instancedMeshRef.current) {
      sceneRef.current.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      (instancedMeshRef.current.material as THREE.Material).dispose();
      instancedMeshRef.current = null;
    }

    const { cols, rows, colors } = gridData;
    const cubeSize = 0.16;
    const gap = 0.02;

    const physics = new CubePhysicsEngine(cols, rows, cubeSize, gap);
    physics.setRestSpeedThreshold(qualityConfig.restSpeedThreshold);
    physics.initFromData(cols, rows, colors, cubeSize, gap);

    if (initialDisturbedPositions && initialDisturbedPositions.length > 0) {
      physics.restoreDisturbedState(initialDisturbedPositions);
    } else if (shouldDisperseImmediately) {
      physics.triggerDisperse();
    }

    physicsRef.current = physics;
    (window as any).__unravelPhysics = physics;

    const handleRevertEvent = () => {
      if (physicsRef.current) {
        physicsRef.current.triggerRevert();
      }
    };
    const handleDisperseEvent = () => {
      if (physicsRef.current) {
        physicsRef.current.triggerDisperse();
      }
    };

    window.addEventListener('unravel-trigger-revert', handleRevertEvent);
    window.addEventListener('unravel-trigger-disperse', handleDisperseEvent);

    if (cameraRef.current) {
      const gridWidth = cols * (cubeSize + gap);
      const gridHeight = rows * (cubeSize + gap);
      const maxDim = Math.max(gridWidth, gridHeight);
      const fovRad = (cameraRef.current.fov * Math.PI) / 180;
      let cameraZ = (maxDim / 2) / Math.tan(fovRad / 2) * 1.15;
      cameraZ = Math.max(cameraZ, 8);
      cameraRef.current.position.set(0, 0, cameraZ);
      cameraRef.current.lookAt(0, 0, 0);
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, cols * rows);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    
    physics.updateInstancedMesh(mesh);
    sceneRef.current.add(mesh);
    instancedMeshRef.current = mesh;

    setIsDisturbed(false);

    return () => {
      window.removeEventListener('unravel-trigger-revert', handleRevertEvent);
      window.removeEventListener('unravel-trigger-disperse', handleDisperseEvent);
    };
  }, [gridData, setIsDisturbed, qualityConfig.restSpeedThreshold]);

  // Main Physics & Render Loop + Page Visibility API Pause/Resume
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let isTabVisible = true;

    const animate = (time: number) => {
      if (!isTabVisible) return;

      const dt = Math.min((time - lastTime) / 1000, 0.05); // Cap dt at 50ms
      lastTime = time;

      if (particleSystemRef.current) {
        particleSystemRef.current.resetFrameCounter();
        particleSystemRef.current.update(dt);
      }

      if (physicsRef.current && instancedMeshRef.current && cameraRef.current) {
        const camera = cameraRef.current;

        // Apply smooth Device Orientation tilt parallax offset to camera position
        currentTiltRef.current.x = THREE.MathUtils.lerp(currentTiltRef.current.x, targetTiltRef.current.x, 0.05);
        currentTiltRef.current.y = THREE.MathUtils.lerp(currentTiltRef.current.y, targetTiltRef.current.y, 0.05);
        camera.position.x = currentTiltRef.current.x;
        camera.position.y = currentTiltRef.current.y;

        const fovRad = (camera.fov * Math.PI) / 180;
        const cameraZ = camera.position.z;
        const halfHeight = Math.tan(fovRad / 2) * cameraZ;
        const halfWidth = halfHeight * camera.aspect;

        const viewportBounds = {
          minX: -halfWidth + camera.position.x,
          maxX: halfWidth + camera.position.x,
          minY: -halfHeight + camera.position.y,
          maxY: halfHeight + camera.position.y,
        };

        // Update solid UI Obstacles from DOM elements (throttled inside manager)
        uiObstacleManager.updateObstacles(camera);
        const obstacles = uiObstacleManager.getObstacles();

        physicsRef.current.update(dt, obstacles, viewportBounds);
        physicsRef.current.updateInstancedMesh(instancedMeshRef.current);
        setIsDisturbed(physicsRef.current.isDisturbed);

        // Drive ambient disturbance sound when in active canvas/landing modes
        if (mode === 'canvas' || mode === 'landing') {
          soundEngine.updateAmbientDisturbance(physicsRef.current.getDisturbanceLevel());
        } else {
          soundEngine.stopAmbientDrone();
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isTabVisible = false;
        cancelAnimationFrame(animationFrameId);
        soundEngine.stopAmbientDrone();
      } else {
        isTabVisible = true;
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
      soundEngine.stopAmbientDrone();
    };
  }, [setIsDisturbed, mode]);

  // Pointer Interaction Handlers (Multi-Touch Support)
  const processPointerImpulse = (clientX: number, clientY: number, vel: THREE.Vector2) => {
    if (!containerRef.current || !cameraRef.current || !physicsRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const hit = raycasterRef.current.ray.intersectPlane(planeRef.current, planeIntersectRef.current);

    if (hit) {
      physicsRef.current.applyPointerImpulse(
        planeIntersectRef.current,
        vel,
        1.2,
        4.0
      );

      // Spawn impact particle puff on fast pointer swipes (respecting quality tier spawn limit)
      if (vel.length() > 0.35 && particleSystemRef.current) {
        const spawnCount = isRecordingRef.current ? 2 : qualityConfig.particleMaxSpawnsPerFrame * 2;
        particleSystemRef.current.spawnPuff(planeIntersectRef.current, spawnCount);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}

    const now = performance.now();
    const ptr = {
      prevX: e.clientX,
      prevY: e.clientY,
      time: now,
      vel: new THREE.Vector2(0, 0),
    };

    activePointersRef.current.set(e.pointerId, ptr);
    processPointerImpulse(e.clientX, e.clientY, ptr.vel);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    let ptr = activePointersRef.current.get(e.pointerId);
    const now = performance.now();

    if (!ptr) {
      ptr = {
        prevX: e.clientX,
        prevY: e.clientY,
        time: now,
        vel: new THREE.Vector2(0, 0),
      };
      activePointersRef.current.set(e.pointerId, ptr);
    } else {
      const dt = Math.max((now - ptr.time) / 1000, 0.001);
      const vx = (e.clientX - ptr.prevX) / dt;
      const vy = (e.clientY - ptr.prevY) / dt;
      ptr.vel.set(vx * 0.005, -vy * 0.005);
      ptr.prevX = e.clientX;
      ptr.prevY = e.clientY;
      ptr.time = now;
    }

    processPointerImpulse(e.clientX, e.clientY, ptr.vel);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
    activePointersRef.current.delete(e.pointerId);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }}>
      {/* WebGL Context Loss Reconnecting Overlay */}
      {isContextLost && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <BrandLoader size={40} />
          <p className="font-heading" style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
            RECONNECTING WEBGL...
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onPointerLeave={handlePointerUpOrCancel}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: 'grab',
        }}
      />
    </div>
  );
};

