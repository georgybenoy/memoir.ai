'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type DocumentRecord } from '@/types/domain';
import { type DeleteMaterialCascadeSummary } from '@/features/learning-units/reprocess-replace';

export interface MaterialDeleteModalProps {
  isOpen: boolean;
  doc: DocumentRecord | null;
  summary: DeleteMaterialCascadeSummary | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function MaterialDeleteModal({
  isOpen,
  doc,
  summary,
  isDeleting,
  onConfirm,
  onClose,
}: MaterialDeleteModalProps) {
  if (!doc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Delete "${doc.filename}"?`}
        description="This action removes this material and its dependent data from your device."
        className="max-w-lg"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 text-xs text-[var(--danger)]">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Local Deletion Invariant</p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Deleting this material will cleanly cascade across all local database stores. All
                dependent learning records will be removed.
              </p>
            </div>
          </div>

          {summary && (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3 text-xs space-y-1.5">
              <p className="font-semibold text-[var(--text-primary)]">Cascade Summary:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)]">
                <li>{summary.chunkCount} document chunk(s)</li>
                <li>{summary.conceptCount} concept(s)</li>
                <li>{summary.unitCount} learning unit(s)</li>
                <li>{summary.questionCount} recall question(s)</li>
                <li>{summary.attemptCount} study attempt(s)</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
