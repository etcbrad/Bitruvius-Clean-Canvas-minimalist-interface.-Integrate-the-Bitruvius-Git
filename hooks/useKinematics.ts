import { useState, useCallback, useEffect } from 'react';
import { Pose, PartName, AnchorName, JointConstraint, KinematicMode, Vector2D } from '../types';
import { getJointPositions } from '../utils/kinematics';

export interface KinematicsState {
  kinematicMode: KinematicMode;
  activePins: AnchorName[];
  pinnedState: Record<string, Vector2D>;
  jointModes: Record<PartName, JointConstraint>;
}

export interface KinematicsActions {
  setKinematicMode: (mode: KinematicMode) => void;
  setActivePins: (pins: AnchorName[]) => void;
  setPinnedState: (state: Record<string, Vector2D>) => void;
  setJointModes: (modes: Record<PartName, JointConstraint>) => void;
  cycleKinematicMode: () => void;
  updatePinnedState: (pins: AnchorName[], pose: Pose) => void;
  toggleJointMode: (part: PartName) => void;
}

export const useKinematics = (initialPose: Pose): [KinematicsState, KinematicsActions] => {
  const [kinematicMode, setKinematicMode] = useState<KinematicMode>('fk');
  const [activePins, setActivePins] = useState<AnchorName[]>([PartName.Waist]);
  const [pinnedState, setPinnedState] = useState<Record<string, Vector2D>>({});
  const [jointModes, setJointModes] = useState<Record<PartName, JointConstraint>>(() => 
    Object.values(PartName).reduce((acc, name) => ({ ...acc, [name]: 'fk' }), {} as Record<PartName, JointConstraint>)
  );

  const cycleKinematicMode = useCallback(() => {
    setKinematicMode(prev => {
      if (prev === 'fk') return 'ik';
      if (prev === 'ik') return 'fabrik';
      return 'fk';
    });
  }, []);

  const updatePinnedState = useCallback((pins: AnchorName[], pose: Pose) => {
    const joints = getJointPositions(pose, pins);
    const newState: Record<string, Vector2D> = {};
    pins.forEach(p => {
      newState[p] = joints[p];
    });
    setPinnedState(newState);
  }, []);

  const toggleJointMode = useCallback((part: PartName) => {
    setJointModes(prev => {
      const currentMode = prev[part];
      let nextMode: JointConstraint;
      if (currentMode === 'fk') {
        nextMode = 'stretch';
      } else if (currentMode === 'stretch') {
        nextMode = 'curl';
      } else {
        nextMode = 'fk';
      }
      return { ...prev, [part]: nextMode };
    });
  }, []);

  // Sync pinnedState when activePins or pose changes
  useEffect(() => {
    updatePinnedState(activePins, initialPose);
  }, [activePins, initialPose, updatePinnedState]);

  const state: KinematicsState = {
    kinematicMode,
    activePins,
    pinnedState,
    jointModes,
  };

  const actions: KinematicsActions = {
    setKinematicMode,
    setActivePins,
    setPinnedState,
    setJointModes,
    cycleKinematicMode,
    updatePinnedState,
    toggleJointMode,
  };

  return [state, actions];
};
