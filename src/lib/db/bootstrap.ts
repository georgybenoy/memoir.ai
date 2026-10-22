import { probeIndexedDB, type PersistenceMode } from './probe';
import { createIdbRepositories } from './repositories/idb-repositories';
import { createMemoryRepositories } from './repositories/memory-repositories';
import { type StorageRepositories } from './repositories/types';
import { type WorkspaceRecord } from '@/types/domain';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
import { openDatabase, removeDatabase, DB_NAME, type StoreName } from './indexeddb';

export interface BootstrapResult {
  repos: StorageRepositories;
  workspace: WorkspaceRecord;
  persistenceMode: PersistenceMode;
}

let _cachedRepos: StorageRepositories | null = null;
let _cachedMode: PersistenceMode = 'indexeddb';
let _bootstrapPromise: Promise<BootstrapResult> | null = null;

/**
 * Bootstrap the storage layer on application startup.
 * Probes IndexedDB availability, falls back to in-memory adapter if blocked,
 * and initializes or retrieves the workspace record.
 */
export async function bootstrapStorage(dbName = DB_NAME): Promise<BootstrapResult> {
  if (_bootstrapPromise && dbName === DB_NAME) {
    return _bootstrapPromise;
  }

  _bootstrapPromise = (async () => {
    const probe = await probeIndexedDB();
    const mode = probe.mode;
    _cachedMode = mode;

    useSaveStatusStore.getState().setPersistenceMode(mode);

    let repos: StorageRepositories;
    if (mode === 'indexeddb') {
      repos = createIdbRepositories(dbName);
    } else {
      console.warn('IndexedDB unavailable. EduMentor is running in in-memory mode:', probe.reason);
      repos = createMemoryRepositories();
    }

    _cachedRepos = repos;

    // Load or create default workspace record
    // Workspace ID is a random client identifier, not a security boundary.
    const workspace = await repos.workspace.getOrCreateDefault();

    useSaveStatusStore.getState().setSaved(workspace.updatedAt);

    return {
      repos,
      workspace,
      persistenceMode: mode,
    };
  })();

  return _bootstrapPromise;
}

/**
 * Synchronous accessor to the active storage repositories.
 * Falls back to in-memory repositories if bootstrap hasn't finished yet.
 */
export function getStorage(): StorageRepositories {
  if (!_cachedRepos) {
    if (typeof window === 'undefined') {
      return createMemoryRepositories();
    }
    // Eagerly construct Idb repositories as default
    _cachedRepos = createIdbRepositories();
  }
  return _cachedRepos;
}

/**
 * Reset and clear all local data completely, re-initializing a fresh workspace.
 */
export async function clearAllLocalData(dbName = DB_NAME): Promise<WorkspaceRecord> {
  useSaveStatusStore.getState().setSaving();

  if (_cachedMode === 'indexeddb') {
    try {
      const db = await openDatabase(dbName);
      const storeNames: StoreName[] = [
        'workspace',
        'documents',
        'documentChunks',
        'subjects',
        'concepts',
        'conceptDependencies',
        'studySessions',
        'studyPathItems',
        'recallQuestions',
        'recallAttempts',
        'masteryStates',
        'spacedRepetitionStates',
        'conversationMessages',
        'learningEvents',
      ];
      const tx = db.transaction(storeNames, 'readwrite');
      for (const s of storeNames) {
        await tx.objectStore(s).clear();
      }
      await tx.done;
    } catch {
      await removeDatabase(dbName);
    }
  }

  // Clear in-memory instance cache to force a fresh connection
  _cachedRepos = null;
  _bootstrapPromise = null;

  const result = await bootstrapStorage(dbName);
  return result.workspace;
}
