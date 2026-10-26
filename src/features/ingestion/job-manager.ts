/**
 * In-memory job manager for document processing and analysis jobs.
 * Ensures isolation across materials, prevents concurrent duplicate runs on the same material,
 * tracks unique run IDs, and decouples long-running AI jobs from React component unmount lifecycles.
 *
 * Source of truth: Architecture Rules - pure TypeScript, no React imports.
 */

import { type MaterialProcessingRecord } from '@/types/domain';

export interface ActiveProcessingJob<T = unknown> {
  materialId: string;
  runId: string;
  abortController: AbortController;
  promise: Promise<T>;
  listeners: Set<(record: MaterialProcessingRecord) => void>;
  startedAt: string;
}

export class ProcessingJobManager {
  private activeJobs = new Map<string, ActiveProcessingJob<unknown>>();

  /**
   * Returns the currently active job for a material, if any.
   */
  getJob<T = unknown>(materialId: string): ActiveProcessingJob<T> | undefined {
    return this.activeJobs.get(materialId) as ActiveProcessingJob<T> | undefined;
  }

  /**
   * Checks whether a background processing run is currently active for a material.
   */
  isJobRunning(materialId: string): boolean {
    return this.activeJobs.has(materialId);
  }

  /**
   * Alias for isJobRunning
   */
  hasJob(materialId: string): boolean {
    return this.isJobRunning(materialId);
  }

  /**
   * Registers a new processing job for a material.
   * If a job is already running for this material, the existing job is preserved.
   */
  registerJob<T>(
    materialId: string,
    runId: string,
    abortController: AbortController,
    promise: Promise<T>,
  ): ActiveProcessingJob<T> {
    const existing = this.activeJobs.get(materialId);
    if (existing) {
      return existing as ActiveProcessingJob<T>;
    }

    const job: ActiveProcessingJob<T> = {
      materialId,
      runId,
      abortController,
      promise,
      listeners: new Set(),
      startedAt: new Date().toISOString(),
    };

    // Auto-clean on promise settlement
    promise.finally(() => {
      const current = this.activeJobs.get(materialId);
      if (current && current.runId === runId) {
        this.activeJobs.delete(materialId);
      }
    });

    this.activeJobs.set(materialId, job);
    return job;
  }

  /**
   * Cancels any active processing job for a material.
   * Returns true if a job was found and cancelled.
   */
  cancelJob(materialId: string): boolean {
    const job = this.activeJobs.get(materialId);
    if (!job) return false;

    job.abortController.abort();
    this.activeJobs.delete(materialId);
    return true;
  }

  /**
   * Subscribes a listener to progress updates for a specific material job.
   * Returns an unsubscribe function.
   */
  subscribe(
    materialId: string,
    listener: (record: MaterialProcessingRecord) => void,
  ): () => void {
    const job = this.activeJobs.get(materialId);
    if (job) {
      job.listeners.add(listener);
    }

    return () => {
      const currentJob = this.activeJobs.get(materialId);
      if (currentJob) {
        currentJob.listeners.delete(listener);
      }
    };
  }

  /**
   * Dispatches a progress update to all active listeners for a material.
   */
  notify(materialId: string, record: MaterialProcessingRecord): void {
    const job = this.activeJobs.get(materialId);
    if (!job) return;

    // Discard notifications that belong to a stale run
    if (record.runId && record.runId !== job.runId) {
      return;
    }

    for (const listener of job.listeners) {
      try {
        listener(record);
      } catch (err) {
        console.error('ProcessingJobManager listener error:', err);
      }
    }
  }

  /**
   * Clears all active jobs (primarily for test teardown).
   */
  clearAll(): void {
    for (const job of this.activeJobs.values()) {
      try {
        job.abortController.abort();
      } catch {
        // Ignore abort errors during clear
      }
    }
    this.activeJobs.clear();
  }
}

export const processingJobManager = new ProcessingJobManager();
