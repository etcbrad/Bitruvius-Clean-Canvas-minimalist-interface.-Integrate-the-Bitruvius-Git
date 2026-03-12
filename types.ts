

import React from 'react';

export enum PartName {
  Torso = 'torso',
  Waist = 'waist',
  Collar = 'collar',
  Head = 'head',
  RShoulder = 'rShoulder',
  RElbow = 'rElbow',
  RWrist = 'rWrist',
  LShoulder = 'lShoulder',
  LElbow = 'lElbow',
  LWrist = 'lWrist',
  RThigh = 'rThigh',
  RSkin = 'rSkin',
  RAnkle = 'rAnkle',
  LThigh = 'lThigh',
  LSkin = 'lSkin',
  LAnkle = 'lAnkle',
}

export const PART_NAMES: PartName[] = Object.values(PartName);

export const partNameToPoseKey: { [key in PartName]: string } = {
  [PartName.Torso]: 'torso',
  [PartName.Waist]: 'waist',
  [PartName.Collar]: 'collar',
  [PartName.Head]: 'head',
  [PartName.RShoulder]: 'rShoulder',
  [PartName.RElbow]: 'rForearm',
  [PartName.RWrist]: 'rWrist',
  [PartName.LShoulder]: 'lShoulder',
  [PartName.LElbow]: 'lForearm',
  [PartName.LWrist]: 'lWrist',
  [PartName.RThigh]: 'rThigh',
  [PartName.RSkin]: 'rCalf',
  [PartName.RAnkle]: 'rAnkle',
  [PartName.LThigh]: 'lThigh',
  [PartName.LSkin]: 'lCalf',
  [PartName.LAnkle]: 'lAnkle',
};

export const PARENT_MAP: { [key in PartName]?: PartName } = {
  [PartName.Torso]: PartName.Waist,
  [PartName.Collar]: PartName.Torso,
  [PartName.Head]: PartName.Collar,
  [PartName.RShoulder]: PartName.Collar,
  [PartName.LShoulder]: PartName.Collar,
  [PartName.RThigh]: PartName.Waist,
  [PartName.LThigh]: PartName.Waist,
  [PartName.RElbow]: PartName.RShoulder,
  [PartName.LElbow]: PartName.LShoulder,
  [PartName.RWrist]: PartName.RElbow,
  [PartName.LWrist]: PartName.LElbow,
  [PartName.RSkin]: PartName.RThigh,
  [PartName.LSkin]: PartName.LThigh,
  [PartName.RAnkle]: PartName.RSkin,
  [PartName.LAnkle]: PartName.LSkin,
};

export const CHILD_MAP: { [key in PartName]?: PartName[] } = (() => {
  const map: { [key in PartName]?: PartName[] } = {};
  PART_NAMES.forEach(child => {
    const parent = PARENT_MAP[child];
    if (parent) {
      if (!map[parent]) map[parent] = [];
      map[parent]!.push(child);
    }
  });
  return map;
})();

export const LIMB_SEQUENCES: { [key: string]: PartName[] } = {
  rArm: [PartName.RShoulder, PartName.RElbow, PartName.RWrist],
  lArm: [PartName.LShoulder, PartName.LElbow, PartName.LWrist],
  rLeg: [PartName.RThigh, PartName.RSkin, PartName.RAnkle],
  lLeg: [PartName.LThigh, PartName.LSkin, PartName.LAnkle],
};

export type Vector2D = { x: number; y: number; };
export type Pose = {
  root: Vector2D;
  bodyRotation: number;
  torso: number;
  waist: number;
  collar: number;
  head: number;
  lShoulder: number;
  lForearm: number;
  lWrist: number;
  rShoulder: number;
  rForearm: number;
  rWrist: number;
  lThigh: number;
  lCalf: number;
  lAnkle: number;
  rThigh: number;
  rCalf: number;
  rAnkle: number;
  offsets?: { [key: string]: Vector2D };
};

export type PartVisibility = { [key in PartName]: boolean };
export type PartSelection = { [key in PartName]: boolean };
export type AnchorName = PartName | 'root' | 'lFootTip' | 'rFootTip' | 'lHandTip' | 'rHandTip'; 

export type PinnedState = {
  [key in AnchorName]?: Vector2D;
};

// Defines the available kinetic constraint modes for joints.
// 'offset' and 'match' replace the prior 'stretch'/'curl' naming.
export type JointConstraint = 'fk' | 'offset' | 'match';

// Defines the rendering mode for the Bone component.
// Simplified: 'grayscale' removed as UI is globally monochrome, 'silhouette' now represents solid black fill.
export type RenderMode =
  | 'default'
  | 'wireframe'
  | 'silhouette'
  | 'backlight'
  | 'spotlight'
  | 'shadow'
  | 'grayscale'
  | 'sepia'
  | 'palette';

export type ViewMode = 'zoomed' | 'default' | 'lotte' | 'wide' | 'mobile'; // Added 'mobile'

// Keep the kinematic system lightweight and consistent: FABRIK is the single IK solver.
export type KinematicMode = 'fk' | 'fabrik';
export type BodyDragMode = 'rigid' | 'float' | 'space' | 'sling' | 'ragdoll' | 'tether';

export type WalkingEngineGait = {
  intensity: number;
  stride: number;
  lean: number;
  frequency: number;
  gravity: number;
  bounce: number;
  bends: number;
  head_spin: number;
  mood: number;
  ground_drag: number;
  foot_angle_on_ground: number;
  arm_swing: number;
  elbow_bend: number;
  wrist_swing: number;
  foot_roll: number;
  toe_lift: number;
  shin_tilt: number;
  foot_slide: number;
  kick_up_force: number;
  hover_height: number;
  waist_twist: number;
  hip_sway: number;
  toe_bend: number;
};

export type AnimationKeyframe = {
  id: string;
  pose: Pose;
  duration: number; // ms to reach this keyframe
};

export type AnimationState = {
  keyframes: AnimationKeyframe[];
  isPlaying: boolean;
  currentFrameIndex: number;
  loop: boolean;
};

// New Animation System Types (for clean separation)
export interface AnimationFrame {
  id: string;
  timestamp: number;
  pose: Pose;
  metadata?: {
    label?: string;
    ease?: EasingFunction;
    duration?: number;
    notes?: string;
  };
}

export interface ActionGroup {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  frameIds: string[];
  color?: string;
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export interface AnimationClip {
  id: string;
  name: string;
  frames: AnimationFrame[];
  groups: ActionGroup[];
  totalDuration: number;
  loop: boolean;
  created: number;
  modified: number;
}

// Unified Sequence Engine Types
export type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

export interface PoseSlot {
  id: string;
  label: string;          // Auto-assigned: A, B, C... or custom name
  pose: Pose;
  durationToNext: number; // ms to transition from this slot to next
  easing: EasingFunction;
  autoGenerated?: boolean;
}

export interface SequenceState {
  slots: PoseSlot[];
  loop: boolean;
  isPlaying: boolean;
  scrubPosition: number;  // 0.0–1.0 across entire timeline
  currentTimeMs: number; // Current playback position in milliseconds
  easingEnabled: boolean; // Global easing toggle
  smoothTransitions: boolean; // Global smooth transitions toggle
  ikAssisted: boolean; // IK-assisted pose-to-pose transitions
}

export interface TransitionSettings {
  easingEnabled: boolean;
  smoothTransitions: boolean;
  ikAssisted: boolean;
  ikStrength: number; // 0.0–1.0, how much IK influences the transition
  smoothness: number; // 0.0–1.0, smoothing factor for transitions
}

export type SavedPose = {
  id: string;
  name: string;
  data: string;
  timestamp: number;
};

// Defines the min/max rotation limits for each joint (in degrees).
export type JointLimits = {
  [key: string]: { min: number; max: number };
};

export type ImageFitMode = 'free' | 'contain' | 'cover';

export interface ImageLayerState {
  src: string | null;
  visible: boolean;
  opacity: number; // 0..1
  x: number; // 0..100 (percent)
  y: number; // 0..100 (percent)
  scale: number; // 10..400 (%)
  fitMode?: ImageFitMode;
  blendMode?: GlobalCompositeOperation;
}

export interface BodyPartMaskLayer {
  src: string | null;
  visible: boolean;
  opacity: number; // 0..1
  scale: number; // 10..400 (%)
  rotationDeg?: number;
  offsetX?: number;
  offsetY?: number;
  blendMode?: GlobalCompositeOperation;
  boneAdjustEnabled?: boolean;
  boneScaleLength?: number;
  boneScaleWidth?: number;
  boneVariant?: BoneVariant;
  physicsMode?: MaskPhysicsMode;
  balanceMode?: MaskBalanceMode;
  counterTargets?: PartName[];
  lockTargets?: PartName[];
}

export type BoneVariant =
  | 'diamond'
  | 'waist-teardrop-pointy-up'
  | 'torso-teardrop-pointy-down'
  | 'collar-horizontal-oval-shape'
  | 'deltoid-shape'
  | 'limb-tapered'
  | 'head-tall-oval'
  | 'hand-foot-arrowhead-shape'
  | 'oval-limb'
  | 'oval-torso'
  | 'oval-waist'
  | 'oval-hand-foot';

export type MaskPhysicsMode = 'follow' | 'replace' | 'offset' | 'balance' | 'counter' | 'lock';
export type MaskBalanceMode = 'x' | 'y' | 'slanted';
