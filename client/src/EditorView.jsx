import {
  Fragment,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import {
  AlertCircle,
  ArrowLeft,
  Bold,
  Check,
  CheckCircle2,
  FileQuestion,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Save,
  Send,
  Share2,
  Underline as UnderlineIcon,
  UserMinus,
  X,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  getDocument,
  revokeDocumentShare,
  shareDocument,
  updateDocument,
} from './api';

const AUTOSAVE_DELAY_MS = 800;
const SAVED_INDICATOR_MS = 2000;

/** SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC; render it in local time. */
function formatTimestamp(value) {
  if (!value) return 'never';

  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
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

// --- Toolbar ----------------------------------------------------------------

const FORMAT_BUTTONS = [
  {
    id: 'bold',
    label: 'Bold',
    group: 0,
    Icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    group: 0,
    Icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    id: 'underline',
    label: 'Underline',
    group: 0,
    Icon: UnderlineIcon,
    isActive: (editor) => editor.isActive('underline'),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    group: 1,
    Icon: Heading1,
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    group: 1,
    Icon: Heading2,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'bullet-list',
    label: 'Bullet list',
    group: 2,
    Icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    group: 2,
    Icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
];

function Toolbar({ editor }) {
  if (!editor) return null;

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1"
    >
      {FORMAT_BUTTONS.map((button, index) => {
        const previous = FORMAT_BUTTONS[index - 1];
        const active = button.isActive(editor);

        return (
          <Fragment key={button.id}>
            {previous && previous.group !== button.group ? (
              <span
                aria-hidden="true"
                className="mx-1 h-5 w-px bg-slate-200"
              />
            ) : null}
            <button
              type="button"
              aria-label={button.label}
              aria-pressed={active}
              title={button.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => button.run(editor)}
              className={`grid size-8 place-items-center rounded-md transition ${
                active
                  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <button.Icon className="size-4" aria-hidden="true" />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

// --- Save status ------------------------------------------------------------

function SaveIndicator({ state, message }) {
  if (state === 'saving') {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }

  if (state === 'saved') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"
      >
        <Check className="size-4" aria-hidden="true" />
        Saved!
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span
        role="alert"
        title={message}
        className="inline-flex max-w-[16rem] items-center gap-1.5 truncate text-xs font-medium text-rose-600"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        {message || 'Save failed'}
      </span>
    );
  }

  return (
    <span
      aria-live="polite"
      className="text-xs font-medium text-slate-400"
    >
      {state === 'dirty' ? 'Unsaved changes' : 'All changes saved'}
    </span>
  );
}

// --- Share modal ------------------------------------------------------------

function ShareModal({
  doc,
  activeUserId,
  users,
  sharedWith,
  setSharedWith,
  onClose,
}) {
  const sharedIds = new Set(sharedWith.map((user) => user.id));
  const recipients = users.filter(
    (user) => user.id !== doc.owner_id && !sharedIds.has(user.id)
  );
  const [selectedUserId, setSelectedUserId] = useState(
    recipients.length > 0 ? String(recipients[0].id) : ''
  );
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const selectRef = useRef(null);
  const isSaving = status === 'saving';

  useEffect(() => {
    const previouslyFocused = window.document.activeElement;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    selectRef.current?.focus();

    return () => {
      window.document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault();
        onClose();
      }
    }

    window.document.addEventListener('keydown', handleKeyDown);
    return () => window.document.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  // Keep the dropdown selection valid as collaborators are added or removed.
  useEffect(() => {
    const stillAvailable = recipients.some(
      (user) => String(user.id) === selectedUserId
    );
    if (stillAvailable) return;

    setSelectedUserId(recipients.length > 0 ? String(recipients[0].id) : '');
  }, [recipients, selectedUserId]);

  function handleSelectionChange(event) {
    setSelectedUserId(event.target.value);
    if (status !== 'idle') {
      setStatus('idle');
      setMessage('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const targetUserId = Number(selectedUserId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      setStatus('error');
      setMessage('Choose a person to share with.');
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      const result = await shareDocument(activeUserId, doc.id, targetUserId);
      const sharedUser =
        result?.user || users.find((user) => user.id === targetUserId) || null;
      const recipientName =
        sharedUser?.name ||
        recipients.find((user) => user.id === targetUserId)?.name ||
        'this user';

      if (sharedUser) {
        setSharedWith((current) =>
          current.some((user) => user.id === sharedUser.id)
            ? current
            : [...current, sharedUser]
        );
      }

      setStatus('success');
      setMessage(`Shared with ${recipientName}.`);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Could not share this document.');
    }
  }

  async function handleRevoke(user) {
    setRevokingId(user.id);
    setStatus('idle');
    setMessage('');

    try {
      await revokeDocumentShare(activeUserId, doc.id, user.id);
      setSharedWith((current) =>
        current.filter((entry) => entry.id !== user.id)
      );
      setStatus('success');
      setMessage(`Removed ${user.name}.`);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Could not remove access.');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <Share2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="share-dialog-title"
                className="text-base font-semibold text-slate-900"
              >
                Share document
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {doc.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close share dialog"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="share-recipient"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Share with
            </label>
            {recipients.length > 0 ? (
              <select
                id="share-recipient"
                ref={selectRef}
                value={selectedUserId}
                onChange={handleSelectionChange}
                disabled={isSaving}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {recipients.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Every demo user already has access to this document.
              </p>
            )}
          </div>

          {status === 'success' ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {message}
            </p>
          ) : null}

          {status === 'error' ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {message}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || recipients.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {isSaving ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </form>

        <section className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            People with access
          </h3>

          {sharedWith.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Only you have access right now.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {sharedWith.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(user)}
                    disabled={revokingId !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {revokingId === user.id ? (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <UserMinus className="size-3.5" aria-hidden="true" />
                    )}
                    {revokingId === user.id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// --- Editor surface ---------------------------------------------------------

function EditorSurface({ doc, activeUserId, users }) {
  const [title, setTitle] = useState(doc.title);
  const [contentVersion, setContentVersion] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(doc.updated_at);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sharedWith, setSharedWith] = useState(doc.sharedWith || []);
  const [, setToolbarTick] = useReducer((tick) => tick + 1, 0);

  const autosaveTimerRef = useRef(null);
  const savedIndicatorRef = useRef(null);
  const saveRequestRef = useRef(0);
  const lastSavedRef = useRef({
    title: doc.title,
    content: doc.content || '',
  });
  const latestRef = useRef({
    title: doc.title,
    content: doc.content || '',
  });
  const initialisedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 bundles Underline; disable it and register the
      // explicitly installed extension below so there is only one.
      StarterKit.configure({ underline: false }),
      Underline,
    ],
    content: doc.content || '',
    editorProps: {
      attributes: {
        class: 'tiptap',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document content',
        spellcheck: 'true',
      },
    },
    onUpdate: () => setContentVersion((version) => version + 1),
    // TipTap v3 does not re-render on transactions by default. Force a render
    // so toolbar active states follow the current cursor selection.
    onTransaction: () => setToolbarTick(),
  });

  // Capture the normalized HTML once so mounting does not trigger a save.
  useEffect(() => {
    if (!editor || initialisedRef.current) return;
    initialisedRef.current = true;
    const current = { title: doc.title, content: editor.getHTML() };
    lastSavedRef.current = current;
    latestRef.current = current;
  }, [editor, doc.title]);

  useEffect(() => {
    if (!editor) return;
    latestRef.current = {
      title: title.trim() || 'Untitled document',
      content: editor.getHTML(),
    };
  }, [title, contentVersion, editor]);

  const save = useCallback(async () => {
    if (!editor) return;

    const content = editor.getHTML();
    const nextTitle = title.trim() || 'Untitled document';
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;

    clearTimeout(autosaveTimerRef.current);
    clearTimeout(savedIndicatorRef.current);
    setSaveState('saving');
    setSaveError(null);

    try {
      const updated = await updateDocument(activeUserId, doc.id, {
        title: nextTitle,
        content,
      });

      if (saveRequestRef.current !== requestId) return;

      lastSavedRef.current = {
        title: updated.title,
        content: updated.content,
      };
      setLastUpdatedAt(updated.updated_at);

      const latest = latestRef.current;
      const savedLatest =
        latest.title === updated.title && latest.content === updated.content;

      if (!savedLatest) {
        setSaveState('dirty');
        return;
      }

      setSaveState('saved');
      savedIndicatorRef.current = setTimeout(
        () => setSaveState('idle'),
        SAVED_INDICATOR_MS
      );
    } catch (err) {
      if (saveRequestRef.current !== requestId) return;
      setSaveState('error');
      setSaveError(err.message || 'Could not save changes');
    }
  }, [activeUserId, doc.id, editor, title]);

  // Debounced autosave whenever the title or document body changes.
  useEffect(() => {
    if (!editor) return undefined;

    const latest = latestRef.current;
    if (
      lastSavedRef.current.title === latest.title &&
      lastSavedRef.current.content === latest.content
    ) {
      return undefined;
    }

    clearTimeout(savedIndicatorRef.current);
    setSaveState((current) => (current === 'saving' ? current : 'dirty'));

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [title, contentVersion, editor, save]);

  useEffect(
    () => () => {
      clearTimeout(autosaveTimerRef.current);
      clearTimeout(savedIndicatorRef.current);
    },
    []
  );

  function handleTitleBlur() {
    if (!title.trim()) setTitle('Untitled document');
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All documents
        </Link>

        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} message={saveError} />
          {doc.owner_id === activeUserId ? (
            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === 'saving' || !editor}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === 'saving' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Save
          </button>
        </div>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 pb-5 pt-6 sm:px-8">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled document"
            aria-label="Document title"
            maxLength={200}
            className="-mx-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-slate-900 transition placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-300 focus:bg-slate-50/60 focus:outline-none sm:text-3xl"
          />

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span>Document #{doc.id}</span>
            <span aria-hidden="true">·</span>
            <span>Last saved {formatTimestamp(lastUpdatedAt)}</span>
            {doc.owner_id !== activeUserId ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Shared with you</span>
              </>
            ) : null}
          </div>
        </header>

        <div className="sticky top-16 z-10 border-b border-slate-100 bg-white/95 px-3 py-2 backdrop-blur sm:px-6">
          <Toolbar editor={editor} />
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <EditorContent editor={editor} />
        </div>
      </article>

      <p className="mt-3 text-center text-xs text-slate-400">
        Changes save automatically after you stop typing. Use Save to persist
        immediately.
      </p>

      {isShareOpen ? (
        <ShareModal
          doc={doc}
          activeUserId={activeUserId}
          users={users}
          sharedWith={sharedWith}
          setSharedWith={setSharedWith}
          onClose={() => setIsShareOpen(false)}
        />
      ) : null}
    </div>
  );
}

// --- Page states ------------------------------------------------------------

function EditorLoading() {
  return (
    <div
      className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-6 h-4 w-28 animate-pulse rounded bg-slate-200" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-3 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-8 space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      <span className="sr-only">Loading document…</span>
    </div>
  );
}

function EditorErrorState({ status, message, documentId, onRetry }) {
  const isForbidden = status === 403;
  const isNotFound = status === 404;
  const Icon = isForbidden ? Lock : isNotFound ? FileQuestion : AlertCircle;

  const heading = isForbidden
    ? 'Access denied'
    : isNotFound
      ? 'Document not found'
      : 'Could not load document';

  const description = isForbidden
    ? 'This document has not been shared with the active user. Switch users in the top bar, or ask the owner to share it with you.'
    : isNotFound
      ? `Document #${documentId} does not exist, or it was deleted.`
      : message || 'Something went wrong while loading this document.';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
        {heading}
      </h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to dashboard
        </Link>

        {!isForbidden && !isNotFound && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function EditorView() {
  const { id } = useParams();
  const { activeUserId, users } = useAuth();

  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const documentId = Number(id);

    setDoc(null);
    setError(null);
    setStatus('loading');

    if (!Number.isInteger(documentId) || documentId <= 0) {
      setError({ status: 400, message: 'Invalid document id' });
      setStatus('error');
      return undefined;
    }

    getDocument(activeUserId, documentId)
      .then((data) => {
        if (cancelled) return;
        setDoc(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError({
          status: err.status || 0,
          message: err.message || 'Could not load this document',
        });
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [activeUserId, id, reloadKey]);

  if (status === 'loading') return <EditorLoading />;

  if (status === 'error') {
    return (
      <EditorErrorState
        status={error?.status}
        message={error?.message}
        documentId={id}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  return (
    <EditorSurface
      key={doc.id}
      doc={doc}
      activeUserId={activeUserId}
      users={users}
    />
  );
}
