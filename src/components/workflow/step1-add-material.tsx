'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Loader2,
  Trash2,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  SUPPORTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  formatBytes,
} from '@/lib/config/ingestion';
import { validateUploadFile } from '@/features/ingestion/validate';
import { extractDocumentText } from '@/features/ingestion/extract-text';
import { normalizeDocument } from '@/features/ingestion/normalize';
import {
  evaluateDuplicateDecision,
  computeFileHash,
  type DuplicateDecision,
} from '@/features/ingestion/duplicates';
import { DuplicateNoticeModal } from './duplicate-modal';
import { getStorage } from '@/lib/db/bootstrap';
import { type DocumentRecord, type MaterialProcessingRecord } from '@/types/domain';
import { cn } from '@/lib/utils/cn';
import { deriveStepForMaterial } from '@/features/workflow/step-guard';

export interface Step1AddMaterialProps {
  onMaterialSelected?: (materialId: string) => void;
  className?: string;
}

export function Step1AddMaterial({ onMaterialSelected, className }: Step1AddMaterialProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // File selection state
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [extractedPreview, setExtractedPreview] = React.useState<string | null>(null);
  const [duplicateDecision, setDuplicateDecision] = React.useState<DuplicateDecision | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = React.useState(false);

  // Saved materials state
  const [savedDocs, setSavedDocs] = React.useState<DocumentRecord[]>([]);
  const [loadingSaved, setLoadingSaved] = React.useState(true);
  const [savedDocProcessing, setSavedDocProcessing] = React.useState<Record<string, MaterialProcessingRecord>>({});

  // Focus heading on mount for a11y
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Load saved materials from IndexedDB
  React.useEffect(() => {
    let mounted = true;
    async function loadSaved() {
      try {
        const repos = getStorage();
        const docs = await repos.documents.list();
        if (!mounted) return;
        setSavedDocs(docs);

        // Load processing records for saved docs
        const procs: Record<string, MaterialProcessingRecord> = {};
        for (const doc of docs) {
          const p = await repos.processing.getByMaterial(doc.id);
          if (p) procs[doc.id] = p;
        }
        if (mounted) setSavedDocProcessing(procs);
      } catch (err) {
        console.error('Failed to load saved materials:', err);
      } finally {
        if (mounted) setLoadingSaved(false);
      }
    }
    loadSaved();
    return () => {
      mounted = false;
    };
  }, []);

  // Guard against accidental navigation when unconfirmed extracted text exists
  const hasUnsavedFile = Boolean(file && extractedPreview);
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedFile) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedFile]);

  // Handle incoming file selection
  const handleFile = async (selectedFile: File) => {
    setValidationError(null);
    setExtractedPreview(null);
    setDuplicateDecision(null);

    // 1. Validate file
    const val = validateUploadFile(selectedFile.name, selectedFile.size, selectedFile.type);
    if (!val.valid) {
      setValidationError(val.error ?? 'Invalid file selected.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setIsExtracting(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      // Validate magic byte signatures
      const signatureVal = validateUploadFile(
        selectedFile.name,
        selectedFile.size,
        selectedFile.type,
        uint8.slice(0, 1024)
      );
      if (!signatureVal.valid) {
        setValidationError(`Invalid File Signature: ${signatureVal.error ?? 'File header does not match expected format.'}`);
        setFile(null);
        return;
      }

      const fileHash = await computeFileHash(uint8);

      // Check duplicates
      const repos = getStorage();
      const allDocs = await repos.documents.list();
      const decision = evaluateDuplicateDecision(fileHash, selectedFile.name, allDocs);

      if (decision.type === 'EXACT_DUPLICATE' || decision.type === 'FILENAME_COLLISION') {
        setDuplicateDecision(decision);
        setShowDuplicateModal(true);
      }

      // Extract text preview
      const extracted = await extractDocumentText(uint8, val.fileType!, selectedFile.name);
      const normalized = normalizeDocument(extracted);

      if (normalized.text.trim().length === 0) {
        setValidationError(
          'This document contains no readable text. It may be a scanned image or empty. Please upload a text-based document.'
        );
        setFile(null);
        return;
      }

      setExtractedPreview(normalized.text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/quota/i.test(msg)) {
        setValidationError(
          'Local browser storage limit reached (QuotaExceededError). Please export or delete old materials in Settings before uploading new documents.'
        );
      } else if (/corrupt|invalid pdf|format|stream|damaged/i.test(msg)) {
        setValidationError(
          'Unable to parse or read document file. The file may be corrupt or encrypted.'
        );
      } else if (/scanned|image-only|optical character recognition|no extractable text/i.test(msg)) {
        setValidationError(
          'Scanned or Image-Only Document: No extractable text found in this PDF. Optical Character Recognition (OCR) is not supported in this version. Please provide a document with a digital text layer.'
        );
      } else {
        setValidationError(`Text extraction failed: ${msg}`);
      }
      setFile(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClearSelected = () => {
    setFile(null);
    setExtractedPreview(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Confirm and start ingestion pipeline
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const handleConfirmAndProcess = async () => {
    if (!file) return;
    setIsSubmitting(true);
    try {
      const { processMaterialLifecycle } = await import('@/features/ingestion/processing-service');
      const repos = getStorage();
      const result = await processMaterialLifecycle({
        file,
        customRepos: repos,
      });

      if (result.success) {
        onMaterialSelected?.(result.materialId);
        router.push(`/learn/${result.materialId}/organise`);
      } else {
        // Even if Gemini analysis fails later in lifecycle, source text is saved. Navigate to Step 2 to show retryable state
        if (result.materialId) {
          router.push(`/learn/${result.materialId}/organise`);
        } else {
          setValidationError(result.error ?? 'Processing failed.');
          setIsSubmitting(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/quota/i.test(msg)) {
        setValidationError(
          'Local browser storage limit reached (QuotaExceededError). Please export or delete old materials in Settings before uploading new documents.'
        );
      } else {
        setValidationError(`Processing error: ${msg}`);
      }
      setIsSubmitting(false);
    }
  };

  // Open an existing material from duplicate notice or saved list
  const handleOpenExistingMaterial = async (materialId: string) => {
    setShowDuplicateModal(false);
    const repos = getStorage();
    const dest = await deriveStepForMaterial(materialId, repos);
    router.push(dest.route);
  };

  const handleImportSeparate = () => {
    setShowDuplicateModal(false);
    // Proceed with currently selected file
  };

  return (
    <div className={cn('space-y-8 max-w-4xl mx-auto py-4 sm:py-6 pb-24 sm:pb-32', className)}>
      {/* Step Heading */}
      <div className="space-y-1">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] focus:outline-none"
        >
          Add Study Material
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          Upload your lecture notes, readings, or slides in PDF, Markdown, or Plain Text format.
        </p>
      </div>

      {/* Duplicate Notice Modal */}
      <DuplicateNoticeModal
        isOpen={showDuplicateModal}
        decision={duplicateDecision}
        file={file}
        onOpenExisting={handleOpenExistingMaterial}
        onImportSeparate={handleImportSeparate}
        onCancel={() => {
          setShowDuplicateModal(false);
          handleClearSelected();
        }}
      />

      {/* File Upload Zone */}
      <div className="space-y-4">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-xl transition-all cursor-pointer select-none text-center',
            isDragging
              ? 'border-[var(--primary)] bg-[var(--primary)]/10'
              : 'border-[var(--border-color)] bg-[var(--surface-raised)] hover:border-[var(--primary)]/60 hover:bg-[var(--surface-hover)]'
          )}
        >
          <input
            ref={fileInputRef}
            id="material-file-picker"
            data-testid="material-file-picker"
            type="file"
            accept={SUPPORTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="p-3 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] mb-4">
            <UploadCloud className="h-8 w-8 sm:h-10 sm:w-10" aria-hidden="true" />
          </div>

          <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mb-1">
            Drag & drop your study material or browse files
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mb-4">
            Supports {SUPPORTED_EXTENSIONS.join(', ')} documents up to {formatBytes(MAX_UPLOAD_BYTES)}.
          </p>

          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="min-h-[44px] px-6 text-sm font-medium border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary)] hover:text-[var(--text-primary)]"
          >
            Browse Files
          </Button>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div
            id="upload-error-alert"
            data-testid="upload-error-alert"
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3.5 flex items-start gap-3 text-sm text-[var(--danger)]"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <span className="font-semibold">Upload issue: </span>
              {validationError}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setValidationError(null)}
              className="text-[var(--danger)] hover:bg-[var(--danger)]/20 min-h-[44px] min-w-[44px] p-2 flex items-center justify-center"
              aria-label="Dismiss error"
            >
              &times;
            </Button>
          </div>
        )}
      </div>

      {/* Selected File Details & Text Preview */}
      {file && (
        <Card className="border-[var(--border-color)] bg-[var(--surface)] shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle id="preview-heading" data-testid="preview-heading" className="text-base sm:text-lg flex items-center gap-2 text-[var(--text-primary)]">
                <FileCheck className="h-5 w-5 text-[var(--accent-green)]" aria-hidden="true" />
                <span className="break-all">{file.name}</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Size: {formatBytes(file.size)} &bull; Format: {file.name.split('.').pop()?.toUpperCase()}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelected}
              disabled={isSubmitting}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] min-h-[44px] px-3"
              aria-label="Remove selected file"
            >
              <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              <span>Remove</span>
            </Button>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            {isExtracting ? (
              <div
                className="py-8 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]"
                role="status"
                aria-live="polite"
              >
                <div className="p-4 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/25">
                  <Loader2 className="h-6 w-6 animate-spin" aria-label="Extracting text from file" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Extracting and normalizing document text…
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Parsing pages, sections, and formulas directly on your device
                  </p>
                </div>
              </div>
            ) : extractedPreview ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-medium uppercase tracking-wider">Extracted Text Preview (Study Chunks)</span>
                  <span>{extractedPreview.length.toLocaleString()} characters</span>
                </div>
                <div
                  className="max-h-48 overflow-y-auto p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap leading-relaxed select-text"
                  tabIndex={0}
                  aria-label="Preview of extracted document text"
                >
                  {extractedPreview.slice(0, 1500)}
                  {extractedPreview.length > 1500 && '\n\n... [content truncated for preview]'}
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleConfirmAndProcess}
                    disabled={isSubmitting}
                    isLoading={isSubmitting}
                    loadingText="Starting Analysis…"
                    className="w-full sm:w-auto min-h-[44px] bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center justify-center gap-2"
                  >
                    <span>Confirm and Process</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Choose from Saved Materials */}
      <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Saved Materials Library
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Continue learning from documents already saved on your local device.
            </p>
          </div>
        </div>

        {loadingSaved ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" aria-label="Loading saved materials" />
            <span className="text-xs">Loading library...</span>
          </div>
        ) : savedDocs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center space-y-2 bg-[var(--surface)]/50">
            <BookOpen className="h-8 w-8 text-[var(--text-muted)] mx-auto opacity-60" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Your learning space starts here…
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Upload your first document above. Your processed materials, concept breakdowns, and study history will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {savedDocs.map((doc) => {
              const proc = savedDocProcessing[doc.id];
              const isComplete = proc?.stage === 'COMPLETE' || doc.analysisStatus === 'completed';
              const isFailed = proc?.stage === 'FAILED';

              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] p-4 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
                      <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate" title={doc.filename}>
                        {doc.filename}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span>{formatBytes(doc.fileSize)}</span>
                      <span>&bull;</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="pt-1 flex items-center gap-2">
                      {isComplete ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-green)]/15 text-[var(--accent-green)] border border-[var(--accent-green)]/30">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Ready
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" />
                          Incomplete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          Processing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenExistingMaterial(doc.id)}
                      className="w-full min-h-[44px] text-xs border-[var(--border-color)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <span>{isComplete ? 'Select & Continue' : 'View / Resume'}</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
