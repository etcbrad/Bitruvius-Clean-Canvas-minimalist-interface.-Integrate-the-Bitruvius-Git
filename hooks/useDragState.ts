import { PartName, Vector2D } from '../types';

export type DragState = 
  | { mode: 'idle' }
  | { mode: 'rotate'; part: PartName; startAngle: number; startValue: number }
  | { mode: 'ik'; effector: PartName }
  | { mode: 'crane'; startX: number; startY: number; startRoot: Vector2D }
  | { mode: 'effector'; part: PartName; initialPinnedPos: Vector2D | null };

export interface DragStateActions {
  setDragState: (state: DragState) => void;
  resetDragState: () => void;
  startRotation: (part: PartName, startAngle: number, startValue: number) => void;
  startIK: (effector: PartName) => void;
  startCrane: (startX: number, startY: number, startRoot: Vector2D) => void;
  startEffector: (part: PartName, initialPinnedPos: Vector2D | null) => void;
}

export const useDragState = (): [DragState, DragStateActions] => {
  const initialDragState: DragState = { mode: 'idle' };

  const setDragState = (state: DragState) => {
    // This would be managed by the component using useState
    return state;
  };

  const resetDragState = (): DragState => ({ mode: 'idle' });

  const startRotation = (part: PartName, startAngle: number, startValue: number): DragState => ({
    mode: 'rotate',
    part,
    startAngle,
    startValue,
  });

  const startIK = (effector: PartName): DragState => ({
    mode: 'ik',
    effector,
  });

  const startCrane = (startX: number, startY: number, startRoot: Vector2D): DragState => ({
    mode: 'crane',
    startX,
    startY,
    startRoot,
  });

  const startEffector = (part: PartName, initialPinnedPos: Vector2D | null): DragState => ({
    mode: 'effector',
    part,
    initialPinnedPos,
  });

  const actions: DragStateActions = {
    setDragState,
    resetDragState,
    startRotation,
    startIK,
    startCrane,
    startEffector,
  };

  return [initialDragState, actions];
};

// Helper functions to check drag state
export const isRotating = (state: DragState): state is Extract<DragState, { mode: 'rotate' }> => 
  state.mode === 'rotate';

export const isIKDragging = (state: DragState): state is Extract<DragState, { mode: 'ik' }> => 
  state.mode === 'ik';

export const isCraneDragging = (state: DragState): state is Extract<DragState, { mode: 'crane' }> => 
  state.mode === 'crane';

export const isEffectorDragging = (state: DragState): state is Extract<DragState, { mode: 'effector' }> => 
  state.mode === 'effector';

export const isDragging = (state: DragState): boolean => 
  state.mode !== 'idle';
