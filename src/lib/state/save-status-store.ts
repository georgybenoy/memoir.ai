import { create } from 'zustand';
import { nowISO } from '@/lib/utils/clock';
import { type PersistenceMode } from '@/lib/db/probe';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusState {
  status: SaveStatus;
  lastSavedAt: string | null;
  errorMessage: string | null;
  persistenceMode: PersistenceMode;
  localDataNoticeDismissed: boolean;

  setSaving: () => void;
  setSaved: (timestamp?: string) => void;
  setError: (message: string) => void;
  setIdle: () => void;
  setPersistenceMode: (mode: PersistenceMode) => void;
  dismissLocalDataNotice: () => void;
  restoreLocalDataNotice: () => void;
  reset: () => void;
}

export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  status: 'idle',
  lastSavedAt: null,
  errorMessage: null,
  persistenceMode: 'indexeddb',
  localDataNoticeDismissed: false,

  setSaving: () => set({ status: 'saving', errorMessage: null }),
  setSaved: (timestamp = nowISO()) =>
    set({
      status: 'saved',
      lastSavedAt: timestamp,
      errorMessage: null,
    }),
  setError: (message: string) =>
    set({
      status: 'error',
      errorMessage: message,
    }),
  setIdle: () => set({ status: 'idle' }),
  setPersistenceMode: (mode) => set({ persistenceMode: mode }),
  dismissLocalDataNotice: () => set({ localDataNoticeDismissed: true }),
  restoreLocalDataNotice: () => set({ localDataNoticeDismissed: false }),
  reset: () =>
    set({
      status: 'idle',
      lastSavedAt: null,
      errorMessage: null,
      localDataNoticeDismissed: false,
    }),
}));
