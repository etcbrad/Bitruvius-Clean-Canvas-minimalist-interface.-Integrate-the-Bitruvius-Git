/**
 * Safe math operations utility functions
 * Provides safe alternatives to prevent common mathematical errors
 */

import { Vector2D } from '../types';

/**
 * Safe division that prevents division by zero
 * Returns fallback value if divisor is zero or invalid
 */
export const safeDivide = (numerator: number, denominator: number, fallback: number = 0): number => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }
  if (denominator === 0) {
    return fallback;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
};

/**
 * Safe distance calculation between two points
 * Returns fallback value if inputs are invalid
 */
export const safeDistance = (v1: Vector2D, v2: Vector2D, fallback: number = 0): number => {
  if (!v1 || !v2 || 
      !Number.isFinite(v1.x) || !Number.isFinite(v1.y) ||
      !Number.isFinite(v2.x) || !Number.isFinite(v2.y)) {
    return fallback;
  }
  
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return fallback;
  }
  
  const result = Math.sqrt(dx * dx + dy * dy);
  return Number.isFinite(result) ? result : fallback;
};

/**
 * Safe hypotenuse calculation
 * Returns fallback value if inputs are invalid
 */
export const safeHypot = (...values: number[]): number => {
  const validValues = values.filter(v => Number.isFinite(v));
  if (validValues.length === 0) {
    return 0;
  }
  
  const result = Math.hypot(...validValues);
  return Number.isFinite(result) ? result : 0;
};

/**
 * Safe linear interpolation
 * Clamps t to [0, 1] and validates inputs
 */
export const safeLerp = (start: number, end: number, t: number): number => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(t)) {
    return start;
  }
  
  const clampedT = Math.max(0, Math.min(1, t));
  return start * (1 - clampedT) + end * clampedT;
};

/**
 * Safe angle interpolation using shortest path
 * Handles angle wrapping and validates inputs
 */
export const safeLerpAngle = (start: number, end: number, t: number): number => {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(t)) {
    return start;
  }
  
  const clampedT = Math.max(0, Math.min(1, t));
  
  // Normalize angles to [0, 360)
  const normalize = (angle: number) => ((angle % 360) + 360) % 360;
  const startNorm = normalize(start);
  const endNorm = normalize(end);
  
  let delta = endNorm - startNorm;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  
  const result = start + delta * clampedT;
  return Number.isFinite(result) ? result : start;
};

/**
 * Safe clamping function with input validation
 */
export const safeClamp = (value: number, min: number, max: number, fallback: number = 0): number => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return fallback;
  }
  
  const actualMin = Math.min(min, max);
  const actualMax = Math.max(min, max);
  
  const result = Math.max(actualMin, Math.min(actualMax, value));
  return Number.isFinite(result) ? result : fallback;
};

/**
 * Safe vector addition with validation
 */
export const safeAddVectors = (v1: Vector2D, v2: Vector2D, fallback: Vector2D = { x: 0, y: 0 }): Vector2D => {
  if (!v1 || !v2 ||
      !Number.isFinite(v1.x) || !Number.isFinite(v1.y) ||
      !Number.isFinite(v2.x) || !Number.isFinite(v2.y)) {
    return fallback;
  }
  
  const result = {
    x: v1.x + v2.x,
    y: v1.y + v2.y
  };
  
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : fallback;
};

/**
 * Safe vector subtraction with validation
 */
export const safeSubtractVectors = (v1: Vector2D, v2: Vector2D, fallback: Vector2D = { x: 0, y: 0 }): Vector2D => {
  if (!v1 || !v2 ||
      !Number.isFinite(v1.x) || !Number.isFinite(v1.y) ||
      !Number.isFinite(v2.x) || !Number.isFinite(v2.y)) {
    return fallback;
  }
  
  const result = {
    x: v1.x - v2.x,
    y: v1.y - v2.y
  };
  
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : fallback;
};

/**
 * Safe vector scaling with validation
 */
export const safeScaleVector = (v: Vector2D, scale: number, fallback: Vector2D = { x: 0, y: 0 }): Vector2D => {
  if (!v || !Number.isFinite(scale) ||
      !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    return fallback;
  }
  
  const result = {
    x: v.x * scale,
    y: v.y * scale
  };
  
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : fallback;
};

/**
 * Safe vector normalization
 * Returns zero vector if magnitude is zero or invalid
 */
export const safeNormalizeVector = (v: Vector2D, fallback: Vector2D = { x: 0, y: 0 }): Vector2D => {
  if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    return fallback;
  }
  
  const magnitude = safeDistance({ x: 0, y: 0 }, v);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  
  return safeScaleVector(v, 1 / magnitude, fallback);
};

/**
 * Validates if a number is safe for mathematical operations
 */
export const isSafeNumber = (value: any): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
};

/**
 * Validates if a Vector2D is safe for mathematical operations
 */
export const isSafeVector = (v: any): v is Vector2D => {
  return v && 
         typeof v === 'object' &&
         isSafeNumber(v.x) &&
         isSafeNumber(v.y);
};
