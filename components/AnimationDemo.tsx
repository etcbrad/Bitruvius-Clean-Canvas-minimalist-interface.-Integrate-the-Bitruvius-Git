import React from 'react';
import { useAnimation } from '../hooks/useAnimation';
import MinimalistTimeline from '../components/MinimalistTimeline';
import { Pose } from '../types';

// ============================================================================
// ANIMATION DEMO COMPONENT - Shows clean integration
// ============================================================================

interface AnimationDemoProps {
  currentPose: Pose;
  onPoseUpdate: (pose: Pose) => void;
}

const AnimationDemo: React.FC<AnimationDemoProps> = ({ currentPose, onPoseUpdate }) => {
  // Clean handshake - pure engine + React state
  const [animationState, animationActions] = useAnimation(currentPose);

  // ============================================================================
  // DEMO CONTROLS - Clean UI logic
  // ============================================================================

  const handleCreateDemoClip = () => {
    animationActions.createClip('Demo Animation');
    
    // Add some demo frames
    setTimeout(() => {
      animationActions.addFrame(currentPose, 0, { label: 'Start' });
    }, 100);

    setTimeout(() => {
      // Create a modified pose for demo
      const modifiedPose = {
        ...currentPose,
        lShoulder: currentPose.lShoulder + 45,
        rShoulder: currentPose.rShoulder - 45
      };
      animationActions.addFrame(modifiedPose, 1000, { label: 'Arms Up' });
    }, 200);

    setTimeout(() => {
      // Create another pose
      const modifiedPose = {
        ...currentPose,
        lShoulder: currentPose.lShoulder - 30,
        rShoulder: currentPose.rShoulder + 30
      };
      animationActions.addFrame(modifiedPose, 2000, { label: 'Arms Down' });
    }, 300);

    setTimeout(() => {
      // Create a group
      if (animationState.currentClip) {
        animationActions.createGroup(
          'Arm Movement',
          0,
          2000,
          { 
            color: '#8B7EC1', 
            description: 'Basic arm raising and lowering',
            tags: ['arms', 'basic']
          }
        );
      }
    }, 400);
  };

  const handleAddCurrentFrame = () => {
    if (!animationState.currentClip) {
      handleCreateDemoClip();
      return;
    }

    const timestamp = animationState.currentTime || animationState.currentClip.totalDuration;
    animationActions.addFrame(currentPose, timestamp, { 
      label: `Frame ${animationState.currentClip.frames.length + 1}` 
    });
  };

  const handleCreateGroup = () => {
    if (!animationState.currentClip) return;

    const startTime = Math.max(0, animationState.currentTime - 500);
    const endTime = Math.min(animationState.currentClip.totalDuration, animationState.currentTime + 500);

    animationActions.createGroup(
      `Group ${animationState.currentClip.groups.length + 1}`,
      startTime,
      endTime,
      { color: '#A3E635' }
    );
  };

  // ============================================================================
  // RENDER - Clean UI with no business logic
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Animation Controls */}
      <div className="bg-mono-darker border border-white/10 rounded-lg p-4">
        <h3 className="text-white/70 text-sm font-bold mb-3">Animation Controls</h3>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {!animationState.currentClip ? (
            <button
              onClick={handleCreateDemoClip}
              className="px-3 py-1 bg-accent-purple/30 border border-accent-purple text-white text-sm rounded hover:bg-accent-purple/50 transition-colors"
            >
              Create Demo Clip
            </button>
          ) : (
            <>
              <button
                onClick={animationState.isActive ? animationActions.pause : animationActions.play}
                className={`px-3 py-1 border text-sm rounded transition-colors ${
                  animationState.isActive 
                    ? 'bg-accent-red/30 border-accent-red text-white hover:bg-accent-red/50'
                    : 'bg-accent-green/30 border-accent-green text-white hover:bg-accent-green/50'
                }`}
              >
                {animationState.isActive ? 'Pause' : 'Play'}
              </button>
              
              <button
                onClick={animationActions.stop}
                className="px-3 py-1 bg-white/10 border border-white/20 text-white text-sm rounded hover:bg-white/20 transition-colors"
              >
                Stop
              </button>
              
              <button
                onClick={() => animationActions.toggleLoop()}
                className={`px-3 py-1 border text-sm rounded transition-colors ${
                  animationState.isLooping
                    ? 'bg-accent-purple/30 border-accent-purple text-white'
                    : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
                }`}
              >
                {animationState.isLooping ? 'Looping' : 'No Loop'}
              </button>
              
              <button
                onClick={handleAddCurrentFrame}
                className="px-3 py-1 bg-white/10 border border-white/20 text-white text-sm rounded hover:bg-white/20 transition-colors"
              >
                Add Frame
              </button>
              
              <button
                onClick={handleCreateGroup}
                className="px-3 py-1 bg-white/10 border border-white/20 text-white text-sm rounded hover:bg-white/20 transition-colors"
              >
                Create Group
              </button>
            </>
          )}
        </div>

        {/* Speed Control */}
        {animationState.currentClip && (
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-sm">Speed:</span>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={animationState.playbackSpeed}
              onChange={(e) => animationActions.setSpeed(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="text-white/70 text-sm font-mono">
              {animationState.playbackSpeed.toFixed(1)}x
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <MinimalistTimeline
        clip={animationState.currentClip}
        currentTime={animationState.currentTime}
        isActive={animationState.isActive}
        onTimeChange={animationActions.setTime}
        className="w-full"
      />

      {/* Current Frame Info */}
      {animationState.currentFrame && (
        <div className="bg-mono-darker border border-white/10 rounded-lg p-4">
          <h3 className="text-white/70 text-sm font-bold mb-2">Current Frame</h3>
          <div className="text-white/50 text-sm font-mono">
            {animationState.currentFrame.metadata?.label || 'Unnamed Frame'} @ {Math.floor(animationState.currentTime / 1000)}s
          </div>
          {animationState.activeGroups.length > 0 && (
            <div className="mt-2">
              <span className="text-white/50 text-sm">Active Groups: </span>
              {animationState.activeGroups.map(group => (
                <span 
                  key={group.id} 
                  className="inline-block px-2 py-1 text-xs rounded mr-1"
                  style={{ 
                    backgroundColor: group.color || 'rgba(168, 85, 247, 0.3)',
                    border: `1px solid ${group.color || 'rgba(168, 85, 247, 0.6)'}`
                  }}
                >
                  {group.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnimationDemo;
