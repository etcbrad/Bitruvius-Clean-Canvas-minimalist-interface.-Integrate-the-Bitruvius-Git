import { useState, useCallback } from 'react';

export interface PanelRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

export interface PanelState {
  panelRects: Record<string, PanelRect>;
  panelZIndices: Record<string, number>;
  expandedSections: Record<string, boolean>;
  highestZIndex: number;
}

export interface PanelActions {
  updatePanelRect: (id: string, rect: Partial<PanelRect>) => void;
  minimizePanel: (id: string) => void;
  maximizePanel: (id: string) => void;
  bringToFront: (id: string) => void;
  toggleSection: (panelId: string, sectionId: string) => void;
}

export const usePanel = (): [PanelState, PanelActions] => {
  const [panelRects, setPanelRects] = useState<Record<string, PanelRect>>(() => ({
    'controls': { id: 'controls', x: 20, y: 20, width: 280, height: 600, minimized: false },
    'animation': { id: 'animation', x: 320, y: 20, width: 280, height: 400, minimized: false },
    'poses': { id: 'poses', x: 620, y: 20, width: 280, height: 500, minimized: false },
  }));

  const [panelZIndices, setPanelZIndices] = useState<Record<string, number>>(() => ({
    'controls': 1,
    'animation': 1,
    'poses': 1,
  }));

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => ({
    'controls-basic': true,
    'controls-advanced': false,
    'animation-timeline': true,
    'animation-keyframes': true,
    'poses-library': true,
    'poses-saved': true,
  }));

  const [highestZIndex, setHighestZIndex] = useState(1);

  const updatePanelRect = useCallback((id: string, rect: Partial<PanelRect>) => {
    setPanelRects(prev => ({
      ...prev,
      [id]: { ...prev[id], ...rect }
    }));
  }, []);

  const minimizePanel = useCallback((id: string) => {
    updatePanelRect(id, { minimized: true });
  }, [updatePanelRect]);

  const maximizePanel = useCallback((id: string) => {
    updatePanelRect(id, { minimized: false });
  }, [updatePanelRect]);

  const bringToFront = useCallback((id: string) => {
    const newZIndex = highestZIndex + 1;
    setPanelZIndices(prev => ({
      ...prev,
      [id]: newZIndex
    }));
    setHighestZIndex(newZIndex);
  }, [highestZIndex]);

  const toggleSection = useCallback((panelId: string, sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }, []);

  const state: PanelState = {
    panelRects,
    panelZIndices,
    expandedSections,
    highestZIndex,
  };

  const actions: PanelActions = {
    updatePanelRect,
    minimizePanel,
    maximizePanel,
    bringToFront,
    toggleSection,
  };

  return [state, actions];
};
