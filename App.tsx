
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Pose, PartName, PartSelection, PartVisibility, AnchorName, partNameToPoseKey, PARENT_MAP, JointConstraint, RenderMode, Vector2D, ViewMode, AnimationState, AnimationKeyframe, SavedPose, KinematicMode, BodyDragMode, WalkingEngineGait, ImageLayerState, BodyPartMaskLayer, BoneVariant, MaskPhysicsMode, MaskBalanceMode } from './types';
import { RESET_POSE, FLOOR_HEIGHT, JOINT_LIMITS, ANATOMY, GROUND_STRIP_HEIGHT } from './constants'; 
import { getJointPositions, getShortestAngleDiffDeg, interpolatePoses, solveIK, solveAdvancedIK, solveFABRIK, solveJacobianTranspose, solvePIM2, solveDLS, solveFluid, lerp } from './utils/kinematics';
import { Scanlines, SystemGuides } from './components/SystemGrid';
import { Mannequin, getPartCategory, getPartCategoryDisplayName } from './components/Mannequin'; 
import { DraggablePanel } from './components/DraggablePanel';
import { COLORS_BY_CATEGORY, COLORS } from './components/Bone';
import { poseToString, stringToPose } from './utils/pose-parser';
import { CanvasRotationWheel } from './components/CanvasRotationWheel';
import { POSE_LIBRARY_DB } from './pose-library-db';
import { useSequence } from './hooks/useSequence';
import { createPoseSlot } from './utils/sequenceEngine';
import { EnhancedTimeline } from './components/EnhancedTimeline';
import { MovementSettings } from './components/MovementSettings';
import { debounce } from './utils/debounce';
import { WalkingCalibrationPanel } from './components/WalkingCalibrationPanel';
import { useDragState } from './hooks/useDragState';
import { usePanel } from './hooks/usePanel';

interface PanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

const DEFAULT_IMAGE_LAYER: ImageLayerState = {
  src: null,
  visible: false,
  opacity: 1,
  x: 50,
  y: 50,
  scale: 100,
  fitMode: 'contain',
  blendMode: 'source-over',
};

const DEFAULT_BODY_PART_MASK_LAYER: BodyPartMaskLayer = {
  src: null,
  visible: false,
  opacity: 1,
  scale: 100,
  rotationDeg: 0,
  offsetX: 0,
  offsetY: 0,
  blendMode: 'source-over',
  boneAdjustEnabled: false,
  boneScaleLength: 1,
  boneScaleWidth: 1,
  boneVariant: null,
  physicsMode: 'follow',
  balanceMode: 'y',
  counterTargets: [],
  lockTargets: [],
};

const BONE_VARIANT_OPTIONS: BoneVariant[] = [
  'diamond',
  'waist-teardrop-pointy-up',
  'torso-teardrop-pointy-down',
  'collar-horizontal-oval-shape',
  'deltoid-shape',
  'limb-tapered',
  'head-tall-oval',
  'hand-foot-arrowhead-shape',
  'oval-limb',
  'oval-torso',
  'oval-waist',
  'oval-hand-foot',
];

const MASK_AUTO_CROP_ALPHA_THRESHOLD = 12;
const MASK_AUTO_CROP_PADDING = 8;

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const MIRROR_PART_MAP: Partial<Record<PartName, PartName>> = {
  [PartName.LShoulder]: PartName.RShoulder,
  [PartName.RShoulder]: PartName.LShoulder,
  [PartName.LElbow]: PartName.RElbow,
  [PartName.RElbow]: PartName.LElbow,
  [PartName.LWrist]: PartName.RWrist,
  [PartName.RWrist]: PartName.LWrist,
  [PartName.LThigh]: PartName.RThigh,
  [PartName.RThigh]: PartName.LThigh,
  [PartName.LSkin]: PartName.RSkin,
  [PartName.RSkin]: PartName.LSkin,
  [PartName.LAnkle]: PartName.RAnkle,
  [PartName.RAnkle]: PartName.LAnkle,
};

const getMirrorPart = (part: PartName): PartName | null => MIRROR_PART_MAP[part] ?? null;

const applyBoneScalePatch = (
  prev: Record<PartName, { length: number; width: number }>,
  part: PartName,
  patch: Partial<{ length: number; width: number }>
) => {
  const current = prev[part] ?? { length: 1, width: 1 };
  const next = {
    length: patch.length ?? current.length,
    width: patch.width ?? current.width,
  };
  const updated = { ...prev, [part]: next };
  const mirrorPart = getMirrorPart(part);
  if (mirrorPart) {
    const mirrorCurrent = prev[mirrorPart] ?? { length: 1, width: 1 };
    updated[mirrorPart] = {
      length: patch.length ?? mirrorCurrent.length,
      width: patch.width ?? mirrorCurrent.width,
    };
  }
  return updated;
};

const WALKING_PRESETS: { name: string; gait: WalkingEngineGait }[] = [
  {
    name: 'Walk',
    gait: { intensity: 0.8, stride: 0.55, lean: 0.1, frequency: 1.2, gravity: 0.6, bounce: 0.1, bends: 1.0, head_spin: 0.0, mood: 0.8, ground_drag: 0.2, foot_angle_on_ground: 0, arm_swing: 0.6, elbow_bend: 0.7, wrist_swing: 0.6, foot_roll: 0.6, toe_lift: 0.8, shin_tilt: 0.0, foot_slide: 0.2, kick_up_force: 0.4, hover_height: 0.1, waist_twist: 0.3, hip_sway: 0.4, toe_bend: 0.8 },
  },
  {
    name: 'Bouncy',
    gait: { intensity: 0.9, stride: 0.5, lean: -0.1, frequency: 1.5, gravity: 0.4, bounce: 0.8, bends: 0.8, head_spin: 0.0, mood: 0.9, ground_drag: 0.1, foot_angle_on_ground: 5, arm_swing: 0.8, elbow_bend: 0.6, wrist_swing: 0.7, foot_roll: 0.7, toe_lift: 0.7, shin_tilt: -0.1, foot_slide: 0.1, kick_up_force: 0.5, hover_height: 0.3, waist_twist: 0.4, hip_sway: 0.6, toe_bend: 0.7 },
  },
  {
    name: 'Run',
    gait: { intensity: 1.0, stride: 0.8, lean: 0.05, frequency: 2.2, gravity: 0.3, bounce: 0.3, bends: 0.14, head_spin: 0.0, mood: 1.0, ground_drag: 0.1, foot_angle_on_ground: 0, arm_swing: 1.2, elbow_bend: 0.8, wrist_swing: 0.8, foot_roll: 0.8, toe_lift: 0.8, shin_tilt: 0.0, foot_slide: 0.1, kick_up_force: 0.9, hover_height: 0.2, waist_twist: 0.2, hip_sway: 0.1, toe_bend: 1.0 },
  },
  {
    name: 'Jog',
    gait: { intensity: 0.9, stride: 0.6, lean: 0.1, frequency: 1.8, gravity: 0.5, bounce: 0.4, bends: 0.6, head_spin: 0.0, mood: 0.85, ground_drag: 0.15, foot_angle_on_ground: 0, arm_swing: 1.0, elbow_bend: 0.9, wrist_swing: 0.5, foot_roll: 0.7, toe_lift: 0.6, shin_tilt: 0.0, foot_slide: 0.1, kick_up_force: 0.6, hover_height: 0.15, waist_twist: 0.3, hip_sway: 0.2, toe_bend: 0.9 },
  },
  {
    name: 'Scoot',
    gait: { intensity: 0.7, stride: 0.2, lean: 0.2, frequency: 2.5, gravity: 0.7, bounce: 0.1, bends: 1.2, head_spin: 0.0, mood: 0.6, ground_drag: 0.6, foot_angle_on_ground: 10, arm_swing: 0.1, elbow_bend: 0.3, wrist_swing: 0.1, foot_roll: 0.3, toe_lift: 0.2, shin_tilt: 0.2, foot_slide: 0.8, kick_up_force: 0.1, hover_height: 0.0, waist_twist: 0.8, hip_sway: 1.0, toe_bend: 0.4 },
  },
];

const toBlendMode = (value?: GlobalCompositeOperation): React.CSSProperties['mixBlendMode'] => {
  if (!value || value === 'source-over') {
    return 'normal';
  }
  return value as React.CSSProperties['mixBlendMode'];
};

const App: React.FC = () => {
  const [activePose, setActivePose] = useState<Pose>(RESET_POSE);
  const [ghostPose, setGhostPose] = useState<Pose>(RESET_POSE);
  const isDragging = useRef(false);
  const undoStack = useRef<Pose[]>([]);
  const redoStack = useRef<Pose[]>([]);
  const dragStartPose = useRef<Pose | null>(null);


  const [activeTab, setActiveTab] = useState<'model' | 'animation'>('model');
  const [poseA, setPoseA] = useState<Pose | null>(null);
  const [poseB, setPoseB] = useState<Pose | null>(null);
  const [tweenValue, setTweenValue] = useState(0); // 0 to 100

  const capturePoseA = () => setPoseA({ ...activePose });
  const capturePoseB = () => setPoseB({ ...activePose });

  useEffect(() => {
    if (poseA && poseB) {
      const t = tweenValue / 100;
      const interpolated = interpolatePoses(poseA, poseB, t);
      setActivePose(interpolated);
      setGhostPose(interpolated);
    }
  }, [tweenValue, poseA, poseB]);

  const [viewMode, setViewMode] = useState<ViewMode>('default');
  const [activePins, setActivePins] = useState<AnchorName[]>([PartName.Waist]); 
  const [pinnedState, setPinnedState] = useState<Record<string, Vector2D>>({});
  const [renderMode, setRenderMode] = useState<RenderMode>('default');
  const [paletteColors] = useState({
    shadow: '#0f172a',
    mid: '#64748b',
    highlight: '#e2e8f0',
  });

  const [selectedParts, setSelectedParts] = useState<PartSelection>(() => {
    const initialSelection: PartSelection = Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: false }), {} as PartSelection);
    initialSelection[PartName.Waist] = true; 
    return initialSelection;
  });

  const [visibility, setVisibility] = useState<PartVisibility>(() => Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: true }), {} as PartVisibility));

  const [jointModes, setJointModes] = useState<Record<PartName, JointConstraint>>(() => 
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: 'fk' }), {} as Record<PartName, JointConstraint>)
  );

  // New Sequence Engine with Auto-Interpolation (defaults to ON)
  const [sequence, sequencePose, sequenceActions] = useSequence(activePose, { autoInterpolationEnabled: autoInterpolation });
  const [autoInterpolation, setAutoInterpolation] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [viewingPose, setViewingPose] = useState<Pose | null>(null);

  const [kinematicMode, setKinematicMode] = useState<KinematicMode>('fk');
  const [bodyDragMode, setBodyDragMode] = useState<BodyDragMode>('rigid');
  const [bodyDragWeightiness, setBodyDragWeightiness] = useState(0);
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [groundPlaneMode, setGroundPlaneMode] = useState<'gradient' | 'black' | 'white' | 'transparent' | 'perspective'>('gradient');
  const [groundPattern, setGroundPattern] = useState<'none' | 'hatch' | 'stippling' | 'dither'>('none');
  const [groundPerspective, setGroundPerspective] = useState({ lines: 10, spacing: 40, convergence: 0.85 });

  const bodyDragStateRef = useRef<{ lastTime: number; lastTarget: Vector2D | null; velocity: Vector2D }>({
    lastTime: 0,
    lastTarget: null,
    velocity: { x: 0, y: 0 },
  });
  const bodyDragModeRef = useRef<BodyDragMode>('rigid');
  const bodyDragModeSwitchRef = useRef<{ lastMode: BodyDragMode; lastSwitchTime: number }>({
    lastMode: 'rigid',
    lastSwitchTime: 0,
  });

  // Update activePose with sequencePose when sequence is playing or scrubbing
  useEffect(() => {
    if ((sequence.isPlaying || sequence.scrubPosition >= 0) && !isUserInteracting) {
      setActivePose(sequencePose);
    }
  }, [sequencePose, sequence.isPlaying, sequence.scrubPosition, isUserInteracting]);

  // --- Sequence Actions ---
  const addKeyframe = useCallback(() => {
    sequenceActions.addSlot(activePose);
  }, [activePose, sequenceActions]);

  const removeKeyframe = useCallback((id: string) => {
    sequenceActions.removeSlot(id);
  }, [sequenceActions]);

  const playAnimation = useCallback(() => {
    sequenceActions.play();
  }, [sequenceActions]);

  const stopAnimation = useCallback(() => {
    sequenceActions.stop();
  }, [sequenceActions]);

  // --- Pose Editing Actions ---
  const handleSlotClick = useCallback((slotId: string) => {
    setSelectedSlotId(slotId);
    const slot = sequence.slots.find(s => s.id === slotId);
    if (slot) {
      setViewingPose(slot.pose);
    }
  }, [sequence.slots]);

  const updateSlotFromCurrent = useCallback((slotId: string) => {
    sequenceActions.updateSlot(slotId, activePose);
  }, [activePose, sequenceActions]);

  const exitPoseView = useCallback(() => {
    setViewingPose(null);
    setSelectedSlotId(null);
  }, []);

  // --- IK Interaction Logic with Smooth Motion ---
  const handleIKMove = useCallback((pinName: AnchorName, targetPos: Vector2D) => {
    if (pinName === 'root' || pinName === PartName.Waist) return;

    // Set interaction flag to prevent sequence updates during user manipulation
    setIsUserInteracting(true);

    // Determine which limb we are dragging
    let limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg' | null = null;
    if (pinName === PartName.RWrist || pinName === 'rHandTip') limb = 'rArm';
    else if (pinName === PartName.LWrist || pinName === 'lHandTip') limb = 'lArm';
    else if (pinName === PartName.RAnkle || pinName === 'rFootTip') limb = 'rLeg';
    else if (pinName === PartName.LAnkle || pinName === 'lFootTip') limb = 'lLeg';

    if (limb) {
      let solvedPose: Pose;

      if (kinematicMode === 'fk') {
        solvedPose = activePose;
      } else if (kinematicMode === 'ik') {
        solvedPose = solveIK(activePose, limb, targetPos, 10);
      } else if (kinematicMode === 'fabrik') {
        solvedPose = solveFABRIK(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'jacobian') {
        solvedPose = solveJacobianTranspose(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'pim2') {
        solvedPose = solvePIM2(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'dls') {
        solvedPose = solveDLS(activePose, limb, targetPos, jointModes, activePins);
      } else if (kinematicMode === 'fluid') {
        solvedPose = solveFluid(activePose, limb, targetPos, jointModes, activePins);
      } else {
        solvedPose = solveFABRIK(activePose, limb, targetPos, jointModes, activePins);
      }
      setGhostPose(solvedPose);
    }
  }, [activePose, jointModes, activePins, kinematicMode]);

  const getPinnedLimbTargets = useCallback(() => {
    const targets: Partial<Record<'rArm' | 'lArm' | 'rLeg' | 'lLeg', Vector2D>> = {};
    const priority: { limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg'; pins: AnchorName[] }[] = [
      { limb: 'rLeg', pins: ['rFootTip', PartName.RAnkle] },
      { limb: 'lLeg', pins: ['lFootTip', PartName.LAnkle] },
      { limb: 'rArm', pins: ['rHandTip', PartName.RWrist] },
      { limb: 'lArm', pins: ['lHandTip', PartName.LWrist] },
    ];

    priority.forEach(({ limb, pins }) => {
      for (const pin of pins) {
        if (activePins.includes(pin) && pinnedState[pin]) {
          targets[limb] = pinnedState[pin];
          break;
        }
      }
    });

    return targets;
  }, [activePins, pinnedState]);

  const solveBodyDragLimb = useCallback((
    pose: Pose,
    limb: 'rArm' | 'lArm' | 'rLeg' | 'lLeg',
    target: Vector2D
  ) => {
    if (bodyDragMode === 'float' || bodyDragMode === 'space') {
      return solveFluid(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'ragdoll') {
      return solveDLS(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'sling') {
      return solveJacobianTranspose(pose, limb, target, jointModes, activePins);
    }
    if (bodyDragMode === 'tether') {
      return solvePIM2(pose, limb, target, jointModes, activePins);
    }
    return solveFABRIK(pose, limb, target, jointModes, activePins);
  }, [activePins, bodyDragMode, jointModes]);

  const solvePinnedLimbsForBodyDrag = useCallback((pose: Pose) => {
    const targets = getPinnedLimbTargets();
    let nextPose = pose;
    (Object.entries(targets) as Array<['rArm' | 'lArm' | 'rLeg' | 'lLeg', Vector2D]>).forEach(
      ([limb, target]) => {
        if (target) {
          nextPose = solveBodyDragLimb(nextPose, limb, target);
        }
      }
    );
    return nextPose;
  }, [getPinnedLimbTargets, solveBodyDragLimb]);

  const computeBodyDragRoot = useCallback((targetRoot: Vector2D) => {
    const now = performance.now();
    const dragState = bodyDragStateRef.current;
    const switchState = bodyDragModeSwitchRef.current;

    if (bodyDragModeRef.current !== bodyDragMode) {
      bodyDragModeRef.current = bodyDragMode;
      switchState.lastMode = bodyDragMode;
      switchState.lastSwitchTime = now;
      dragState.velocity = { x: 0, y: 0 };
      dragState.lastTarget = targetRoot;
      dragState.lastTime = now;
    }
    const lastTarget = dragState.lastTarget ?? targetRoot;
    const dt = Math.max(8, now - (dragState.lastTime || now));

    const targetVel = {
      x: (targetRoot.x - lastTarget.x) / dt,
      y: (targetRoot.y - lastTarget.y) / dt,
    };

    dragState.velocity = {
      x: dragState.velocity.x * 0.65 + targetVel.x * 0.35,
      y: dragState.velocity.y * 0.65 + targetVel.y * 0.35,
    };

    dragState.lastTarget = targetRoot;
    dragState.lastTime = now;

    const presets: Record<BodyDragMode, { follow: number; lag: number; sag: number; tether: number; switchFriction: number }> = {
      rigid: { follow: 1, lag: 0, sag: 0, tether: 0, switchFriction: 0.6 },
      float: { follow: 0.22, lag: 0.3, sag: 0.1, tether: 0.1, switchFriction: 0.35 },
      space: { follow: 0.15, lag: 0.45, sag: 0.05, tether: 0.15, switchFriction: 0.3 },
      sling: { follow: 0.28, lag: 0.7, sag: 0.1, tether: 0.25, switchFriction: 0.4 },
      ragdoll: { follow: 0.16, lag: 0.2, sag: 1, tether: 0, switchFriction: 0.32 },
      tether: { follow: 0.2, lag: 0.4, sag: 0.05, tether: 0.9, switchFriction: 0.42 },
    };

    const preset = presets[bodyDragMode];
    const weightScale = 1 - Math.min(0.75, bodyDragWeightiness * 0.9);
    let follow = Math.min(1, preset.follow * weightScale * (dt / 16));

    const switchAge = now - switchState.lastSwitchTime;
    if (switchAge < 200) {
      follow *= preset.switchFriction;
    }

    const delta = {
      x: targetRoot.x - activePose.root.x,
      y: targetRoot.y - activePose.root.y,
    };
    const distance = Math.hypot(delta.x, delta.y);
    const maxSnap = switchAge < 200 ? 60 * preset.switchFriction : 220;
    const snapScale = distance > maxSnap ? maxSnap / Math.max(distance, 0.001) : 1;

    let nextRoot = {
      x: activePose.root.x + delta.x * follow * snapScale,
      y: activePose.root.y + delta.y * follow * snapScale,
    };

    const speed = Math.hypot(dragState.velocity.x, dragState.velocity.y);

    if (bodyDragMode === 'sling') {
      const lag = Math.min(1, speed * 40) * preset.lag;
      nextRoot = {
        x: nextRoot.x - dragState.velocity.x * 120 * lag,
        y: nextRoot.y - dragState.velocity.y * 120 * lag,
      };
    } else if (bodyDragMode === 'ragdoll') {
      const sag = (30 + Math.min(120, speed * 300)) * preset.sag;
      nextRoot = {
        x: nextRoot.x,
        y: nextRoot.y + sag * (0.4 + bodyDragWeightiness),
      };
    } else if (bodyDragMode === 'tether') {
      nextRoot = {
        x: nextRoot.x + dragState.velocity.x * 60 * preset.tether,
        y: nextRoot.y + dragState.velocity.y * 60 * preset.tether,
      };
    } else if (bodyDragMode === 'float' || bodyDragMode === 'space') {
      nextRoot = {
        x: nextRoot.x - dragState.velocity.x * 40 * preset.lag,
        y: nextRoot.y - dragState.velocity.y * 40 * preset.lag + 20 * preset.sag,
      };
    }

    return nextRoot;
  }, [activePose.root.x, activePose.root.y, bodyDragMode, bodyDragWeightiness]);

  const [userPoses, setUserPoses] = useState<SavedPose[]>(() => {
    const saved = localStorage.getItem('bitruvius-saved-poses');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bitruvius-saved-poses', JSON.stringify(userPoses));
  }, [userPoses]);

  const saveCurrentPose = (name: string) => {
    const newPose: SavedPose = {
      id: `UP-${Date.now()}`,
      name: name || `Pose ${userPoses.length + 1}`,
      data: poseToString(activePose),
      timestamp: Date.now(),
    };
    setUserPoses(prev => [newPose, ...prev]);
  };

  const deleteSavedPose = (id: string) => {
    setUserPoses(prev => prev.filter(p => p.id !== id));
  };

  const [isAdjusting, setIsAdjusting] = useState(false);
  const [rotatingPart, setRotatingPart] = useState<PartName | null>(null);
  const rotationStartInfo = useRef<{ 
    startAngle: number; 
    startRotationValue: number; 
    pointerX: number; 
    pointerY: number;
    initialPinnedPos: Vector2D | null;
  } | null>(null);

  const [isEffectorDragging, setIsEffectorDragging] = useState(false);
  const [effectorPart, setEffectorPart] = useState<PartName | null>(null);
  const [isIKDragging, setIsIKDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null); 
  const [isCraneActive] = useState(false);
  const [isCraneDragging, setIsCraneDragging] = useState(false);
const dragStartInfo = useRef<{ startX: number; startY: number; startRootX: number; startRootY: number } | null>(null);

  function dragStartInfoInitial() {
    return { startX: 0, startY: 0, startRootX: 0, startRootY: 0 };
  }

  const [showSplash, setShowSplash] = useState(true);
  const [isAirMode] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showBoneOverlay, setShowBoneOverlay] = useState(true);
  const [wheelCollapsed, setWheelCollapsed] = useState(false);
  const [mannequinStyle, setMannequinStyle] = useState<'default' | 'oval'>('default');
  const [walkingEnabled, setWalkingEnabled] = useState(false);
  const [walkingPinMode, setWalkingPinMode] = useState<'none' | 'leftFoot' | 'rightFoot' | 'dual'>('none');
  const [gaitDepth, setGaitDepth] = useState(35);
  const [walkingPresetIndex, setWalkingPresetIndex] = useState(0);
  const [walkingGait, setWalkingGait] = useState<WalkingEngineGait>(WALKING_PRESETS[0].gait);
  const [walkingSpeed, setWalkingSpeed] = useState(1);
  const [showCalibrationPanel, setShowCalibrationPanel] = useState(false);

  // Hook for drag state management
  const [dragState, dragActions] = useDragState();

  // Hook for panel management  
  const [panelState, panelActions] = usePanel();

  const resolveLayerPlacement = useCallback((layer: any) => {
    return { x: 0, y: 0, width: 100, height: 100 };
  }, []);

  const cycleBodyDragMode = useCallback(() => {
    // Add body drag mode cycling logic here if needed
  }, []);

  const cycleBodyDragWeightiness = useCallback(() => {
    // Add body drag weightiness cycling logic here if needed  
  }, []);

  const cycleWalkingPreset = useCallback(() => {
    // Add walking preset cycling logic here if needed
  }, []);

  const saveWalkingLoopToTimeline = useCallback(() => {
    // Add walking loop save logic here if needed
  }, []);

  const handleBackgroundUploadInput = useCallback(() => {
    backgroundUploadInputRef.current?.click();
  }, []);

  const handleForegroundUploadInput = useCallback(() => {
    foregroundUploadInputRef.current?.click();
  }, []);

  const handleBodyPartMaskUploadInput = useCallback(() => {
    bodyPartMaskUploadInputRef.current?.click();
  }, []);

  const dockHeight = 800;

  const toggleSection = useCallback((panelId: string, sectionId: string) => {
    // Add section toggle logic here if needed
  }, []);

  const expandedSections = useMemo(() => ({}), []);

  const handleClearBackgroundImageLayer = useCallback(() => {
    setBackgroundImageLayer(DEFAULT_IMAGE_LAYER);
  }, []);

  const handlePatchBackgroundImageLayer = useCallback((patch: any) => {
    setBackgroundImageLayer(prev => ({ ...prev, ...patch }));
  }, []);

  const handleClearForegroundImageLayer = useCallback(() => {
    setForegroundImageLayer(DEFAULT_IMAGE_LAYER);
  }, []);

  const handlePatchForegroundImageLayer = useCallback((patch: any) => {
    setForegroundImageLayer(prev => ({ ...prev, ...patch }));
  }, []);

  const handleClearBodyPartMaskLayer = useCallback(() => {
    // Add mask clear logic here if needed
  }, []);

  const handlePatchBodyPartMaskLayer = useCallback((patch: any) => {
    // Add mask patch logic here if needed
  }, []);

  const loadedMaskCount = 0;
  const orderedParts = Object.values(PartName);

  const openBackgroundUpload = useCallback(() => {
    backgroundUploadInputRef.current?.click();
  }, []);

  const openForegroundUpload = useCallback(() => {
    foregroundUploadInputRef.current?.click();
  }, []);

  const openBodyPartMaskUpload = useCallback(() => {
    bodyPartMaskUploadInputRef.current?.click();
  }, []);

  const selectedBoneScale = { length: 1, width: 1 };

  const handlePatchJointOffset = useCallback(() => {
    // Add joint offset patch logic here if needed
  }, []);

  const maskHandles = [];

  const handleMouseDownOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    
    if (smartPinning) {
      // Check if walking is active - if so, merge smart pins with existing pins
      const smartPinSet: AnchorName[] = [];
      
      if (part === PartName.LAnkle) {
        smartPinSet.push(PartName.Waist, PartName.LAnkle, 'lFootTip');
      } else if (part === PartName.RAnkle) {
        smartPinSet.push(PartName.Waist, PartName.RAnkle, 'rFootTip');
      } else if (part === PartName.LWrist) {
        smartPinSet.push(PartName.Waist, PartName.LWrist, 'lHandTip');
      } else if (part === PartName.RWrist) {
        smartPinSet.push(PartName.Waist, PartName.RWrist, 'rHandTip');
      }
      
      if (walkingEnabled) {
        // Merge smart pins with existing active pins to coexist with walking engine
        const mergedPins = Array.from(new Set([...activePins, ...smartPinSet]));
        setActivePins(mergedPins);
      } else {
        // Replace pins when walking is disabled
        setActivePins(smartPinSet);
      }
    }

    setSelectedParts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => (next[k as PartName] = false);
      next[part] = true;
      return next;
    });
  }, [smartPinning, activePins, walkingEnabled]);

  const handleDoubleClickOnPart = useCallback(() => {
    // Add double click handler here if needed
  }, []);

  const jointPositions = useMemo(() => getJointPositions(activePose, []), [activePose]);

  const applyBoneScalePatch = useCallback((prev: any, part: PartName, scale: any) => {
    return { ...prev, [part]: scale };
  }, []);
  const [showSystemTab, setShowSystemTab] = useState(false);
  const [smartPinning, setSmartPinning] = useState(false);
  const [bodySyncMode, setBodySyncMode] = useState(false);
  const [omniSyncMode, setOmniSyncMode] = useState(false);
  const [panelsVisible, setPanelsVisible] = useState(true);
  const [characterEditMode, setCharacterEditMode] = useState(false);
  const [globalBoneScale, setGlobalBoneScale] = useState({ length: 1.0, width: 1.0 });
  const [boneScale, setBoneScale] = useState<Record<PartName, { length: number; width: number }>>(() => (
    Object.values(PartName).reduce((acc, part) => ({ ...acc, [part]: { length: 1, width: 1 } }), {} as Record<PartName, { length: number; width: number }>)
  ));
  const [enablePerBoneResize] = useState(true);
  const [boneVariantOverrides, setBoneVariantOverrides] = useState<Record<PartName, BoneVariant | null>>(() => (
    Object.values(PartName).reduce((acc, part) => ({ ...acc, [part]: null }), {} as Record<PartName, BoneVariant | null>)
  ));
  const [backgroundImageLayer, setBackgroundImageLayer] = useState<ImageLayerState>(DEFAULT_IMAGE_LAYER);
  const [foregroundImageLayer, setForegroundImageLayer] = useState<ImageLayerState>(DEFAULT_IMAGE_LAYER);
  const [bodyPartMaskLayers, setBodyPartMaskLayers] = useState<Record<PartName, BodyPartMaskLayer>>({});
  const [maskControlsVisible, setMaskControlsVisible] = useState(false);
  const [activeMaskEditorPart, setActiveMaskEditorPart] = useState<PartName | null>(null);
  const [maskUploadTarget, setMaskUploadTarget] = useState<PartName | null>(null);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const foregroundObjectUrlRef = useRef<string | null>(null);
  const bodyPartMaskObjectUrlRef = useRef<Record<PartName, string>>({} as Record<PartName, string>);
  const backgroundUploadInputRef = useRef<HTMLInputElement>(null);
  const foregroundUploadInputRef = useRef<HTMLInputElement>(null);
  const bodyPartMaskUploadInputRef = useRef<HTMLInputElement>(null);

  const walkingBasePoseRef = useRef<Pose>(RESET_POSE);
  const walkingPhaseRef = useRef(0);
  const walkingLastTimeRef = useRef(0);
  const walkingGaitRef = useRef<WalkingEngineGait>(walkingGait);
  const walkingFootLockRef = useRef<{
    left: { active: boolean; pos: Vector2D; blend: number };
    right: { active: boolean; pos: Vector2D; blend: number };
  }>({
    left: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
    right: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
  });

  const buildWalkingPose = useCallback((
    phase: number,
    basePose: Pose,
    gait: WalkingEngineGait,
    depth: number,
  ): Pose => {
    const strideVal = Math.sin(phase);
    const counterStride = Math.sin(phase + Math.PI);
    const moodFactor = gait.mood;

    const torsoLean = (gait.lean * 35) + (moodFactor - 0.5) * -40 + Math.cos(phase * 2) * 8 * gait.intensity;
    const waistTwist = counterStride * 20 * gait.waist_twist * gait.intensity;
    const hipSwayMagnitude = 25 * gait.hip_sway * gait.intensity;
    const waistSway = Math.cos(phase * 2) * hipSwayMagnitude * 0.5;
    const bodySwayX = Math.sin(phase * 2) * hipSwayMagnitude * 0.5;
    const bobbing = -Math.cos(phase * 2) * 5 * gait.bounce;

    const armSwingMagnitude = (20 + (gait.stride * 45)) * (0.4 + moodFactor) * gait.arm_swing;
    const baseElbowBend = -30 * gait.elbow_bend;
    const dynamicElbowAmplitude = 60 * gait.arm_swing * gait.intensity * gait.bends;
    const elbowPhaseOffset = Math.PI * 0.05;
    const lElbowDrive = Math.cos(phase + Math.PI + elbowPhaseOffset);
    const rElbowDrive = Math.cos(phase + elbowPhaseOffset);
    const wristPhaseOffset = Math.PI * 0.15;
    const lWristDrive = Math.cos(phase + Math.PI + wristPhaseOffset);
    const rWristDrive = Math.cos(phase + wristPhaseOffset);

    const easeInOutQuint = (t: number) => (t < 0.5
      ? 16 * t * t * t * t * t
      : 1 - Math.pow(-2 * t + 2, 5) / 2);

    const calculateLegAngles = (s: number, phaseValue: number) => {
      const hipMult = (10 + (gait.stride * 35)) * (0.8 + gait.intensity * 0.4) * (0.5 + moodFactor);
      const effectiveS = s < 0 ? s * 0.5 : s;
      let hip = effectiveS * hipMult;
      hip -= torsoLean * 0.2;

      let knee = 0;
      let foot = 0;

      const normalizedPhase = (phaseValue + Math.PI * 2) % (Math.PI * 2);
      const isGrounded = normalizedPhase >= Math.PI;

      if (isGrounded) {
        const stanceProgress = (normalizedPhase - Math.PI) / Math.PI;
        const downBend = 25 * (gait.gravity + gait.bends * 0.2);
        const passingStraightness = 5;

        if (stanceProgress < 0.3) {
          const t = stanceProgress / 0.3;
          knee = lerp(0, downBend, easeInOutQuint(t));
        } else {
          const t = (stanceProgress - 0.3) / 0.7;
          knee = lerp(downBend, passingStraightness, t);
        }
        knee += gait.ground_drag * 15;

        const shinGlobalAngle = hip + knee;
        const flatFootAngle = -shinGlobalAngle + gait.foot_angle_on_ground;

        const heelStrikeAngle = 30;
        const toeOffAngle = -90 * (1 - gait.ground_drag * 0.4);

        if (stanceProgress < 0.1) {
          const t = stanceProgress / 0.1;
          foot = lerp(heelStrikeAngle, flatFootAngle, t);
        } else if (stanceProgress <= 0.7) {
          foot = flatFootAngle;
        } else {
          const t = (stanceProgress - 0.7) / 0.3;
          const heelLiftAngle = lerp(0, toeOffAngle, t) * gait.foot_roll;
          foot = flatFootAngle + heelLiftAngle;
        }

        const slideProgress = Math.sin(stanceProgress * Math.PI);
        const slideAmount = slideProgress * gait.foot_slide * 40 * (1 + gait.gravity * 0.5);
        hip += slideAmount;
        knee -= slideAmount * 0.5;
      } else {
        const swingProgressLinear = normalizedPhase / Math.PI;
        const swingArcHeight = Math.sin(normalizedPhase);

        const clearanceBend = (gait.stride + gait.intensity) * 35 * swingArcHeight;
        const hoverLift = gait.hover_height * 40 * swingArcHeight;
        const dragFactor = Math.pow(1 - swingProgressLinear, 5);
        const dragBend = dragFactor * 80 * gait.bends * (1 + gait.ground_drag * 0.5);
        const kickForce = -Math.pow(1 - swingProgressLinear, 4) * gait.kick_up_force * 50;

        knee = clearanceBend + hoverLift + dragBend + kickForce;

        const footDragAngle = Math.cos(swingProgressLinear * Math.PI) * -45;
        const footFlickAngle = swingArcHeight * gait.toe_lift * 60;
        foot = footDragAngle + footFlickAngle;
      }

      const shinTiltAmplitude = 25 * gait.shin_tilt * (0.5 + gait.intensity);
      knee += Math.cos(phaseValue + (Math.PI / 4)) * shinTiltAmplitude;

      return { hip, knee, foot, grounded: isGrounded };
    };

    const lLeg = calculateLegAngles(strideVal, phase);
    const rLeg = calculateLegAngles(counterStride, phase + Math.PI);

    const nextPose: Pose = {
      ...basePose,
      root: {
        x: basePose.root.x + bodySwayX * depth,
        y: basePose.root.y + bobbing * depth,
      },
      waist: basePose.waist + (waistTwist + waistSway) * depth,
      torso: basePose.torso + torsoLean * depth,
      collar: basePose.collar + (-torsoLean * 0.7 + (moodFactor * 15) - waistSway * 0.6) * depth,
      head: basePose.head + (-torsoLean * 0.2 - (moodFactor * 20) + (gait.head_spin * 180)) * depth,
      lShoulder: basePose.lShoulder + counterStride * armSwingMagnitude * depth,
      lForearm: basePose.lForearm + (baseElbowBend + (lElbowDrive * dynamicElbowAmplitude)) * depth,
      lWrist: basePose.lWrist + lWristDrive * 50 * gait.wrist_swing * depth,
      rShoulder: basePose.rShoulder + strideVal * armSwingMagnitude * depth,
      rForearm: basePose.rForearm + (baseElbowBend + (rElbowDrive * dynamicElbowAmplitude)) * depth,
      rWrist: basePose.rWrist + rWristDrive * 50 * gait.wrist_swing * depth,
      lThigh: basePose.lThigh + lLeg.hip * depth,
      lCalf: basePose.lCalf + lLeg.knee * depth,
      lAnkle: basePose.lAnkle + lLeg.foot * depth,
      rThigh: basePose.rThigh + rLeg.hip * depth,
      rCalf: basePose.rCalf + rLeg.knee * depth,
      rAnkle: basePose.rAnkle + rLeg.foot * depth,
    };

    return nextPose;
  }, []);

  const applyWalkingFootLocks = useCallback((
    pose: Pose,
    phase: number,
    lockRef: { left: { active: boolean; pos: Vector2D; blend: number }; right: { active: boolean; pos: Vector2D; blend: number } },
    pinMode: 'none' | 'leftFoot' | 'rightFoot' | 'dual',
    dt: number,
    gait: WalkingEngineGait,
  ): Pose => {
    const joints = getJointPositions(pose, ['root']);
    const leftPhase = (phase + Math.PI * 2) % (Math.PI * 2);
    const rightPhase = (phase + Math.PI) % (Math.PI * 2);
    const leftGrounded = leftPhase >= Math.PI;
    const rightGrounded = rightPhase >= Math.PI;

    const leftAllowed = pinMode === 'leftFoot' || pinMode === 'dual';
    const rightAllowed = pinMode === 'rightFoot' || pinMode === 'dual';

    const dtFactor = clampNumber(dt / 16.67, 0.5, 3);
    const blendRate = clampNumber(dt * 0.007, 0, 1);
    const slideRateBase = clampNumber(dt * 0.0025, 0, 0.15);
    const slideBoost = (gait.foot_slide * 0.2 + gait.ground_drag * 0.1) * dtFactor;

    const updateLock = (side: 'left' | 'right', grounded: boolean, allowed: boolean, footTip?: Vector2D) => {
      const lock = lockRef[side];
      const targetBlend = grounded && allowed ? 1 : 0;
      lock.blend = lerp(lock.blend, targetBlend, blendRate);
      lock.active = lock.blend > 0.01;

      if (allowed && grounded && footTip) {
        if (!lock.active || lock.pos.y === 0) {
          lock.pos = { x: footTip.x, y: FLOOR_HEIGHT };
        }
        const slideRate = clampNumber(slideRateBase + slideBoost, 0, 0.35);
        lock.pos = {
          x: lerp(lock.pos.x, footTip.x, slideRate),
          y: FLOOR_HEIGHT,
        };
      }
    };

    updateLock('left', leftGrounded, leftAllowed, joints.lFootTip);
    updateLock('right', rightGrounded, rightAllowed, joints.rFootTip);

    const adjustments: { x: number; y: number; w: number }[] = [];
    if (lockRef.left.active && joints.lFootTip) {
      adjustments.push({
        x: lockRef.left.pos.x - joints.lFootTip.x,
        y: lockRef.left.pos.y - joints.lFootTip.y,
        w: lockRef.left.blend,
      });
    }
    if (lockRef.right.active && joints.rFootTip) {
      adjustments.push({
        x: lockRef.right.pos.x - joints.rFootTip.x,
        y: lockRef.right.pos.y - joints.rFootTip.y,
        w: lockRef.right.blend,
      });
    }

    let nextPose = pose;
    if (adjustments.length) {
      const totalW = adjustments.reduce((acc, curr) => acc + curr.w, 0);
      const sum = adjustments.reduce((acc, curr) => ({ x: acc.x + curr.x * curr.w, y: acc.y + curr.y * curr.w }), { x: 0, y: 0 });
      const avg = totalW > 0 ? { x: sum.x / totalW, y: sum.y / totalW } : { x: 0, y: 0 };
      const lockStrength = clampNumber(0.35 + 0.65 * Math.max(lockRef.left.blend, lockRef.right.blend), 0, 1);
      nextPose = {
        ...pose,
        root: {
          x: pose.root.x + avg.x * lockStrength,
          y: pose.root.y + avg.y * lockStrength,
        },
      };
    } else if (pinMode === 'none') {
      const lFootY = joints.lFootTip?.y ?? -Infinity;
      const rFootY = joints.rFootTip?.y ?? -Infinity;
      const lowest = Math.max(lFootY, rFootY);
      if (Number.isFinite(lowest)) {
        const correction = FLOOR_HEIGHT - lowest;
        const floorBlend = clampNumber(dt * 0.008, 0, 1);
        nextPose = {
          ...pose,
          root: {
            x: pose.root.x,
            y: pose.root.y + correction * floorBlend,
          },
        };
      }
    }

    const blendLegPose = (base: Pose, target: Pose, parts: PartName[], weight: number) => {
      if (weight <= 0) return base;
      const blended = { ...base };
      for (const part of parts) {
        const key = partNameToPoseKey[part];
        const currentVal = (base as any)[key] ?? 0;
        const targetVal = (target as any)[key] ?? currentVal;
        const delta = getShortestAngleDiffDeg(targetVal, currentVal);
        (blended as any)[key] = currentVal + delta * weight;
      }
      return blended;
    };

    const postRootJoints = getJointPositions(nextPose, ['root']);
    if (lockRef.left.active && postRootJoints.lFootTip) {
      const solve = solveIK(nextPose, 'lLeg', lockRef.left.pos, 6, [PartName.Waist]);
      nextPose = blendLegPose(nextPose, solve, [PartName.LThigh, PartName.LSkin, PartName.LAnkle], clampNumber(lockRef.left.blend * 0.85, 0, 1));
    }
    if (lockRef.right.active && postRootJoints.rFootTip) {
      const solve = solveIK(nextPose, 'rLeg', lockRef.right.pos, 6, [PartName.Waist]);
      nextPose = blendLegPose(nextPose, solve, [PartName.RThigh, PartName.RSkin, PartName.RAnkle], clampNumber(lockRef.right.blend * 0.85, 0, 1));
    }

    return nextPose;
  }, []);

  const computeWalkingPose = useCallback((timeMs: number) => {
    const gait = walkingGaitRef.current;
    const basePose = walkingBasePoseRef.current;
    const depth = clampNumber(gaitDepth / 100, 0, 1);

    const lastTime = walkingLastTimeRef.current || timeMs;
    const dt = Math.max(0, timeMs - lastTime);
    walkingLastTimeRef.current = timeMs;

    const phaseAdvance = dt * 0.005 * gait.frequency * walkingSpeed;
    walkingPhaseRef.current = (walkingPhaseRef.current + phaseAdvance) % (Math.PI * 2);
    const phase = walkingPhaseRef.current;

    let pose = buildWalkingPose(phase, basePose, gait, depth);
    pose = applyWalkingFootLocks(pose, phase, walkingFootLockRef.current, walkingPinMode, dt, gait);

    return pose;
  }, [applyWalkingFootLocks, buildWalkingPose, gaitDepth, walkingPinMode, walkingSpeed]);

  const [windowSize, setWindowSize] = useState({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  });

  useEffect(() => {
    walkingGaitRef.current = walkingGait;
  }, [walkingGait]);

  useEffect(() => {
    if (!walkingEnabled) return;
    walkingBasePoseRef.current = activePose;
    walkingPhaseRef.current = 0;
    walkingLastTimeRef.current = performance.now();
    walkingFootLockRef.current = {
      left: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
      right: { active: false, pos: { x: 0, y: 0 }, blend: 0 },
    };
  }, [walkingEnabled]);

  // --- Panel Management for the settings panels ---
  const DOCK_WIDTH = 280;
  const DOCK_GAP = 8;
  const dockOrder = useMemo(
    () => [
      'model-settings-panel',
      'movement-settings-panel',
    ],
    []
  );

  // Panel Z-index management for the settings panels
  const [panelZIndices, setPanelZIndices] = useState<Record<string, number>>({
    'model-settings-panel': 101,
    'movement-settings-panel': 102,
  });
  const nextZIndex = useRef<number>(103);

  const bringPanelToFront = useCallback((id: string) => {
    setPanelZIndices(prev => {
      const newZIndices = { ...prev };
      newZIndices[id] = nextZIndex.current++;
      return newZIndices;
    });
  }, []);

  // --- Panel Position/Size Management for the settings panels ---
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>({
    'model-settings-panel': { id: 'model-settings-panel', x: 0, y: 0, width: DOCK_WIDTH, height: 700, minimized: false },
    'movement-settings-panel': { id: 'movement-settings-panel', x: 0, y: 0, width: DOCK_WIDTH, height: 600, minimized: true },
  });

  const updatePanelRect = useCallback((id: string, newRect: Omit<PanelRect, 'x' | 'y'>) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.width !== newRect.width || existingRect.height !== newRect.height || existingRect.minimized !== newRect.minimized) {
        return { ...prev, [id]: { ...existingRect, ...newRect } };
      }
      return prev;
    });
  }, []);

  const updatePanelPosition = useCallback((id: string, newX: number, newY: number, minimized: boolean) => {
    setPanelRects(prev => {
      const existingRect = prev[id];
      if (!existingRect || existingRect.x !== newX || existingRect.y !== newY || existingRect.minimized !== minimized) {
        return { ...prev, [id]: { ...existingRect, x: newX, y: newY, minimized: minimized } };
      }
      return prev;
    });
  }, []);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'joint-control': true,
    'pin-options': false,
    'display-modes': false,
    'animation-engine': false,
    'ab-engine': true,
    'saved-poses': true,
    'system-monitor': false,
    'hotkey-commands': false,
    'system-roadmap': false,
    'pose-export': false,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // --- End Panel Position/Size Management ---
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs(prev => [...prev.slice(-49), { timestamp, message }]);
  }, []);

  useEffect(() => {
    addLog('[SYSTEM]: BOOT SEQUENCE COMPLETE');
  }, [addLog]);

  const primarySelectedPart = useMemo(() => {
    return (Object.entries(selectedParts).find(([p, sel]) => sel)?.[0]) as PartName | undefined;
  }, [selectedParts]);

  // Dynamically calculate viewBox based on viewMode and windowSize
  const autoViewBox = useMemo(() => {
    const configs = {
      zoomed: { x: -900, y: 1950, w: 1800, h: 1550 },
      default: { x: -1112.5, y: 1287.5, w: 2225, h: 2212.5 },
      lotte: { x: -1325, y: 625, w: 2650, h: 2875 },
      wide: { x: -1750, y: -700, w: 3500, h: 4200 },
    };

    if (viewMode === 'mobile') {
      const screenAspectRatio = windowSize.innerWidth / windowSize.innerHeight;

      const mannequinIntrinsicHeight = (
        ANATOMY.HEAD +
        ANATOMY.HEAD_NECK_GAP_OFFSET +
        ANATOMY.COLLAR +
        ANATOMY.TORSO +
        ANATOMY.WAIST +
        ANATOMY.LEG_UPPER +
        ANATOMY.LEG_LOWER +
        ANATOMY.FOOT
      );

      const verticalPaddingRatio = 0.20;
      const contentHeightInSVGUnits = mannequinIntrinsicHeight * (1 + verticalPaddingRatio);

      const viewBoxHeight = contentHeightInSVGUnits;
      const viewBoxWidth = viewBoxHeight * screenAspectRatio;

      const groundPlaneBuffer = GROUND_STRIP_HEIGHT * 1.5;
      const desiredViewBoxBottom = FLOOR_HEIGHT + groundPlaneBuffer;
      const viewBoxY = desiredViewBoxBottom - viewBoxHeight;
      const viewBoxX = -viewBoxWidth / 2;

      return `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;

    } else {
      const c = configs[viewMode];
      return `${c.x} ${c.y} ${c.w} ${c.h}`;
    }
  }, [viewMode, windowSize.innerWidth, windowSize.innerHeight]);

  // --- Physics Validation Logic ---
  const isValidMove = useCallback((
    potentialPose: Pose,
    originalPose: Pose,
    activePins: AnchorName[],
    pinnedState: Record<string, Vector2D>,
    isCraneDragging: boolean,
    isEffectorDragging: boolean,
    partBeingRotated: PartName | null,
    isAirMode: boolean,
  ): boolean => {
    if (isAirMode) return true;

    const potentialJoints = getJointPositions(potentialPose, activePins);
    
    // 1. Check Pin Immovability (Softened by Elasticity)
    // In Bitruvius 0.2, pins are elastic, but we still have a "Hard Stop" threshold
    const HARD_STOP_THRESHOLD = 300; // Maximum stretch before hard stop

    for (const pinName of activePins) {
      const targetPos = pinnedState[pinName];
      const currentPos = potentialJoints[pinName as keyof typeof potentialJoints];
      
      if (targetPos && currentPos && !isCraneDragging) {
        const dx = currentPos.x - targetPos.x;
        const dy = currentPos.y - targetPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > HARD_STOP_THRESHOLD) {
          return false;
        }
      }
    }

    // 2. Check Ground Collision
    const isFootRelatedPart = (part: PartName | null) =>
      part === PartName.LAnkle || part === PartName.RAnkle || part === PartName.LSkin || part === PartName.RSkin; 

    const relevantToGrounding = isCraneDragging || isEffectorDragging || isFootRelatedPart(partBeingRotated);
    
    if (relevantToGrounding) {
      const lFootTipY = potentialJoints.lFootTip?.y || -Infinity;
      const rFootTipY = potentialJoints.rFootTip?.y || -Infinity;
      const lowestFootTipY = Math.max(lFootTipY, rFootTipY);

      const GROUND_COLLISION_THRESHOLD = 2;
      if (lowestFootTipY > FLOOR_HEIGHT + GROUND_COLLISION_THRESHOLD) {
          return false;
      }
    }

    return true;
  }, [isAirMode]); 

  const validateAndApplyPoseUpdate = useCallback((
      proposedUpdates: Partial<Pose>,
      partBeingDirectlyManipulated: PartName | null,
      isEffectorDrag: boolean,
  ) => {
      setGhostPose(prev => {
          let tentativeNextPose: Pose = { ...prev, ...proposedUpdates };

          if (bodySyncMode && partBeingDirectlyManipulated) {
            const oppositeMap: Record<string, string> = {
              'lShoulder': 'rShoulder', 'rShoulder': 'lShoulder',
              'lForearm': 'rForearm', 'rForearm': 'lForearm',
              'lWrist': 'rWrist', 'rWrist': 'lWrist',
              'lThigh': 'rThigh', 'rThigh': 'lThigh',
              'lCalf': 'rCalf', 'rCalf': 'lCalf',
              'lAnkle': 'rAnkle', 'rAnkle': 'lAnkle',
            };
            const directKey = partNameToPoseKey[partBeingDirectlyManipulated];
            const oppositeKey = oppositeMap[directKey];
            if (oppositeKey) {
              const delta = ((proposedUpdates as any)[directKey] || 0) - ((prev as any)[directKey] || 0);
              (tentativeNextPose as any)[oppositeKey] = ((prev as any)[oppositeKey] || 0) - delta;
            }
          }

          if (omniSyncMode) {
            const rotationKeys = new Set<string>([...Object.values(partNameToPoseKey), 'bodyRotation']);
            Object.keys(proposedUpdates).forEach(key => {
              if (!rotationKeys.has(key)) return;
              const delta = ((proposedUpdates as any)[key] || 0) - ((prev as any)[key] || 0);
              if (Math.abs(delta) < 0.01) return;
              rotationKeys.forEach(otherKey => {
                if (otherKey === key) return;
                (tentativeNextPose as any)[otherKey] = ((tentativeNextPose as any)[otherKey] || (prev as any)[otherKey] || 0) + delta * 0.08;
              });
            });
          }

          if (!isValidMove(
              tentativeNextPose,
              prev,
              activePins,
              pinnedState,
              isCraneDragging, 
              isEffectorDrag,
              partBeingDirectlyManipulated,
              isAirMode,
          )) {
              return prev;
          }

          // Save to undo stack when making actual changes
          if (isDragging.current && !dragStartPose.current) {
              dragStartPose.current = prev;
          }

          return tentativeNextPose;
      });
  }, [activePins, pinnedState, isAirMode, isCraneDragging, isValidMove]);

  const poseComparisonKeys: (keyof Pose)[] = [
    'bodyRotation', 'torso', 'waist', 'collar', 'head',
    'lShoulder', 'lForearm', 'lWrist', 'rShoulder', 'rForearm', 'rWrist',
    'lThigh', 'lCalf', 'lAnkle', 'rThigh', 'rCalf', 'rAnkle'
  ];

  const posesAreClose = (a: Pose, b: Pose) => {
    if (Math.abs(a.root.x - b.root.x) > 0.01 || Math.abs(a.root.y - b.root.y) > 0.01) return false;
    for (const key of poseComparisonKeys) {
      if (Math.abs((a[key] as number) - (b[key] as number)) > 0.01) return false;
    }
    return true;
  };

  // Exponential Decay Smoothing (Bitruvius 0.1 requirement)
  useEffect(() => {
    if (!isPoweredOn) return;
    if (!isDragging.current && posesAreClose(activePose, ghostPose)) return;
    
    let rafId: number;
    const smooth = () => {
      setActivePose(current => {
        // If not dragging, we can either snap or continue smoothing
        // The "5-frame snap" logic is handled in handleMouseUp
        const smoothingFactor = isDragging.current ? 0.3 : 0.15;
        return interpolatePoses(current, ghostPose, smoothingFactor);
      });
      rafId = requestAnimationFrame(smooth);
    };
    
    rafId = requestAnimationFrame(smooth);
    return () => cancelAnimationFrame(rafId);
  }, [activePose, ghostPose, isPoweredOn]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length > 0) {
      const prev = activePose;
      redoStack.current.push(prev); 
      const nextPose = undoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length > 0) {
      const prev = activePose;
      undoStack.current.push(prev);
      const nextPose = redoStack.current.pop()!;
      setGhostPose(nextPose);
      setActivePose(nextPose);
    }
  }, [activePose]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!svgRef.current) return;
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX; svgPoint.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

    if (isCraneDragging && dragStartInfo.current) {
      const dx = transformedPoint.x - dragStartInfo.current.startX;
      const dy = transformedPoint.y - dragStartInfo.current.startY;
      
      const newRootX = dragStartInfo.current.startRootX + dx;
      const newRootY = dragStartInfo.current.startRootY + dy;

      validateAndApplyPoseUpdate({ root: { x: newRootX, y: newRootY } }, null, false);
      
    } else if (isAdjusting && rotatingPart && rotationStartInfo.current) {
      const joints = getJointPositions(ghostPose, activePins);
      const pivot = joints[rotatingPart]; 
      if (!pivot) return;
      
      const currentAngleDeg = Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI;
      const startAngleDeg = rotationStartInfo.current.startAngle; 
      
      const angleDeltaDeg = getShortestAngleDiffDeg(currentAngleDeg, startAngleDeg);
      
      let newRotationValue = rotationStartInfo.current.startRotationValue + angleDeltaDeg;
      const partKey = partNameToPoseKey[rotatingPart];
      const limits = JOINT_LIMITS[partKey];

      if (limits) {
        newRotationValue = Math.max(limits.min, Math.min(limits.max, newRotationValue));
      }

      validateAndApplyPoseUpdate({ [partKey]: newRotationValue }, rotatingPart, false);

    } else if (isIKDragging && effectorPart) {
      handleIKMove(effectorPart, transformedPoint);
    }
  }, [isAdjusting, rotatingPart, isCraneDragging, isIKDragging, effectorPart, ghostPose, validateAndApplyPoseUpdate, activePins, handleIKMove]);

  const updatePinnedState = useCallback((pins: AnchorName[]) => {
    const joints = getJointPositions(activePose, pins);
    const newState: Record<string, Vector2D> = {};
    pins.forEach(p => {
      newState[p] = joints[p];
    });
    setPinnedState(newState);
  }, [activePose]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      // 5-frame snap (Bitruvius 0.1 requirement)
      // We snap activePose to ghostPose immediately on release
      setActivePose(ghostPose);
      
      // Save to undo stack on release
      if (dragStartPose.current) {
        undoStack.current.push(dragStartPose.current);
        redoStack.current.length = 0;
      }
    }

    isDragging.current = false;
    setIsAdjusting(false);
    setRotatingPart(null);
    setIsCraneDragging(false);
    setEffectorPart(null); 
    setIsEffectorDragging(false); 
    setIsIKDragging(false);
    setIsUserInteracting(false); // Reset interaction flag
    rotationStartInfo.current = null;
    dragStartInfo.current = dragStartInfoInitial(); 
  }, [ghostPose, activePose]);

  const handleDoubleClickOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    setJointModes(prev => {
      const currentMode = prev[part];
      let nextMode: JointConstraint;
      if (currentMode === 'fk') {
        nextMode = 'stretch';
      } else if (currentMode === 'stretch') {
        nextMode = 'curl';
      } else if (currentMode === 'curl') {
        nextMode = 'stretch';
      } else {
        nextMode = 'fk';
      }
      return { ...prev, [part]: nextMode };
    });
  }, []);

  useEffect(() => {
    updatePinnedState(activePins);
  }, [activePins]); // Sync pinnedState when activePins change

  useEffect(() => {
    if (!walkingEnabled) return;
    if (walkingPinMode === 'none') {
      setActivePins([PartName.Waist]);
      return;
    }
    if (walkingPinMode === 'leftFoot') {
      setActivePins([PartName.Waist, PartName.LAnkle, 'lFootTip']);
      return;
    }
    if (walkingPinMode === 'rightFoot') {
      setActivePins([PartName.Waist, PartName.RAnkle, 'rFootTip']);
      return;
    }
    setActivePins([PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip']);
  }, [walkingEnabled, walkingPinMode]);

  const handleMouseDownOnPart = useCallback((part: PartName, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    if (smartPinning) {
      if (part === PartName.LAnkle) setActivePins([PartName.Waist, PartName.LAnkle, 'lFootTip']);
      else if (part === PartName.RAnkle) setActivePins([PartName.Waist, PartName.RAnkle, 'rFootTip']);
      else if (part === PartName.LWrist) setActivePins([PartName.Waist, PartName.LWrist, 'lHandTip']);
      else if (part === PartName.RWrist) setActivePins([PartName.Waist, PartName.RWrist, 'rHandTip']);
    }
    isDragging.current = true;
    dragStartPose.current = activePose;
    setSelectedParts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => next[k as PartName] = k === part);
      return next;
    });

    const joints = getJointPositions(activePose, activePins);
    const pivot = joints[part]; 
    if (!pivot) return;

    // If part is pinned OR global IK is active OR joint mode is 'stretch', use IK instead of rotation
    const isLimbPart = [PartName.RWrist, PartName.LWrist, PartName.RAnkle, PartName.LAnkle].includes(part);
    const isStretchMode = jointModes[part] === 'stretch';
    
    if (activePins.includes(part) || (kinematicMode !== 'fk' && isLimbPart) || (isStretchMode && isLimbPart)) {
      setIsIKDragging(true);
      setEffectorPart(part);
    } else {
      const svgPoint = svgRef.current.createSVGPoint();
      svgPoint.x = e.clientX; svgPoint.y = e.clientY;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      const transformedPoint = svgPoint.matrixTransform(ctm.inverse());

      setIsAdjusting(true);
      setRotatingPart(part);
      rotationStartInfo.current = {
        startAngle: Math.atan2(transformedPoint.y - pivot.y, transformedPoint.x - pivot.x) * 180 / Math.PI,
        startRotationValue: (activePose as any)[partNameToPoseKey[part]] || 0,
        pointerX: transformedPoint.x, pointerY: transformedPoint.y, initialPinnedPos: null // Not used in Bitruvius 0.2
      };
    }
  }, [activePose, activePins, kinematicMode, jointModes, smartPinning]);

  const cycleKinematicMode = useCallback(() => {
    setKinematicMode(prev => {
      let next: KinematicMode;
      if (prev === 'fk') next = 'ik';
      else if (prev === 'ik') next = 'fabrik';
      else if (prev === 'fabrik') next = 'jacobian';
      else if (prev === 'jacobian') next = 'pim2';
      else if (prev === 'pim2') next = 'dls';
      else if (prev === 'dls') next = 'fluid';
      else next = 'fk';
      addLog(`[SYSTEM]: KINEMATIC MODE -> ${next.toUpperCase()}`);
      return next;
    });
  }, [addLog]);
  const cycleRenderMode = useCallback(() => {
    setRenderMode(prev => {
      if (prev === 'default') return 'wireframe';
      if (prev === 'wireframe') return 'silhouette';
      if (prev === 'silhouette') return 'backlight';
      if (prev === 'backlight') return 'default';
      return 'default';
    });
  }, []);

  const cycleViewMode = useCallback(() => {
    setViewMode(prev => {
      if (prev === 'default') return 'lotte';
      if (prev === 'lotte') return 'wide';
      if (prev === 'wide') return 'mobile';
      if (prev === 'mobile') return 'zoomed';
      if (prev === 'zoomed') return 'default';
      return 'default';
    });
  }, []);

  // Handler for toggling the minimized state of the settings panels
  const toggleSettingsPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['model-settings-panel'];
      return {
        ...prev,
        'model-settings-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('model-settings-panel'); // Bring to front when toggled
  }, [bringPanelToFront]);

  const toggleMovementPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['movement-settings-panel'];
      return {
        ...prev,
        'movement-settings-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('movement-settings-panel');
  }, [bringPanelToFront]);

  const toggleSystemStatusPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['system-status-panel'];
      return {
        ...prev,
        'system-status-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('system-status-panel');
  }, [bringPanelToFront]);

  const toggleCommandLogPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['command-log-panel'];
      return {
        ...prev,
        'command-log-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('command-log-panel');
  }, [bringPanelToFront]);

  const togglePoseDataPanelMinimized = useCallback(() => {
    setPanelRects(prev => {
      const currentPanel = prev['pose-data-terminal-panel'];
      return {
        ...prev,
        'pose-data-terminal-panel': { ...currentPanel, minimized: !currentPanel.minimized }
      };
    });
    bringPanelToFront('pose-data-terminal-panel');
  }, [bringPanelToFront]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v') cycleViewMode();
      if (e.key === 'p') {
        setActivePins(prev => {
          const cycle = [PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip', 'root'];
          const currentPrimary = prev[0] || PartName.Waist;
          const currentIndex = cycle.indexOf(currentPrimary);
          const nextPrimary = cycle[(currentIndex + 1) % cycle.length] as AnchorName;
          
          if (e.shiftKey) {
            if (prev.includes(nextPrimary)) {
              return prev.filter(p => p !== nextPrimary);
            } else {
              return [...prev, nextPrimary];
            }
          } else {
            return [nextPrimary];
          }
        });
      }
      if (e.key === 'r') cycleRenderMode();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    const handleResize = () => {
      setWindowSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
      // Adjust panel position on resize if it would go off-screen
      setPanelRects(prev => {
        const modelPanel = prev['model-settings-panel'];
        const movementPanel = prev['movement-settings-panel'];
        
        const newModelX = Math.min(modelPanel.x, window.innerWidth - modelPanel.width - 16);
        const newModelY = Math.min(modelPanel.y, window.innerHeight - (modelPanel.minimized ? 40 : modelPanel.height) - 16);
        
        const newMovementX = Math.min(movementPanel.x, window.innerWidth - movementPanel.width - 16);
        const newMovementY = Math.min(movementPanel.y, window.innerHeight - (movementPanel.minimized ? 40 : movementPanel.height) - 16);
        
        return {
          ...prev,
          'model-settings-panel': { ...modelPanel, x: newModelX, y: newModelY },
          'movement-settings-panel': { ...movementPanel, x: newMovementX, y: newMovementY }
        };
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [handleMouseMove, handleMouseUp, handleUndo, handleRedo, cycleRenderMode, cycleViewMode]);

  const getPinName = useCallback((pins: AnchorName[]): string => {
    if (pins.length === 0) return 'NONE';
    return pins.map(p => {
      if (p === PartName.LAnkle) return 'L-ANKLE';
      if (p === 'lFootTip') return 'L-FOOT';
      if (p === PartName.LWrist) return 'L-WRIST';
      if (p === 'lHandTip') return 'L-HAND';
      if (p === PartName.RAnkle) return 'R-ANKLE';
      if (p === 'rFootTip') return 'R-FOOT';
      if (p === PartName.RWrist) return 'R-WRIST';
      if (p === 'rHandTip') return 'R-HAND';
      if (p === 'root') return 'ROOT';
      return String(p).toUpperCase();
    }).join(' + ');
  }, []);

  const getOppositePart = (part: PartName): PartName | null => {
    return getMirrorPart(part);
  };

  const getKineticModeDisplayName = (mode: JointConstraint) => {
    switch (mode) {
      case 'fk': return 'STANDARD (No Effects)';
      case 'offset': return 'OFFSET (PULLS PARENT)';
      case 'match': return 'MATCH (PULLS CHILD)';
      default: return 'UNKNOWN';
    }
  };

  const getKineticModeShortLabel = (mode: JointConstraint) => {
    switch (mode) {
      case 'fk': return 'STANDARD';
      case 'offset': return 'OFFSET';
      case 'match': return 'MATCH';
      default: return 'UNKNOWN';
    }
  };

  const getKineticModeDisplayColorClass = (mode: JointConstraint) => {
    switch (mode) {
      case 'offset': return 'text-accent-purple';
      case 'match': return 'text-accent-green';
      case 'fk': return 'text-focus-ring';
      default: return 'text-white/70';
    }
  };

  const getRenderModeDisplayName = (mode: RenderMode) => {
    switch (mode) {
      case 'default': return 'STANDARD (Solid)';
      case 'wireframe': return 'WIREFRAME (Outline)';
      case 'silhouette': return 'MONOCHROME (Black Fill)';
      case 'backlight': return 'X-RAY (Transparent)';
      case 'spotlight': return 'SPOTLIGHT (Subject)';
      case 'shadow': return 'SHADOW (Blur)';
      case 'grayscale': return 'GRAYSCALE';
      case 'sepia': return 'SEPIA';
      case 'palette': return 'PALETTE (Custom)';
      default: return 'UNKNOWN';
    }
  };

  const kinematicModeDescriptions: Record<KinematicMode, string> = {
    fk: 'FK: direct joint rotation, no target solving.',
    ik: 'IK (CCD): iterative joint rotation toward target.',
    fabrik: 'FABRIK: forward/backward reaching with fixed bone lengths.',
    jacobian: 'Jacobian: gradient-based solver for smoother convergence.',
    pim2: 'PIM2: predictive IK with faster convergence.',
    dls: 'DLS: damped least squares for stability near singularities.',
    fluid: 'Fluid: soft, continuous IK with pinned constraints.',
  };

  const renderModePresets: Record<RenderMode, { showPins: boolean; showBoneOverlay: boolean; maskControlsVisible: boolean }> = {
    default: { showPins: true, showBoneOverlay: true, maskControlsVisible: false },
    wireframe: { showPins: true, showBoneOverlay: false, maskControlsVisible: false },
    silhouette: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    backlight: { showPins: false, showBoneOverlay: true, maskControlsVisible: false },
    spotlight: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    shadow: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    grayscale: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    sepia: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
    palette: { showPins: false, showBoneOverlay: false, maskControlsVisible: false },
  };

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '');
    const value = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean;
    const num = parseInt(value, 16);
    return {
      r: ((num >> 16) & 255) / 255,
      g: ((num >> 8) & 255) / 255,
      b: (num & 255) / 255,
    };
  };

  const paletteMatrix = useMemo(() => {
    const shadow = hexToRgb(paletteColors.shadow);
    const mid = hexToRgb(paletteColors.mid);
    const highlight = hexToRgb(paletteColors.highlight);
    const r = `${shadow.r} ${mid.r} ${highlight.r}`;
    const g = `${shadow.g} ${mid.g} ${highlight.g}`;
    const b = `${shadow.b} ${mid.b} ${highlight.b}`;
    return { r, g, b };
  }, [paletteColors]);

  const sceneFilter = useMemo(() => {
    if (renderMode === 'grayscale') return 'grayscale(1)';
    if (renderMode === 'sepia') return 'sepia(1)';
    return 'none';
  }, [renderMode]);

  const backgroundModeOpacity = useMemo(() => {
    if (renderMode === 'spotlight') return 0.35;
    if (renderMode === 'shadow') return 0.2;
    return 1;
  }, [renderMode]);

  const getMaskBaseSize = (part: PartName) => {
    switch (part) {
      case PartName.Head:
        return ANATOMY.HEAD * 1.6;
      case PartName.Torso:
        return ANATOMY.TORSO * 1.4;
      case PartName.Waist:
        return ANATOMY.WAIST * 1.4;
      case PartName.Collar:
        return ANATOMY.COLLAR * 2;
      case PartName.RShoulder:
      case PartName.LShoulder:
        return ANATOMY.UPPER_ARM * 1.4;
      case PartName.RElbow:
      case PartName.LElbow:
        return ANATOMY.LOWER_ARM * 1.4;
      case PartName.RWrist:
      case PartName.LWrist:
        return ANATOMY.HAND * 1.8;
      case PartName.RThigh:
      case PartName.LThigh:
        return ANATOMY.LEG_UPPER * 1.4;
      case PartName.RSkin:
      case PartName.LSkin:
        return ANATOMY.LEG_LOWER * 1.4;
      case PartName.RAnkle:
      case PartName.LAnkle:
        return ANATOMY.FOOT * 1.8;
      default:
        return ANATOMY.HEAD * 1.6;
    }
  };


  const allPanelRectsArray = useMemo(() => Object.values(panelRects), [panelRects]);
  const settingsPanel = panelRects['model-settings-panel'];
  const movementPanel = panelRects['movement-settings-panel'];

  const panelQuickAccessButtons = useMemo(() => {
    const labels = ['M', 'MV'];
    const panelIds = ['model-settings-panel', 'movement-settings-panel'];
    
    return labels.map((label, index) => ({
      label,
      panelId: panelIds[index],
      rect: panelRects[panelIds[index] as keyof typeof panelRects],
      zIndex: panelZIndices[panelIds[index] as keyof typeof panelZIndices],
    }));
  }, [panelRects, panelZIndices]);
  const resolvedBackgroundLayer = { ...DEFAULT_IMAGE_LAYER, ...backgroundImageLayer };
  const resolvedForegroundLayer = { ...DEFAULT_IMAGE_LAYER, ...foregroundImageLayer };
  const backgroundPlacement = resolvedBackgroundLayer.src ? resolveLayerPlacement(resolvedBackgroundLayer) : null;
  const foregroundPlacement = resolvedForegroundLayer.src ? resolveLayerPlacement(resolvedForegroundLayer) : null;
  const bgOpacityPercent = Math.round(clampNumber(resolvedBackgroundLayer.opacity ?? 1, 0, 1) * 100);
  const fgOpacityPercent = Math.round(clampNumber(resolvedForegroundLayer.opacity ?? 1, 0, 1) * 100);
  const bgScalePercent = clampNumber(resolvedBackgroundLayer.scale ?? 100, 10, 400);
  const fgScalePercent = clampNumber(resolvedForegroundLayer.scale ?? 100, 10, 400);
  const bgXPercent = clampNumber(resolvedBackgroundLayer.x ?? 50, 0, 100);
  const bgYPercent = clampNumber(resolvedBackgroundLayer.y ?? 50, 0, 100);
  const fgXPercent = clampNumber(resolvedForegroundLayer.x ?? 50, 0, 100);
  const fgYPercent = clampNumber(resolvedForegroundLayer.y ?? 50, 0, 100);
  const activeMaskLayer = activeMaskEditorPart
    ? { ...DEFAULT_BODY_PART_MASK_LAYER, ...(bodyPartMaskLayers[activeMaskEditorPart] ?? {}) }
    : null;
  const activeMaskOpacityPercent = Math.round(clampNumber(activeMaskLayer?.opacity ?? 1, 0, 1) * 100);
  const activeMaskScalePercent = clampNumber(activeMaskLayer?.scale ?? 100, 10, 400);
  const activeMaskRotationDeg = clampNumber(activeMaskLayer?.rotationDeg ?? 0, -180, 180);
  const activeMaskOffsetX = clampNumber(activeMaskLayer?.offsetX ?? 0, -400, 400);
  const activeMaskOffsetY = clampNumber(activeMaskLayer?.offsetY ?? 0, -400, 400);

  // Computed values for part selection and interaction
  const primarySelectedPart = useMemo(() => {
    return (Object.entries(selectedParts).find(([p, sel]) => sel)?.[0]) as PartName | undefined;
  }, [selectedParts]);
  const selectedRotation = useMemo(() => {
    if (!primarySelectedPart) return 0;
    const key = partNameToPoseKey[primarySelectedPart];
    return (activePose as any)[key] || 0;
  }, [activePose, primarySelectedPart]);
  const parentRotation = useMemo(() => {
    if (!primarySelectedPart) return 0;
    const parent = PARENT_MAP[primarySelectedPart];
    if (!parent) return 0;
    const key = partNameToPoseKey[parent];
    return (activePose as any)[key] || 0;
  }, [activePose, primarySelectedPart]);

  // Missing functions that depend on primarySelectedPart
  const applyRotationDelta = useCallback((delta: number) => {
    if (!primarySelectedPart) return;
    const key = partNameToPoseKey[primarySelectedPart];
    setActivePose(prev => ({ ...prev, [key]: (prev as any)[key] + delta }));
  }, [primarySelectedPart]);

  const applyParentRotationDelta = useCallback((delta: number) => {
    if (!primarySelectedPart) return;
    const parent = PARENT_MAP[primarySelectedPart];
    if (!parent) return;
    const key = partNameToPoseKey[parent];
    setActivePose(prev => ({ ...prev, [key]: (prev as any)[key] + delta }));
  }, [primarySelectedPart]);

  const selectAdjacentPart = useCallback((direction: number) => {
    const parts = Object.values(PartName);
    const currentIndex = primarySelectedPart ? parts.indexOf(primarySelectedPart) : -1;
    const newIndex = (currentIndex + direction + parts.length) % parts.length;
    const newPart = parts[newIndex];
    setSelectedParts({ [newPart]: true });
  }, [primarySelectedPart]);

  const cycleRotationModeForSelected = useCallback(() => {
    if (!primarySelectedPart) return;
    // Add rotation mode cycling logic here if needed
  }, [primarySelectedPart]);

  const cycleKinematicMode = useCallback(() => {
    // Add kinematic mode cycling logic here if needed
  }, []);

  const effectiveBoneScale = useMemo(() => {
    if (!primarySelectedPart) return { length: 1, width: 1 };
    return boneScale[primarySelectedPart] || { length: 1, width: 1 };
  }, [primarySelectedPart, boneScale]);

  const autoViewBox = useMemo(() => true, []);

  const toggleSettingsPanelMinimized = useCallback(() => {
    updatePanelRect('model-settings-panel', { minimized: !panelRects['model-settings-panel'].minimized });
  }, [panelRects, updatePanelRect]);

  const toggleMovementPanelMinimized = useCallback(() => {
    const isCurrentlyMinimized = panelRects['movement-settings-panel'].minimized;
    updatePanelRect('movement-settings-panel', { minimized: !isCurrentlyMinimized });
    
    // Bring panel to front when opening (unminimizing)
    if (isCurrentlyMinimized) {
      bringPanelToFront('movement-settings-panel');
    }
  }, [panelRects, updatePanelRect, bringPanelToFront]);

  const openPanel = useCallback((panelId: string) => {
    updatePanelRect(panelId, { minimized: false });
    bringPanelToFront(panelId);
  }, [updatePanelRect, bringPanelToFront]);

  const toggleAllPanels = useCallback(() => {
    const allMinimized = Object.values(panelRects).every(rect => rect.minimized);
    Object.keys(panelRects).forEach(id => {
      updatePanelRect(id, { minimized: !allMinimized });
    });
  }, [panelRects, updatePanelRect]);

  const handleUndo = useCallback(() => {
    // Add undo logic here if needed
  }, []);

  const handleRedo = useCallback(() => {
    // Add redo logic here if needed
  }, []);

  const activeJointOffset = primarySelectedPart
    ? (activePose.offsets?.[primarySelectedPart] ?? { x: 0, y: 0 })
    : { x: 0, y: 0 };

  return (
    <div className={`w-full h-full bg-mono-darker shadow-2xl flex flex-col relative touch-none fixed inset-0 z-50 overflow-hidden text-ink font-mono ${!isPoweredOn ? 'grayscale brightness-50' : ''} safe-area-inset`}>
      <div className="relative flex h-full w-full">
        
        {/* Bottom Left: Rotation Wheel */}
        <div className="fixed left-6 bottom-6 z-[150] pointer-events-none">
          <div className="pointer-events-auto overflow-visible">
            <CanvasRotationWheel
              selectedPartLabel={primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : '--'}
              anchorLabel={getPinName(activePins)}
              rotationModeLabel={primarySelectedPart ? getKineticModeShortLabel(jointModes[primarySelectedPart]) : 'STANDARD'}
              kinematicModeLabel={`KIN-${kinematicMode.toUpperCase()}`}
              kinematicModeDescription={kinematicModeDescriptions[kinematicMode]}
              currentRotation={selectedRotation}
              parentRotation={parentRotation}
              onRotateChild={applyRotationDelta}
              onRotateParent={applyParentRotationDelta}
              onSelectPrevPart={() => selectAdjacentPart(-1)}
              onSelectNextPart={() => selectAdjacentPart(1)}
              onCycleRotationMode={cycleRotationModeForSelected}
              onCycleKinematicMode={cycleKinematicMode}
              onToggleSmartPinning={() => setSmartPinning(prev => !prev)}
              onToggleMirror={() => setBodySyncMode(prev => !prev)}
              onToggleOmni={() => setOmniSyncMode(prev => !prev)}
              onToggleMasks={() => setMaskControlsVisible(prev => !prev)}
              smartPinning={smartPinning}
              mirrorMode={bodySyncMode}
              omniMode={omniSyncMode}
              masksVisible={maskControlsVisible}
              pose={activePose}
              selectedParts={selectedParts}
              visibility={visibility}
              activePins={activePins}
              pinnedState={pinnedState}
              jointModes={jointModes}
              renderMode={renderMode}
              modelStyle={mannequinStyle}
              boneScale={effectiveBoneScale}
              boneVariantOverrides={boneVariantOverrides}
              viewBox={autoViewBox}
              collapsed={wheelCollapsed}
              onToggleCollapsed={() => setWheelCollapsed(prev => !prev)}
            />
          </div>
        </div>

        {/* Unified Top Menu Bar */}
        <div className="absolute top-0 left-0 right-0 z-[1000] bg-black/40 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-2">
            {/* Left Side: Settings & Controls */}
            <div className="flex items-center gap-3">
              {/* Settings Icons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSettingsPanelMinimized}
                  className={`p-2 bg-white/10 hover:bg-white/20 rounded-full border border-white/20 text-white hover:text-focus-ring transition-all duration-200 ${!settingsPanel.minimized ? 'border-selection text-selection bg-selection/20' : ''}`}
                  aria-label={settingsPanel.minimized ? "Open Model Settings" : "Close Model Settings"}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.243 14.757l-.37-.37c-.63.63-1.39 1.05-2.22 1.25l-.23.95a.996.996 0 01-1.22.75l-2-.5a.996.996 0 01-.75-1.22l.23-.95c-.83-.2-1.59-.62-2.22-1.25l-.37.37a.997.997 0 01-1.41 0l-.707-.707a.997.997 0 010-1.414l.37-.37c-.63-.63-1.05-1.39-1.25-2.22l-.95-.23a.996.996 0 01-.75-1.22l.5-2a.996.996 0 011.22-.75l.95.23c.2-.83.62-1.59 1.25-2.22l-.37-.37a.997.997 0 010-1.414l.707-.707a.997.997 0 011.414 0l.37.37c.63-.63 1.39-1.05 2.22-1.25l.23-.95a.996.996 0 011.22-.75l2 .5a.996.996 0 01.75 1.22l-.23.95c.83.2 1.59.62 2.22 1.25l.37-.37a.997.997 0 011.414 0l.707.707a.997.997 0 010 1.414l-.37.37c.63.63 1.05 1.39 1.25 2.22l.95.23a.996.996 0 01.75 1.22l-.5 2a.996.996 0 01-1.22.75l-.95-.23c-.2.83-.62 1.59-1.25 2.22l.37.37a.997.997 0 010 1.414l-.707.707a.997.997 0 01-1.414 0zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" fillRule="evenodd"></path>
                  </svg>
                </button>
                <button
                  onClick={toggleMovementPanelMinimized}
                  className={`p-2 bg-white/10 hover:bg-white/20 rounded-full border border-white/20 text-white hover:text-focus-ring transition-all duration-200 ${!movementPanel.minimized ? 'border-accent-purple text-accent-purple bg-accent-purple/20' : ''}`}
                  aria-label={movementPanel.minimized ? "Open Movement Settings" : "Close Movement Settings"}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"></path>
                  </svg>
                </button>
              </div>

              {/* Panel Quick Access */}
              <div className="flex items-center gap-1 border-l border-white/20 pl-3">
                {panelQuickAccessButtons.map(({ label, panelId }) => {
                  return (
                    <button
                      key={label}
                      onClick={() => openPanel(panelId)}
                      className="px-2 py-1 text-[8px] uppercase border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all"
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  onClick={toggleAllPanels}
                  className={`px-2 py-1 text-[8px] uppercase border transition-all ${
                    panelsVisible 
                      ? 'border-selection text-selection bg-selection/20' 
                      : 'border-white/10 text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  {panelsVisible ? 'HIDE' : 'SHOW'}
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1 border-l border-white/20 pl-3">
                <button
                  onClick={handleUndo}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded border border-white/20 text-white/60 hover:text-white transition-all"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  onClick={handleRedo}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded border border-white/20 text-white/60 hover:text-white transition-all"
                  title="Redo (Ctrl+Y)"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
                <button
                  onClick={() => setActivePose(RESET_POSE)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded border border-white/20 text-white/60 hover:text-white transition-all"
                  title="Reset Pose"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.001 8.001 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Right Side: System Status & Info */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-black/40 px-2 py-1 border border-white/10 rounded">
                <div className={`w-1.5 h-1.5 rounded-full ${isPoweredOn ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
                <span className="text-[8px] font-bold text-white/70 tracking-widest">
                  {isPoweredOn ? 'ACTIVE' : 'STANDBY'}
                </span>
              </div>
              <button
                onClick={() => setIsPoweredOn(prev => !prev)}
                className={`p-1.5 rounded-full border transition-all duration-300 ${
                  isPoweredOn 
                    ? 'bg-accent-green/30 border-accent-green text-accent-green shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
                    : 'bg-accent-red/30 border-accent-red text-accent-red opacity-50'
                }`}
                aria-label={isPoweredOn ? "System Shutdown" : "System Activation"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
              <button
                onClick={() => setShowSystemTab(prev => !prev)}
                className={`p-1.5 rounded-full border transition-all duration-300 ${
                  showSystemTab
                    ? 'bg-accent-purple/30 border-accent-purple text-accent-purple'
                    : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
                }`}
                aria-label="Toggle System Tab"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* System Tab */}
        {showSystemTab && (
          <div className="fixed top-0 left-0 right-0 bg-mono-darker border-b border-white/10 z-[100] p-4">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-start gap-8">
                {/* VIEWPORT Section */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider">VIEWPORT</h3>
                  <div className="text-[9px] text-white/60 space-y-1">
                    <div>DEFAULT</div>
                    <div className="mt-2">FIXED POINTS:</div>
                    <div className="ml-2">HIPS</div>
                    <div className="mt-2">ACTIVE JOINT:</div>
                    <div className="ml-2">TORSO</div>
                    <div className="mt-2">JOINT BEHAVIOR:</div>
                    <div className="ml-2">STANDARD (No Effects)</div>
                    <div className="mt-2">DISPLAY MODE:</div>
                    <div className="ml-2">STANDARD (SOLID)</div>
                  </div>
                </div>

                {/* Hotkey Commands Section */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider">Hotkey_Commands</h3>
                  <div className="text-[9px] text-white/60 space-y-1 font-mono">
                    <div><span className="text-accent-purple">[V]</span> TOGGLE ZOOM</div>
                    <div><span className="text-accent-purple">[P]</span> CYCLE FIXED POINT</div>
                    <div><span className="text-accent-purple">[R]</span> CYCLE DISPLAY MODE</div>
                    <div><span className="text-accent-purple">[CTRL/CMD+Z]</span> UNDO LAST ACTION</div>
                    <div><span className="text-accent-purple">[CTRL/CMD+Y]</span> REDO LAST ACTION</div>
                    <div className="mt-2 text-white/40">DRAG</div>
                    <div className="ml-2">POSE JOINT</div>
                    <div className="mt-2 text-white/40">DBL-CLK</div>
                    <div className="ml-2">TOGGLE JOINT BEHAVIOR</div>
                  </div>
                </div>

                {/* Behavior Legend Section */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider">BEHAVIOR_LEGEND</h3>
                  <div className="text-[9px] text-white/60 space-y-1">
                    <div><span className="text-accent-green">OFFSET</span> MATCH</div>
                    <div className="mt-2">System_Roadmap_(v0.2)</div>
                    <div className="mt-1 space-y-1">
                      <div className="text-accent-green">●</div>
                      <div className="ml-4">PHASE 0.2.1: ENVIRONMENTAL CONTEXT (FLOOR PLANE $Y=0$) - [COMPLETE]</div>
                      <div className="text-accent-green">●</div>
                      <div className="ml-4">PHASE 0.2.2: ELASTIC ANKLE CONSTRAINTS (TENSION PHYSICS) - [COMPLETE]</div>
                      <div className="text-accent-green">●</div>
                      <div className="ml-4">PHASE 0.2.3: ANIMATION ENGINE (KEYFRAME SEQUENCER) - [COMPLETE]</div>
                      <div className="text-accent-yellow">○</div>
                      <div className="ml-4">PHASE 0.2.4: MULTI-PIN SAFEGUARDS (AUTO-SQUAT/ELASTICITY) - [PLANNED]</div>
                      <div className="text-accent-yellow">○</div>
                      <div className="ml-4">PHASE 0.3.0: PROP SYSTEM & COLLISION (INTERACTIVE OBJECTS) - [PLANNED]</div>
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowSystemTab(false)}
                    className="px-3 py-1 bg-accent-red/20 border border-accent-red/50 text-accent-red hover:bg-accent-red/30 text-[9px] uppercase"
                  >
                    Close System Tab
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {panelsVisible && (
          <div className="fixed right-0 top-[52px] bottom-0 w-[280px] overflow-y-auto overflow-x-visible z-[120]">
            <div className="relative w-full pt-4 pb-4 pr-4" style={{ height: dockHeight + 16 }}>
              {/* MODEL SETTINGS (New Master Draggable Panel) */}
              <DraggablePanel
                id="model-settings-panel"
                title="MODEL SETTINGS"
                x={settingsPanel.x}
                y={settingsPanel.y}
                minimized={settingsPanel.minimized}
                onUpdateRect={(id, rect) => updatePanelRect(id, rect)}
                onUpdatePosition={(id, x, y, minimized) => updatePanelPosition(id, x, y, minimized)}
                allPanelRects={allPanelRectsArray}
                onBringToFront={bringPanelToFront}
                currentZIndex={panelZIndices['model-settings-panel']}
                className="w-[280px] max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
          {/* Section: Masks & Models */}
          <div className="flex flex-col gap-1 w-full text-left border-b border-white/10 pb-2 mb-2">
            <button
              onClick={() => toggleSection('model-display')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>MASKS & MODELS</span>
              <span className="text-[10px] opacity-50">{expandedSections['model-display'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['model-display'] && (
              <div className="mt-2 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-white/40 text-[8px] uppercase">Image_Layers</span>
                  <div className="border border-white/10 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Background</span>
                      <span className="text-white/30">{resolvedBackgroundLayer.src ? 'Loaded' : 'Empty'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={openBackgroundUpload}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white"
                      >
                        {resolvedBackgroundLayer.src ? 'Replace BG' : 'Upload BG'}
                      </button>
                      <button
                        onClick={handleClearBackgroundImageLayer}
                        disabled={!resolvedBackgroundLayer.src}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white disabled:opacity-40"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => handlePatchBackgroundImageLayer({ visible: true, opacity: 1, x: 50, y: 50, scale: 100, fitMode: 'contain' })}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Visible</span>
                      <input
                        type="checkbox"
                        checked={resolvedBackgroundLayer.visible}
                        disabled={!resolvedBackgroundLayer.src}
                        onChange={(event) => handlePatchBackgroundImageLayer({ visible: event.target.checked })}
                        className="h-3.5 w-3.5 accent-green-400"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Fit</span>
                      <select
                        value={resolvedBackgroundLayer.fitMode ?? 'contain'}
                        onChange={(event) => handlePatchBackgroundImageLayer({ fitMode: event.target.value as ImageLayerState['fitMode'] })}
                        className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                      >
                        <option value="free">Free</option>
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                      </select>
                    </label>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Opacity</span>
                        <span>{bgOpacityPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={bgOpacityPercent}
                        onChange={(event) => handlePatchBackgroundImageLayer({ opacity: clampNumber(Number(event.target.value), 0, 100) / 100 })}
                        className="w-full"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        X
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={bgXPercent}
                          onChange={(event) => handlePatchBackgroundImageLayer({ x: clampNumber(Number(event.target.value), 0, 100) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Y
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={bgYPercent}
                          onChange={(event) => handlePatchBackgroundImageLayer({ y: clampNumber(Number(event.target.value), 0, 100) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Scale
                        <input
                          type="range"
                          min={10}
                          max={400}
                          value={bgScalePercent}
                          onChange={(event) => handlePatchBackgroundImageLayer({ scale: clampNumber(Number(event.target.value), 10, 400) })}
                          className="w-full"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border border-white/10 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Foreground</span>
                      <span className="text-white/30">{resolvedForegroundLayer.src ? 'Loaded' : 'Empty'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={openForegroundUpload}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white"
                      >
                        {resolvedForegroundLayer.src ? 'Replace FG' : 'Upload FG'}
                      </button>
                      <button
                        onClick={handleClearForegroundImageLayer}
                        disabled={!resolvedForegroundLayer.src}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white disabled:opacity-40"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => handlePatchForegroundImageLayer({ visible: true, opacity: 1, x: 50, y: 50, scale: 100, fitMode: 'contain' })}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Visible</span>
                      <input
                        type="checkbox"
                        checked={resolvedForegroundLayer.visible}
                        disabled={!resolvedForegroundLayer.src}
                        onChange={(event) => handlePatchForegroundImageLayer({ visible: event.target.checked })}
                        className="h-3.5 w-3.5 accent-green-400"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Fit</span>
                      <select
                        value={resolvedForegroundLayer.fitMode ?? 'contain'}
                        onChange={(event) => handlePatchForegroundImageLayer({ fitMode: event.target.value as ImageLayerState['fitMode'] })}
                        className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                      >
                        <option value="free">Free</option>
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                      </select>
                    </label>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Opacity</span>
                        <span>{fgOpacityPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={fgOpacityPercent}
                        onChange={(event) => handlePatchForegroundImageLayer({ opacity: clampNumber(Number(event.target.value), 0, 100) / 100 })}
                        className="w-full"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        X
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={fgXPercent}
                          onChange={(event) => handlePatchForegroundImageLayer({ x: clampNumber(Number(event.target.value), 0, 100) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Y
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={fgYPercent}
                          onChange={(event) => handlePatchForegroundImageLayer({ y: clampNumber(Number(event.target.value), 0, 100) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Scale
                        <input
                          type="range"
                          min={10}
                          max={400}
                          value={fgScalePercent}
                          onChange={(event) => handlePatchForegroundImageLayer({ scale: clampNumber(Number(event.target.value), 10, 400) })}
                          className="w-full"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
                  <span className="text-white/40 text-[8px] uppercase">Body_Masks</span>
                  <div className="border border-white/10 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>On-Screen Masks</span>
                      <span className="text-white/30">{loadedMaskCount}/{orderedParts.length}</span>
                    </div>
                    <button
                      onClick={() => setMaskControlsVisible(!maskControlsVisible)}
                      className={`text-[9px] py-1 border ${maskControlsVisible ? 'border-accent-green text-accent-green bg-accent-green/10' : 'border-white/10 text-white/60 hover:text-white'}`}
                    >
                      Mask Controls {maskControlsVisible ? 'ON' : 'OFF'}
                    </button>
                    <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                      Active Mask
                      <select
                        value={activeMaskEditorPart ?? ''}
                        onChange={(event) => setActiveMaskEditorPart(event.target.value ? (event.target.value as PartName) : null)}
                        className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                      >
                        <option value="">Select Part</option>
                        {orderedParts.map(part => (
                          <option key={part} value={part}>
                            {getPartCategoryDisplayName(part)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => activeMaskEditorPart && openBodyPartMaskUpload(activeMaskEditorPart, true)}
                        disabled={!activeMaskEditorPart}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white disabled:opacity-40"
                      >
                        {activeMaskEditorPart && bodyPartMaskLayers[activeMaskEditorPart]?.src ? 'Replace Mask' : 'Upload Mask'}
                      </button>
                      <button
                        onClick={() => activeMaskEditorPart && handleClearBodyPartMaskLayer(activeMaskEditorPart)}
                        disabled={!activeMaskEditorPart || !bodyPartMaskLayers[activeMaskEditorPart]?.src}
                        className="text-[9px] py-1 border border-white/10 text-white/70 hover:text-white disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Mask Visible</span>
                      <input
                        type="checkbox"
                        checked={activeMaskEditorPart ? (bodyPartMaskLayers[activeMaskEditorPart]?.visible ?? false) : false}
                        disabled={!activeMaskEditorPart}
                        onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { visible: event.target.checked })}
                        className="h-3.5 w-3.5 accent-green-400"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                      <span>Bone Visible</span>
                      <input
                        type="checkbox"
                        checked={activeMaskEditorPart ? visibility[activeMaskEditorPart] : false}
                        disabled={!activeMaskEditorPart}
                        onChange={(event) => activeMaskEditorPart && setVisibility(prev => ({ ...prev, [activeMaskEditorPart]: event.target.checked }))}
                        className="h-3.5 w-3.5 accent-green-400"
                      />
                    </label>
                    <div className="border border-white/10 rounded p-2 space-y-2">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Bone Adjust</span>
                        <button
                          onClick={() => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                            boneAdjustEnabled: !activeMaskLayer?.boneAdjustEnabled,
                            boneScaleLength: activeMaskLayer?.boneAdjustEnabled ? 1 : (boneScale[activeMaskEditorPart]?.length ?? 1),
                            boneScaleWidth: activeMaskLayer?.boneAdjustEnabled ? 1 : (boneScale[activeMaskEditorPart]?.width ?? 1),
                            boneVariant: activeMaskLayer?.boneAdjustEnabled ? null : (boneVariantOverrides[activeMaskEditorPart] ?? null),
                          })}
                          disabled={!activeMaskEditorPart}
                          className={`text-[9px] px-2 py-1 border transition-all ${
                            activeMaskLayer?.boneAdjustEnabled
                              ? 'bg-selection/30 border-selection text-selection'
                              : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
                          }`}
                        >
                          {activeMaskLayer?.boneAdjustEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      {activeMaskLayer?.boneAdjustEnabled && activeMaskEditorPart && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                              Length (X)
                              <input
                                type="range"
                                min={0.5}
                                max={1.8}
                                step={0.01}
                                value={activeMaskLayer?.boneScaleLength ?? 1}
                                onChange={(event) => handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                                  boneScaleLength: clampNumber(Number(event.target.value), 0.5, 1.8),
                                })}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                              Width (Y)
                              <input
                                type="range"
                                min={0.5}
                                max={1.8}
                                step={0.01}
                                value={activeMaskLayer?.boneScaleWidth ?? 1}
                                onChange={(event) => handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                                  boneScaleWidth: clampNumber(Number(event.target.value), 0.5, 1.8),
                                })}
                              />
                            </label>
                          </div>
                          <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                            Bone Shape
                            <select
                              value={activeMaskLayer?.boneVariant ?? ''}
                              onChange={(event) => handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                                boneVariant: event.target.value ? (event.target.value as BoneVariant) : null,
                              })}
                              className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                            >
                              <option value="">Default</option>
                              {BONE_VARIANT_OPTIONS.map(variant => (
                                <option key={variant} value={variant}>
                                  {variant.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="border border-white/10 rounded p-2 space-y-2">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Mask Physics</span>
                        <select
                          value={activeMaskLayer?.physicsMode ?? 'follow'}
                          disabled={!activeMaskEditorPart}
                          onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                            physicsMode: event.target.value as MaskPhysicsMode,
                          })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        >
                          {(['follow', 'replace', 'offset', 'balance', 'counter', 'lock'] as MaskPhysicsMode[]).map(mode => (
                            <option key={mode} value={mode}>
                              {mode.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                      {activeMaskLayer?.physicsMode === 'balance' && (
                        <label className="flex items-center justify-between text-[9px] uppercase text-white/50">
                          <span>Balance Axis</span>
                          <select
                            value={activeMaskLayer?.balanceMode ?? 'y'}
                            onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, {
                              balanceMode: event.target.value as MaskBalanceMode,
                            })}
                            className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                          >
                            <option value="x">X</option>
                            <option value="y">Y</option>
                            <option value="slanted">SLANTED</option>
                          </select>
                        </label>
                      )}
                      {activeMaskLayer?.physicsMode === 'counter' && (
                        <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                          Counter Targets
                          <input
                            type="text"
                            value={(activeMaskLayer?.counterTargets ?? []).join(',')}
                            onChange={(event) => {
                              const raw = event.target.value;
                              const parts = raw
                                .split(',')
                                .map(item => item.trim())
                                .filter(Boolean)
                                .filter(item => (Object.values(PartName) as string[]).includes(item)) as PartName[];
                              activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { counterTargets: parts });
                            }}
                            className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                          />
                        </label>
                      )}
                      {activeMaskLayer?.physicsMode === 'lock' && (
                        <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                          Lock Targets
                          <input
                            type="text"
                            value={(activeMaskLayer?.lockTargets ?? []).join(',')}
                            onChange={(event) => {
                              const raw = event.target.value;
                              const parts = raw
                                .split(',')
                                .map(item => item.trim())
                                .filter(Boolean)
                                .filter(item => (Object.values(PartName) as string[]).includes(item)) as PartName[];
                              activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { lockTargets: parts });
                            }}
                            className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                          />
                        </label>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Opacity</span>
                        <span>{activeMaskOpacityPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={activeMaskOpacityPercent}
                        disabled={!activeMaskEditorPart}
                        onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { opacity: clampNumber(Number(event.target.value), 0, 100) / 100 })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Scale</span>
                        <span>{activeMaskScalePercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={400}
                        value={activeMaskScalePercent}
                        disabled={!activeMaskEditorPart}
                        onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { scale: clampNumber(Number(event.target.value), 10, 400) })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] uppercase text-white/50">
                        <span>Rotation</span>
                        <span>{activeMaskRotationDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={activeMaskRotationDeg}
                        disabled={!activeMaskEditorPart}
                        onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { rotationDeg: clampNumber(Number(event.target.value), -180, 180) })}
                        className="w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Offset X
                        <input
                          type="number"
                          value={activeMaskOffsetX}
                          disabled={!activeMaskEditorPart}
                          onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { offsetX: clampNumber(Number(event.target.value), -400, 400) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Offset Y
                        <input
                          type="number"
                          value={activeMaskOffsetY}
                          disabled={!activeMaskEditorPart}
                          onChange={(event) => activeMaskEditorPart && handlePatchBodyPartMaskLayer(activeMaskEditorPart, { offsetY: clampNumber(Number(event.target.value), -400, 400) })}
                          className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
                  <span className="text-white/40 text-[8px] uppercase">Model_&_Skins</span>
                  <div className="flex flex-col gap-2 border-b border-white/10 pb-2 mb-2">
                    <button
                      onClick={() => setCharacterEditMode(!characterEditMode)}
                      className={`text-[9px] font-bold text-center px-2 py-1 transition-all border ${
                        characterEditMode
                          ? 'bg-selection/20 border-selection text-selection'
                          : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
                      }`}
                      aria-pressed={characterEditMode}
                    >
                      CHARACTER EDIT MODE
                    </button>
                    {characterEditMode && (
                      <div className="flex flex-col gap-2 items-center">
                        <span className="text-white/40 uppercase text-[8px]">
                          {primarySelectedPart ? `${primarySelectedPart}_Scale` : 'Select_A_Bone'}
                        </span>
                        <div className="w-full">
                          <div className="flex items-center justify-between text-[8px] text-white/50">
                            <span>Length</span>
                            <span>{selectedBoneScale.length.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            value={selectedBoneScale.length}
                            onChange={(e) => {
                              if (!primarySelectedPart) return;
                              const value = parseFloat(e.target.value);
                              setBoneScale(prev => applyBoneScalePatch(prev, primarySelectedPart, { length: value }));
                            }}
                            disabled={!primarySelectedPart}
                            className="w-full"
                          />
                        </div>
                        <div className="w-full">
                          <div className="flex items-center justify-between text-[8px] text-white/50">
                            <span>Width</span>
                            <span>{selectedBoneScale.width.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            value={selectedBoneScale.width}
                            onChange={(e) => {
                              if (!primarySelectedPart) return;
                              const value = parseFloat(e.target.value);
                              setBoneScale(prev => applyBoneScalePatch(prev, primarySelectedPart, { width: value }));
                            }}
                            disabled={!primarySelectedPart}
                            className="w-full"
                          />
                        </div>
                        <div className="w-full">
                          <div className="flex items-center justify-between text-[8px] text-white/50">
                            <span>Joint Offset</span>
                            <button
                              onClick={() => primarySelectedPart && handlePatchJointOffset(primarySelectedPart, { x: 0, y: 0 })}
                              disabled={!primarySelectedPart}
                              className="text-[8px] px-1 border border-white/10 text-white/60 hover:text-white disabled:opacity-40"
                            >
                              RESET
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                              X
                              <input
                                type="number"
                                value={activeJointOffset.x}
                                disabled={!primarySelectedPart}
                                onChange={(event) => primarySelectedPart && handlePatchJointOffset(primarySelectedPart, {
                                  x: clampNumber(Number(event.target.value), -200, 200),
                                })}
                                className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                              Y
                              <input
                                type="number"
                                value={activeJointOffset.y}
                                disabled={!primarySelectedPart}
                                onChange={(event) => primarySelectedPart && handlePatchJointOffset(primarySelectedPart, {
                                  y: clampNumber(Number(event.target.value), -200, 200),
                                })}
                                className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[9px] text-white"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-white/40 text-[8px] uppercase">Skin_Style</span>
                  <div className="flex flex-col gap-1">
                    {(['default', 'wireframe', 'silhouette', 'backlight', 'spotlight', 'shadow', 'grayscale', 'sepia', 'palette'] as RenderMode[]).map(mode => (
                      <button
                        key={mode}
                        onClick={(event) => {
                          setRenderMode(mode);
                          if (event.shiftKey) {
                            const preset = renderModePresets[mode];
                            setShowPins(preset.showPins);
                            setShowBoneOverlay(preset.showBoneOverlay);
                            setMaskControlsVisible(preset.maskControlsVisible);
                          }
                        }}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          renderMode === mode
                            ? 'bg-selection/30 border-selection text-selection'
                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={renderMode === mode}
                        aria-label={`Set display mode to ${getRenderModeDisplayName(mode)}`}
                      >
                        {getRenderModeDisplayName(mode).toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <span className="text-white/40 text-[8px] uppercase mt-3">Ground_Plane</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(['gradient', 'black', 'white', 'transparent', 'perspective'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setGroundPlaneMode(mode)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          groundPlaneMode === mode
                            ? 'bg-selection/30 border-selection text-selection'
                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={groundPlaneMode === mode}
                      >
                        {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {groundPlaneMode === 'perspective' && (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          onClick={() => setGroundPerspective({ lines: 6, spacing: 80, convergence: 0.88 })}
                          className="text-[9px] text-center px-2 py-1 border border-white/10 text-white/60 hover:text-white"
                        >
                          HORIZON
                        </button>
                        <button
                          onClick={() => setGroundPerspective({ lines: 40, spacing: 12, convergence: 0.75 })}
                          className="text-[9px] text-center px-2 py-1 border border-white/10 text-white/60 hover:text-white"
                        >
                          SOLID
                        </button>
                      </div>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Lines
                        <input
                          type="range"
                          min={4}
                          max={60}
                          value={groundPerspective.lines}
                          onChange={(event) => setGroundPerspective(prev => ({ ...prev, lines: Number(event.target.value) }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Spacing
                        <input
                          type="range"
                          min={6}
                          max={120}
                          value={groundPerspective.spacing}
                          onChange={(event) => setGroundPerspective(prev => ({ ...prev, spacing: Number(event.target.value) }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[8px] uppercase text-white/50">
                        Convergence
                        <input
                          type="range"
                          min={0.6}
                          max={0.98}
                          step={0.01}
                          value={groundPerspective.convergence}
                          onChange={(event) => setGroundPerspective(prev => ({ ...prev, convergence: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                  )}
                  <span className="text-white/40 text-[8px] uppercase mt-3">Ground_Pattern</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(['none', 'hatch', 'stippling', 'dither'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setGroundPattern(mode)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          groundPattern === mode
                            ? 'bg-selection/30 border-selection text-selection'
                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={groundPattern === mode}
                      >
                        {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <span className="text-white/40 text-[8px] uppercase mt-4">Viewport_Zoom</span>
                  <div className="grid grid-cols-2 gap-1 items-center">
                    {(['default', 'lotte', 'wide', 'mobile', 'zoomed'] as ViewMode[]).map(_mode => (
                      <button
                        key={_mode}
                        onClick={() => setViewMode(_mode)}
                        className={`col-span-1 text-[9px] text-center px-1 py-0.5 transition-all border ${
                          viewMode === _mode
                            ? 'bg-accent-green/30 border-accent-green text-accent-green'
                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={viewMode === _mode}
                        aria-label={`Set viewport zoom to ${_mode.toUpperCase()}`}
                      >
                        {_mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-white/40 text-[8px] uppercase">Model_Shape</span>
                    <div className="grid grid-cols-2 gap-1">
                      {(['default', 'oval'] as const).map(style => (
                        <button
                          key={style}
                          onClick={() => setMannequinStyle(style)}
                          className={`text-[9px] text-center px-2 py-1 transition-all border ${
                            mannequinStyle === style
                              ? 'bg-selection/30 border-selection text-selection'
                              : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                          }`}
                          aria-pressed={mannequinStyle === style}
                        >
                          {style === 'default' ? 'STANDARD' : 'OVAL BITRUVIUS'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-white/40 text-[8px] uppercase">Bone_&_Joint_Toggles</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setShowPins(!showPins)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          showPins ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={showPins}
                      >
                        {showPins ? 'ANCHORS ON' : 'ANCHORS OFF'}
                      </button>
                      <button
                        onClick={() => setShowBoneOverlay(!showBoneOverlay)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          showBoneOverlay ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={showBoneOverlay}
                      >
                        {showBoneOverlay ? 'AXIS ON' : 'AXIS OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Primary Menu */}
          <div className="flex flex-col gap-1 w-full text-left">
            <button
              onClick={() => toggleSection('primary')}
              className="flex items-center justify-between w-full text-focus-ring font-bold uppercase tracking-wide hover:text-white transition-colors"
            >
              <span>PRIMARY MENU</span>
              <span className="text-[10px] opacity-50">{expandedSections['primary'] ? '▼' : '▶'}</span>
            </button>

            {expandedSections['primary'] && (
              <div className="mt-2 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-white/40 text-[8px] uppercase">Fixed_Point_Options</span>
                  <span className="text-white/40 text-[8px] uppercase">Select_Pin_Location</span>
                  <div className="grid grid-cols-2 gap-1">
                    {([PartName.Waist, PartName.LAnkle, 'lFootTip', PartName.RAnkle, 'rFootTip', 'root'] as AnchorName[]).map(pinOption => (
                      <button
                        key={pinOption}
                        onClick={() => {
                          setActivePins(prev => {
                            if (prev.includes(pinOption)) {
                              return prev.filter(p => p !== pinOption);
                            } else {
                              return [...prev, pinOption];
                            }
                          });
                        }}
                        className={`text-[9px] text-left px-2 py-1 transition-all border ${
                          activePins.includes(pinOption)
                            ? 'bg-accent-red/30 border-accent-red text-accent-red'
                            : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={activePins.includes(pinOption)}
                        aria-label={`Toggle fixed point ${getPinName([pinOption])}`}
                      >
                        {getPinName([pinOption])}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-white/40 text-[8px] uppercase">Pin_Behavior</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setSmartPinning(!smartPinning)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          smartPinning ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={smartPinning}
                      >
                        {smartPinning ? 'SMART ON' : 'SMART OFF'}
                      </button>
                      <button
                        onClick={() => setBodySyncMode(!bodySyncMode)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          bodySyncMode ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={bodySyncMode}
                      >
                        {bodySyncMode ? 'MIRROR ON' : 'MIRROR OFF'}
                      </button>
                      <button
                        onClick={() => setOmniSyncMode(!omniSyncMode)}
                        className={`text-[9px] text-center px-2 py-1 transition-all border ${
                          omniSyncMode ? 'bg-selection/30 border-selection text-selection' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                        }`}
                        aria-pressed={omniSyncMode}
                      >
                        {omniSyncMode ? 'OMNI ON' : 'OMNI OFF'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
                  <span className="text-white/40 text-[8px] uppercase">Saved_Poses</span>
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => {
                        const name = prompt('Enter pose name:');
                        if (name !== null) saveCurrentPose(name);
                      }}
                      className="flex-1 text-[10px] font-bold py-1 bg-accent-green/20 border border-accent-green/40 text-accent-green hover:bg-accent-green/30 transition-all"
                    >
                      + SAVE_CURRENT
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                    {POSE_LIBRARY_DB.map(poseData => (
                      <button
                        key={poseData.id}
                        onClick={() => {
                          const parsed = stringToPose(poseData.data);
                          setActivePose(prev => ({ ...prev, ...parsed }));
                        }}
                        className="text-[9px] text-left px-2 py-1 bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10 transition-all flex justify-between items-center group"
                      >
                        <span className="truncate">{poseData.name.toUpperCase()}</span>
                        <span className="text-[8px] opacity-30 group-hover:opacity-60">SYSTEM</span>
                      </button>
                    ))}

                    {userPoses.map(pose => (
                      <div key={pose.id} className="flex gap-1 group">
                        <button
                          onClick={() => {
                            const parsed = stringToPose(pose.data);
                            setActivePose(prev => ({ ...prev, ...parsed }));
                          }}
                          className="flex-1 text-[9px] text-left px-2 py-1 bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10 transition-all truncate"
                        >
                          {pose.name.toUpperCase()}
                        </button>
                        <button
                          onClick={() => deleteSavedPose(pose.id)}
                          className="px-2 text-[9px] text-red-500/50 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {userPoses.length === 0 && POSE_LIBRARY_DB.length === 0 && (
                      <div className="text-[9px] text-white/20 italic py-2 text-center">NO_POSES_FOUND</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
                  <span className="text-white/40 text-[8px] uppercase">System_Monitor</span>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-4 justify-between w-full"><span>VIEWPORT:</span> <span className="text-accent-green text-right">{viewMode.toUpperCase()}</span></div>
                    <div className="flex gap-4 justify-between w-full"><span>FIXED POINTS:</span> <span className="text-accent-red truncate max-w-[120px]">{getPinName(activePins)}</span></div>
                    <div className="flex gap-4 justify-between w-full"><span>ACTIVE JOINT:</span> <span className="text-focus-ring">{primarySelectedPart ? getPartCategoryDisplayName(primarySelectedPart) : 'NONE'}</span></div>
                    {primarySelectedPart && (
                      <div className="flex gap-4 justify-between w-full">
                        <span>JOINT BEHAVIOR:</span>
                        <span className={`text-[9px] font-bold ${getKineticModeDisplayColorClass(jointModes[primarySelectedPart])}`}>
                          {getKineticModeDisplayName(jointModes[primarySelectedPart])}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-4 justify-between w-full"><span>DISPLAY MODE:</span> <span className="text-focus-ring">{getRenderModeDisplayName(renderMode).toUpperCase()}</span></div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
                  <span className="text-white/40 text-[8px] uppercase">Hotkey_Commands</span>
                  <div className="flex flex-col gap-1 uppercase tracking-widest">
                    <div className="flex gap-2 items-center"><span className="text-accent-green">[V]</span> <span>TOGGLE ZOOM</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">[P]</span> <span>CYCLE FIXED POINT</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">[R]</span> <span>CYCLE DISPLAY MODE</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">[CTRL/CMD+Z]</span> <span>UNDO LAST ACTION</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">[CTRL/CMD+Y]</span> <span>REDO LAST ACTION</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">DRAG</span> <span>POSE JOINT</span></div>
                    <div className="flex gap-2 items-center"><span className="text-accent-green">DBL-CLK</span> <span>TOGGLE JOINT BEHAVIOR</span></div>
                    <div className="mt-2 text-white/30 border-b border-white/10 pb-1">BEHAVIOR_LEGEND</div>
                    <div className="flex gap-2 items-center"><span className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.PURPLE_STRETCH}}></span> <span className="text-accent-purple">OFFSET</span></div>
                    <div className="flex gap-2 items-center"><span className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.GREEN_CURL}}></span> <span className="text-accent-green">MATCH</span></div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-white/10 pt-2 text-[8px] text-white/50">
                  <span className="text-white/40 text-[8px] uppercase">System_Roadmap_(v0.2)</span>
                  <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.1: ENVIRONMENTAL CONTEXT (FLOOR PLANE $Y=0$) - [COMPLETE]</span></div>
                  <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.2: ELASTIC ANKLE CONSTRAINTS (TENSION PHYSICS) - [COMPLETE]</span></div>
                  <div className="flex gap-2"><span className="text-accent-green">●</span> <span>PHASE 0.2.3: ANIMATION ENGINE (KEYFRAME SEQUENCER) - [COMPLETE]</span></div>
                  <div className="flex gap-2"><span className="text-focus-ring">○</span> <span>PHASE 0.2.4: MULTI-PIN SAFEGUARDS (AUTO-SQUAT/ELASTICITY) - [PLANNED]</span></div>
                  <div className="flex gap-2"><span className="text-focus-ring">○</span> <span>PHASE 0.3.0: PROP SYSTEM & COLLISION (INTERACTIVE OBJECTS) - [PLANNED]</span></div>
                </div>

                              </div>
            )}
          </div>

              </DraggablePanel>

              {/* MOVEMENT SETTINGS (Animation Controls Panel) */}
              <DraggablePanel
                id="movement-settings-panel"
                title="MOVEMENT SETTINGS"
                x={movementPanel.x}
                y={movementPanel.y}
                minimized={movementPanel.minimized}
                onUpdateRect={(id, rect) => updatePanelRect(id, rect)}
                onUpdatePosition={(id, x, y, minimized) => updatePanelPosition(id, x, y, minimized)}
                allPanelRects={allPanelRectsArray}
                onBringToFront={bringPanelToFront}
                currentZIndex={panelZIndices['movement-settings-panel']}
                className="w-[280px] max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
          <div className="flex flex-col gap-3">
            <div className="text-white/50 text-[9px] uppercase tracking-wider">Animation Engine</div>
            <EnhancedTimeline
              sequence={sequence}
              currentPose={activePose}
              viewingPose={viewingPose}
              selectedSlotId={selectedSlotId}
              autoInterpolation={autoInterpolation}
              onScrubPositionChange={sequenceActions.setScrubPosition}
              onSlotClick={handleSlotClick}
              onSlotUpdate={sequenceActions.updateSlot}
              onSlotLabelUpdate={sequenceActions.updateSlotLabel}
              onSlotDelete={sequenceActions.removeSlot}
              onSlotReorder={sequenceActions.reorderSlots}
              onTransitionUpdate={sequenceActions.updateSlotTransition}
              onPlay={sequenceActions.play}
              onPause={sequenceActions.pause}
              onStop={sequenceActions.stop}
              onLoopToggle={sequenceActions.setLoop}
              onAddSlot={sequenceActions.addSlot}
              onEasingToggle={sequenceActions.setEasingEnabled}
              onSmoothToggle={sequenceActions.setSmoothTransitions}
              onIKToggle={sequenceActions.setIKAssisted}
              onAutoInterpolationToggle={() => setAutoInterpolation(!autoInterpolation)}
              onExitPoseView={exitPoseView}
            />
            <MovementSettings
              sequence={sequence}
              autoInterpolation={autoInterpolation}
              bodyDragMode={bodyDragMode}
              bodyDragWeightiness={bodyDragWeightiness}
              walkingEnabled={walkingEnabled}
              walkingPresetName={WALKING_PRESETS[walkingPresetIndex]?.name ?? 'Custom'}
              gaitDepth={gaitDepth}
              walkingSpeed={walkingSpeed}
              walkingPinMode={walkingPinMode}
              onEasingToggle={sequenceActions.setEasingEnabled}
              onSmoothToggle={sequenceActions.setSmoothTransitions}
              onIKToggle={sequenceActions.setIKAssisted}
              onAutoInterpolationToggle={() => setAutoInterpolation(!autoInterpolation)}
              onCycleBodyDragMode={cycleBodyDragMode}
              onCycleBodyDragWeightiness={cycleBodyDragWeightiness}
              onToggleWalking={() => {
                setWalkingEnabled(prev => !prev);
              }}
              onCycleWalkingPreset={cycleWalkingPreset}
              onGaitDepthChange={setGaitDepth}
              onWalkingSpeedChange={setWalkingSpeed}
              onWalkingPinModeChange={setWalkingPinMode}
              onSaveWalkingLoop={saveWalkingLoopToTimeline}
              onOpenCalibration={() => setShowCalibrationPanel(true)}
            />
            
            {/* Walking Calibration Panel */}
            {showCalibrationPanel && (
              <WalkingCalibrationPanel
                currentGait={walkingGait}
                onGaitChange={setWalkingGait}
                onClose={() => setShowCalibrationPanel(false)}
              />
            )}
            
          </div>
              </DraggablePanel>
            </div>
          </div>
        )}

        <div className="w-full h-full bg-selection-super-light bg-triangle-grid flex items-center justify-center relative">
          <Scanlines />
          <input
            ref={backgroundUploadInputRef}
            type="file"
            accept="image/*"
            onChange={handleBackgroundUploadInput}
            className="hidden"
          />
          <input
            ref={foregroundUploadInputRef}
            type="file"
            accept="image/*"
            onChange={handleForegroundUploadInput}
            className="hidden"
          />
          <input
            ref={bodyPartMaskUploadInputRef}
            type="file"
            accept="image/*"
            onChange={handleBodyPartMaskUploadInput}
            className="hidden"
          />
          {showSplash && (
            <div className="absolute top-[8%] left-0 right-0 z-30 flex items-center justify-center pointer-events-none">
              <h1 className="text-6xl font-archaic text-paper/80 animate-terminal-boot tracking-widest uppercase">BITRUVIUS</h1>
            </div>
          )}
          
          <svg 
            ref={svgRef} 
            width="100%" 
            height="100%" 
            viewBox={autoViewBox} 
            className="overflow-visible relative z-10" 
            style={{ filter: sceneFilter }}
          >
            <defs>
              <filter id="shadow-blur" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <filter id="palette-map">
                <feColorMatrix
                  type="matrix"
                  values="
                    0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0      0      0      1 0"
                />
                <feComponentTransfer>
                  <feFuncR type="table" tableValues={paletteMatrix.r} />
                  <feFuncG type="table" tableValues={paletteMatrix.g} />
                  <feFuncB type="table" tableValues={paletteMatrix.b} />
                </feComponentTransfer>
              </filter>
            </defs>
            {resolvedBackgroundLayer.src && resolvedBackgroundLayer.visible && backgroundPlacement && (
              <image
                href={resolvedBackgroundLayer.src}
                x={backgroundPlacement.x}
                y={backgroundPlacement.y}
                width={backgroundPlacement.width}
                height={backgroundPlacement.height}
                preserveAspectRatio={backgroundPlacement.preserveAspectRatio}
                opacity={resolvedBackgroundLayer.opacity * backgroundModeOpacity}
                style={{ mixBlendMode: toBlendMode(resolvedBackgroundLayer.blendMode) }}
              />
            )}
            <SystemGuides
              floorY={FLOOR_HEIGHT}
              groundMode={groundPlaneMode}
              groundPattern={groundPattern}
              perspective={groundPerspective}
            /> 
            <g filter={
              renderMode === 'shadow'
                ? 'url(#shadow-blur)'
                : renderMode === 'palette'
                  ? 'url(#palette-map)'
                  : undefined
            }>
              <Mannequin
                pose={activePose}
                ghostPose={isDragging.current ? ghostPose : undefined}
                showOverlay={showBoneOverlay}
                showPins={showPins}
                modelStyle={mannequinStyle}
                boneScale={effectiveBoneScale}
                boneVariantOverrides={boneVariantOverrides}
                selectedParts={selectedParts}
                visibility={visibility}
                activePins={activePins}
                pinnedState={pinnedState}
                className="text-black"
                onMouseDownOnPart={handleMouseDownOnPart}
                onDoubleClickOnPart={handleDoubleClickOnPart}
                onMouseDownOnRoot={(e) => { 
                  e.stopPropagation(); 
                  isDragging.current = true;
                  dragStartPose.current = activePose;
                  setIsCraneDragging(true); 
                  dragStartInfo.current = { startX: e.clientX, startY: e.clientY, startRootX: activePose.root.x, startRootY: activePose.root.y }; 
                }}
                jointModes={jointModes}
                renderMode={renderMode}
              />
            </g>

            {orderedParts.map((part) => {
              const layer = bodyPartMaskLayers[part];
              const joint = jointPositions[part];
              if (!layer?.src || !layer.visible || !joint) return null;
              const scale = clampNumber(layer.scale ?? 100, 10, 400) / 100;
              const size = getMaskBaseSize(part) * scale;
              const offsetX = layer.offsetX ?? 0;
              const offsetY = layer.offsetY ?? 0;
              
              // Get joint offset for bone-attached movement
              const jointOffset = activePose.offsets?.[part] ?? { x: 0, y: 0 };
              
              // Position mask at joint position + user offsets + joint offsets
              const centerX = joint.x + offsetX + jointOffset.x;
              const centerY = joint.y + offsetY + jointOffset.y;
              const rotation = layer.rotationDeg ?? 0;
              const blendMode = toBlendMode(layer.blendMode);
              return (
                <image
                  key={`mask-${part}`}
                  href={layer.src}
                  x={centerX - size / 2}
                  y={centerY - size / 2}
                  width={size}
                  height={size}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={layer.opacity ?? 1}
                  style={{ mixBlendMode: blendMode }}
                  transform={`rotate(${rotation} ${centerX} ${centerY})`}
                />
              );
            })}

            {resolvedForegroundLayer.src && resolvedForegroundLayer.visible && foregroundPlacement && (
              <image
                href={resolvedForegroundLayer.src}
                x={foregroundPlacement.x}
                y={foregroundPlacement.y}
                width={foregroundPlacement.width}
                height={foregroundPlacement.height}
                preserveAspectRatio={foregroundPlacement.preserveAspectRatio}
                opacity={resolvedForegroundLayer.opacity * backgroundModeOpacity}
                style={{ mixBlendMode: toBlendMode(resolvedForegroundLayer.blendMode) }}
              />
            )}

            {maskControlsVisible && maskHandles.length > 0 && (
              <g className="pointer-events-auto">
                {maskHandles.map((handle) => {
                  const label = getPartCategoryDisplayName(handle.part).replace(/\s+/g, '_').toUpperCase();
                  const scaleFactor = 4 * 0.66; // Scale down to 66%
                  const labelWidth = Math.max(56, label.length * 6) * scaleFactor;
                  const labelHeight = 16 * scaleFactor;
                  const labelX = handle.labelX - labelWidth / 2;
                  const labelY = handle.labelY - labelHeight / 2;
                  const hasMask = handle.hasMask;
                  const boneVisible = visibility[handle.part];
                  const layer = bodyPartMaskLayers[handle.part] ?? DEFAULT_BODY_PART_MASK_LAYER;
                  const boneAdjustEnabled = layer.boneAdjustEnabled ?? false;
                  const physicsMode = layer.physicsMode ?? 'follow';
                  const toggleR = 8 * scaleFactor;
                  const togglePad = 6 * scaleFactor;
                  const boneToggleX = labelX - togglePad - toggleR;
                  const physicsToggleX = labelX + labelWidth + togglePad + toggleR;
                  const toggleY = handle.labelY;
                  const physicsModes: MaskPhysicsMode[] = ['follow', 'replace', 'offset', 'balance', 'counter', 'lock'];
                  return (
                    <g key={`mask-handle-${handle.part}`}>
                      <line
                        x1={handle.jointX}
                        y1={handle.jointY}
                        x2={handle.labelX}
                        y2={handle.labelY}
                        stroke={hasMask ? 'rgba(74, 222, 128, 0.55)' : 'rgba(148, 163, 184, 0.45)'}
                        strokeWidth={2 * scaleFactor}
                        strokeDasharray={`${4 * scaleFactor} ${4 * scaleFactor}`}
                      />
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          const enableNext = !boneAdjustEnabled;
                          handlePatchBodyPartMaskLayer(handle.part, {
                            boneAdjustEnabled: enableNext,
                            boneScaleLength: enableNext ? (boneScale[handle.part]?.length ?? 1) : 1,
                            boneScaleWidth: enableNext ? (boneScale[handle.part]?.width ?? 1) : 1,
                            boneVariant: enableNext ? (boneVariantOverrides[handle.part] ?? null) : null,
                          });
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={boneToggleX}
                          cy={toggleY}
                          r={toggleR}
                          fill={boneAdjustEnabled ? 'rgba(59,130,246,0.85)' : 'rgba(30,41,59,0.8)'}
                          stroke="rgba(15,23,42,0.8)"
                          strokeWidth={1.5 * scaleFactor}
                        />
                        <text
                          x={boneToggleX}
                          y={toggleY + 4 * scaleFactor}
                          textAnchor="middle"
                          fontSize={9 * scaleFactor}
                          fill="rgba(248,250,252,0.95)"
                          fontFamily="monospace"
                        >
                          B
                        </text>
                      </g>
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentIndex = Math.max(0, physicsModes.indexOf(physicsMode));
                          const nextMode = physicsModes[(currentIndex + 1) % physicsModes.length];
                          const patch: Partial<BodyPartMaskLayer> = { physicsMode: nextMode };
                          if (nextMode === 'counter' && !(layer.counterTargets?.length)) {
                            const opposite = getOppositePart(handle.part);
                            patch.counterTargets = opposite ? [opposite] : [];
                          }
                          if (nextMode === 'lock' && !(layer.lockTargets?.length)) {
                            patch.lockTargets = [handle.part];
                          }
                          handlePatchBodyPartMaskLayer(handle.part, patch);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (physicsMode !== 'counter' && physicsMode !== 'lock') return;
                          const promptLabel = physicsMode === 'counter' ? 'Counter targets (comma-separated PartName values)' : 'Lock targets (comma-separated PartName values)';
                          const input = window.prompt(promptLabel, (physicsMode === 'counter' ? (layer.counterTargets ?? []) : (layer.lockTargets ?? [])).join(','));
                          if (input === null) return;
                          const parts = input
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean)
                            .filter(item => (Object.values(PartName) as string[]).includes(item)) as PartName[];
                          handlePatchBodyPartMaskLayer(handle.part, physicsMode === 'counter' ? { counterTargets: parts } : { lockTargets: parts });
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={physicsToggleX}
                          cy={toggleY}
                          r={toggleR}
                          fill={physicsMode === 'follow' ? 'rgba(34,197,94,0.85)' : 
                                physicsMode === 'replace' ? 'rgba(239,68,68,0.85)' :
                                physicsMode === 'offset' ? 'rgba(251,146,60,0.85)' :
                                physicsMode === 'balance' ? 'rgba(147,51,234,0.85)' :
                                physicsMode === 'counter' ? 'rgba(236,72,153,0.85)' :
                                'rgba(107,114,128,0.85)'}
                          stroke="rgba(15,23,42,0.8)"
                          strokeWidth={1.5 * scaleFactor}
                        />
                        <text
                          x={physicsToggleX}
                          y={toggleY + 4 * scaleFactor}
                          textAnchor="middle"
                          fontSize={9 * scaleFactor}
                          fill="rgba(248,250,252,0.95)"
                          fontFamily="monospace"
                        >
                          {physicsMode === 'follow' ? 'F' :
                           physicsMode === 'replace' ? 'R' :
                           physicsMode === 'offset' ? 'O' :
                           physicsMode === 'balance' ? 'B' :
                           physicsMode === 'counter' ? 'C' : 'L'}
                        </text>
                      </g>
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePatchBodyPartMaskLayer(handle.part, {
                            visible: !layer.visible,
                          });
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={handle.visibilityX}
                          cy={handle.visibilityY}
                          r={toggleR}
                          fill={layer.visible ? 'rgba(34,197,94,0.85)' : 'rgba(107,114,128,0.85)'}
                          stroke="rgba(15,23,42,0.8)"
                          strokeWidth={1.5 * scaleFactor}
                        />
                        <text
                          x={handle.visibilityX}
                          y={handle.visibilityY + 4 * scaleFactor}
                          textAnchor="middle"
                          fontSize={9 * scaleFactor}
                          fill="rgba(248,250,252,0.95)"
                          fontFamily="monospace"
                        >
                          {layer.visible ? 'V' : 'H'}
                        </text>
                      </g>
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          openBodyPartMaskUpload(handle.part, true);
                        }}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={handle.plusX}
                          cy={handle.plusY}
                          r={toggleR}
                          fill={hasMask ? 'rgba(34,197,94,0.85)' : 'rgba(30,41,59,0.8)'}
                          stroke="rgba(15,23,42,0.8)"
                          strokeWidth={1.5 * scaleFactor}
                        />
                        <text
                          x={handle.plusX}
                          y={handle.plusY + 4 * scaleFactor}
                          textAnchor="middle"
                          fontSize={9 * scaleFactor}
                          fill="rgba(248,250,252,0.95)"
                          fontFamily="monospace"
                        >
                          {hasMask ? '✓' : '+'}
                        </text>
                      </g>
                      <rect
                        x={labelX}
                        y={labelY}
                        width={labelWidth}
                        height={labelHeight}
                        fill="rgba(30,41,59,0.9)"
                        stroke={hasMask ? 'rgba(74, 222, 128, 0.7)' : 'rgba(148, 163, 184, 0.6)'}
                        strokeWidth={1.5 * scaleFactor}
                        rx={4 * scaleFactor}
                      />
                      <text
                        x={labelX + labelWidth / 2}
                        y={labelY + labelHeight / 2 + 4 * scaleFactor}
                        textAnchor="middle"
                        fontSize={10 * scaleFactor}
                        fill="rgba(248,250,252,0.95)"
                        fontFamily="monospace"
                        fontWeight="500"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Pose Data Display - Bottom Right of Canvas */}
      <div className="fixed bottom-4 right-4 bg-mono-darker border border-white/10 rounded p-3 z-[50]">
        <div className="text-white/40 text-[8px] uppercase mb-2">Pose_Data</div>
        <div className="text-white/70 text-[8px] whitespace-pre-wrap break-all h-40 overflow-y-auto custom-scrollbar bg-white/5 p-2 rounded border border-white/10 min-w-[200px] max-w-[300px]">
          {poseToString(activePose)}
        </div>
      </div>
    </div>
  );
};

export default App;
