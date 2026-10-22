'use client';

import * as React from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Bell,
} from 'lucide-react';
import {
  getNotificationStatus,
  requestNotificationPermission,
  sendReviewNotification,
  type NotificationSupportStatus,
} from '@/features/spaced-repetition/notifications';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
import { getStorage, clearAllLocalData } from '@/lib/db/bootstrap';
import {
  createBackupEnvelope,
  downloadBackupFile,
  validateBackupFile,
  executeImport,
  restoreRollbackData,
  type ImportValidationResult,
  type ImportConflictPolicy,
} from '@/lib/db/backup';
import {
  getStorageEstimate,
  requestPersistentStorage,
  type StorageEstimateInfo,
} from '@/lib/db/storage-status';
import { fetchAiHealth } from '@/lib/ai/client';
import { type HealthResponse } from '@/lib/ai/schemas';
import { ALLOWED_MODELS } from '@/lib/config/models';
import { type WorkspaceRecord, type EduMentorBackupEnvelope } from '@/types/domain';

export const SettingsView: React.FC = () => {
  const { addToast } = useWorkspaceStore();
  const {
    status: saveStatus,
    lastSavedAt,
    persistenceMode,
    setSaving,
    setSaved,
    setError,
    restoreLocalDataNotice,
  } = useSaveStatusStore();

  const [workspace, setWorkspace] = React.useState<WorkspaceRecord | null>(null);
  const [estimate, setEstimate] = React.useState<StorageEstimateInfo>({ supported: false });
  const [isPersistLoading, setIsPersistLoading] = React.useState(false);
  const [persistOutcome, setPersistOutcome] = React.useState<string | null>(null);
  const [aiHealth, setAiHealth] = React.useState<HealthResponse | null>(null);
  const [isHealthLoading, setIsHealthLoading] = React.useState(true);

  // Import flow state
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importValidation, setImportValidation] = React.useState<ImportValidationResult | null>(
    null,
  );
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [selectedConflictPolicy, setSelectedConflictPolicy] =
    React.useState<ImportConflictPolicy>('keep_local');
  const [rollbackSnapshot, setRollbackSnapshot] =
    React.useState<EduMentorBackupEnvelope | null>(null);
  const [isRestoringRollback, setIsRestoringRollback] = React.useState(false);

  // Clear data confirmation state
  const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);

  // Load initial workspace record, storage estimate, and AI health
  const loadData = React.useCallback(async () => {
    try {
      const repos = getStorage();
      const ws = await repos.workspace.getOrCreateDefault();
      setWorkspace(ws);
      const est = await getStorageEstimate();
      setEstimate(est);
      const health = await fetchAiHealth();
      setAiHealth(health);
      setIsHealthLoading(false);
    } catch (err) {
      console.error('Failed to load settings data:', err);
      setIsHealthLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const repos = getStorage();

    repos.workspace
      .getOrCreateDefault()
      .then((ws) => {
        if (mounted) setWorkspace(ws);
      })
      .catch((err) => console.error('Failed to load workspace:', err));

    getStorageEstimate()
      .then((est) => {
        if (mounted) setEstimate(est);
      })
      .catch((err) => console.error('Failed to get storage estimate:', err));

    fetchAiHealth()
      .then((h) => {
        if (mounted) {
          setAiHealth(h);
          setIsHealthLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setIsHealthLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Request persistent storage
  const handleRequestPersistence = async () => {
    setIsPersistLoading(true);
    setPersistOutcome(null);
    try {
      const res = await requestPersistentStorage();
      setPersistOutcome(res.message);
      if (res.persisted) {
        addToast({
          type: 'success',
          title: 'Persistent Storage Granted',
          description: res.message,
        });
      } else {
        addToast({
          type: 'warning',
          title: 'Persistence Request',
          description: res.message,
        });
      }
      const est = await getStorageEstimate();
      setEstimate(est);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPersistOutcome(`Request error: ${msg}`);
      addToast({
        type: 'error',
        title: 'Error',
        description: msg,
      });
    } finally {
      setIsPersistLoading(false);
    }
  };

  // Export backup
  const handleExportBackup = async () => {
    try {
      setSaving();
      const repos = getStorage();
      const envelope = await createBackupEnvelope(repos);
      downloadBackupFile(envelope);
      setSaved();
      addToast({
        type: 'success',
        title: 'Backup Exported',
        description: 'Downloaded your complete learning profile as JSON.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      addToast({
        type: 'error',
        title: 'Export Failed',
        description: err instanceof Error ? err.message : 'Failed to export backup.',
      });
    }
  };

  // Handle file picker selection for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const validation = validateBackupFile(content, file.size);
      setImportValidation(validation);
      setImportModalOpen(true);
      // Reset input value so re-selecting same file works
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      addToast({
        type: 'error',
        title: 'File Read Error',
        description: 'Could not read the selected backup file.',
      });
    };
    reader.readAsText(file);
  };

  // Run import with selectable conflict policy
  const handleApplyImport = async (policy: ImportConflictPolicy) => {
    if (!importValidation?.parsedEnvelope) return;
    setIsImporting(true);
    setSaving();

    try {
      const repos = getStorage();
      const result = await executeImport(importValidation.parsedEnvelope, policy, repos);
      setSaved();
      setImportModalOpen(false);
      setImportValidation(null);

      if (result.rollbackExport) {
        setRollbackSnapshot(result.rollbackExport);
      }

      // Reload state
      await loadData();

      const details: string[] = [];
      const totalImported =
        (result.importedCounts.documents ?? 0) + (result.importedCounts.concepts ?? 0);
      if (totalImported > 0) {
        details.push(`${result.importedCounts.concepts ?? 0} concepts, ${result.importedCounts.documents ?? 0} documents`);
      }
      if (result.updatedCount > 0) details.push(`${result.updatedCount} updated`);
      if (result.copiedCount > 0) details.push(`${result.copiedCount} copied`);
      if (result.skippedCount > 0) details.push(`${result.skippedCount} local records preserved`);

      addToast({
        type: 'success',
        title: policy === 'replace_all' || policy === 'replace' ? 'Workspace Replaced' : 'Import Complete',
        description: `Import finished. ${details.join(', ')}.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      addToast({
        type: 'error',
        title: 'Import Failed',
        description: err instanceof Error ? err.message : 'Failed to restore backup.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Restore previous data from rollback safety snapshot
  const handleRestoreRollback = async () => {
    if (!rollbackSnapshot) return;
    setIsRestoringRollback(true);
    setSaving();
    try {
      const repos = getStorage();
      await restoreRollbackData(rollbackSnapshot, repos);
      setSaved();
      setRollbackSnapshot(null);
      await loadData();
      addToast({
        type: 'success',
        title: 'Safety Snapshot Restored',
        description: 'Successfully restored your previous study data from the pre-replace rollback snapshot.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Rollback Failed',
        description: err instanceof Error ? err.message : 'Failed to restore previous snapshot.',
      });
    } finally {
      setIsRestoringRollback(false);
    }
  };

  // Clear all local data
  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      const newWorkspace = await clearAllLocalData();
      setWorkspace(newWorkspace);
      setClearConfirmOpen(false);
      addToast({
        type: 'info',
        title: 'Local Data Cleared',
        description: 'All stored documents, concepts, and history have been wiped. Initialized fresh workspace.',
      });
      const est = await getStorageEstimate();
      setEstimate(est);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Clear Data Failed',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsClearing(false);
    }
  };

  const [notificationPermStatus, setNotificationPermStatus] =
    React.useState<NotificationSupportStatus>(() => getNotificationStatus());

  // Preference changes
  const handlePreferenceChange = async (
    key: 'model' | 'difficulty' | 'reducedMotion' | 'reviewNotifications',
    value: string | boolean,
  ) => {
    try {
      setSaving();
      const repos = getStorage();
      const updated = await repos.workspace.updatePreferences({ [key]: value });
      setWorkspace(updated);
      setSaved();
      addToast({
        type: 'success',
        title: 'Preference Saved',
        description: `Updated ${key} setting.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleToggleNotifications = async () => {
    const isCurrentlyEnabled = workspace?.preferences.reviewNotifications ?? false;
    if (isCurrentlyEnabled) {
      await handlePreferenceChange('reviewNotifications', false);
      addToast({
        type: 'info',
        title: 'Notifications Disabled',
        description: 'Review notifications have been turned off.',
      });
      return;
    }

    // Explicit click request: never requested on page load
    const status = await requestNotificationPermission();
    setNotificationPermStatus(status);

    if (status === 'granted') {
      await handlePreferenceChange('reviewNotifications', true);
      addToast({
        type: 'success',
        title: 'Review Notifications Enabled',
        description: 'You will receive reminders when due reviews are pending while EduMentor is open.',
      });
      sendReviewNotification({
        title: 'EduMentor Review Reminders',
        body: 'Review notifications enabled. We will remind you when scheduled reviews are due.',
      });
    } else if (status === 'denied') {
      await handlePreferenceChange('reviewNotifications', false);
      addToast({
        type: 'warning',
        title: 'Permission Denied',
        description:
          'Browser notifications are blocked. If you want reminders, allow them in your browser site permissions.',
      });
    } else {
      await handlePreferenceChange('reviewNotifications', false);
      addToast({
        type: 'info',
        title: 'Notifications Unavailable',
        description: 'Web notifications are not supported by this browser environment.',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Data & Settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your browser-local learning profile, export backups, and configure preferences.
        </p>
      </div>

      {/* Storage Architecture Honest Disclosure Banner */}
      <Card className="border-[var(--border-color)] bg-[var(--surface-raised)]/70">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-[var(--accent-blue)]" aria-hidden="true" />
            <CardTitle>Browser-Local Storage Architecture</CardTitle>
          </div>
          <CardDescription>
            EduMentor is private by design. Learning records, uploaded notes, and review schedules
            stay exclusively inside your browser&apos;s IndexedDB profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
          <p>
            • <strong>No Cloud Sync:</strong> Your data does not automatically move to other
            devices or browsers.
          </p>
          <p>
            • <strong>Retention:</strong> Clearing your browser&apos;s site data will delete all
            stored materials unless you have exported a JSON backup.
          </p>
          <p>
            • <strong>AI Processing Boundary:</strong> Only excerpts needed for specific
            user-initiated tutoring or evaluation actions are transmitted to Google Gemini.
          </p>
        </CardContent>
        <CardFooter className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={restoreLocalDataNotice}
            className="text-xs text-[var(--accent-blue)]"
          >
            Show top reminder banner again
          </Button>
        </CardFooter>
      </Card>

      {/* Persistence & Quota Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <CardTitle>Storage Status & Health</CardTitle>
          </div>
          <CardDescription>
            Current persistence mode and device disk allocation for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3">
              <span className="text-xs text-[var(--text-muted)] block">Persistence Adapter</span>
              <div className="flex items-center gap-2 mt-1">
                {persistenceMode === 'indexeddb' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      IndexedDB (Durable Profile)
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" />
                    <span className="text-sm font-semibold text-[var(--warning)]">
                      In-Memory (Non-persistent session)
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3">
              <span className="text-xs text-[var(--text-muted)] block">Last Persisted Save</span>
              <span className="text-sm font-semibold text-[var(--text-primary)] mt-1 block">
                {saveStatus === 'saving'
                  ? 'Saving in progress...'
                  : lastSavedAt
                    ? new Date(lastSavedAt).toLocaleString()
                    : 'Initial state'}
              </span>
            </div>
          </div>

          {estimate.supported && (
            <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  IndexedDB Usage: {estimate.formattedUsage} / {estimate.formattedQuota}
                </span>
                {estimate.percentUsed !== undefined && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {estimate.percentUsed}% used
                  </span>
                )}
              </div>
              <div className="w-full bg-[var(--surface-hover)] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[var(--primary)] h-2 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(2, estimate.percentUsed ?? 1))}%` }}
                />
              </div>
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)] pt-3">
                <span>
                  Persistent Storage:{' '}
                  {estimate.isPersisted === true
                    ? 'Protected from automatic browser eviction'
                    : 'Standard browser quota (may be evicted if disk is full)'}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRequestPersistence}
                  isLoading={isPersistLoading}
                  className="text-xs text-[var(--text-primary)] hover:text-[var(--accent-blue)] h-8 px-3 shrink-0"
                  aria-label="Ask the browser to keep this data"
                >
                  Ask the browser to keep this data
                </Button>
              </div>
              {persistOutcome && (
                <div className="mt-2 rounded bg-[var(--surface-raised)] border border-[var(--border-color)] p-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">Outcome: </span>
                  {persistOutcome}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gemini Model & AI Service Status (FR-17) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <CardTitle>Gemini AI Model & Gateway</CardTitle>
          </div>
          <CardDescription>
            Configure the AI model used for concept extraction, Socratic explanations, and question generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)]">Backend AI Gateway Status</span>
              {isHealthLoading ? (
                <span className="text-xs text-[var(--text-muted)]">Checking service...</span>
              ) : aiHealth?.aiConfigured ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Configured & Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--warning)]">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <span>API Key Not Configured (Offline Fallback)</span>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
              <strong>Strict Security Boundary:</strong> The Gemini API key is configured exclusively as a server environment secret. No secrets are stored in your browser, and no key input field is provided.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
            <div>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Selected Model
              </span>
              <p className="text-xs text-[var(--text-muted)]">
                Validated against server allowlist. Server default: {aiHealth?.defaultModel || 'gemini-3.8-flash'}.
              </p>
            </div>
            <select
              value={workspace?.preferences.model ?? aiHealth?.defaultModel ?? 'gemini-3.8-flash'}
              onChange={(e) => handlePreferenceChange('model', e.target.value)}
              className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              aria-label="Gemini model selection"
            >
              {(aiHealth?.allowedModels && aiHealth.allowedModels.length > 0
                ? aiHealth.allowedModels
                : ALLOWED_MODELS
              ).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Backup and Restore Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-[var(--accent-blue)]" aria-hidden="true" />
            <CardTitle>Export & Restore Backups</CardTitle>
          </div>
          <CardDescription>
            Port your study materials, extracted concepts, and mastery records between devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rollbackSnapshot && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-[10px] border border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10 text-xs">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--accent-blue)] shrink-0" aria-hidden="true" />
                <span>
                  Safety rollback snapshot available from your recent replace operation.
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRestoreRollback}
                isLoading={isRestoringRollback}
                loadingText="Restoring..."
                className="text-xs shrink-0"
              >
                Restore previous data
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            {/* Export action */}
            <div className="flex-1 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-4 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                  Export Learning Profile
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Generates an edumentor-backup JSON file containing all notes, chunks, concepts,
                  dependencies, and SM-2 review progress.
                </p>
              </div>
              <Button variant="primary" onClick={handleExportBackup} className="w-full">
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Export backup file
              </Button>
            </div>

            {/* Import action */}
            <div className="flex-1 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-4 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                  Import / Restore Backup
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                  Inspect and restore a previously saved backup file. Validate schema integrity
                  before applying.
                </p>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                  id="backup-file-input"
                />
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                  Select backup JSON
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Study Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent-cyan)]" aria-hidden="true" />
            <CardTitle>Study Preferences</CardTitle>
          </div>
          <CardDescription>Configure learning difficulty and accessibility settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
            <div>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Difficulty Level
              </span>
              <p className="text-xs text-[var(--text-muted)]">
                Controls question depth, prerequisite sensitivity, and adaptive recall challenge.
              </p>
            </div>
            <select
              value={workspace?.preferences.difficulty ?? 'intermediate'}
              onChange={(e) => handlePreferenceChange('difficulty', e.target.value)}
              className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              aria-label="Difficulty level"
            >
              <option value="beginner">Easier (Beginner)</option>
              <option value="intermediate">Balanced (Intermediate)</option>
              <option value="advanced">Harder (Advanced)</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-sm font-medium text-[var(--text-primary)]">Reduced Motion Override</span>
              <p className="text-xs text-[var(--text-muted)]">
                Disables animated transitions. System prefers-reduced-motion is automatically respected.
              </p>
            </div>
            <Button
              variant={workspace?.preferences.reducedMotion ? 'primary' : 'secondary'}
              size="sm"
              onClick={() =>
                handlePreferenceChange('reducedMotion', !workspace?.preferences.reducedMotion)
              }
              aria-label="Toggle reduced motion preference"
            >
              {workspace?.preferences.reducedMotion ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Boundary Details (PRD §8, DESIGN §11) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-[var(--accent-blue)]" aria-hidden="true" />
            <CardTitle>Privacy & Data Boundaries</CardTitle>
          </div>
          <CardDescription>
            Plain-language summary of where your study data lives and when network requests occur.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3 space-y-2">
            <p>
              • <strong>Stored in IndexedDB:</strong> All uploaded notes, text chunks, concept graphs, prerequisite trees, recall question history, and SM-2 spaced repetition schedules stay locally in this browser profile.
            </p>
            <p>
              • <strong>Sent to Gemini AI:</strong> When you click to extract concepts, generate a question, or evaluate an answer, only the relevant note excerpt chunks and student answer are sent to Google Gemini via serverless route handlers.
            </p>
            <p>
              • <strong>No Multi-Device Sync:</strong> EduMentor does not have accounts, passwords, or a cloud database. Your data does not sync across devices automatically.
            </p>
            <p>
              • <strong>Backups:</strong> Use the Export feature above to download an edumentor-backup JSON file anytime to transfer your learning to another device or browser.
            </p>
            <p>
              • <strong>No Telemetry or Ad Trackers:</strong> No third-party trackers, analytics cookies, or behavioral advertising exist in EduMentor.
            </p>
          </div>
          <div className="pt-1 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Want complete technical details?</span>
            <a
              href="/privacy"
              className="text-xs text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 font-medium"
            >
              Read full privacy notice →
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Review Reminders & Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--accent-orange)]" aria-hidden="true" />
            <CardTitle>Spaced Review Reminders</CardTitle>
          </div>
          <CardDescription>
            Best-effort browser notifications when scheduled concept reviews become due.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
            <div>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Enable Review Notifications
              </span>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Permission is requested only when you click this toggle.
              </p>
            </div>
            <Button
              variant={workspace?.preferences.reviewNotifications ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleToggleNotifications}
              aria-label="Toggle review notifications"
            >
              {workspace?.preferences.reviewNotifications ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3 text-xs space-y-2 text-[var(--text-secondary)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text-primary)]">Browser Status:</span>
              <span className="capitalize font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                {notificationPermStatus}
              </span>
            </div>
            <p className="leading-relaxed text-[var(--text-muted)]">
              <strong>Honest Limitation Notice:</strong> EduMentor runs purely in your browser
              without background servers, push relays, or external cloud cron workers. Reminders
              are best-effort and <em>cannot be guaranteed when EduMentor or your browser is closed</em>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone: Clear Data */}
      <Card className="border-[var(--danger)]/40 bg-[var(--danger)]/5">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--danger)]">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            <CardTitle className="text-[var(--danger)]">Danger Zone: Clear All Data</CardTitle>
          </div>
          <CardDescription>
            Permanently delete all study notes, extracted concepts, review history, and reset your
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            This action cannot be undone by EduMentor. Be sure to export a backup beforehand if you
            wish to keep your study records.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            onClick={() => setClearConfirmOpen(true)}
            className="w-full sm:w-auto"
          >
            Clear all local data
          </Button>
        </CardFooter>
      </Card>

      {/* Import Preview & Action Dialog */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent
          title="Import Backup Preview"
          description="Verify backup structure before applying changes to your local database."
          className="max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Import Backup Preview</DialogTitle>
            <DialogDescription>
              Review the records found in this backup file and choose how to apply them.
            </DialogDescription>
          </DialogHeader>

          {importValidation && !importValidation.valid && (
            <div className="rounded-[10px] border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-4 text-xs text-[var(--danger)] space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Backup Validation Failed</span>
              </div>
              <ul className="list-disc pl-5 space-y-1">
                {importValidation.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {importValidation?.valid && importValidation.preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">Documents</span>
                  <span className="font-semibold text-sm">
                    {importValidation.preview.counts.documents}
                  </span>
                </div>
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">Concepts</span>
                  <span className="font-semibold text-sm">
                    {importValidation.preview.counts.concepts}
                  </span>
                </div>
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">Recall Attempts</span>
                  <span className="font-semibold text-sm">
                    {importValidation.preview.counts.recallAttempts}
                  </span>
                </div>
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">Study Sessions</span>
                  <span className="font-semibold text-sm">
                    {importValidation.preview.counts.studySessions}
                  </span>
                </div>
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">SM-2 Review Items</span>
                  <span className="font-semibold text-sm">
                    {importValidation.preview.counts.spacedRepetitionStates}
                  </span>
                </div>
                <div className="rounded bg-[var(--surface)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--text-muted)] block">Exported Date</span>
                  <span className="font-semibold text-xs truncate block">
                    {importValidation.preview.exportedAt.slice(0, 10)}
                  </span>
                </div>
              </div>

              {importValidation.warnings.length > 0 && (
                <div className="rounded bg-[var(--warning)]/10 border border-[var(--warning)]/40 p-3 text-xs text-[var(--warning)]">
                  <p className="font-medium mb-1">Notice:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {importValidation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Selectable Conflict Policy (PRD §8, FR-18, Task 3) */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Select Conflict Policy:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedConflictPolicy('keep_local')}
                    className={`p-2.5 rounded-[8px] border text-left transition-colors cursor-pointer ${
                      selectedConflictPolicy === 'keep_local'
                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <span className="font-semibold block text-[var(--text-primary)]">Keep Local</span>
                    <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                      Skip colliding records; preserve all existing local data.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedConflictPolicy('prefer_imported')}
                    className={`p-2.5 rounded-[8px] border text-left transition-colors cursor-pointer ${
                      selectedConflictPolicy === 'prefer_imported'
                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <span className="font-semibold block text-[var(--text-primary)]">Prefer Imported</span>
                    <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                      Overwrite local records with incoming data on ID collision.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedConflictPolicy('import_as_copy')}
                    className={`p-2.5 rounded-[8px] border text-left transition-colors cursor-pointer ${
                      selectedConflictPolicy === 'import_as_copy'
                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <span className="font-semibold block text-[var(--text-primary)]">Import as Copy</span>
                    <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                      Assign fresh IDs to collisions and import alongside local data.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedConflictPolicy('replace_all')}
                    className={`p-2.5 rounded-[8px] border text-left transition-colors cursor-pointer ${
                      selectedConflictPolicy === 'replace_all'
                        ? 'border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <span className="font-semibold block text-[var(--danger)]">Replace All</span>
                    <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                      Wipe database and restore backup (safety snapshot created).
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setImportModalOpen(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            {importValidation?.valid && (
              <Button
                variant={selectedConflictPolicy === 'replace_all' ? 'destructive' : 'primary'}
                onClick={() => handleApplyImport(selectedConflictPolicy)}
                isLoading={isImporting}
                loadingText="Importing..."
              >
                {selectedConflictPolicy === 'replace_all'
                  ? 'Replace all data'
                  : selectedConflictPolicy === 'import_as_copy'
                    ? 'Import as copy'
                    : selectedConflictPolicy === 'prefer_imported'
                      ? 'Apply & overwrite'
                      : 'Import backup'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Data Confirmation Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent
          title="Confirm Permanent Deletion"
          description="Are you sure you want to delete all local study records?"
        >
          <DialogHeader>
            <div className="flex items-center gap-2 text-[var(--danger)] mb-1">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              <DialogTitle className="text-[var(--danger)]">
                Permanently Clear All Local Data?
              </DialogTitle>
            </div>
            <DialogDescription>
              This will completely wipe your local IndexedDB database. All notes, concept graphs,
              recall question history, and SM-2 schedules will be destroyed.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)] space-y-2">
            <p className="font-semibold text-[var(--text-primary)]">Recommended before clearing:</p>
            <p>Download a backup JSON to your computer so you can restore your learning later.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportBackup}
              className="w-full text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Export safety backup first
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="ghost"
              onClick={() => setClearConfirmOpen(false)}
              disabled={isClearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAllData}
              isLoading={isClearing}
              loadingText="Clearing..."
            >
              I understand, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
