/**
 * Mock Embedding Provider for Unit & Integration Testing
 * Source of truth: PRD FR-08, TECH_STACK §8
 */

import {
  type EmbeddingProvider,
  type EmbeddingProgress,
} from './types';

export class MockEmbeddingProvider implements EmbeddingProvider {
  public shouldFail: boolean;
  public failureMessage: string;
  public delayMs: number;
  public simulatedCosine: number;
  private progressListeners = new Set<(p: EmbeddingProgress) => void>();
  private currentProgress: EmbeddingProgress = { status: 'ready', progress: 100 };

  constructor(options: {
    shouldFail?: boolean;
    failureMessage?: string;
    delayMs?: number;
    simulatedCosine?: number;
  } = {}) {
    this.shouldFail = options.shouldFail ?? false;
    this.failureMessage = options.failureMessage ?? 'Mock embedding model failed to load';
    this.delayMs = options.delayMs ?? 0;
    this.simulatedCosine = options.simulatedCosine ?? 0.75;
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  preload(): void {
    // No-op for mock
  }

  async getEmbedding(text: string): Promise<Float32Array> {
    void text;
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.shouldFail) {
      this.currentProgress = { status: 'error', message: this.failureMessage };
      this.notify();
      throw new Error(this.failureMessage);
    }
    // Return dummy 384-dimensional unit vector
    const vec = new Float32Array(384);
    vec[0] = 1.0;
    return vec;
  }

  async computeCosineSimilarity(textA: string, textB: string): Promise<number> {
    void textA;
    void textB;
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.shouldFail) {
      this.currentProgress = { status: 'error', message: this.failureMessage };
      this.notify();
      throw new Error(this.failureMessage);
    }
    return this.simulatedCosine;
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

  private notify(): void {
    for (const l of this.progressListeners) {
      l(this.currentProgress);
    }
  }
}
