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
    bounceDamping: 0.25 + seed * 0.15,      // [0.25 .. 0.40] - heavy wood doesn't bounce much
    impulseResponse: 0.35 + Math.random() * 0.20, // [0.35 .. 0.55] - harder to move
    friction: 0.82 + Math.random() * 0.06,        // [0.82 .. 0.88] - stops sliding much faster
    materialRoughness: 0.70 + Math.random() * 0.20, // [0.70 .. 0.90] - wood is quite rough
    materialMetalness: Math.random() * 0.05, // [0.00 .. 0.05] - wood is not metallic
  };
}

export const sessionPhysicsConfig: SessionPhysicsConfig = createSessionConfig();
