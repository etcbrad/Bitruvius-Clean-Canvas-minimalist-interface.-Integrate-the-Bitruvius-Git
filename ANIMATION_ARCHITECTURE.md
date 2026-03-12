# 🎬 Clean Animation System Architecture

## 📋 Overview

A clean, separated animation system with minimal coupling between pure logic and React UI components.

## 🏗️ Architecture Layers

### **1. Data Layer (`utils/animationEngine.ts`)**
**Pure data structures - no UI dependencies**

```typescript
interface AnimationFrame {
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

interface ActionGroup {
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

interface AnimationClip {
  id: string;
  name: string;
  frames: AnimationFrame[];
  groups: ActionGroup[];
  totalDuration: number;
  loop: boolean;
  created: number;
  modified: number;
}
```

### **2. Engine Layer (`utils/animationEngine.ts`)**
**Pure animation logic - no React dependencies**

```typescript
class AnimationEngine {
  // Pure pose interpolation
  interpolatePose(from: Pose, to: Pose, progress: number, easing?: EasingFunction): Pose
  
  // Timing calculation  
  calculateProgress(currentTime: number, clip: AnimationClip): number
  
  // Frame resolution
  getCurrentFrame(clip: AnimationClip, time: number): AnimationFrame | null
  
  // Group management
  getActiveGroups(clip: AnimationClip, time: number): ActionGroup[]
  createActionGroup(clip: AnimationClip, name: string, startTime: number, endTime: number): ActionGroup
}
```

### **3. State Management Layer (`hooks/useAnimation.ts`)**
**Clean handshake between pure engine and React state**

```typescript
const [animationState, animationActions] = useAnimation(initialPose);

// Pure state - no business logic
interface AnimationState {
  currentClip: AnimationClip | null;
  currentTime: number;
  isActive: boolean;
  currentFrame: AnimationFrame | null;
  activeGroups: ActionGroup[];
  playbackSpeed: number;
  isLooping: boolean;
}

// Clean actions - pure UI logic only
interface AnimationActions {
  createClip: (name: string) => void;
  loadClip: (clip: AnimationClip) => void;
  addFrame: (pose: Pose, timestamp?: number, metadata?: AnimationFrame['metadata']) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setTime: (time: number) => void;
  createGroup: (name: string, startTime: number, endTime: number) => void;
  // ... more actions
}
```

### **4. UI Layer (`components/MinimalistTimeline.tsx`)**
**Pure presentation - no business logic**

```typescript
<MinimalistTimeline
  clip={animationState.currentClip}
  currentTime={animationState.currentTime}
  isActive={animationState.isActive}
  onTimeChange={animationActions.setTime}
  onGroupSelect={handleGroupSelect}
  onFrameSelect={handleFrameSelect}
/>
```

## 🎯 Key Benefits

### **✅ Clean Separation**
- **Engine**: Pure functions, no dependencies
- **State**: React bridge, no business logic
- **UI**: Pure presentation, no calculations

### **✅ Minimal Coupling**
- Engine can be used outside React
- State layer is thin and focused
- UI components are reusable

### **✅ Easy Testing**
- Engine: Pure function tests
- State: Hook testing with React Testing Library
- UI: Component rendering tests

### **✅ Action Groups**
- Group related frames
- Visual timeline representation
- Metadata and tagging support
- Color coding for organization

## 🚀 Usage Example

```typescript
// In your component
const MyAnimationComponent = ({ currentPose, onPoseUpdate }) => {
  const [animationState, animationActions] = useAnimation(currentPose);

  // Create a new animation
  const handleCreateAnimation = () => {
    animationActions.createClip('My Animation');
    animationActions.addFrame(currentPose, 0, { label: 'Start' });
    animationActions.addFrame(modifiedPose, 1000, { label: 'End' });
    
    // Group the frames
    animationActions.createGroup('Main Action', 0, 1000, {
      color: '#8B7EC1',
      description: 'Primary movement sequence'
    });
  };

  return (
    <div>
      <button onClick={animationActions.play}>Play</button>
      <MinimalistTimeline
        clip={animationState.currentClip}
        currentTime={animationState.currentTime}
        isActive={animationState.isActive}
        onTimeChange={animationActions.setTime}
      />
    </div>
  );
};
```

## 🔄 Migration Path

### **From Legacy System:**
1. **Keep existing `useSequence`** for backward compatibility
2. **Gradually adopt `useAnimation`** for new features
3. **Migrate existing clips** using conversion utilities:
   ```typescript
   import { poseSlotToAnimationFrame } from './utils/animationEngine';
   ```

### **Integration Strategy:**
- Use both systems in parallel during transition
- Share the same `Pose` type
- Convert between formats as needed

## 📁 File Structure

```
utils/
├── animationEngine.ts     # Pure engine + data types
├── sequenceEngine.ts      # Legacy system (keep for now)

hooks/
├── useAnimation.ts        # New clean hook
├── useSequence.ts         # Legacy hook (keep for now)

components/
├── MinimalistTimeline.tsx # New grouped timeline
├── EnhancedTimeline.tsx   # Legacy timeline (keep for now)
├── AnimationDemo.tsx      # Integration example
```

## 🎨 Minimalist Timeline Features

- **Action Groups**: Visual colored blocks
- **Frame Markers**: Precise timing indicators
- **Current Time**: Animated position indicator
- **Interactive**: Click to seek, select groups/frames
- **Responsive**: Adapts to container width
- **Clean UI**: Minimal, distraction-free design

## 🔧 Extending the System

### **Adding New Easing Functions:**
```typescript
// In animationEngine.ts
private applyEasing(t: number, easing: EasingFunction): number {
  const easingFunctions = {
    // ... existing functions
    'custom-bounce': (t: number) => {
      // Your custom easing logic
    }
  };
}
```

### **Adding New Group Features:**
```typescript
// Extend ActionGroup interface
interface ActionGroup {
  // ... existing properties
  priority?: number;
  dependencies?: string[]; // group IDs
  automation?: {
    autoRepeat?: boolean;
    repeatCount?: number;
  };
}
```

### **Custom Timeline Components:**
```typescript
// Build on top of the clean engine
const CustomTimeline = ({ clip, currentTime, onTimeChange }) => {
  // Your custom visualization logic
  // Use engine.getCurrentFrame() for calculations
  // Keep UI logic separate from engine
};
```

## 🧪 Testing Strategy

### **Engine Tests:**
```typescript
describe('AnimationEngine', () => {
  it('should interpolate poses correctly', () => {
    const engine = new AnimationEngine();
    const result = engine.interpolatePose(poseA, poseB, 0.5);
    expect(result).toEqual(expectedPose);
  });
});
```

### **Hook Tests:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useAnimation } from './useAnimation';

describe('useAnimation', () => {
  it('should create clip and add frames', () => {
    const { result } = renderHook(() => useAnimation());
    act(() => {
      result.current[1].createClip('Test');
    });
    expect(result.current[0].currentClip?.name).toBe('Test');
  });
});
```

This architecture provides a clean foundation for animation features while maintaining separation of concerns and testability.
