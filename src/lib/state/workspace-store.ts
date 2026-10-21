import { create } from 'zustand';
import { generateId } from '@/lib/utils/id';

export type WorkspaceView =
  'workspace' | 'materials' | 'concepts' | 'recall' | 'review' | 'settings';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
}

export interface WorkspaceState {
  // Navigation & panels
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  activeView: WorkspaceView;
  activeNoteId: string | null;

  // Connectivity
  isOnline: boolean;

  // Toast notifications
  toasts: ToastItem[];

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;
  setActiveView: (view: WorkspaceView) => void;
  setActiveNoteId: (id: string | null) => void;
  setIsOnline: (online: boolean) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sidebarCollapsed: false,
  rightPanelOpen: true,
  activeView: 'workspace',
  activeNoteId: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  toasts: [],

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  setActiveView: (view) => set({ activeView: view }),
  setActiveNoteId: (id) => set({ activeNoteId: id }),

  setIsOnline: (online) => set({ isOnline: online }),

  addToast: (toast) => {
    const id = generateId();
    const item: ToastItem = { ...toast, id, durationMs: toast.durationMs ?? 5000 };
    set((state) => ({ toasts: [...state.toasts, item] }));
    return id;
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),
}));
