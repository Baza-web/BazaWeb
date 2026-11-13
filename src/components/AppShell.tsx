"use client";

import { useState } from "react";
import { NavLink } from "./NavLink";

type NavItem = { href: string; label: string };

export function AppShell({
  nav,
  roleLabel,
  staffName,
  unreadMessages,
  unreadNotifications,
  logoutAction,
  children,
}: {
  nav: NavItem[];
  roleLabel: string;
  staffName: string;
  unreadMessages: number;
  unreadNotifications: number;
  logoutAction: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {menuOpen && (
        <button
          aria-label="Dismiss menu overlay"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform border-r border-stone-200 bg-white px-4 py-6 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <h1 className="text-lg font-semibold text-brand-700">Baza ERP</h1>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="text-stone-400 md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="space-y-1" onClick={() => setMenuOpen(false)}>
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="text-stone-500 md:hidden"
              aria-label="Open menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <span className="hidden text-sm text-stone-500 sm:inline">{roleLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <a href="/inbox" className="relative text-sm text-stone-600 hover:text-brand-700" title="Inbox">
              Inbox
              {unreadMessages > 0 && (
                <span className="badge ml-1 bg-brand-600 text-white">{unreadMessages}</span>
              )}
            </a>
            <a
              href="/notifications"
              className="relative text-sm text-stone-600 hover:text-brand-700"
              title="Notifications"
            >
              Notifications
              {unreadNotifications > 0 && (
                <span className="badge ml-1 bg-brand-600 text-white">{unreadNotifications}</span>
              )}
            </a>
            <span className="hidden text-sm font-medium text-stone-800 sm:inline">{staffName}</span>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary text-xs">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
