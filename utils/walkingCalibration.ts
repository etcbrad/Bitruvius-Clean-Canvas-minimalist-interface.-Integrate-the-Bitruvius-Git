/**
 * Walking Engine Calibration Interface
 * Provides fine-grained control over walking animation parameters
 */

import { WalkingEngineGait } from '../types';

export interface WalkingCalibrationProfile {
  name: string;
  description: string;
  gait: WalkingEngineGait;
  // Speed and timing
  frequency?: number;        // Steps per second (1.0-3.0)
  speed?: number;           // Overall speed multiplier (0.1-3.0)
  
  // Movement characteristics
  intensity?: number;       // Energy/enthusiasm (0.0-1.0)
  stride?: number;          // Step length (0.1-1.2)
  lean?: number;            // Forward/backward lean (-0.5 to 0.5)
  
  // Physics and weight
  gravity?: number;         // Ground impact force (0.0-1.0)
  bounce?: number;          // Upward bounce after ground contact (0.0-1.0)
  ground_drag?: number;     // Foot friction/drag (0.0-1.0)
  
  // Body dynamics
  bends?: number;          // Overall joint bending (0.0-1.5)
  head_spin?: number;       // Head rotation during walk (0.0-0.5)
  mood?: number;           // Movement style/character (0.0-1.0)
  
  // Arm movement
  arm_swing?: number;      // Arm swing amplitude (0.0-1.5)
  elbow_bend?: number;     // Elbow flexion (0.0-1.0)
  wrist_swing?: number;    // Wrist rotation (0.0-1.0)
  
  // Leg and foot details
  foot_angle_on_ground?: number;  // Foot placement angle (-10 to 10 degrees)
  foot_roll?: number;             // Ankle rotation (0.0-1.0)
  toe_lift?: number;              // Toe extension (0.0-1.0)
  shin_tilt?: number;             // Lower leg angle (-0.5 to 0.5)
  foot_slide?: number;             // Foot sliding on ground (0.0-1.0)
  kick_up_force?: number;          // Toe lift force (0.0-1.0)
  hover_height?: number;          // Foot clearance height (0.0-0.5)
  waist_twist?: number;           // Hip rotation (0.0-1.0)
  hip_sway?: number;             // Side-to-side hip movement (0.0-1.0)
  toe_bend?: number;             // Toe flexion (0.0-1.0)
}

export const DEFAULT_CALIBRATION: WalkingCalibrationProfile = {
  name: 'Balanced',
  description: 'Natural walking motion with balanced parameters',
  gait: {
    intensity: 0.8,
    stride: 0.55,
    lean: 0.1,
    frequency: 1.2,
    gravity: 0.6,
    bounce: 0.1,
    bends: 1.0,
    head_spin: 0.0,
    mood: 0.8,
    ground_drag: 0.2,
    foot_angle_on_ground: 0,
    arm_swing: 0.6,
    elbow_bend: 0.7,
    wrist_swing: 0.6,
    foot_roll: 0.6,
    toe_lift: 0.8,
    shin_tilt: 0.0,
    foot_slide: 0.2,
    kick_up_force: 0.4,
    hover_height: 0.1,
    waist_twist: 0.3,
    hip_sway: 0.4,
    toe_bend: 0.8
  }
};

export const CALIBRATION_PRESETS: WalkingCalibrationProfile[] = [
  DEFAULT_CALIBRATION,
  {
    name: 'Athletic',
    description: 'Energetic, sporty walking with higher intensity',
    gait: {
      intensity: 1.0,
      stride: 0.8,
      lean: 0.05,
      frequency: 1.8,
      gravity: 0.3,
      bounce: 0.3,
      bends: 0.8,
      head_spin: 0.0,
      mood: 1.0,
      ground_drag: 0.1,
      foot_angle_on_ground: 0,
      arm_swing: 1.2,
      elbow_bend: 0.8,
      wrist_swing: 0.8,
      foot_roll: 0.8,
      toe_lift: 0.8,
      shin_tilt: 0.0,
      foot_slide: 0.1,
      kick_up_force: 0.9,
      hover_height: 0.2,
      waist_twist: 0.2,
      hip_sway: 0.1,
      toe_bend: 1.0
    }
  },
  {
    name: 'Casual',
    description: 'Relaxed, everyday walking style',
    gait: {
      intensity: 0.6,
      stride: 0.4,
      lean: 0.15,
      frequency: 1.0,
      gravity: 0.7,
      bounce: 0.05,
      bends: 0.7,
      head_spin: 0.0,
      mood: 0.6,
      ground_drag: 0.3,
      foot_angle_on_ground: 2,
      arm_swing: 0.4,
      elbow_bend: 0.6,
      wrist_swing: 0.4,
      foot_roll: 0.4,
      toe_lift: 0.6,
      shin_tilt: 0.1,
      foot_slide: 0.3,
      kick_up_force: 0.2,
      hover_height: 0.05,
      waist_twist: 0.4,
      hip_sway: 0.6,
      toe_bend: 0.6
    }
  },
  {
    name: 'Elderly',
    description: 'Gentle, careful walking with reduced movement',
    gait: {
      intensity: 0.4,
      stride: 0.3,
      lean: 0.2,
      frequency: 0.8,
      gravity: 0.8,
      bounce: 0.02,
      bends: 0.5,
      head_spin: 0.0,
      mood: 0.4,
      ground_drag: 0.5,
      foot_angle_on_ground: 5,
      arm_swing: 0.2,
      elbow_bend: 0.4,
      wrist_swing: 0.2,
      foot_roll: 0.3,
      toe_lift: 0.4,
      shin_tilt: 0.2,
      foot_slide: 0.5,
      kick_up_force: 0.1,
      hover_height: 0.02,
      waist_twist: 0.6,
      hip_sway: 0.8,
      toe_bend: 0.4
    }
  },
  {
    name: 'Robotic',
    description: 'Mechanical, precise movements with minimal bounce',
    gait: {
      intensity: 0.9,
      stride: 0.6,
      lean: 0.0,
      frequency: 2.0,
      gravity: 1.0,
      bounce: 0.0,
      bends: 0.3,
      head_spin: 0.1,
      mood: 0.2,
      ground_drag: 0.0,
      foot_angle_on_ground: 0,
      arm_swing: 0.8,
      elbow_bend: 0.9,
      wrist_swing: 0.9,
      foot_roll: 1.0,
      toe_lift: 1.0,
      shin_tilt: 0.0,
      foot_slide: 0.0,
      kick_up_force: 0.6,
      hover_height: 0.1,
      waist_twist: 0.1,
      hip_sway: 0.2,
      toe_bend: 0.8
    }
  }
];

/**
 * Apply calibration profile to a base gait
 */
export const applyCalibration = (
  baseGait: WalkingEngineGait,
  calibration: Partial<WalkingCalibrationProfile>
): WalkingEngineGait => {
  return {
    ...baseGait,
    ...calibration.gait,
    // Apply individual parameter overrides
    ...(calibration.frequency !== undefined && { frequency: calibration.frequency }),
    ...(calibration.speed !== undefined && { /* speed is handled separately */ }),
    ...(calibration.intensity !== undefined && { intensity: calibration.intensity }),
    ...(calibration.stride !== undefined && { stride: calibration.stride }),
    ...(calibration.lean !== undefined && { lean: calibration.lean }),
    ...(calibration.gravity !== undefined && { gravity: calibration.gravity }),
    ...(calibration.bounce !== undefined && { bounce: calibration.bounce }),
    ...(calibration.bends !== undefined && { bends: calibration.bends }),
    ...(calibration.head_spin !== undefined && { head_spin: calibration.head_spin }),
    ...(calibration.mood !== undefined && { mood: calibration.mood }),
    ...(calibration.ground_drag !== undefined && { ground_drag: calibration.ground_drag }),
    ...(calibration.foot_angle_on_ground !== undefined && { foot_angle_on_ground: calibration.foot_angle_on_ground }),
    ...(calibration.arm_swing !== undefined && { arm_swing: calibration.arm_swing }),
    ...(calibration.elbow_bend !== undefined && { elbow_bend: calibration.elbow_bend }),
    ...(calibration.wrist_swing !== undefined && { wrist_swing: calibration.wrist_swing }),
    ...(calibration.foot_roll !== undefined && { foot_roll: calibration.foot_roll }),
    ...(calibration.toe_lift !== undefined && { toe_lift: calibration.toe_lift }),
    ...(calibration.shin_tilt !== undefined && { shin_tilt: calibration.shin_tilt }),
    ...(calibration.foot_slide !== undefined && { foot_slide: calibration.foot_slide }),
    ...(calibration.kick_up_force !== undefined && { kick_up_force: calibration.kick_up_force }),
    ...(calibration.hover_height !== undefined && { hover_height: calibration.hover_height }),
    ...(calibration.waist_twist !== undefined && { waist_twist: calibration.waist_twist }),
    ...(calibration.hip_sway !== undefined && { hip_sway: calibration.hip_sway }),
    ...(calibration.toe_bend !== undefined && { toe_bend: calibration.toe_bend })
  };
};

/**
 * Get calibration profile by name
 */
export const getCalibrationProfile = (name: string): WalkingCalibrationProfile => {
  return CALIBRATION_PRESETS.find(profile => profile.name === name) || DEFAULT_CALIBRATION;
};
