/**
 * Proves the black-cube fix at the shader level.
 *
 * The bug: three's color_fragment chunk only multiplies vColor into
 * diffuseColor when USE_COLOR is defined, and USE_COLOR is what
 * `vertexColors: true` sets. But color_vertex then runs `vColor.rgb *= color`,
 * and an unbound `color` attribute reads as (0,0,0) — so every cube without a
 * tile texture rendered pure black.
 *
 * Run: npx tsx verify-shader.mts
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShaderChunk } from 'three';
import { createCubeGeometry, createTileMaterial } from './src/lib/cubeMaterial';

const results: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (err: any) {
    results.push(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

check('three only applies vColor under USE_COLOR (the trap)', () => {
  const fragment: string = ShaderChunk.color_fragment;
  assert.ok(
    /defined\(\s*USE_COLOR\s*\)/.test(fragment),
    'color_fragment should gate on USE_COLOR'
  );
  assert.ok(
    !/USE_INSTANCING_COLOR/.test(fragment),
    'instanceColor alone never reaches diffuseColor, so vertexColors must stay on'
  );
});

check('three multiplies by the color attribute when USE_COLOR is set', () => {
  const vertex: string = ShaderChunk.color_vertex;
  assert.ok(
    /#ifdef\s+USE_COLOR[\s\S]*vColor\.rgb\s*\*=\s*color/.test(vertex),
    'color_vertex must multiply by the color attribute — an unbound one reads (0,0,0)'
  );
});

check('createCubeGeometry supplies the white color attribute', () => {
  const geometry = createCubeGeometry(6, 4);

  const color = geometry.getAttribute('color');
  assert.ok(color, 'no color attribute -> USE_COLOR reads zero -> black cubes');
  assert.equal(color.count, geometry.getAttribute('position').count);
  assert.ok(
    Array.from(color.array as Float32Array).every((v) => v === 1),
    'the attribute must be all-white so instanceColor passes through unchanged'
  );
  geometry.dispose();
});

check('the material still declares vertexColors and the tile uniforms', () => {
  const handles = createTileMaterial(0.5, 0.1);

  assert.equal(handles.material.vertexColors, true, 'needed for instanceColor to reach the shader');

  // Run the onBeforeCompile patch against the real chunks and confirm both the
  // attribute plumbing and the tile-map branch land.
  const shader: any = {
    uniforms: {},
    vertexShader: `#include <common>\nvoid main() {\n#include <begin_vertex>\n}`,
    fragmentShader: `#include <common>\nvoid main() {\n#include <color_fragment>\n}`,
  };
  handles.material.onBeforeCompile!(shader as any, {} as any);

  for (const decl of ['attribute vec2 aTileOffset', 'attribute vec2 aTileScale', 'varying vec2 vTileUv']) {
    assert.ok(shader.vertexShader.includes(decl), `vertex shader missing: ${decl}`);
  }
  assert.ok(
    shader.fragmentShader.includes('uniform sampler2D uTileMap'),
    'fragment shader missing the tile sampler'
  );
  assert.ok(
    shader.fragmentShader.includes('uHasTileMap > 0.5'),
    'the texture branch must be guarded so textureless grids fall back to vColor'
  );
  assert.ok('uTileMap' in shader.uniforms && 'uHasTileMap' in shader.uniforms);

  handles.dispose();
});

check('instanceColor round-trips a per-cube colour through setColorAt', () => {
  const geometry = createCubeGeometry(2, 2);
  const handles = createTileMaterial(0.5, 0.1);
  const mesh = new THREE.InstancedMesh(geometry, handles.material, 4);

  const source = new THREE.Color();
  source.setRGB(0.9, 0.3, 0.15, THREE.SRGBColorSpace);
  mesh.setColorAt(0, source);

  assert.ok(mesh.instanceColor, 'setColorAt should allocate instanceColor');
  const readBack = new THREE.Color();
  mesh.getColorAt(0, readBack);
  assert.ok(Math.abs(readBack.r - source.r) < 1e-5, 'red channel should survive the upload');
  assert.ok(Math.abs(readBack.g - source.g) < 1e-5, 'green channel should survive the upload');

  // With a white vertex colour, vColor === instanceColor: the cube shows its
  // average colour rather than black.
  const white = geometry.getAttribute('color');
  assert.equal(white.array[0] * source.r, source.r);

  geometry.dispose();
  handles.dispose();
});

console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
