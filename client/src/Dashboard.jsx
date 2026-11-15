import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { marked } from 'marked';
import { useAuth } from './AuthContext';
import {
  createDocument,
  deleteDocument,
  getDocuments,
  revokeDocumentShare,
} from './api';

/** Imports must stay under 2 MB (2 * 1024 * 1024 bytes). */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * TipTap stores HTML, so plain text is split into paragraphs to preserve line
 * breaks. Text is escaped first, so `<` in the source file cannot inject markup.
 */
function textToHtml(text) {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!normalized) return '';

  return normalized
    .split('\n')
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
    .join('');
}

function titleFromFileName(fileName) {
  const title = fileName.replace(/\.[^.]+$/, '').trim();
  return title || 'Untitled document';
}

/** SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC; render it in local time. */
function formatUpdatedAt(value) {
  if (!value) return 'unknown';

  const normalized = value.includes('T')
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DocumentCard({ doc, showOwner, onDelete, onRemove }) {
  const actionHandler = showOwner ? onRemove : onDelete;
  const ActionIcon = showOwner ? UserMinus : Trash2;
  const actionLabel = showOwner ? 'Remove' : 'Delete';

  return (
    <li className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {doc.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              Updated {formatUpdatedAt(doc.updated_at)}
            </span>
            {showOwner && doc.owner_name ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true">·</span>
                Shared by {doc.owner_name}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={`/doc/${doc.id}`}
          aria-label={`Open ${doc.title}`}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          Open
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        {actionHandler ? (
          <button
            type="button"
            onClick={() => actionHandler(doc)}
            aria-label={`${actionLabel} ${doc.title}`}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <ActionIcon className="size-3.5" aria-hidden="true" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function DocumentSection({
  title,
  icon: Icon,
  documents,
  emptyMessage,
  showOwner = false,
  onDelete,
  onRemove,
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {documents.length}
        </span>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
          <Icon className="mx-auto size-6 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              showOwner={showOwner}
              onDelete={onDelete}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div
      className="grid gap-8 lg:grid-cols-2"
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1].map((column) => (
        <div key={column}>
          <div className="mb-3 h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-[74px] animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading documents…</span>
    </div>
  );
}

export default function Dashboard() {
  const { activeUserId, activeUser } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState({ owned: [], shared: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    getDocuments(activeUserId)
      .then((data) => {
        if (cancelled) return;
        setDocuments({
          owned: Array.isArray(data?.owned) ? data.owned : [],
          shared: Array.isArray(data?.shared) ? data.shared : [],
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeUserId, reloadKey]);

  const owned = documents.owned.filter(
    (doc) => doc.owner_id === activeUserId
  );
  const shared = documents.shared;

  async function handleCreate() {
    setIsCreating(true);
    setActionError(null);

    try {
      const doc = await createDocument(activeUserId, {
        title: 'Untitled document',
        content: '',
      });
      navigate(`/doc/${doc.id}`);
    } catch (err) {
      setActionError(err.message || 'Could not create a document.');
      setIsCreating(false);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file after an error.
    event.target.value = '';
    if (!file) return;

    setActionError(null);

    if (!/\.(txt|md)$/i.test(file.name)) {
      setActionError('Only .txt and .md files can be imported.');
      return;
    }

    if (file.size >= MAX_IMPORT_BYTES) {
      setActionError(
        'That file is too large. Choose a .txt or .md file under 2 MB.'
      );
      return;
    }

    setIsImporting(true);

    try {
      const text = await file.text();
      const isMarkdown = file.name.toLowerCase().endsWith('.md');
      const doc = await createDocument(activeUserId, {
        title: titleFromFileName(file.name),
        content: isMarkdown ? marked.parse(text, { async: false }) : textToHtml(text),
      });
      navigate(`/doc/${doc.id}`);
    } catch (err) {
      setActionError(err.message || 'Could not import that file.');
      setIsImporting(false);
    }
  }

  async function handleDeleteDocument(doc) {
    if (!window.confirm(`Permanently delete "${doc.title}"?`)) return;

    try {
      await deleteDocument(activeUserId, doc.id);
      setDocuments((current) => ({
        ...current,
        owned: current.owned.filter((entry) => entry.id !== doc.id),
      }));
    } catch (err) {
      setActionError(err.message || 'Could not delete this document.');
    }
  }

  async function handleRemoveShared(doc) {
    if (!window.confirm(`Remove "${doc.title}" from your dashboard?`)) return;

    try {
      await revokeDocumentShare(activeUserId, doc.id, activeUserId);
      setDocuments((current) => ({
        ...current,
        shared: current.shared.filter((entry) => entry.id !== doc.id),
      }));
    } catch (err) {
      setActionError(err.message || 'Could not remove this document.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Dashboard
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Welcome back, {activeUser.name}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Documents you own and documents others have shared with you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            tabIndex={-1}
            onChange={handleImportFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isCreating}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {isImporting ? 'Importing…' : 'Import file'}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || isImporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {isCreating ? 'Creating…' : 'Create new document'}
          </button>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="rounded p-0.5 text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <DocumentSection
            title="Owned by Me"
            icon={FolderOpen}
            documents={owned}
            emptyMessage={`${activeUser.name} has not created any documents yet.`}
            onDelete={handleDeleteDocument}
          />
          <DocumentSection
            title="Shared with Me"
            icon={Users}
            documents={shared}
            emptyMessage="Nothing has been shared with this user yet."
            showOwner
            onRemove={handleRemoveShared}
          />
        </div>
      )}
    </div>
  );
}
