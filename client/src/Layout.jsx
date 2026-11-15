import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useAuth } from './AuthContext';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function LogoMark() {
  return (
    <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 p-1.5 text-white shadow-xs">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-full"
        aria-hidden="true"
      >
        <path d="M6 18 12 5.5 18 18" />
        <path d="M8.6 13.4h6.8" />
      </svg>
    </span>
  );
}

function AccountSwitcher() {
  const { activeUser, activeUserId, setActiveUserId, users } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    window.document.addEventListener('mousedown', handlePointerDown);
    window.document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.document.removeEventListener('mousedown', handlePointerDown);
      window.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(userId) {
    setActiveUserId(userId);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Account: ${activeUser.name}`}
        className="flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white py-1.5 pl-1.5 pr-2.5 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 sm:pr-3"
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white ${activeUser.color}`}
          aria-hidden="true"
        >
          {initials(activeUser.name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[9rem] truncate text-sm font-medium leading-tight text-slate-900">
            {activeUser.name}
          </span>
          <span className="block max-w-[9rem] truncate text-[11px] leading-tight text-slate-400">
            {activeUser.email}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Switch account"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xl shadow-slate-200/70 backdrop-blur-md"
        >
          <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Switch account
          </p>

          {users.map((user) => {
            const isActive = user.id === activeUserId;

            return (
              <button
                key={user.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handleSelect(user.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                  isActive ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ${user.color}`}
                  aria-hidden="true"
                >
                  {initials(user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user.email}
                  </span>
                </span>
                {isActive ? (
                  <Check
                    className="size-4 shrink-0 text-indigo-600"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 rounded-lg outline-offset-4"
            aria-label="Ajaia Docs home"
          >
            <LogoMark />
            <span className="font-semibold tracking-tight text-slate-900">
              Ajaia Docs
            </span>
          </NavLink>

          <AccountSwitcher />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
