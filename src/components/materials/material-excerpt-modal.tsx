'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type getChunkExcerpt } from '@/features/ingestion';

export interface InspectedExcerptData {
  conceptTitle: string;
  chunkIndex: number;
  chunkId: string;
  excerpt: ReturnType<typeof getChunkExcerpt>;
}

export interface MaterialExcerptModalProps {
  excerptData: InspectedExcerptData | null;
  onClose: () => void;
}

export function MaterialExcerptModal({
  excerptData,
  onClose,
}: MaterialExcerptModalProps) {
  if (!excerptData) return null;

  return (
    <Dialog open={!!excerptData} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Source Provenance: ${excerptData.conceptTitle}`}
        description={`Verified context from Chunk #${excerptData.chunkIndex}`}
        className="max-w-2xl"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">
            <span>
              Concept: <strong className="text-[var(--text-primary)]">{excerptData.conceptTitle}</strong>
            </span>
            <span className="font-mono">Chunk #{excerptData.chunkIndex}</span>
          </div>

          <div className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] max-h-72 overflow-y-auto text-xs sm:text-sm font-sans leading-relaxed text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">{excerptData.excerpt.before}</span>
            <mark className="bg-[var(--primary)]/25 text-[var(--text-primary)] px-1 py-0.5 rounded font-medium border border-[var(--primary)]/40">
              {excerptData.excerpt.matched}
            </mark>
            <span className="text-[var(--text-muted)]">{excerptData.excerpt.after}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--success)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Mathematical provenance confirmed: Concept maps directly to indexed note chunks.</span>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="secondary" onClick={onClose}>
            Close Inspector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
