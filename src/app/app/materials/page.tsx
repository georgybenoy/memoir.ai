'use client';

import * as React from 'react';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { MaterialsView } from '@/components/materials/materials-view';
import { useWorkspaceStore } from '@/lib/state/workspace-store';

export default function MaterialsPage() {
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  React.useEffect(() => {
    setActiveView('materials');
  }, [setActiveView]);

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-2 sm:py-4">
        <MaterialsView />
      </Container>
    </WorkspaceLayout>
  );
}
