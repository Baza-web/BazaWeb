"use client";

import { useState } from "react";
import Link from "next/link";
import { NavLink } from "./NavLink";
import { ClockButton } from "./ClockButton";
import { Diamond, List, X, ChatCircle, Bell, SignOut } from "./icons";
import { initials } from "@/lib/utils";

type NavItem = { href: string; label: string; iconKey: string };

export function AppShell({
  nav,
  roleLabel,
  staffName,
  unreadMessages,
  unreadNotifications,
  isClockedIn,
  logoutAction,
  children,
}: {
  nav: NavItem[];
  roleLabel: string;
  staffName: string;
  unreadMessages: number;
  unreadNotifications: number;
  isClockedIn: boolean;
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
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`bg-sidebar-sheen fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform bg-ink-950 px-4 py-6 transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/20">
              <Diamond size={18} weight="fill" className="text-brand-300" aria-hidden="true" />
            </span>
            <h1 className="font-display text-xl font-semibold text-white">Baza ERP</h1>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="cursor-pointer text-ink-400 hover:text-white md:hidden"
            aria-label="Close menu"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              iconKey={item.iconKey}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="cursor-pointer text-stone-500 hover:text-ink-900 md:hidden"
              aria-label="Open menu"
            >
              <List size={22} aria-hidden="true" />
            </button>
            <span className="hidden text-sm text-stone-500 sm:inline">{roleLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ClockButton isClockedIn={isClockedIn} />
            <Link
              href="/inbox"
              className="relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink-900"
              title="Inbox"
            >
              <ChatCircle size={19} aria-hidden="true" />
              <span className="hidden sm:inline">Inbox</span>
              {unreadMessages > 0 && (
                <span className="badge absolute -right-1 -top-1 h-5 min-w-[1.25rem] justify-center bg-brand-600 px-1 text-[10px] text-white sm:static sm:ml-1">
                  {unreadMessages}
                </span>
              )}
            </Link>
            <Link
              href="/notifications"
              className="relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink-900"
              title="Notifications"
            >
              <Bell size={19} aria-hidden="true" />
              <span className="hidden sm:inline">Notifications</span>
              {unreadNotifications > 0 && (
                <span className="badge absolute -right-1 -top-1 h-5 min-w-[1.25rem] justify-center bg-brand-600 px-1 text-[10px] text-white sm:static sm:ml-1">
                  {unreadNotifications}
                </span>
              )}
            </Link>
            <Link
              href="/account"
              className="hidden cursor-pointer items-center gap-2 rounded-lg border-l border-stone-200 py-1 pl-3 pr-2 transition-colors hover:bg-stone-100 sm:flex"
              title="Your account"
            >
              <span className="avatar h-8 w-8">{initials(staffName)}</span>
              <span className="text-sm font-medium text-ink-800">{staffName}</span>
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-red-700"
                title="Sign out"
              >
                <SignOut size={19} aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
