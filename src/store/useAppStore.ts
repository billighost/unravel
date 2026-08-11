import { create } from 'zustand';
import { SampledGridResult, generateDemoGrid } from '@/lib/demoGenerator';
import { saveLastCreation, addGalleryItem, generateThumbnailDataUrl } from '@/lib/storage';

export type AppMode = 'landing' | 'select' | 'upload' | 'draw' | 'type' | 'canvas';

interface AppState {
  mode: AppMode;
  gridData: SampledGridResult;
  isDisturbed: boolean;
  username: string | null;
  isAdmin: boolean;
  hasPromptedResume: boolean;
  
  setMode: (mode: AppMode) => void;
  setGridData: (gridData: SampledGridResult, sourceMode?: string) => void;
  setIsDisturbed: (isDisturbed: boolean) => void;
  resetToDemo: () => void;
  setUsername: (username: string | null) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setHasPromptedResume: (prompted: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'landing',
  gridData: generateDemoGrid(),
  isDisturbed: false,
  username: null,
  isAdmin: false,
  hasPromptedResume: false,

  setMode: (mode) => set({ mode }),
  
  setGridData: (gridData, sourceMode) => {
    const modeName = sourceMode || get().mode;
    set({
      gridData,
      mode: 'canvas',
      isDisturbed: false,
    });

    // Auto-save creation & add to local gallery history
    if (typeof window !== 'undefined' && sourceMode !== 'challenge') {
      const timestamp = Date.now();
      saveLastCreation({
        gridData,
        mode: modeName,
        timestamp,
      });

      const thumbnail = generateThumbnailDataUrl(gridData);
      addGalleryItem({
        gridData,
        mode: modeName,
        timestamp,
        thumbnail,
      });
    }
  },

  setIsDisturbed: (isDisturbed) => set({ isDisturbed }),

  resetToDemo: () =>
    set({
      mode: 'landing',
      gridData: generateDemoGrid(),
      isDisturbed: false,
    }),

  setUsername: (username) => set({ username }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setHasPromptedResume: (hasPromptedResume) => set({ hasPromptedResume }),
}));
