import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicateNoticeModal } from '@/components/workflow/duplicate-modal';
import { type DuplicateDecision } from '@/features/ingestion/duplicates';
import { type DocumentRecord } from '@/types/domain';

describe('DuplicateNoticeModal Component (Phase R3)', () => {
  const mockExistingDoc: DocumentRecord = {
    id: 'mat-existing-1',
    materialId: 'mat-existing-1',
    filename: 'Lecture_Notes.pdf',
    fileType: 'pdf',
    fileSize: 1048576,
    extractedText: 'Existing note text content.',
    analysisStatus: 'completed',
    fileHash: 'sha256-existing-hash',
    contentHash: 'sha256-existing-content',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  };

  const mockFile = new File(['New content sample'], 'Lecture_Notes.pdf', {
    type: 'application/pdf',
  });

  it('renders exact duplicate notice when file hash matches existing document', async () => {
    const handleOpenExisting = vi.fn();
    const handleImportSeparate = vi.fn();
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    const decision: DuplicateDecision = {
      type: 'EXACT_DUPLICATE',
      fileHash: 'sha256-existing-hash',
      existingDocument: mockExistingDoc,
      message: '"Lecture_Notes.pdf" is already in your library.',
      options: [
        { action: 'open_existing', label: 'Open existing material', description: 'View saved material' },
        { action: 'import_copy', label: 'Import as separate copy', description: 'Create copy' },
      ],
    };

    render(
      <DuplicateNoticeModal
        isOpen={true}
        decision={decision}
        file={mockFile}
        onOpenExisting={handleOpenExisting}
        onImportSeparate={handleImportSeparate}
        onCancel={handleCancel}
      />
    );

    // Verify Title and copy
    expect(screen.getByText('Document Already in Library')).toBeInTheDocument();
    expect(screen.getByText(/An identical copy of/i)).toBeInTheDocument();
    expect(screen.getAllByText('Lecture_Notes.pdf').length).toBeGreaterThanOrEqual(1);

    // Verify Action Buttons
    const openBtn = screen.getByRole('button', { name: /Open Existing/i });
    const importBtn = screen.getByRole('button', { name: /Import as Separate/i });
    expect(openBtn).toBeInTheDocument();
    expect(importBtn).toBeInTheDocument();

    await user.click(openBtn);
    expect(handleOpenExisting).toHaveBeenCalledWith('mat-existing-1');

    await user.click(importBtn);
    expect(handleImportSeparate).toHaveBeenCalled();
  });

  it('renders filename collision notice when names match but file bytes differ', async () => {
    const handleOpenExisting = vi.fn();
    const handleImportSeparate = vi.fn();
    const handleReplaceExisting = vi.fn();
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    const decision: DuplicateDecision = {
      type: 'FILENAME_COLLISION',
      fileHash: 'sha256-different-hash',
      existingDocument: mockExistingDoc,
      message: 'A file named "Lecture_Notes.pdf" exists with different content.',
      options: [
        { action: 'import_new', label: 'Import as new material', description: 'Keep both' },
        { action: 'replace_existing', label: 'Replace existing material', description: 'Overwrite' },
      ],
    };

    render(
      <DuplicateNoticeModal
        isOpen={true}
        decision={decision}
        file={mockFile}
        onOpenExisting={handleOpenExisting}
        onImportSeparate={handleImportSeparate}
        onReplaceExisting={handleReplaceExisting}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Similar Document Found')).toBeInTheDocument();
    expect(screen.getByText(/exists in your library, but its file content differs/i)).toBeInTheDocument();

    const replaceBtn = screen.getByRole('button', { name: /Replace Existing/i });
    const importNewBtn = screen.getByRole('button', { name: /Import as New/i });
    expect(replaceBtn).toBeInTheDocument();
    expect(importNewBtn).toBeInTheDocument();

    await user.click(replaceBtn);
    expect(handleReplaceExisting).toHaveBeenCalledWith('mat-existing-1');
  });

  it('does not render when isOpen is false', () => {
    render(
      <DuplicateNoticeModal
        isOpen={false}
        decision={null}
        file={null}
        onOpenExisting={vi.fn()}
        onImportSeparate={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText('Document Already in Library')).not.toBeInTheDocument();
  });
});
