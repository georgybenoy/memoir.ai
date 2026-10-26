'use client';

import * as React from 'react';
import {
  BookOpen,
  Network,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspaceStore, type WorkspaceView } from '@/lib/state/workspace-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useRouter, usePathname } from 'next/navigation';
import { useReviewStore } from '@/lib/state/review-store';
import { getStorage } from '@/lib/db/bootstrap';
import { deriveStepForMaterial } from '@/features/workflow/step-guard';

interface NavItem {
  id: WorkspaceView;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: 'workspace', label: 'Home / My Materials', icon: BookOpen },
  { id: 'concepts', label: 'Concept Map', icon: Network },
  { id: 'progress', label: 'Progress & History', icon: BarChart3 },
  { id: 'settings', label: 'Data & Settings', icon: Settings },
];

export interface WorkspaceSidebarProps {
  className?: string;
  isMobileDrawer?: boolean;
  onMobileItemClick?: () => void;
}

const routeMap: Record<string, string> = {
  workspace: '/learn',
  materials: '/learn',
  concepts: '/app/path',
  recall: '/learn',
  review: '/learn',
  progress: '/app/progress',
  settings: '/app/settings',
};

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  className,
  isMobileDrawer = false,
  onMobileItemClick,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, setActiveView } = useWorkspaceStore();
  const totalDueCount = useReviewStore((state) => state.totalDueCount);
  const isCollapsed = !isMobileDrawer && sidebarCollapsed;

  const handleSelect = (view: WorkspaceView) => {
    setActiveView(view);
    onMobileItemClick?.();
    const targetRoute = routeMap[view];
    if (targetRoute && pathname !== targetRoute) {
      router.push(targetRoute);
    }
  };

  const handleStartLearning = async () => {
    onMobileItemClick?.();
    try {
      const repos = getStorage();
      const docs = await repos.documents.list();
      if (docs.length > 0) {
        // Derive step for the latest material
        const dest = await deriveStepForMaterial(docs[0].id, repos);
        router.push(dest.route);
      } else {
        router.push('/learn/new');
      }
    } catch {
      router.push('/learn/new');
    }
  };

  return (
    <aside
      aria-label="Navigation sidebar"
      className={cn(
        'flex flex-col border-r border-[var(--border-color)] bg-[var(--surface)] transition-all duration-200 select-none',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Primary Action: Start Learning */}
      <div className="p-2 sm:p-3 pb-1 border-b border-[var(--border-color)]/60">
        <Button
          variant="primary"
          onClick={handleStartLearning}
          className={cn(
            'w-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] font-semibold shadow-sm transition-all',
            isCollapsed ? 'p-2 justify-center' : 'px-3 py-2.5 justify-start gap-2.5'
          )}
          title={isCollapsed ? 'Start Learning' : undefined}
          aria-label="Start Learning"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
          {!isCollapsed && <span className="truncate">Start Learning</span>}
        </Button>
      </div>

      {/* Nav items list */}
      <nav aria-label="Workspace navigation" className="flex-1 space-y-1 p-2 sm:p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const targetRoute = routeMap[item.id];
          const isActive =
            pathname === targetRoute ||
            (item.id === 'workspace' && (pathname === '/learn' || pathname === '/app'));

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
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors',
                  isActive
                    ? 'text-[var(--primary-hover)]'
                    : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                )}
                aria-hidden="true"
              />
              {!isCollapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {item.id === 'workspace' && totalDueCount > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30">
                      {totalDueCount} due
                    </span>
                  )}
                </>
              )}
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
              !isCollapsed && 'justify-between px-3'
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
