/**
 * Type-safe interfaces for pose manipulation
 */

import { Pose, PartName, Vector2D } from '../types';

/**
 * Type-safe pose key mapping
 */
export type PoseKey = keyof Omit<Pose, 'root' | 'offsets'>;

/**
 * Type-safe pose update interface
 */
export interface PoseUpdate {
  root?: Pose['root'];
  bodyRotation?: Pose['bodyRotation'];
  torso?: Pose['torso'];
  waist?: Pose['waist'];
  collar?: Pose['collar'];
  head?: Pose['head'];
  lShoulder?: Pose['lShoulder'];
  lForearm?: Pose['lForearm'];
  lWrist?: Pose['lWrist'];
  rShoulder?: Pose['rShoulder'];
  rForearm?: Pose['rForearm'];
  rWrist?: Pose['rWrist'];
  lThigh?: Pose['lThigh'];
  lCalf?: Pose['lCalf'];
  lAnkle?: Pose['lAnkle'];
  rThigh?: Pose['rThigh'];
  rCalf?: Pose['rCalf'];
  rAnkle?: Pose['rAnkle'];
  offsets?: Pose['offsets'];
}

/**
 * Type-safe pose getter
 */
export const getPoseValue = (pose: Pose, key: PoseKey): number => {
  return pose[key] as number;
};

/**
 * Type-safe pose setter
 */
export const setPoseValue = (pose: Pose, key: PoseKey, value: number): Pose => {
  return {
    ...pose,
    [key]: value
  };
};

/**
 * Type-safe pose updater for multiple values
 */
export const updatePoseValues = (pose: Pose, updates: PoseUpdate): Pose => {
  return {
    ...pose,
    ...updates
  };
};

/**
 * Type-safe joint limit checker
 */
export interface JointLimits {
  min: number;
  max: number;
}

export const checkJointLimits = (value: number, limits: JointLimits): number => {
  return Math.max(limits.min, Math.min(limits.max, value));
};

/**
 * Type-safe vector operations
 */
export interface Vector2DOperations {
  add: (a: Vector2D, b: Vector2D) => Vector2D;
  subtract: (a: Vector2D, b: Vector2D) => Vector2D;
  multiply: (v: Vector2D, scalar: number) => Vector2D;
  magnitude: (v: Vector2D) => number;
  normalize: (v: Vector2D) => Vector2D;
  distance: (a: Vector2D, b: Vector2D) => number;
}

export const vector2D: Vector2DOperations = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  subtract: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  multiply: (v, scalar) => ({ x: v.x * scalar, y: v.y * scalar }),
  magnitude: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
  normalize: (v) => {
    const mag = Math.sqrt(v.x * v.x + v.y * v.y);
    return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
  },
  distance: (a, b) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2))
};

/**
 * Type-safe animation frame utilities
 */
export interface AnimationFrame {
  id: string;
  timestamp: number;
  pose: Pose;
}

export interface AnimationFrameUpdate {
  pose?: Pose;
  timestamp?: number;
}

export const updateAnimationFrame = (frame: AnimationFrame, updates: AnimationFrameUpdate): AnimationFrame => {
  return {
    ...frame,
    ...updates
  };
};
