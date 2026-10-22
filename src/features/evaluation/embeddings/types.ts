/**
 * Embedding Provider Types
 * Source of truth: PRD FR-08, TECH_STACK §8
 */

export interface EmbeddingProgress {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress?: number; // 0-100
  file?: string;
  message?: string;
}

export interface EmbeddingProviderOptions {
  modelId?: string;
  remoteHost?: string;
  localModelPath?: string;
  timeoutMs?: number;
}

export interface EmbeddingProvider {
  /**
   * Generates a 384-dimensional normalized float vector for the input text.
   * Student answer text is processed solely in-browser; never transmitted over the network.
   */
  getEmbedding(text: string): Promise<Float32Array>;

  /**
   * Computes cosine similarity in [-1, 1] between two strings.
   */
  computeCosineSimilarity(textA: string, textB: string): Promise<number>;

  /**
   * Checks whether the embedding model and worker environment are operational.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Optional idle prefetch once user begins typing an answer.
   */
  preload?(): void;

  /**
   * Current model loading progress.
   */
  getProgress(): EmbeddingProgress;

  /**
   * Subscribes to model download/initialization progress events.
   */
  onProgress(callback: (progress: EmbeddingProgress) => void): () => void;

  /**
   * Cleans up worker and resources.
   */
  destroy?(): void;
}
