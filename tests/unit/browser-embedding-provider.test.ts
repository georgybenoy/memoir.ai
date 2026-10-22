import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserEmbeddingProvider } from '@/features/evaluation/embeddings/browser-embedding-provider';

// Mock Worker implementation
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postedMessages: unknown[] = [];
  terminated = false;

  constructor(public url: URL, public options?: WorkerOptions) {}

  postMessage(message: unknown) {
    this.postedMessages.push(message);

    // Default mock behavior is handled per-test via static handlers or simulated responses
    MockWorker.handleMessage(this, message as { type?: string; id?: string; [key: string]: unknown });
  }

  terminate() {
    this.terminated = true;
  }

  static handleMessage: (
    worker: MockWorker,
    message: { type?: string; id?: string; [key: string]: unknown },
  ) => void = () => {};
}

describe('BrowserEmbeddingProvider', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    // @ts-expect-error Mocking Worker in node environment
    globalThis.Worker = MockWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('reports progress and computes cosine similarity successfully on worker result', async () => {
    MockWorker.handleMessage = (worker, message) => {
      if (message.type === 'LOAD_MODEL') {
        // Send progress first
        worker.onmessage?.({
          data: { type: 'PROGRESS', status: 'downloading', progress: 50, file: 'model.onnx' },
        } as MessageEvent);

        worker.onmessage?.({
          data: { type: 'PROGRESS', status: 'ready', progress: 100 },
        } as MessageEvent);

        worker.onmessage?.({
          data: { type: 'RESULT', id: message.id, data: { loaded: true } },
        } as MessageEvent);
      } else if (message.type === 'COSINE_SIMILARITY') {
        worker.onmessage?.({
          data: { type: 'RESULT', id: message.id, data: 0.82 },
        } as MessageEvent);
      }
    };

    const provider = new BrowserEmbeddingProvider({ timeoutMs: 2000 });
    const progressList: string[] = [];
    provider.onProgress((p) => {
      progressList.push(p.status);
    });

    const isAvailable = await provider.isAvailable();
    expect(isAvailable).toBe(true);
    expect(progressList).toContain('downloading');
    expect(progressList).toContain('ready');

    const similarity = await provider.computeCosineSimilarity(
      'Mitochondria is the powerhouse',
      'The organelle produces ATP',
    );
    expect(similarity).toBe(0.82);

    provider.destroy();
  });

  it('caches reference text embeddings in-memory to avoid redundant worker messages', async () => {
    let extractCount = 0;
    MockWorker.handleMessage = (worker, message) => {
      if (message.type === 'EXTRACT') {
        extractCount++;
        worker.onmessage?.({
          data: { type: 'RESULT', id: message.id, data: [0.1, 0.2, 0.3] },
        } as MessageEvent);
      }
    };

    const provider = new BrowserEmbeddingProvider();
    const text = 'Photosynthesis in plants';

    const emb1 = await provider.getEmbedding(text);
    const emb2 = await provider.getEmbedding(text);

    expect(extractCount).toBe(1);
    expect(emb1).toEqual(emb2);
    expect(emb1[0]).toBeCloseTo(0.1);

    provider.destroy();
  });

  it('rejects with timeout error when worker takes longer than timeoutMs', async () => {
    // Worker does not respond at all
    MockWorker.handleMessage = () => {};

    const provider = new BrowserEmbeddingProvider({ timeoutMs: 100 });

    await expect(provider.computeCosineSimilarity('A', 'B')).rejects.toThrow(
      /timed out after 100ms/,
    );

    provider.destroy();
  });

  it('handles worker load failure and reports error state (degraded mode)', async () => {
    MockWorker.handleMessage = (worker, message) => {
      worker.onmessage?.({
        data: {
          type: 'ERROR',
          id: message.id,
          error: 'Failed to fetch ONNX model file: 404 Not Found',
        },
      } as MessageEvent);
    };

    const provider = new BrowserEmbeddingProvider({ timeoutMs: 1000 });
    const isAvailable = await provider.isAvailable();
    expect(isAvailable).toBe(false);

    await expect(provider.getEmbedding('Cell biology')).rejects.toThrow(/Failed to fetch ONNX/);

    provider.destroy();
  });

  it('returns false for isAvailable when Workers are not supported', async () => {
    // @ts-expect-error Mock undefined Worker
    globalThis.Worker = undefined;

    const provider = new BrowserEmbeddingProvider();
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});
