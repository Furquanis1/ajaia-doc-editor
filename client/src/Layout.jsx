import { NavLink, Outlet } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAuth } from './AuthContext';

function UserSwitcher() {
  const { activeUserId, setActiveUserId, users } = useAuth();

  return (
    <div
      role="group"
      aria-label="Switch demo user"
      className="flex items-center gap-1 rounded-full bg-slate-100 p-1"
    >
      {users.map((user) => {
        const isActive = user.id === activeUserId;

        return (
          <button
            key={user.id}
            type="button"
            onClick={() => setActiveUserId(user.id)}
            aria-pressed={isActive}
            title={`${user.name} <${user.email}>`}
            className={`flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium transition sm:px-3 ${
              isActive
                ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-5 place-items-center rounded-full text-[10px] font-bold text-white ${user.color}`}
            >
              {user.name.charAt(0)}
            </span>
            <span className="hidden sm:inline">{user.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Layout() {
  const { activeUser } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-slate-900">
                Ajaia Docs
              </span>
              <span className="hidden text-[11px] text-slate-500 sm:block">
                Collaborative editor
              </span>
            </span>
          </NavLink>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-slate-500 md:inline">
              Signed in as {activeUser.name}
            </span>
            <UserSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/80 py-6 text-center text-xs text-slate-400">
        Ajaia Docs · demo identity switcher · Phase 5
      </footer>
    </div>
  );
}
