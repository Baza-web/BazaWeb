"use client";

import { useState } from "react";
import Link from "next/link";
import { SocialPostModal } from "./SocialPostModal";
import { CaretRight, Plus } from "./icons";

export type CalendarPost = {
  id: string;
  title: string;
  platform: string;
  status: string;
  scheduledAt: string;
  assignedToName: string | null;
};

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: "IG",
  FACEBOOK: "FB",
  TIKTOK: "TT",
  WHATSAPP_STATUS: "WA",
  OTHER: "—",
};

const STATUS_DOT: Record<string, string> = {
  IDEA: "bg-stone-400",
  DRAFTING: "bg-amber-500",
  READY: "bg-blue-500",
  SCHEDULED: "bg-brand-500",
  POSTED: "bg-green-600",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ContentCalendar({
  groupId,
  year,
  month,
  posts,
  memberOptions,
  prevHref,
  nextHref,
  monthLabel,
}: {
  groupId: string;
  year: number;
  month: number;
  posts: CalendarPost[];
  memberOptions: { id: string; name: string }[];
  prevHref: string;
  nextHref: string;
  monthLabel: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const postsByDay = new Map<number, CalendarPost[]>();
  for (const post of posts) {
    const d = new Date(post.scheduledAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!postsByDay.has(day)) postsByDay.set(day, []);
    postsByDay.get(day)!.push(post);
  }

  const cells: (number | null)[] = Array(startWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function openModalFor(day: number) {
    const dt = new Date(year, month, day, 10, 0);
    setModalDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:00`);
    setModalOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="btn-secondary px-2 py-1 text-xs">
            <CaretRight size={12} className="rotate-180" aria-hidden="true" />
          </Link>
          <h4 className="text-sm font-medium text-ink-900">{monthLabel}</h4>
          <Link href={nextHref} className="btn-secondary px-2 py-1 text-xs">
            <CaretRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            setModalDate(undefined);
            setModalOpen(true);
          }}
          className="btn-primary text-xs"
        >
          <Plus size={14} aria-hidden="true" />
          Plan a post
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-stone-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-[72px] rounded-lg border border-stone-100 p-1 text-left ${
              day ? "bg-white" : "bg-transparent"
            }`}
          >
            {day && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-stone-400">{day}</span>
                  <button
                    type="button"
                    onClick={() => openModalFor(day)}
                    aria-label={`Plan a post for ${monthLabel} ${day}`}
                    className="cursor-pointer text-[11px] text-stone-300 hover:text-brand-600"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 space-y-0.5">
                  {(postsByDay.get(day) ?? []).slice(0, 3).map((post) => (
                    <Link
                      key={post.id}
                      href={`/creative/posts/${post.id}`}
                      className="flex items-center gap-1 rounded bg-stone-50 px-1 py-0.5 text-[10px] text-ink-800 hover:bg-stone-100"
                      title={post.title}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status]}`} aria-hidden="true" />
                      <span className="truncate">
                        {PLATFORM_LABELS[post.platform]} {post.title}
                      </span>
                    </Link>
                  ))}
                  {(postsByDay.get(day)?.length ?? 0) > 3 && (
                    <p className="px-1 text-[10px] text-stone-400">+{postsByDay.get(day)!.length - 3} more</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <SocialPostModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        groupId={groupId}
        memberOptions={memberOptions}
        defaultDate={modalDate}
      />
    </div>
  );
}
