'use client';

import * as React from 'react';
import {
  FileUp,
  FileText,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Info,
  X,
  ShieldAlert,
  Loader2,
  Network,
  Tag,
  Quote,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import {
  MAX_UPLOAD_BYTES,
  formatBytes,
} from '@/lib/config/ingestion';
import {
  ingestDocument,
  deleteDocumentAndChunks,
  verifyChunkProvenance,
  getChunkExcerpt,
  type IngestionProgress,
  type IngestResult,
} from '@/features/ingestion';
import {
  extractConceptsForDocument,
  type ConceptPipelineProgress,
} from '@/features/concepts';
import { getStorage } from '@/lib/db/bootstrap';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type ConceptRecord,
} from '@/types/domain';
import { cn } from '@/lib/utils/cn';

export function MaterialsView() {
  const { setActiveView, addToast } = useWorkspaceStore();

  // Documents list and preview state
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = React.useState(true);
  const [selectedDoc, setSelectedDoc] = React.useState<DocumentRecord | null>(null);
  const [selectedDocChunks, setSelectedDocChunks] = React.useState<DocumentChunkRecord[]>([]);
  const [loadingChunks, setLoadingChunks] = React.useState(false);
  const [previewTab, setPreviewTab] = React.useState<'text' | 'chunks' | 'concepts'>('text');

  // Concept extraction & analysis state
  const [extractedConcepts, setExtractedConcepts] = React.useState<ConceptRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisProgress, setAnalysisProgress] = React.useState<ConceptPipelineProgress | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [inspectedExcerpt, setInspectedExcerpt] = React.useState<{
    conceptTitle: string;
    chunkIndex: number;
    chunkId: string;
    excerpt: ReturnType<typeof getChunkExcerpt>;
  } | null>(null);

  // Drag & drop and upload state
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState<IngestionProgress | null>(null);
  const [lastAttemptedFile, setLastAttemptedFile] = React.useState<{ name: string; size: number } | null>(null);
  const [uploadError, setUploadError] = React.useState<{ code?: string; message: string } | null>(null);

  // Deletion modal state
  const [docToDelete, setDocToDelete] = React.useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Refs for cancellation
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const analysisAbortRef = React.useRef<AbortController | null>(null);

  // Load existing documents from storage
  const loadDocuments = React.useCallback(async () => {
    try {
      const storage = getStorage();
      const docs = await storage.documents.list();
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDocuments(docs);
      return docs;
    } catch (err) {
      console.error('Failed to load documents:', err);
      return [];
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const storage = getStorage();
    storage.documents
      .list()
      .then((docs) => {
        if (mounted) {
          docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setDocuments(docs);
          setLoadingDocs(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load documents:', err);
        if (mounted) setLoadingDocs(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Load chunks and related concepts when a document is selected
  const handleSelectDoc = React.useCallback(async (doc: DocumentRecord) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    setAnalysisError(null);
    try {
      const storage = getStorage();
      const chunks = await storage.chunks.listByDocument(doc.id);
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      setSelectedDocChunks(chunks);

      // Find concepts that cite chunks from this document
      const docChunkIds = new Set(chunks.map((c) => c.id));
      const allConcepts = await storage.concepts.list();
      const related = allConcepts.filter((c) => c.sourceChunkIds.some((id) => docChunkIds.has(id)));
      related.sort((a, b) => a.extractionOrder - b.extractionOrder);
      setExtractedConcepts(related);

      if (related.length > 0) {
        setPreviewTab('concepts');
      } else {
        setPreviewTab('text');
      }
    } catch (err) {
      console.error('Failed to load chunks or concepts for document:', err);
      setSelectedDocChunks([]);
      setExtractedConcepts([]);
    } finally {
      setLoadingChunks(false);
    }
  }, []);

  // Process file upload
  const processFile = async (file: File) => {
    setLastAttemptedFile({ name: file.name, size: file.size });
    setUploadError(null);
    setIsProcessing(true);
    setProgress({
      stage: 'validating',
      percent: 5,
      message: `Validating ${file.name}...`,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result: IngestResult = await ingestDocument({
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          arrayBuffer: () => file.arrayBuffer(),
        },
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });

      if (!result.success) {
        setUploadError({
          code: result.code,
          message: result.error || 'Failed to process document.',
        });
        return;
      }

      if (result.document && result.chunks) {
        addToast({
          type: 'success',
          title: 'Document imported',
          description: `"${result.document.filename}" imported with ${result.chunks.length} study chunks.`,
        });

        const updatedDocs = await loadDocuments();
        const freshDoc = updatedDocs.find((d) => d.id === result.documentId) || result.document;
        setSelectedDoc(freshDoc);
        setSelectedDocChunks(result.chunks);
        setExtractedConcepts([]);
        setPreviewTab('text');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUploadError({
        code: 'UNEXPECTED_ERROR',
        message: `An unexpected error occurred: ${message}`,
      });
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void processFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Run AI Concept Extraction on the selected document
  const handleAnalyzeNotes = async () => {
    if (!selectedDoc) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({
      stage: 'batching',
      percent: 5,
      message: 'Reading your material and identifying concepts…',
    });

    const controller = new AbortController();
    analysisAbortRef.current = controller;

    try {
      const result = await extractConceptsForDocument({
        documentId: selectedDoc.id,
        signal: controller.signal,
        onProgress: (p) => setAnalysisProgress(p),
      });

      if (!result.success) {
        setAnalysisError(result.error || 'Failed to extract concepts from this material.');
        return;
      }

      setExtractedConcepts(result.concepts);
      setPreviewTab('concepts');
      addToast({
        type: 'success',
        title: 'Concepts extracted',
        description: `Successfully identified ${result.concepts.length} concepts and ${result.dependencies.length} prerequisite links.`,
      });

      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
      analysisAbortRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
    }
  };

  const handleOpenExcerpt = (concept: ConceptRecord, chunkId: string) => {
    if (!selectedDoc) return;
    const chunk = selectedDocChunks.find((c) => c.id === chunkId);
    if (!chunk) return;
    const excerpt = getChunkExcerpt(selectedDoc, chunk, 120);
    setInspectedExcerpt({
      conceptTitle: concept.title,
      chunkIndex: chunk.chunkIndex + 1,
      chunkId: chunk.id,
      excerpt,
    });
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDocumentAndChunks(docToDelete.id);
      addToast({
        type: 'info',
        title: 'Material deleted',
        description: `"${docToDelete.filename}" and its chunks were removed.`,
      });
      if (selectedDoc?.id === docToDelete.id) {
        setSelectedDoc(null);
        setSelectedDocChunks([]);
        setExtractedConcepts([]);
      }
      await loadDocuments();
      setDocToDelete(null);
    } catch (err) {
      console.error('Failed to delete document:', err);
      addToast({
        type: 'error',
        title: 'Delete failed',
        description: 'Unable to remove document from local storage.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

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
                {/* Progress bar element */}
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

            {/* Specific Error State Notification */}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="preview-heading" className="text-xl font-bold text-[var(--text-primary)]">
                  {selectedDoc.filename}
                </h2>
                <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-blue)]">
                  {selectedDoc.fileType}
                </span>
                {extractedConcepts.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)]">
                    {extractedConcepts.length} Concepts Analyzed
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {formatBytes(selectedDoc.fileSize)} • {selectedDocChunks.length} study chunks • Added{' '}
                {new Date(selectedDoc.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Active Analyze notes button */}
              <Button
                variant="primary"
                onClick={handleAnalyzeNotes}
                disabled={isAnalyzing}
                isLoading={isAnalyzing}
                loadingText="Analyzing..."
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                <span>{extractedConcepts.length > 0 ? 'Re-analyze notes' : 'Analyze notes'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDocToDelete(selectedDoc)}
                className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDoc(null);
                  setSelectedDocChunks([]);
                  setExtractedConcepts([]);
                }}
                aria-label="Close document preview"
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

          {/* Tabs: Extracted Text vs Chunks vs Concepts */}
          <div className="border-b border-[var(--border-color)] flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => setPreviewTab('text')}
              className={cn(
                'pb-2 font-medium border-b-2 transition-colors cursor-pointer',
                previewTab === 'text'
                  ? 'border-[var(--primary)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              Extracted Text ({selectedDoc.extractedText.length.toLocaleString()} chars)
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('chunks')}
              className={cn(
                'pb-2 font-medium border-b-2 transition-colors cursor-pointer',
                previewTab === 'chunks'
                  ? 'border-[var(--primary)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              Study Chunks ({selectedDocChunks.length})
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('concepts')}
              className={cn(
                'pb-2 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5',
                previewTab === 'concepts'
                  ? 'border-[var(--primary)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              <Network className="h-3.5 w-3.5" />
              <span>Extracted Concepts ({extractedConcepts.length})</span>
            </button>
          </div>

          {/* Tab 1: Full Extracted Text View */}
          {previewTab === 'text' && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div
                  tabIndex={0}
                  aria-label="Normalized extracted text preview"
                  className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)] bg-[var(--surface)] p-4 rounded-lg border border-[var(--border-color)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] select-text"
                >
                  {selectedDoc.extractedText || 'No text extracted.'}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab 2: Study Chunks View */}
          {previewTab === 'chunks' && (
            <div className="space-y-3">
              {loadingChunks ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  Loading chunks...
                </div>
              ) : selectedDocChunks.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  No chunks generated for this material.
                </div>
              ) : (
                selectedDocChunks.map((chunk) => {
                  const isValid = verifyChunkProvenance(selectedDoc, chunk);
                  return (
                    <Card key={chunk.id} className="text-xs space-y-2">
                      <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-[var(--border-color)]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[var(--primary)]">
                            Chunk #{chunk.chunkIndex + 1}
                          </span>
                          {chunk.pageStart && (
                            <span className="px-2 py-0.5 rounded bg-[var(--surface)] text-[10px] text-[var(--text-secondary)]">
                              Page {chunk.pageStart}
                              {chunk.pageEnd && chunk.pageEnd !== chunk.pageStart
                                ? `–${chunk.pageEnd}`
                                : ''}
                            </span>
                          )}
                          {chunk.headingPath && chunk.headingPath.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-[var(--surface)] text-[10px] text-[var(--text-secondary)] truncate max-w-xs">
                              {chunk.headingPath.join(' › ')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">
                            [{chunk.startOffset}..{chunk.endOffset}]
                          </span>
                          {isValid ? (
                            <span
                              title="Mathematically proven: doc.extractedText.slice(start, end) === chunk.text"
                              className="flex items-center gap-1 text-[10px] font-medium text-[var(--success)]"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Proven</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--danger)]">
                              <ShieldAlert className="h-3 w-3" />
                              <span>Corrupt Offset</span>
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 py-3">
                        <p className="font-sans text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed select-text">
                          {chunk.text}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 3: Extracted Concepts View */}
          {previewTab === 'concepts' && (
            <div className="space-y-4">
              {extractedConcepts.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center space-y-3">
                    <Sparkles className="h-8 w-8 text-[var(--primary)] mx-auto opacity-70" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      No concepts extracted yet
                    </p>
                    <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                      Click the &quot;Analyze notes&quot; button above to extract teachable concepts, key terms,
                      and prerequisite relationships using Gemini.
                    </p>
                    <Button variant="primary" size="sm" onClick={handleAnalyzeNotes} disabled={isAnalyzing}>
                      Analyze notes now
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {extractedConcepts.map((concept) => (
                    <Card key={concept.id} className="overflow-hidden border border-[var(--border-color)]">
                      <CardHeader className="py-3 px-4 sm:px-6 bg-[var(--surface-raised)]/40 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-[var(--text-primary)]">
                            {concept.title}
                          </h3>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--accent-blue)] border border-[var(--border-color)]">
                            {concept.tier === 0 ? 'Tier 0: Foundational' : concept.tier === 1 ? 'Tier 1: Core' : 'Tier 2: Advanced'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)]"
                            title="Model extraction confidence"
                          >
                            {Math.round(concept.confidence * 100)}% confidence
                          </span>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-6 space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Summary
                          </p>
                          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                            {concept.summary}
                          </p>
                        </div>

                        {concept.canonicalExplanation && (
                          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border-color)]">
                            <p className="text-xs font-semibold text-[var(--accent-blue)] mb-1">
                              Canonical Explanation
                            </p>
                            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                              {concept.canonicalExplanation}
                            </p>
                          </div>
                        )}

                        {concept.keyTerms && concept.keyTerms.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              <span>Key Terms</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {concept.keyTerms.map((term, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-secondary)]"
                                >
                                  {term}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Source citations provenance viewer */}
                        <div className="pt-2 border-t border-[var(--border-color)]/60 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                          <Quote className="h-3.5 w-3.5 text-[var(--primary)]" />
                          <span>Grounded in chunks:</span>
                          {concept.sourceChunkIds.map((cid) => {
                            const chunk = selectedDocChunks.find((c) => c.id === cid);
                            const label = chunk ? `Chunk #${chunk.chunkIndex + 1}` : 'Chunk';
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => handleOpenExcerpt(concept, cid)}
                                className="px-2 py-0.5 rounded bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-color)] text-[var(--primary)] font-mono text-[10px] cursor-pointer transition-colors"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] mt-0.5">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
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
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatBytes(doc.fileSize)} • {chunkCount} chunks • {doc.extractedText.length.toLocaleString()} chars • Added{' '}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
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
                      onClick={() => setDocToDelete(doc)}
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
      {inspectedExcerpt && (
        <Dialog open={!!inspectedExcerpt} onOpenChange={(open) => !open && setInspectedExcerpt(null)}>
          <DialogContent
            title={`Source Provenance: ${inspectedExcerpt.conceptTitle}`}
            description={`Verified context from Chunk #${inspectedExcerpt.chunkIndex}`}
            className="max-w-2xl"
          >
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] pb-2">
                <span>Concept: <strong className="text-[var(--text-primary)]">{inspectedExcerpt.conceptTitle}</strong></span>
                <span className="font-mono">Chunk #{inspectedExcerpt.chunkIndex}</span>
              </div>

              <div className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] max-h-72 overflow-y-auto text-xs sm:text-sm font-sans leading-relaxed text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">{inspectedExcerpt.excerpt.before}</span>
                <mark className="bg-[var(--primary)]/25 text-[var(--text-primary)] px-1 py-0.5 rounded font-medium border border-[var(--primary)]/40">
                  {inspectedExcerpt.excerpt.matched}
                </mark>
                <span className="text-[var(--text-muted)]">{inspectedExcerpt.excerpt.after}</span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[var(--success)]">
                <CheckCircle2 className="h-4 w-4" />
                <span>Exact mathematical provenance verified against stored normalized notes.</span>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="secondary" onClick={() => setInspectedExcerpt(null)}>
                Close Excerpt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent
          title="Delete study material?"
          description="Are you sure you want to delete this document?"
        >
          <div className="space-y-3 pt-2 text-sm text-[var(--text-secondary)]">
            <p>
              Are you sure you want to delete{' '}
              <strong className="text-[var(--text-primary)]">{docToDelete?.filename}</strong>?
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              This will permanently remove the document and its associated study chunks from this
              device&apos;s local storage. This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="secondary"
              onClick={() => setDocToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
