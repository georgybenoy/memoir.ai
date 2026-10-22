/**
 * Browser Embedding Provider Client
 * Source of truth: PRD FR-08, TECH_STACK §8
 *
 * Coordinates embedding requests with the isolated Web Worker,
 * maintains in-memory reference embedding caches, applies load timeouts,
 * and reports progress to the UI.
 */

import { generateId } from '@/lib/utils/id';
import { hashText } from '@/lib/utils/hash';
import {
  type EmbeddingProvider,
  type EmbeddingProgress,
  type EmbeddingProviderOptions,
} from './types';

export class BrowserEmbeddingProvider implements EmbeddingProvider {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private progressListeners = new Set<(p: EmbeddingProgress) => void>();
  private currentProgress: EmbeddingProgress = { status: 'idle' };
  private referenceCache = new Map<string, Float32Array>(); // In-memory reference text cache
  private options: Required<EmbeddingProviderOptions>;

  constructor(options: EmbeddingProviderOptions = {}) {
    this.options = {
      modelId: options.modelId ?? 'Xenova/all-MiniLM-L6-v2',
      remoteHost: options.remoteHost ?? '',
      localModelPath: options.localModelPath ?? '',
      timeoutMs: options.timeoutMs ?? 20000,
    };
  }

  private initWorker(): Worker {
    if (this.worker) return this.worker;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      throw new Error('Web Workers are not supported in this runtime environment.');
    }

    const worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent) => {
      const { type, id, data, error, status, progress, file, message } = event.data;

      if (type === 'PROGRESS') {
        this.currentProgress = { status, progress, file, message };
        this.notifyProgress();
        return;
      }

      if (id && this.pendingRequests.has(id)) {
        const { resolve, reject, timer } = this.pendingRequests.get(id)!;
        clearTimeout(timer);
        this.pendingRequests.delete(id);

        if (type === 'RESULT') {
          resolve(data);
        } else if (type === 'ERROR') {
          reject(new Error(error ?? 'Worker execution error'));
        }
      }
    };

    worker.onerror = (err) => {
      this.currentProgress = {
        status: 'error',
        message: err.message ?? 'Web Worker error occurred.',
      };
      this.notifyProgress();
      for (const [, { reject, timer }] of this.pendingRequests) {
        clearTimeout(timer);
        reject(new Error(err.message ?? 'Worker execution error'));
      }
      this.pendingRequests.clear();
    };

    this.worker = worker;
    return worker;
  }

  private postRequest<T>(payload: Record<string, unknown>, customTimeoutMs?: number): Promise<T> {
    const worker = this.initWorker();
    const id = generateId();
    const timeout = customTimeoutMs ?? this.options.timeoutMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Embedding operation timed out after ${timeout}ms.`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      worker.postMessage({
        ...payload,
        id,
        modelId: this.options.modelId,
        remoteHost: this.options.remoteHost || undefined,
        localModelPath: this.options.localModelPath || undefined,
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return false;
    }
    try {
      await this.postRequest({ type: 'LOAD_MODEL' }, 10000);
      return true;
    } catch {
      return false;
    }
  }

  preload(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        void this.postRequest({ type: 'LOAD_MODEL' }).catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  async getEmbedding(text: string): Promise<Float32Array> {
    const trimmed = text.trim();
    const textHash = hashText(trimmed);

    // Check memory cache
    const cached = this.referenceCache.get(textHash);
    if (cached) return cached;

    const rawArray = await this.postRequest<number[]>({
      type: 'EXTRACT',
      text: trimmed,
    });

    const floatArray = new Float32Array(rawArray);
    this.referenceCache.set(textHash, floatArray);
    return floatArray;
  }

  async computeCosineSimilarity(textA: string, textB: string): Promise<number> {
    const similarity = await this.postRequest<number>({
      type: 'COSINE_SIMILARITY',
      textA: textA.trim(),
      textB: textB.trim(),
    });
    return similarity;
  }

  getProgress(): EmbeddingProgress {
    return this.currentProgress;
  }

  onProgress(callback: (progress: EmbeddingProgress) => void): () => void {
    this.progressListeners.add(callback);
    callback(this.currentProgress);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private notifyProgress(): void {
    for (const listener of this.progressListeners) {
      listener(this.currentProgress);
    }
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, { reject, timer }] of this.pendingRequests) {
      clearTimeout(timer);
      reject(new Error('Embedding provider was destroyed.'));
    }
    this.pendingRequests.clear();
    this.referenceCache.clear();
    this.progressListeners.clear();
  }
}
