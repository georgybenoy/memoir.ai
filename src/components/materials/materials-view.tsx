'use client';

import * as React from 'react';
import {
  FileUp,
  FileText,
  Trash2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Info,
  X,
  Loader2,
  RotateCw,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { MAX_UPLOAD_BYTES, formatBytes } from '@/lib/config/ingestion';
import { cn } from '@/lib/utils/cn';

import { useMaterialsManager } from './use-materials-manager';
import { MaterialDetailTabs } from './material-detail-tabs';
import { MaterialDeleteModal } from './material-delete-modal';
import { MaterialExcerptModal } from './material-excerpt-modal';
import { DuplicateNoticeModal } from '@/components/workflow/duplicate-modal';

export function MaterialsView() {
  const { setActiveView } = useWorkspaceStore();

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    documents,
    loadingDocs,
    selectedDoc,
    selectedDocChunks,
    selectedDocUnits,
    extractedConcepts,
    loadingChunks,
    previewTab,
    setPreviewTab,
    processingRecords,
    duplicateModal,
    setDuplicateModal,
    isAnalyzing,
    analysisProgress,
    analysisError,
    setAnalysisError,
    inspectedExcerpt,
    setInspectedExcerpt,
    isDragging,
    isProcessing,
    progress,
    lastAttemptedFile,
    uploadError,
    setUploadError,
    docToDelete,
    deleteCascadeSummary,
    isDeleting,
    setSelectedDoc,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleCancelUpload,
    handleSelectDoc,
    processFile,
    handleAnalyzeNotes,
    handleCancelAnalysis,
    handleOpenExcerpt,
    handleOpenDelete,
    handleCloseDelete,
    confirmDelete,
  } = useMaterialsManager();

  const supportedFormatsText = `Supported formats: PDF (.pdf), Plain Text (.txt), Markdown (.md) up to ${formatBytes(MAX_UPLOAD_BYTES)}.`;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--accent-blue)]">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>Knowledge Ingestion & Provenance</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Study Materials
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-3xl leading-relaxed">
          Import lecture notes, slides, and readings. All documents are parsed and divided into study
          chunks entirely inside your browser with mathematical source provenance, then analyzed into teachable concepts.
        </p>
      </div>

      {/* Upload Dropzone Section */}
      <section aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="sr-only">
          Upload new study material
        </h2>
        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle>Import Notes & Documents</CardTitle>
            <CardDescription>{supportedFormatsText}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hidden native input */}
            <input
              ref={fileInputRef}
              type="file"
              id="material-file-picker"
              aria-label="Upload study material file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="sr-only"
            />

            {/* Hidden native replace input */}
            <input
              ref={replaceFileInputRef}
              type="file"
              id="material-replace-picker"
              aria-label="Replace material file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && selectedDoc) {
                  void processFile(file, { replaceMaterialId: selectedDoc.id, allowDuplicate: true });
                }
                e.target.value = '';
              }}
              className="sr-only"
            />

            {/* Accessible Drag & Drop Target */}
            <div
              role="region"
              aria-label="File upload dropzone"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                isDragging
                  ? 'border-[var(--primary)] bg-[var(--primary)]/10 scale-[1.01]'
                  : 'border-[var(--border-color)] bg-[var(--surface-raised)]/50 hover:bg-[var(--surface-hover)]',
                isProcessing && 'pointer-events-none opacity-60',
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] mb-3">
                <FileUp className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-base font-semibold text-[var(--text-primary)] mb-1">
                Drag and drop your file here, or{' '}
                <span className="text-[var(--primary)] underline decoration-[var(--primary)]/50 underline-offset-4">
                  browse files
                </span>
              </p>
              <p className="text-xs text-[var(--text-muted)] max-w-md">
                Files are processed locally in your browser. No files are uploaded to an external server.
              </p>
            </div>

            {/* Ingestion Progress Indicator */}
            {isProcessing && progress && (
              <div
                role="status"
                aria-live="polite"
                className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)] space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                    <span>{progress.message}</span>
                  </div>
                  <span className="font-mono">{progress.percent}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden"
                >
                  <div
                    className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-blue)] transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[var(--text-muted)]">
                    Stage: <span className="capitalize">{progress.stage}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCancelUpload}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Error State Notification */}
            {uploadError && (
              <div
                id="upload-error-alert"
                role="alert"
                aria-label="Upload error notice"
                aria-live="assertive"
                className="p-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-xs sm:text-sm text-[var(--text-primary)] space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-[var(--danger)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--danger)]">
                        {uploadError.code === 'DUPLICATE_FILE'
                          ? 'Document Already Imported'
                          : uploadError.code === 'NO_EXTRACTABLE_TEXT'
                            ? 'Scanned or Image-Only Document'
                            : uploadError.code === 'PDF_ENCRYPTED'
                              ? 'Password-Protected PDF'
                              : uploadError.code === 'SIGNATURE_MISMATCH'
                                ? 'Invalid File Signature'
                                : uploadError.code === 'FILE_TOO_LARGE'
                                  ? 'File Exceeds Size Limit'
                                  : 'Ingestion Error'}
                      </p>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        {uploadError.message}
                      </p>
                      {lastAttemptedFile && (
                        <p className="text-xs text-[var(--text-muted)] pt-1">
                          File: <span className="font-mono">{lastAttemptedFile.name}</span> (
                          {formatBytes(lastAttemptedFile.size)}) — selection preserved.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setUploadError(null)}
                    aria-label="Dismiss error notice"
                    className="h-7 w-7 p-0 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {uploadError.code === 'NO_EXTRACTABLE_TEXT' && (
                  <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-color)]/50 pt-2">
                    Note: EduMentor extracts digital text layers. Documents created from photos, scans, or flattened images do not contain digital text. Please export or OCR the document beforehand.
                  </p>
                )}
                {uploadError.code?.includes('QUOTA') && (
                  <div className="border-t border-[var(--border-color)]/50 pt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveView('settings')}
                      className="text-xs h-7"
                    >
                      Open Settings to Export & Manage Storage
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Selected Material Preview & Provenance Inspector */}
      {selectedDoc && (
        <section aria-labelledby="preview-heading" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--surface-raised)]/60 border border-[var(--border-color)] min-w-0">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h2
                  id="preview-heading"
                  className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate max-w-full"
                  title={selectedDoc.filename}
                >
                  {selectedDoc.filename}
                </h2>
                <span className="shrink-0 uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border-color)] text-[var(--accent-blue)]">
                  {selectedDoc.fileType}
                </span>
                {extractedConcepts.length > 0 && (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)]">
                    {extractedConcepts.length} Concepts Analyzed
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {formatBytes(selectedDoc.fileSize)} • {selectedDocChunks.length} study chunks • Added{' '}
                {new Date(selectedDoc.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
              {/* Active Analyze notes button */}
              <Button
                variant="primary"
                onClick={handleAnalyzeNotes}
                disabled={isAnalyzing}
                isLoading={isAnalyzing}
                loadingText="Analyzing..."
                className="shrink-0 whitespace-nowrap shadow-xs"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                <span>{extractedConcepts.length > 0 ? 'Re-analyze notes' : 'Analyze notes'}</span>
              </Button>

              {/* Reprocess button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAnalyzeNotes}
                disabled={isAnalyzing}
                className="shrink-0 whitespace-nowrap"
                title="Re-run analysis on this material"
              >
                <RefreshCw className="h-4 w-4 sm:mr-1.5" />
                <span className="sr-only sm:not-sr-only">Reprocess</span>
              </Button>

              {/* Replace Material button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => replaceFileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="shrink-0 whitespace-nowrap"
                title="Replace this material with updated file"
              >
                <RotateCw className="h-4 w-4 sm:mr-1.5" />
                <span className="sr-only sm:not-sr-only">Replace</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenDelete(selectedDoc)}
                className="shrink-0 text-[var(--danger)] hover:bg-[var(--danger)]/10"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDoc(null)}
                aria-label="Close document preview"
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* AI Analysis Progress Indicator */}
          {isAnalyzing && analysisProgress && (
            <div
              role="status"
              aria-live="polite"
              className="p-4 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/5 space-y-3"
            >
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                  <span>{analysisProgress.message}</span>
                </div>
                <span className="font-mono">{analysisProgress.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={analysisProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden"
              >
                <div
                  className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-blue)] transition-all duration-300"
                  style={{ width: `${analysisProgress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[var(--text-muted)]">
                  Stage: <span className="capitalize">{analysisProgress.stage}</span>
                  {analysisProgress.conceptsExtracted ? ` (${analysisProgress.conceptsExtracted} concepts so far)` : ''}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCancelAnalysis}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Analysis Error State */}
          {analysisError && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-xs sm:text-sm text-[var(--text-primary)] flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-[var(--danger)] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--danger)]">Concept Extraction Issue</p>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{analysisError}</p>
                  <p className="text-xs text-[var(--text-muted)] pt-1">
                    Your notes and study chunks are safely preserved on this device.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={handleAnalyzeNotes} className="h-7 text-xs">
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAnalysisError(null)} className="h-7 w-7 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* AI Notice Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 text-xs text-[var(--text-secondary)]">
            <Info className="h-4 w-4 text-[var(--accent-blue)] shrink-0 mt-0.5" />
            <p>
              <strong className="text-[var(--text-primary)]">AI Analysis Notice:</strong> Relevant
              study chunk excerpts are sent to Google Gemini through the server gateway to extract concepts
              and provide tutoring. Your complete source document files remain stored strictly on this device.
            </p>
          </div>

          {/* Tabbed Inspector: Extracted Text, Study Chunks, Concepts, Learning Units */}
          <MaterialDetailTabs
            selectedDoc={selectedDoc}
            selectedDocChunks={selectedDocChunks}
            extractedConcepts={extractedConcepts}
            selectedDocUnits={selectedDocUnits}
            loadingChunks={loadingChunks}
            previewTab={previewTab}
            setPreviewTab={setPreviewTab}
            onAnalyzeNotes={handleAnalyzeNotes}
            isAnalyzing={isAnalyzing}
            onOpenExcerpt={handleOpenExcerpt}
          />
        </section>
      )}

      {/* Materials List Section */}
      <section aria-labelledby="materials-list-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="materials-list-heading" className="text-xl font-bold text-[var(--text-primary)]">
            Imported Materials ({documents.length})
          </h2>
        </div>

        {loadingDocs ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            Loading materials...
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Your learning space starts here"
            description="Import a set of notes to build your first learning path. Upload a PDF, Markdown, or text file above."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {documents.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              const proc = processingRecords[doc.id];
              const chunkCount =
                typeof doc.metadata?.chunkCount === 'number'
                  ? doc.metadata.chunkCount
                  : 'Ready';
              const conceptCount =
                typeof doc.metadata?.conceptCount === 'number'
                  ? doc.metadata.conceptCount
                  : undefined;

              return (
                <div
                  key={doc.id}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all duration-150',
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--surface-raised)] shadow-sm'
                      : 'border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]',
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] mt-0.5">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-full" title={doc.filename}>
                          {doc.filename}
                        </h3>
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-blue)]">
                          {doc.fileType}
                        </span>
                        {conceptCount !== undefined && conceptCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)]">
                            {conceptCount} concepts
                          </span>
                        )}
                        {proc && (
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                              proc.stage === 'COMPLETE' && 'bg-[var(--success)]/15 border-[var(--success)]/30 text-[var(--success)]',
                              proc.stage === 'ANALYZING' && 'bg-[var(--accent-blue)]/15 border-[var(--accent-blue)]/30 text-[var(--accent-blue)]',
                              proc.stage === 'FAILED' && 'bg-[var(--danger)]/15 border-[var(--danger)]/30 text-[var(--danger)]',
                              proc.stage === 'SAVED' && 'bg-[var(--surface-raised)] border-[var(--border-color)] text-[var(--text-muted)]',
                            )}
                          >
                            {proc.stage === 'COMPLETE'
                              ? `Ready • ${proc.counts?.totalUnits ?? 0} units`
                              : proc.stage === 'ANALYZING'
                                ? `Analyzing (${proc.currentBatch ?? 1}/${proc.totalBatches ?? 1})`
                                : proc.stage === 'FAILED'
                                  ? `Failed (${proc.errorCode ?? 'retryable'})`
                                  : 'Saved'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatBytes(doc.fileSize)} • {chunkCount} chunks • {doc.extractedText.length.toLocaleString()} chars • Added{' '}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {proc?.stage === 'FAILED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await handleSelectDoc(doc);
                          void handleAnalyzeNotes();
                        }}
                        className="text-xs text-[var(--primary)]"
                      >
                        Retry
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isSelected ? 'primary' : 'secondary'}
                      onClick={() => handleSelectDoc(doc)}
                    >
                      {isSelected ? 'Viewing' : 'Inspect'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenDelete(doc)}
                      aria-label={`Delete ${doc.filename}`}
                      className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Source Excerpt Provenance Inspector Modal */}
      <MaterialExcerptModal
        excerptData={inspectedExcerpt}
        onClose={() => setInspectedExcerpt(null)}
      />

      {/* Delete Confirmation Modal */}
      <MaterialDeleteModal
        isOpen={!!docToDelete}
        doc={docToDelete}
        summary={deleteCascadeSummary}
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onClose={handleCloseDelete}
      />

      {/* Duplicate Notice Modal */}
      <DuplicateNoticeModal
        isOpen={!!duplicateModal}
        decision={duplicateModal?.decision ?? null}
        file={duplicateModal?.file ?? null}
        onOpenExisting={(id) => {
          const doc = documents.find((d) => d.id === id);
          if (doc) void handleSelectDoc(doc);
          setDuplicateModal(null);
        }}
        onImportSeparate={() => {
          const file = duplicateModal?.file;
          setDuplicateModal(null);
          if (file) void processFile(file, { allowDuplicate: true });
        }}
        onReplaceExisting={(id) => {
          const file = duplicateModal?.file;
          setDuplicateModal(null);
          if (file) void processFile(file, { replaceMaterialId: id, allowDuplicate: true });
        }}
        onCancel={() => setDuplicateModal(null)}
      />
    </div>
  );
}
