/**
 * UNRAVEL PER-SESSION VARIATION UTILITY
 * 
 * Generates subtle randomized physics tuning and material cosmetic parameters
 * on each fresh session to ensure every session feels unique.
 */

export interface SessionPhysicsConfig {
  bounceDamping: number;   // base ~ 0.85 (variance ± 0.05)
  impulseResponse: number; // base ~ 1.0 (variance ± 0.1)
  friction: number;        // base ~ 0.96 (variance ± 0.02)
  materialRoughness: number; // base ~ 0.4 (variance ± 0.15)
  materialMetalness: number; // base ~ 0.1 (variance ± 0.08)
}

function createSessionConfig(): SessionPhysicsConfig {
  const seed = Math.random();
  return {
    bounceDamping: 0.50 + seed * 0.10,      // [0.50 .. 0.60] - bouncy wood thud
    impulseResponse: 0.70 + Math.random() * 0.15, // [0.70 .. 0.85] - responsive, cubes fly
    friction: 0.94 + Math.random() * 0.03,        // [0.94 .. 0.97] - cubes travel far
    materialRoughness: 0.35 + Math.random() * 0.15, // [0.35 .. 0.50] - glossy wood finish
    materialMetalness: 0.10 + Math.random() * 0.08, // [0.10 .. 0.18] - subtle lacquer sheen
  };
}

export const sessionPhysicsConfig: SessionPhysicsConfig = createSessionConfig();
