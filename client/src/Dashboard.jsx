import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
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

/** Turn stored document HTML into a short, readable preview line. */
function htmlToPlainText(html) {
  if (!html) return 'No content yet — open the document to start writing.';

  const text = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();

  return text || 'No content yet — open the document to start writing.';
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function CountPill({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs">
      <Icon className="size-3.5 text-slate-400" aria-hidden="true" />
      {children}
    </span>
  );
}

function DocumentCard({ doc, showOwner, onDelete, onRemove }) {
  const isShared = showOwner;
  const actionHandler = isShared ? onRemove : onDelete;
  const ActionIcon = isShared ? UserMinus : Trash2;
  const actionLabel = isShared ? 'Remove' : 'Delete';

  return (
    <li className="group relative flex min-h-[168px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200/80 hover:shadow-lg hover:shadow-slate-200/60">
      <Link
        to={`/doc/${doc.id}`}
        aria-label={`Open ${doc.title}`}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <span className="rounded-xl bg-indigo-50/80 p-2.5 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
          <FileText className="size-5" aria-hidden="true" />
        </span>

        {actionHandler ? (
          <button
            type="button"
            onClick={() => actionHandler(doc)}
            aria-label={`${actionLabel} ${doc.title}`}
            className="pointer-events-auto relative z-20 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 opacity-70 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
          >
            <ActionIcon className="size-3.5" aria-hidden="true" />
            {actionLabel}
          </button>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 mt-4">
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900 transition-colors group-hover:text-indigo-600">
          {doc.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {htmlToPlainText(doc.content)}
        </p>
      </div>

      <div className="pointer-events-none relative z-10 mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          Updated {formatUpdatedAt(doc.updated_at)}
        </span>

        {isShared ? (
          <span className="inline-flex max-w-[58%] items-center gap-1.5 truncate rounded-full bg-slate-50 px-2 py-0.5 font-medium text-slate-500 ring-1 ring-inset ring-slate-200/70">
            <span
              className="grid size-4 shrink-0 place-items-center rounded-full bg-indigo-100 text-[9px] font-semibold text-indigo-600"
              aria-hidden="true"
            >
              {initials(doc.owner_name)}
            </span>
            <span className="truncate">Shared by {doc.owner_name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 font-medium text-slate-500 ring-1 ring-inset ring-slate-200/70">
            Private
          </span>
        )}
      </div>
    </li>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/90 bg-white/60 px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-indigo-500 shadow-2xs ring-1 ring-slate-200/80">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

function DocumentSection({
  title,
  icon: Icon,
  documents,
  emptyState,
  showOwner = false,
  onDelete,
  onRemove,
}) {
  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-white text-indigo-600 shadow-2xs ring-1 ring-slate-200/80">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200/70">
          {documents.length}
        </span>
      </div>

      {documents.length === 0 ? (
        emptyState
      ) : (
        <ul className="space-y-4">
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
      className="grid gap-10 lg:grid-cols-2"
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1].map((column) => (
        <div key={column}>
          <div className="mb-4 h-5 w-36 animate-pulse rounded bg-slate-200/70" />
          <div className="space-y-4">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="min-h-[168px] animate-pulse rounded-2xl border border-slate-200/80 bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="size-10 rounded-xl bg-slate-100" />
                  <div className="h-6 w-16 rounded-md bg-slate-100" />
                </div>
                <div className="mt-5 h-4 w-2/3 rounded bg-slate-100" />
                <div className="mt-2.5 h-3 w-full rounded bg-slate-50" />
                <div className="mt-1.5 h-3 w-4/5 rounded bg-slate-50" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading documents…</span>
    </div>
  );
}

export default function Dashboard() {
  const { activeUserId } = useAuth();
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

  function openImportPicker() {
    fileInputRef.current?.click();
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
        content: isMarkdown
          ? marked.parse(text, { async: false })
          : textToHtml(text),
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

  const createAction = (
    <button
      type="button"
      onClick={handleCreate}
      disabled={isCreating || isImporting}
      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isCreating ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {isCreating ? 'Creating…' : 'New Document'}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <section className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Workspace
          </span>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-slate-900 sm:text-[2.75rem]">
            My Workspace
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Write, refine, and share your documents in one calm place.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CountPill icon={FolderOpen}>{owned.length} owned</CountPill>
            <CountPill icon={Users}>{shared.length} shared</CountPill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            onClick={openImportPicker}
            disabled={isImporting || isCreating}
            className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {isImporting ? 'Importing…' : 'Import File'}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || isImporting}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {isCreating ? 'Creating…' : 'New Document'}
          </button>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
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
          className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-700"
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
        <div className="grid gap-10 lg:grid-cols-2">
          <DocumentSection
            title="Owned by Me"
            icon={FolderOpen}
            documents={owned}
            onDelete={handleDeleteDocument}
            emptyState={
              <EmptyState
                icon={FileText}
                title="Your first document starts here"
                description="Capture an idea, draft a proposal, or import a file you already have."
                action={createAction}
              />
            }
          />
          <DocumentSection
            title="Shared with Me"
            icon={Users}
            documents={shared}
            showOwner
            onRemove={handleRemoveShared}
            emptyState={
              <EmptyState
                icon={Users}
                title="Nothing shared yet"
                description="Documents that teammates share with you will appear here."
                action={
                  <button
                    type="button"
                    onClick={openImportPicker}
                    disabled={isImporting || isCreating}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload className="size-3.5" aria-hidden="true" />
                    Import File
                  </button>
                }
              />
            }
          />
        </div>
      )}
    </div>
  );
}
