import { create } from 'zustand';
import { SampledGridResult, generateDemoGrid } from '@/lib/demoGenerator';
import { persistCreation } from '@/lib/storage';

export type AppMode = 'landing' | 'select' | 'upload' | 'draw' | 'type' | 'canvas';

/** Options for setGridData. */
interface SetGridDataOptions {
  /**
   * Whether to write the grid to local storage. Restored creations (resume,
   * local gallery, shared challenges) pass false — they are already persisted,
   * and re-saving them would append a duplicate gallery entry every time one is
   * opened.
   */
  persist?: boolean;
}

interface AppState {
  mode: AppMode;
  gridData: SampledGridResult;
  isDisturbed: boolean;
  username: string | null;
  isAdmin: boolean;
  hasPromptedResume: boolean;

  setMode: (mode: AppMode) => void;
  setGridData: (gridData: SampledGridResult, sourceMode?: string, options?: SetGridDataOptions) => void;
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

  setGridData: (gridData, sourceMode, options) => {
    const modeName = sourceMode || get().mode;
    set({
      gridData,
      mode: 'canvas',
      isDisturbed: false,
    });

    const shouldPersist = options?.persist !== false && sourceMode !== 'challenge';

    // Auto-save creation & add to local gallery history. Encoding the artwork
    // texture is async, so this is deliberately fire-and-forget — a storage
    // failure must never block the canvas from showing.
    if (typeof window !== 'undefined' && shouldPersist) {
      persistCreation(gridData, modeName).catch((err) => {
        console.warn('Failed to persist creation locally:', err);
      });
    }
  },

  // Called from the render loop every frame, so bail out when nothing changed
  // rather than allocating a new state object and waking every subscriber 60
  // times a second.
  setIsDisturbed: (isDisturbed) => {
    if (get().isDisturbed === isDisturbed) return;
    set({ isDisturbed });
  },

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
