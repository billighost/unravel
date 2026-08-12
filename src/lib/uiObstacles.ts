import * as THREE from 'three';

export interface UIObstacleAABB {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * UIObstacleManager maps DOM elements marked with `data-ui-obstacle="true"`
 * into 3D axis-aligned bounding boxes (AABBs) in Three.js world space.
 *
 * PERFORMANCE OPTIMIZATION: Throttles DOM `getBoundingClientRect()` queries
 * to avoid per-frame layout thrashing / forced reflows during physics loops & recording.
 */
export class UIObstacleManager {
  private obstacles: UIObstacleAABB[] = [];
  private frameCounter: number = 0;
  private throttleInterval: number = 20; // Re-query DOM bounds every 20 frames (~300ms at 60fps)
  private isDirty: boolean = true;

  // Viewport size is cached and refreshed from resize events. Reading
  // window.innerWidth/innerHeight inside the render loop forces the browser to
  // flush pending layout, which is what produced the "Forced reflow while
  // executing JavaScript" warnings whenever animated UI was on screen.
  private viewportW: number = 0;
  private viewportH: number = 0;
  private listenersBound: boolean = false;

  public markDirty() {
    this.isDirty = true;
    this.refreshViewportSize();
  }

  private refreshViewportSize() {
    if (typeof window === 'undefined') return;
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
  }

  private bindListeners() {
    if (this.listenersBound || typeof window === 'undefined') return;
    this.listenersBound = true;
    const onResize = () => this.markDirty();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    this.refreshViewportSize();
  }

  /**
   * Scans DOM for visible elements with `data-ui-obstacle="true"`
   * and computes their world-space bounding boxes at Z=0.
   */
  public updateObstacles(camera: THREE.PerspectiveCamera, force: boolean = false) {
    if (typeof window === 'undefined' || !camera) return;

    this.bindListeners();

    this.frameCounter++;
    if (!force && !this.isDirty && this.frameCounter % this.throttleInterval !== 0) {
      return;
    }

    this.isDirty = false;
    const elements = document.querySelectorAll<HTMLElement>('[data-ui-obstacle="true"]');

    // Nothing to measure: skip the layout read entirely rather than reflowing
    // for an empty result.
    if (elements.length === 0) {
      if (this.obstacles.length > 0) this.obstacles = [];
      return;
    }

    const newObstacles: UIObstacleAABB[] = [];

    const fovRad = (camera.fov * Math.PI) / 180;
    const cameraZ = camera.position.z;
    const halfHeight = Math.tan(fovRad / 2) * cameraZ;
    const halfWidth = halfHeight * camera.aspect;

    if (this.viewportW === 0 || this.viewportH === 0) this.refreshViewportSize();
    const winW = this.viewportW;
    const winH = this.viewportH;
    if (winW === 0 || winH === 0) return;

    elements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();

      // Skip elements that are collapsed or hidden
      if (rect.width === 0 || rect.height === 0) return;
      // Skip elements fully outside viewport
      if (rect.bottom < 0 || rect.top > winH || rect.right < 0 || rect.left > winW) return;

      // Convert pixel bounds to Normalized Device Coordinates [-1, 1]
      const ndcLeft = (rect.left / winW) * 2 - 1;
      const ndcRight = (rect.right / winW) * 2 - 1;
      const ndcTop = -((rect.top / winH) * 2 - 1);
      const ndcBottom = -((rect.bottom / winH) * 2 - 1);

      // Convert NDC to Three.js world-space coordinates at Z=0
      const minX = Math.min(ndcLeft, ndcRight) * halfWidth;
      const maxX = Math.max(ndcLeft, ndcRight) * halfWidth;
      const minY = Math.min(ndcTop, ndcBottom) * halfHeight;
      const maxY = Math.max(ndcTop, ndcBottom) * halfHeight;

      newObstacles.push({
        id: el.id || `obstacle-${index}`,
        minX,
        maxX,
        minY,
        maxY,
        minZ: -0.6,
        maxZ: 0.6,
      });
    });

    this.obstacles = newObstacles;
  }

  public getObstacles(): UIObstacleAABB[] {
    return this.obstacles;
  }
}

export const uiObstacleManager = new UIObstacleManager();
