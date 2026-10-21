import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '@/lib/state/workspace-store';

describe('Workspace Store (Zustand)', () => {
  beforeEach(() => {
    // Reset store state
    useWorkspaceStore.setState({
      sidebarCollapsed: false,
      rightPanelOpen: true,
      activeView: 'workspace',
      activeNoteId: null,
      isOnline: true,
      toasts: [],
    });
  });

  it('toggles sidebar collapse state', () => {
    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);

    useWorkspaceStore.getState().toggleSidebar();
    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);

    useWorkspaceStore.getState().toggleSidebar();
    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(false);

    useWorkspaceStore.getState().setSidebarCollapsed(true);
    expect(useWorkspaceStore.getState().sidebarCollapsed).toBe(true);
  });

  it('toggles right panel visibility', () => {
    expect(useWorkspaceStore.getState().rightPanelOpen).toBe(true);

    useWorkspaceStore.getState().toggleRightPanel();
    expect(useWorkspaceStore.getState().rightPanelOpen).toBe(false);

    useWorkspaceStore.getState().setRightPanelOpen(true);
    expect(useWorkspaceStore.getState().rightPanelOpen).toBe(true);
  });

  it('updates active view and note ID', () => {
    useWorkspaceStore.getState().setActiveView('materials');
    expect(useWorkspaceStore.getState().activeView).toBe('materials');

    useWorkspaceStore.getState().setActiveNoteId('doc-123');
    expect(useWorkspaceStore.getState().activeNoteId).toBe('doc-123');
  });

  it('updates online status', () => {
    useWorkspaceStore.getState().setIsOnline(false);
    expect(useWorkspaceStore.getState().isOnline).toBe(false);

    useWorkspaceStore.getState().setIsOnline(true);
    expect(useWorkspaceStore.getState().isOnline).toBe(true);
  });

  it('manages toast queue correctly (add, dismiss, clear)', () => {
    const id1 = useWorkspaceStore.getState().addToast({
      type: 'info',
      title: 'Info Notice',
      description: 'Detail',
    });

    const id2 = useWorkspaceStore.getState().addToast({
      type: 'success',
      title: 'Saved Successfully',
    });

    const currentToasts = useWorkspaceStore.getState().toasts;
    expect(currentToasts).toHaveLength(2);
    expect(currentToasts[0].id).toBe(id1);
    expect(currentToasts[1].id).toBe(id2);

    // Dismiss one
    useWorkspaceStore.getState().dismissToast(id1);
    expect(useWorkspaceStore.getState().toasts).toHaveLength(1);
    expect(useWorkspaceStore.getState().toasts[0].id).toBe(id2);

    // Clear all
    useWorkspaceStore.getState().clearToasts();
    expect(useWorkspaceStore.getState().toasts).toHaveLength(0);
  });
});
