'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useAppStore } from '@/store/useAppStore';
import { CubePhysicsEngine } from '@/lib/cubePhysics';
import { soundEngine } from '@/lib/audio/soundEngine';
import { ImpactParticleSystem } from '@/lib/impactParticles';
import { uiObstacleManager } from '@/lib/uiObstacles';
import { qualityTierManager, QualityConfig } from '@/lib/qualityTier';
import { resampleToGrid } from '@/lib/imageSampler';
import { createTileMaterial, createCubeGeometry, TileMaterialHandles } from '@/lib/cubeMaterial';
import { sessionPhysicsConfig } from '@/lib/sessionPhysics';
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
}

export const CubeCanvas: React.FC<CubeCanvasProps> = ({ onExportReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridData = useAppStore((state) => state.gridData);
  const mode = useAppStore((state) => state.mode);
  const disturbedPositions = useAppStore((state) => state.disturbedPositions);
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
  const tileMaterialRef = useRef<TileMaterialHandles | null>(null);
  // Fit distance for the current grid, preserved so resize and tilt never clobber it.
  const baseCameraZRef = useRef<number>(15);

  // Pointer tracking (Multi-touch support)
  const activePointersRef = useRef<Map<number, { prevX: number; prevY: number; time: number; vel: THREE.Vector2 }>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const planeIntersectRef = useRef<THREE.Vector3>(new THREE.Vector3());
  // Reused across pointer events: a fresh Vector2 per move handler is thousands
  // of short-lived allocations during a single drag.
  const pointerNdcRef = useRef<THREE.Vector2>(new THREE.Vector2());

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
      if (physicsRef.current && instancedMeshRef.current) {
        // Every GPU buffer was lost, so force a full re-upload rather than only
        // pushing the cubes that happened to be dirty.
        physicsRef.current.markAllDirty();
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

    // Resize handler. Refits the camera distance too — on a rotate or a mobile
    // browser-chrome change the aspect ratio shifts, and without refitting the
    // artwork gets cropped off the sides.
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const camera = cameraRef.current;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);

      const physics = physicsRef.current;
      if (physics) {
        const { cols, rows, cubeSize, gap } = physics.grid;
        const stride = cubeSize + gap;
        const fovRad = (camera.fov * Math.PI) / 180;
        const distForHeight = (rows * stride / 2) / Math.tan(fovRad / 2);
        const distForWidth = (cols * stride / 2) / (Math.tan(fovRad / 2) * camera.aspect);
        const margin = camera.aspect < 0.7 ? 1.32 : 1.18;
        baseCameraZRef.current = Math.max(Math.max(distForHeight, distForWidth) * margin, 6);
        camera.position.z = baseCameraZRef.current;
      }

      uiObstacleManager.markDirty();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
      particles.dispose();

      // Release the instanced grid and its artwork texture explicitly; these are
      // the largest GPU allocations in the app and were previously leaked on
      // unmount (only the renderer was disposed).
      if (instancedMeshRef.current) {
        instancedMeshRef.current.geometry.dispose();
        sceneRef.current?.remove(instancedMeshRef.current);
        instancedMeshRef.current = null;
      }
      if (tileMaterialRef.current) {
        tileMaterialRef.current.dispose();
        tileMaterialRef.current = null;
      }

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
      instancedMeshRef.current = null;
    }
    if (tileMaterialRef.current) {
      tileMaterialRef.current.dispose();
      tileMaterialRef.current = null;
    }

    const { cols, rows, colors, textureCanvas } = gridData;

    // Cube size is derived from the grid so the artwork always fills a similar
    // slice of the canvas regardless of resolution — coarse grids simply get
    // chunkier, more satisfying cubes rather than a smaller picture.
    const targetSpan = 7.2;
    const stride = targetSpan / Math.max(cols, rows);
    const gap = stride * 0.1;
    const cubeSize = stride - gap;

    const physics = new CubePhysicsEngine(cols, rows, cubeSize, gap);
    physics.setRestSpeedThreshold(qualityConfig.restSpeedThreshold);
    physics.initFromData(cols, rows, colors, cubeSize, gap);

    // Apply disturbed positions immediately so cubes appear in their
    // scattered state from the very first frame — no flash of the original.
    if (disturbedPositions && disturbedPositions.length > 0) {
      physics.restoreDisturbedState(disturbedPositions);
      setIsDisturbed(true);
    }

    physicsRef.current = physics;
    (window as any).__unravelPhysics = physics;

    const handleRevertEvent = () => {
      physicsRef.current?.triggerRevert();
    };
    const handleDisperseEvent = () => {
      physicsRef.current?.triggerDisperse();
    };

    window.addEventListener('unravel-trigger-revert', handleRevertEvent);
    window.addEventListener('unravel-trigger-disperse', handleDisperseEvent);

    if (cameraRef.current) {
      const gridWidth = cols * stride;
      const gridHeight = rows * stride;
      const camera = cameraRef.current;
      const fovRad = (camera.fov * Math.PI) / 180;

      // Fit both axes: vertical FOV bounds height directly, and the horizontal
      // FOV (derived from aspect) bounds width. Taking the max of the two
      // required distances is what stops the artwork being cropped on narrow
      // phone screens — the old code only ever fitted the larger dimension.
      const distForHeight = (gridHeight / 2) / Math.tan(fovRad / 2);
      const distForWidth = (gridWidth / 2) / (Math.tan(fovRad / 2) * camera.aspect);

      // Extra margin on short/narrow viewports so UI chrome never sits on top
      // of the picture.
      const margin = camera.aspect < 0.7 ? 1.32 : 1.18;
      const cameraZ = Math.max(Math.max(distForHeight, distForWidth) * margin, 6);

      camera.position.set(0, 0, cameraZ);
      camera.lookAt(0, 0, 0);
      baseCameraZRef.current = cameraZ;
    }

    const geometry = createCubeGeometry(cols, rows);

    const tileMaterial = createTileMaterial(
      sessionPhysicsConfig.materialRoughness,
      sessionPhysicsConfig.materialMetalness
    );
    tileMaterialRef.current = tileMaterial;

    if (textureCanvas) {
      // Texture rather than CanvasTexture so an <img> source works too. The
      // source is never an ImageBitmap — three ignores flipY for those, which
      // uploads the artwork rows inverted and renders the picture upside down
      // (see the note on SampledGridResult.textureCanvas).
      const texture = new THREE.Texture(textureCanvas);
      texture.needsUpdate = true;
      texture.flipY = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      // Clamp + linear filtering keeps tile edges clean without bleeding into
      // neighbouring tiles; no mipmaps since each tile is already at target size.
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = rendererRef.current
        ? rendererRef.current.capabilities.getMaxAnisotropy()
        : 1;
      tileMaterial.setTexture(texture);
    }

    const mesh = new THREE.InstancedMesh(geometry, tileMaterial.material, cols * rows);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The grid moves far beyond its initial bounds once dispersed, so let three
    // skip frustum culling rather than popping cubes out mid-flight.
    mesh.frustumCulled = false;

    physics.updateInstancedMesh(mesh);
    sceneRef.current.add(mesh);
    instancedMeshRef.current = mesh;

    setIsDisturbed(false);

    return () => {
      window.removeEventListener('unravel-trigger-revert', handleRevertEvent);
      window.removeEventListener('unravel-trigger-disperse', handleDisperseEvent);
    };
  }, [gridData, disturbedPositions, setIsDisturbed, qualityConfig.restSpeedThreshold]);

  // Live cube-size changes.
  //
  // Cube size is a function of the grid resolution, so changing it means
  // re-deriving the grid — and doing that while cubes are mid-flight would snap
  // the picture together jarringly. So: reassemble the artwork first, then swap
  // in the new resolution once it has settled.
  useEffect(() => {
    let timeoutId: number | undefined;
    let cancelled = false;

    const rebuildAtCurrentSize = () => {
      if (cancelled) return;

      const grid = useAppStore.getState().gridData;
      const source = grid.textureCanvas;
      // Procedural grids (the landing demo) carry no artwork to resample, so
      // regenerate them instead — generateDemoGrid reads the new resolution.
      if (!source) {
        if (useAppStore.getState().mode === 'landing') {
          useAppStore.getState().resetToDemo();
        }
        return;
      }

      const config = qualityTierManager.getConfig();
      const maxDimension =
        grid.contrast === 'type' ? config.gridResolutionType
        : grid.contrast === 'draw' ? config.gridResolutionDraw
        : config.gridResolutionMax;

      try {
        const resampled = resampleToGrid(source, maxDimension, grid.contrast || 'photo');
        useAppStore.getState().setGridData(resampled, undefined, { persist: false });
      } catch (err) {
        console.warn('Failed to rebuild grid at the new cube size:', err);
      }
    };

    const unsubscribe = qualityTierManager.subscribeCubeSize(() => {
      const physics = physicsRef.current;

      if (!physics || !physics.isDisturbed) {
        rebuildAtCurrentSize();
        return;
      }

      physics.triggerRevert();

      const onRevertComplete = () => {
        window.removeEventListener('unravel-revert-complete', onRevertComplete);
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        rebuildAtCurrentSize();
      };

      window.addEventListener('unravel-revert-complete', onRevertComplete);

      // Safety net: a cube wedged against UI chrome can keep the revert from
      // ever settling, and the size change must still apply.
      timeoutId = window.setTimeout(() => {
        window.removeEventListener('unravel-revert-complete', onRevertComplete);
        rebuildAtCurrentSize();
      }, 2500);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

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
        // Keep the fitted distance — reading camera.position.z here instead
        // would let any stray write to it permanently rescale the artwork.
        camera.position.z = baseCameraZRef.current;

        const fovRad = (camera.fov * Math.PI) / 180;
        const halfHeight = Math.tan(fovRad / 2) * camera.position.z;
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

    raycasterRef.current.setFromCamera(pointerNdcRef.current.set(x, y), cameraRef.current);
    const hit = raycasterRef.current.ray.intersectPlane(planeRef.current, planeIntersectRef.current);

    if (hit) {
      // Scale the touch radius to the cube size so a fingertip always affects a
      // comparable patch of artwork whatever the grid resolution — and so it
      // stays a comfortable finger-sized target on phones.
      const renderedSize = physicsRef.current.getRenderedSize();
      const radius = Math.max(renderedSize * 2.6, 0.5);

      physicsRef.current.applyPointerImpulse(
        planeIntersectRef.current,
        vel,
        radius,
        5.5
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
      // Clamp dt to a sane minimum: a sub-millisecond gap between two coalesced
      // pointer events otherwise divides into an enormous spurious velocity.
      const dt = Math.max((now - ptr.time) / 1000, 0.008);
      const vx = (e.clientX - ptr.prevX) / dt;
      const vy = (e.clientY - ptr.prevY) / dt;

      // px/s -> world units/s, then clamped. Without a clamp a fast flick can
      // launch cubes off-screen faster than collision can resolve.
      const scale = 0.0022;
      const maxSpeed = 9;
      let wx = vx * scale;
      let wy = -vy * scale;
      const mag = Math.hypot(wx, wy);
      if (mag > maxSpeed) {
        wx = (wx / mag) * maxSpeed;
        wy = (wy / mag) * maxSpeed;
      }

      // Smooth against the previous sample so jittery touch streams don't make
      // the shove direction flicker frame to frame.
      ptr.vel.set(ptr.vel.x * 0.35 + wx * 0.65, ptr.vel.y * 0.35 + wy * 0.65);
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
    // Uses the app-shell sizing vars (see globals.css) rather than raw 100vh:
    // on iOS Safari 100vh is the *expanded* viewport height, so the bottom of
    // the canvas sat under the browser chrome and the artwork got cropped.
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
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

