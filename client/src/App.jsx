import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { AuthProvider } from './AuthContext';
import Layout from './Layout';
import Dashboard from './Dashboard';
import EditorView from './EditorView';

function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200/80">
        <FileQuestion className="size-7" aria-hidden="true" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
        404
      </p>
      <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to workspace
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900">
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="doc/:id" element={<EditorView />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
