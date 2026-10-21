'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Network,
  Brain,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspaceStore, type WorkspaceView } from '@/lib/state/workspace-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  id: WorkspaceView;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: 'workspace', label: 'Workspace', icon: LayoutDashboard },
  { id: 'materials', label: 'Study Materials', icon: BookOpen },
  { id: 'concepts', label: 'Concept Map', icon: Network },
  { id: 'recall', label: 'Recall Practice', icon: Brain },
  { id: 'review', label: 'Spaced Review', icon: Clock },
  { id: 'settings', label: 'Data & Settings', icon: Settings },
];

export interface WorkspaceSidebarProps {
  className?: string;
  isMobileDrawer?: boolean;
  onMobileItemClick?: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  className,
  isMobileDrawer = false,
  onMobileItemClick,
}) => {
  const { sidebarCollapsed, toggleSidebar, activeView, setActiveView } = useWorkspaceStore();
  const isCollapsed = !isMobileDrawer && sidebarCollapsed;

  const handleSelect = (view: WorkspaceView) => {
    setActiveView(view);
    onMobileItemClick?.();
  };

  return (
    <aside
      aria-label="Navigation sidebar"
      className={cn(
        'flex flex-col border-r border-[var(--border-color)] bg-[var(--surface)] transition-all duration-200 select-none',
        isCollapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {/* Nav items list */}
      <nav aria-label="Workspace navigation" className="flex-1 space-y-1 p-2 sm:p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                isActive
                  ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] font-semibold border-l-2 border-[var(--primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors',
                  isActive
                    ? 'text-[var(--primary-hover)]'
                    : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]',
                )}
                aria-hidden="true"
              />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {!isMobileDrawer && (
        <div className="border-t border-[var(--border-color)] p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'w-full justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              !isCollapsed && 'justify-between px-3',
            )}
          >
            {!isCollapsed && <span className="text-xs">Collapse sidebar</span>}
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      )}
    </aside>
  );
};
