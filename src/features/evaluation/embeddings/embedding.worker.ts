/**
 * Web Worker for Browser-Side Embedding Extraction
 * Source of truth: PRD FR-08, TECH_STACK §8
 *
 * Runs @huggingface/transformers quantized all-MiniLM-L6-v2 inside an isolated Web Worker thread.
 * Student answer text is processed entirely within this worker; only model weights are downloaded.
 */

import { pipeline, env, LogLevel, type FeatureExtractionPipeline } from '@huggingface/transformers';

// Configure transformers environment for isolated Web Worker execution
env.allowLocalModels = false;
env.useBrowserCache = true;
env.logLevel = LogLevel.ERROR;

const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractorInstance: FeatureExtractionPipeline | null = null;
let loadPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(modelId = DEFAULT_MODEL_ID): Promise<FeatureExtractionPipeline> {
  if (extractorInstance) return extractorInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    self.postMessage({
      type: 'PROGRESS',
      status: 'loading',
      progress: 0,
      message: 'Downloading quantized embedding model...',
    });

    const pipe = await pipeline('feature-extraction', modelId, {
      dtype: 'q8',
      progress_callback: (info: { status: string; progress?: number; file?: string }) => {
        if (info.status === 'progress' && typeof info.progress === 'number') {
          self.postMessage({
            type: 'PROGRESS',
            status: 'loading',
            progress: Math.round(info.progress),
            file: info.file,
            message: `Loading model files: ${Math.round(info.progress)}%`,
          });
        } else if (info.status === 'ready' || info.status === 'done') {
          self.postMessage({
            type: 'PROGRESS',
            status: 'ready',
            progress: 100,
            file: info.file,
            message: 'Embedding model ready.',
          });
        }
      },
    });

    extractorInstance = pipe;
    self.postMessage({
      type: 'PROGRESS',
      status: 'ready',
      progress: 100,
      message: 'Embedding model loaded successfully.',
    });

    return pipe;
  })();

  return loadPromise;
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, text, textA, textB, modelId, remoteHost, localModelPath } = event.data;

  // Optional model configuration
  if (remoteHost) {
    env.remoteHost = remoteHost;
  }
  if (localModelPath) {
    env.allowLocalModels = true;
    env.localModelPath = localModelPath;
  }

  try {
    if (type === 'LOAD_MODEL') {
      await getExtractor(modelId);
      self.postMessage({ type: 'RESULT', id, data: true });
      return;
    }

    if (type === 'EXTRACT') {
      const extractor = await getExtractor(modelId);
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      // output.data is Float32Array
      const embedding = Array.from(output.data as Float32Array);
      self.postMessage({ type: 'RESULT', id, data: embedding });
      return;
    }

    if (type === 'COSINE_SIMILARITY') {
      const extractor = await getExtractor(modelId);
      const outputA = await extractor(textA, { pooling: 'mean', normalize: true });
      const outputB = await extractor(textB, { pooling: 'mean', normalize: true });

      const vecA = outputA.data as Float32Array;
      const vecB = outputB.data as Float32Array;

      // Vectors are normalized (L2 norm = 1), so cosine similarity is the dot product
      let dot = 0;
      const len = Math.min(vecA.length, vecB.length);
      for (let i = 0; i < len; i++) {
        dot += vecA[i] * vecB[i];
      }

      self.postMessage({ type: 'RESULT', id, data: dot });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
