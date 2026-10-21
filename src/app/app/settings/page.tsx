'use client';

import * as React from 'react';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { SettingsView } from '@/components/settings/settings-view';

export default function AppSettingsPage() {
  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-2 sm:py-4">
        <SettingsView />
      </Container>
    </WorkspaceLayout>
  );
}
