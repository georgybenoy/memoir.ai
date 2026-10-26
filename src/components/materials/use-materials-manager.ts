'use client';

import * as React from 'react';
import {
  ingestDocument,
  getChunkExcerpt,
  resumeMaterialAnalysis,
  processingJobManager,
  type IngestionProgress,
} from '@/features/ingestion';
import {
  evaluateDuplicateDecision,
  inFlightDeduplicator,
  computeFileHash,
  type DuplicateDecision,
} from '@/features/ingestion/duplicates';
import {
  getDeleteMaterialCascadeSummary,
  executeDeleteMaterialCascade,
  planReplaceMaterialConcepts,
  type DeleteMaterialCascadeSummary,
} from '@/features/learning-units/reprocess-replace';
import { getStorage } from '@/lib/db/bootstrap';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type ConceptRecord,
  type LearningUnitRecord,
  type MaterialProcessingRecord,
} from '@/types/domain';
import { type InspectedExcerptData } from './material-excerpt-modal';

export function useMaterialsManager() {
  const { addToast } = useWorkspaceStore();

  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = React.useState(true);
  const [selectedDoc, setSelectedDoc] = React.useState<DocumentRecord | null>(null);
  const [selectedDocChunks, setSelectedDocChunks] = React.useState<DocumentChunkRecord[]>([]);
  const [selectedDocUnits, setSelectedDocUnits] = React.useState<LearningUnitRecord[]>([]);
  const [loadingChunks, setLoadingChunks] = React.useState(false);
  const [previewTab, setPreviewTab] = React.useState<'text' | 'chunks' | 'concepts' | 'units'>('text');

  // Processing records per material
  const [processingRecords, setProcessingRecords] = React.useState<Record<string, MaterialProcessingRecord>>({});

  // Duplicate notice modal state
  const [duplicateModal, setDuplicateModal] = React.useState<{
    decision: DuplicateDecision;
    file: File;
  } | null>(null);

  // Concept extraction & analysis state
  const [extractedConcepts, setExtractedConcepts] = React.useState<ConceptRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisProgress, setAnalysisProgress] = React.useState<{
    stage: string;
    percent: number;
    message: string;
    currentBatch?: number;
    totalBatches?: number;
    conceptsExtracted?: number;
  } | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [inspectedExcerpt, setInspectedExcerpt] = React.useState<InspectedExcerptData | null>(null);

  // Drag & drop and upload state
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState<IngestionProgress | null>(null);
  const [lastAttemptedFile, setLastAttemptedFile] = React.useState<{ name: string; size: number } | null>(null);
  const [uploadError, setUploadError] = React.useState<{ code?: string; message: string } | null>(null);

  // Deletion modal state
  const [docToDelete, setDocToDelete] = React.useState<DocumentRecord | null>(null);
  const [deleteCascadeSummary, setDeleteCascadeSummary] = React.useState<DeleteMaterialCascadeSummary | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Refs for in-flight cancellation
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const analysisAbortRef = React.useRef<AbortController | null>(null);

  const handleOpenDelete = React.useCallback((doc: DocumentRecord) => {
    setDocToDelete(doc);
    const storage = getStorage();
    void getDeleteMaterialCascadeSummary(doc.id, storage).then(setDeleteCascadeSummary);
  }, []);

  const handleCloseDelete = React.useCallback(() => {
    setDocToDelete(null);
    setDeleteCascadeSummary(null);
  }, []);

  // Load existing documents and processing records from storage
  const loadDocuments = React.useCallback(async () => {
    try {
      const storage = getStorage();
      const [docs, procs] = await Promise.all([
        storage.documents.list(),
        storage.processing.list(),
      ]);
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDocuments(docs);

      const procMap: Record<string, MaterialProcessingRecord> = {};
      for (const p of procs) {
        procMap[p.materialId] = p;
      }
      setProcessingRecords(procMap);
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
    Promise.all([storage.documents.list(), storage.processing.list()])
      .then(([docs, procs]) => {
        if (mounted) {
          docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setDocuments(docs);
          const procMap: Record<string, MaterialProcessingRecord> = {};
          for (const p of procs) {
            procMap[p.materialId] = p;
          }
          setProcessingRecords(procMap);
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

  // Load chunks, units, and concepts when a document is selected
  const handleSelectDoc = React.useCallback(async (doc: DocumentRecord) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    setAnalysisError(null);

    try {
      const storage = getStorage();
      const [chunks, units, concepts, proc] = await Promise.all([
        storage.chunks.listByMaterial(doc.id),
        storage.learningUnits.listByMaterial(doc.id),
        storage.concepts.listByMaterial(doc.id),
        storage.processing.getByMaterial(doc.id),
      ]);

      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      setSelectedDocChunks(chunks);
      setSelectedDocUnits(units);

      const docChunkIds = new Set(chunks.map((c) => c.id));
      const related =
        concepts.length > 0
          ? concepts
          : (await storage.concepts.list()).filter((c) =>
              c.sourceChunkIds.some((id) => docChunkIds.has(id)),
            );
      related.sort((a, b) => a.extractionOrder - b.extractionOrder);
      setExtractedConcepts(related);

      if (proc) {
        setProcessingRecords((prev) => ({ ...prev, [doc.id]: proc }));
      }

      if (units.length > 0) {
        setPreviewTab('units');
      } else if (related.length > 0) {
        setPreviewTab('concepts');
      } else {
        setPreviewTab('text');
      }
    } catch (err) {
      console.error('Failed to load chunks or concepts for document:', err);
      setSelectedDocChunks([]);
      setExtractedConcepts([]);
      setSelectedDocUnits([]);
    } finally {
      setLoadingChunks(false);
    }
  }, []);

  // Process file upload with in-flight deduplication and duplicate detection
  const processFile = async (
    file: File,
    options: { allowDuplicate?: boolean; replaceMaterialId?: string } = {},
  ) => {
    setLastAttemptedFile({ name: file.name, size: file.size });
    setUploadError(null);

    // Compute file hash
    let fileHash: string | null = null;
    try {
      const buffer = await file.arrayBuffer();
      fileHash = await computeFileHash(new Uint8Array(buffer));
    } catch {
      // Ingestion will re-hash
    }

    // In-flight deduplication guard
    if (fileHash && inFlightDeduplicator.isInFlight(fileHash)) {
      setUploadError({
        code: 'DUPLICATE_IN_FLIGHT',
        message: 'This document is already being processed right now.',
      });
      return;
    }

    // Duplicate detection against existing stored library
    if (fileHash && !options.allowDuplicate) {
      const decision = evaluateDuplicateDecision(fileHash, file.name, documents);
      if (decision.type === 'EXACT_DUPLICATE' || decision.type === 'FILENAME_COLLISION') {
        setDuplicateModal({ decision, file });
        return;
      }
    }

    setIsProcessing(true);
    setProgress({
      stage: 'validating',
      percent: 5,
      message: 'Inspecting document header and metadata...',
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await ingestDocument({
        file,
        signal: controller.signal,
        documentId: options.replaceMaterialId,
        allowDuplicate: options.allowDuplicate,
        onProgress: (p: IngestionProgress) => setProgress(p),
      });

      if (!result.success) {
        setUploadError({
          code: result.code,
          message: result.error || 'Failed to ingest file.',
        });
        return;
      }

      if (result.document && result.chunks) {
        // If replacing an existing material, apply conservative concept matching
        if (options.replaceMaterialId) {
          const storage = getStorage();
          const oldConcepts = await storage.concepts.listByMaterial(options.replaceMaterialId);
          if (oldConcepts.length > 0) {
            const replacePlan = planReplaceMaterialConcepts(
              oldConcepts,
              [],
              result.document.contentHash,
            );
            await storage.concepts.putMany(replacePlan.conceptsToPut);
          }
        }

        addToast({
          type: 'success',
          title: options.replaceMaterialId ? 'Material Replaced' : 'Document Ingested',
          description: `"${result.document.filename}" divided into ${result.chunks.length} proven chunks.`,
        });

        const refreshed = await loadDocuments();
        const created = refreshed.find((d) => d.id === result.document!.id) || result.document;
        await handleSelectDoc(created);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed unexpectedly.';
      setUploadError({ message });
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value = '';
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
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Run AI Concept Extraction and Learning Unit synthesis on the selected document
  const handleAnalyzeNotes = async () => {
    if (!selectedDoc || isAnalyzing) return;
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
      const result = await resumeMaterialAnalysis(selectedDoc.id, {
        signal: controller.signal,
        onProgress: (p) => {
          setAnalysisProgress({
            stage:
              p.stage === 'ANALYZING'
                ? 'extracting'
                : p.stage === 'UNITS_BUILT'
                ? 'linking'
                : 'batching',
            percent: p.progressPercent,
            message: p.message || 'Analyzing material notes...',
            currentBatch: p.currentBatch,
            totalBatches: p.totalBatches,
            conceptsExtracted: p.accumulatedConcepts?.length,
          });
        },
      });

      if (!result.success) {
        if (result.record?.stage === 'CANCELLED') {
          addToast({
            type: 'info',
            title: 'Analysis Paused',
            description: 'Concept extraction was paused. Progress has been preserved.',
          });
        } else {
          setAnalysisError(result.error || 'Failed to extract concepts from this material.');
        }
        await loadDocuments();
        return;
      }

      const storage = getStorage();
      const [loadedUnits, loadedConcepts] = await Promise.all([
        storage.learningUnits.listByMaterial(selectedDoc.id),
        storage.concepts.listByMaterial(selectedDoc.id),
      ]);

      loadedUnits.sort((a, b) => a.order - b.order);
      setSelectedDocUnits(loadedUnits);
      setExtractedConcepts(loadedConcepts);
      setPreviewTab('concepts');
      addToast({
        type: 'success',
        title: 'Concepts & Learning Units Ready',
        description: `Identified ${loadedConcepts.length} concepts organized into ${loadedUnits.length} structured learning units.`,
      });

      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAnalysisError(message);
      await loadDocuments();
    } finally {
      setIsAnalyzing(false);
      analysisAbortRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    if (selectedDoc) {
      processingJobManager.cancelJob(selectedDoc.id);
    }
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
      const storage = getStorage();
      await executeDeleteMaterialCascade(docToDelete.id, storage);
      addToast({
        type: 'info',
        title: 'Material deleted',
        description: `"${docToDelete.filename}" and all its dependent records were removed.`,
      });
      if (selectedDoc?.id === docToDelete.id) {
        setSelectedDoc(null);
        setSelectedDocChunks([]);
        setExtractedConcepts([]);
        setSelectedDocUnits([]);
      }
      setDocToDelete(null);
      setDeleteCascadeSummary(null);
      await loadDocuments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete material.';
      addToast({
        type: 'error',
        title: 'Deletion Failed',
        description: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
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
  };
}
