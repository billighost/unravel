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
    bounceDamping: 0.82 + seed * 0.06,      // [0.82 .. 0.88]
    impulseResponse: 0.90 + Math.random() * 0.20, // [0.90 .. 1.10]
    friction: 0.94 + Math.random() * 0.04,        // [0.94 .. 0.98]
    materialRoughness: 0.25 + Math.random() * 0.30, // [0.25 .. 0.55]
    materialMetalness: 0.05 + Math.random() * 0.12, // [0.05 .. 0.17]
  };
}

export const sessionPhysicsConfig: SessionPhysicsConfig = createSessionConfig();
