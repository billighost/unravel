/**
 * UNRAVEL PER-INSTANCE TILE MATERIAL
 *
 * A MeshStandardMaterial patched via onBeforeCompile so each InstancedMesh
 * instance samples its own rectangular sub-region of the shared artwork
 * texture. The front face shows the crisp image tile; the side faces get a
 * darkened edge of the same tile so cubes read as solid painted blocks with
 * real thickness rather than flat stickers.
 */

import * as THREE from 'three';
import { buildTileUVAttributes } from './cubeTexture';

export interface TileMaterialHandles {
  material: THREE.MeshStandardMaterial;
  /** Swap in a new artwork texture (disposes the previous one). */
  setTexture: (texture: THREE.Texture | null) => void;
  dispose: () => void;
}

/**
 * Builds the instanced cube geometry that createTileMaterial() expects.
 *
 * Two contracts are satisfied here, and both are easy to get wrong:
 *
 * 1. `aTileOffset` / `aTileScale` — the per-instance window into the artwork
 *    texture that the vertex shader remaps UVs into.
 *
 * 2. A white per-vertex `color` attribute. The material needs
 *    `vertexColors: true` because three only multiplies `vColor` into
 *    `diffuseColor` when `USE_COLOR` is defined, and that define is what
 *    carries `instanceColor` (the per-cube average colour) through to the
 *    fragment stage. But `USE_COLOR` also makes the vertex shader run
 *    `vColor.rgb *= color`, and an unbound attribute reads as (0, 0, 0) — so
 *    without this white attribute every cube multiplies its colour by zero and
 *    renders pure black. That only showed up for grids with no artwork texture
 *    (restored saves, gallery items, challenges, the procedural demo), because
 *    the tile-map branch overwrites diffuseColor outright.
 */
export function createCubeGeometry(cols: number, rows: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  const { offsets, scales } = buildTileUVAttributes(cols, rows);
  geometry.setAttribute('aTileOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geometry.setAttribute('aTileScale', new THREE.InstancedBufferAttribute(scales, 2));

  const vertexCount = geometry.attributes.position.count;
  const white = new Float32Array(vertexCount * 3).fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));

  return geometry;
}

export function createTileMaterial(
  roughness: number,
  metalness: number
): TileMaterialHandles {
  const material = new THREE.MeshStandardMaterial({
    roughness,
    metalness,
    // Vertex colours carry the per-tile average, used as the base tint and as
    // the fallback whenever no artwork texture is bound (procedural demo grid).
    // Requires the geometry from createCubeGeometry() — see the note there.
    vertexColors: true,
  });

  const uniforms = {
    uTileMap: { value: null as THREE.Texture | null },
    uHasTileMap: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTileMap = uniforms.uTileMap;
    shader.uniforms.uHasTileMap = uniforms.uHasTileMap;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aTileOffset;
        attribute vec2 aTileScale;
        varying vec2 vTileUv;
        varying float vFaceShade;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Box geometry UVs are per-face 0..1, so remapping them into the
        // instance's tile rect paints every face with that tile's imagery.
        vTileUv = aTileOffset + uv * aTileScale;

        // Cheap face shading from the object-space normal: front face full
        // brightness, sides and back progressively darker. Gives the cubes
        // readable volume without needing shadow maps.
        vec3 objNormal = normalize(normal);
        vFaceShade = mix(0.62, 1.0, clamp(objNormal.z * 0.5 + 0.5, 0.0, 1.0));`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uTileMap;
        uniform float uHasTileMap;
        varying vec2 vTileUv;
        varying float vFaceShade;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uHasTileMap > 0.5) {
          vec4 tileTexel = texture2D(uTileMap, vTileUv);
          diffuseColor.rgb = tileTexel.rgb;
        }
        diffuseColor.rgb *= vFaceShade;`
      );
  };

  const setTexture = (texture: THREE.Texture | null) => {
    const previous = uniforms.uTileMap.value;
    if (previous && previous !== texture) {
      previous.dispose();
    }
    uniforms.uTileMap.value = texture;
    uniforms.uHasTileMap.value = texture ? 1 : 0;
    material.needsUpdate = true;
  };

  const dispose = () => {
    if (uniforms.uTileMap.value) {
      uniforms.uTileMap.value.dispose();
      uniforms.uTileMap.value = null;
    }
    material.dispose();
  };

  return { material, setTexture, dispose };
}
