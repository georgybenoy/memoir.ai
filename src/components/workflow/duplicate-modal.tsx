'use client';

import * as React from 'react';
import { AlertCircle, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type DuplicateDecision } from '@/features/ingestion/duplicates';
import { formatBytes } from '@/lib/config/ingestion';

export interface DuplicateNoticeModalProps {
  isOpen: boolean;
  decision: DuplicateDecision | null;
  file: File | null;
  onOpenExisting: (existingMaterialId: string) => void;
  onImportSeparate: () => void;
  onReplaceExisting?: (existingMaterialId: string) => void;
  onCancel: () => void;
}

export function DuplicateNoticeModal({
  isOpen,
  decision,
  file,
  onOpenExisting,
  onImportSeparate,
  onReplaceExisting,
  onCancel,
}: DuplicateNoticeModalProps) {
  if (!decision || !file) return null;

  const isExactDuplicate = decision.type === 'EXACT_DUPLICATE';
  const existingDoc = decision.existingDocument;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-w-md bg-[var(--surface)] border-[var(--border-color)] text-[var(--text-primary)]"
        aria-describedby="duplicate-modal-description"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-[var(--warning)]">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">
              {isExactDuplicate ? 'Document Already in Library' : 'Similar Document Found'}
            </DialogTitle>
          </div>
          <DialogDescription id="duplicate-modal-description" className="text-sm text-[var(--text-secondary)] mt-2">
            {isExactDuplicate ? (
              <>
                An identical copy of <strong className="text-[var(--text-primary)]">{file.name}</strong> ({formatBytes(file.size)}) is already stored in your local library.
              </>
            ) : (
              <>
                A document named <strong className="text-[var(--text-primary)]">{file.name}</strong> exists in your library, but its file content differs.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {existingDoc && (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3 text-xs space-y-1.5 my-2">
            <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <FileText className="h-4 w-4 text-[var(--accent-cyan)] shrink-0" aria-hidden="true" />
              <span className="truncate">{existingDoc.filename}</span>
            </div>
            <div className="text-[var(--text-muted)] flex items-center justify-between">
              <span>Size: {formatBytes(existingDoc.fileSize)}</span>
              <span>Added: {new Date(existingDoc.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button variant="ghost" onClick={onCancel} className="text-[var(--text-secondary)]">
            Cancel
          </Button>

          {isExactDuplicate ? (
            <>
              <Button
                variant="secondary"
                onClick={onImportSeparate}
                className="border-[var(--border-color)] text-[var(--text-primary)]"
              >
                Import as Separate
              </Button>
              <Button
                variant="primary"
                onClick={() => existingDoc && onOpenExisting(existingDoc.id)}
                className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Open Existing
              </Button>
            </>
          ) : (
            <>
              {onReplaceExisting && existingDoc && (
                <Button
                  variant="secondary"
                  onClick={() => onReplaceExisting(existingDoc.id)}
                  className="border-[var(--border-color)] text-[var(--text-primary)]"
                >
                  Replace Existing
                </Button>
              )}

              <Button
                variant="primary"
                onClick={onImportSeparate}
                className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
              >
                <ArrowRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Import as New
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
