/**
 * Walking Engine Calibration Panel
 * Provides real-time calibration controls for walking parameters
 */

import React, { useState, useCallback } from 'react';
import { WalkingEngineGait } from '../types';
import { 
  WalkingCalibrationProfile, 
  CALIBRATION_PRESETS, 
  DEFAULT_CALIBRATION,
  applyCalibration,
  getCalibrationProfile 
} from '../utils/walkingCalibration';

interface WalkingCalibrationPanelProps {
  currentGait: WalkingEngineGait;
  onGaitChange: (gait: WalkingEngineGait) => void;
  onClose: () => void;
}

export const WalkingCalibrationPanel: React.FC<WalkingCalibrationPanelProps> = ({
  currentGait,
  onGaitChange,
  onClose
}) => {
  const [calibration, setCalibration] = useState<WalkingCalibrationProfile>(DEFAULT_CALIBRATION);
  const [activeTab, setActiveTab] = useState<'presets' | 'manual'>('presets');

  const handlePresetChange = useCallback((presetName: string) => {
    const preset = getCalibrationProfile(presetName);
    setCalibration(preset);
    const newGait = applyCalibration(currentGait, preset);
    onGaitChange(newGait);
  }, [currentGait, onGaitChange]);

  const handleParameterChange = useCallback((parameter: keyof WalkingEngineGait, value: number) => {
    const updatedCalibration = {
      ...calibration,
      gait: {
        ...calibration.gait,
        [parameter]: value
      }
    };
    setCalibration(updatedCalibration);
    const newGait = applyCalibration(currentGait, updatedCalibration);
    onGaitChange(newGait);
  }, [calibration, currentGait, onGaitChange]);

  const ParameterSlider = ({ 
    label, 
    parameter, 
    min, 
    max, 
    step = 0.01,
    value = calibration.gait[parameter as keyof WalkingEngineGait] 
  }: {
    label: string;
    parameter: keyof WalkingEngineGait;
    min: number;
    max: number;
    step?: number;
    value?: number;
  }) => (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-300 mb-1">
        {label}: {value?.toFixed(2)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value || 0}
        onChange={(e) => handleParameterChange(parameter, parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl p-6 max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Walking Engine Calibration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              activeTab === 'presets' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Presets
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              activeTab === 'manual' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Manual Tuning
          </button>
        </div>

        {activeTab === 'presets' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CALIBRATION_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetChange(preset.name)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  calibration.name === preset.name
                    ? 'border-blue-500 bg-blue-600 bg-opacity-20 text-white'
                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                }`}
              >
                <h3 className="font-semibold text-sm mb-1">{preset.name}</h3>
                <p className="text-xs text-gray-400">{preset.description}</p>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="space-y-6">
            {/* Speed & Timing */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">
                Speed & Timing
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParameterSlider
                  label="Frequency (steps/sec)"
                  parameter="frequency"
                  min={0.5}
                  max={3.0}
                  step={0.1}
                />
              </div>
            </div>

            {/* Movement Characteristics */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">
                Movement Characteristics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParameterSlider
                  label="Intensity (energy)"
                  parameter="intensity"
                  min={0.0}
                  max={1.5}
                />
                <ParameterSlider
                  label="Stride Length"
                  parameter="stride"
                  min={0.1}
                  max={1.2}
                />
                <ParameterSlider
                  label="Forward Lean"
                  parameter="lean"
                  min={-0.5}
                  max={0.5}
                />
                <ParameterSlider
                  label="Mood (style)"
                  parameter="mood"
                  min={0.0}
                  max={1.0}
                />
              </div>
            </div>

            {/* Physics & Weight */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">
                Physics & Weight
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParameterSlider
                  label="Gravity Impact"
                  parameter="gravity"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Bounce Height"
                  parameter="bounce"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Ground Drag"
                  parameter="ground_drag"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Body Bending"
                  parameter="bends"
                  min={0.0}
                  max={1.5}
                />
              </div>
            </div>

            {/* Arm Movement */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">
                Arm Movement
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParameterSlider
                  label="Arm Swing"
                  parameter="arm_swing"
                  min={0.0}
                  max={1.5}
                />
                <ParameterSlider
                  label="Elbow Bend"
                  parameter="elbow_bend"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Wrist Swing"
                  parameter="wrist_swing"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Head Spin"
                  parameter="head_spin"
                  min={0.0}
                  max={0.5}
                />
              </div>
            </div>

            {/* Leg & Foot Details */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 border-b border-gray-600 pb-2">
                Leg & Foot Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ParameterSlider
                  label="Foot Ground Angle"
                  parameter="foot_angle_on_ground"
                  min={-10}
                  max={10}
                />
                <ParameterSlider
                  label="Foot Roll"
                  parameter="foot_roll"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Toe Lift"
                  parameter="toe_lift"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Shin Tilt"
                  parameter="shin_tilt"
                  min={-0.5}
                  max={0.5}
                />
                <ParameterSlider
                  label="Foot Slide"
                  parameter="foot_slide"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Kick Up Force"
                  parameter="kick_up_force"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Hover Height"
                  parameter="hover_height"
                  min={0.0}
                  max={0.5}
                />
                <ParameterSlider
                  label="Waist Twist"
                  parameter="waist_twist"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Hip Sway"
                  parameter="hip_sway"
                  min={0.0}
                  max={1.0}
                />
                <ParameterSlider
                  label="Toe Bend"
                  parameter="toe_bend"
                  min={0.0}
                  max={1.0}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-600">
          <button
            onClick={() => {
              setCalibration(DEFAULT_CALIBRATION);
              onGaitChange(currentGait);
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
