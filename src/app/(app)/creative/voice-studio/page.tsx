import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub } from "@/lib/rbac";
import { elevenLabsConfigured } from "@/lib/elevenlabs";
import { formatDateTime } from "@/lib/utils";
import { SpeakerHigh, GearSix } from "@/components/icons";
import { CloneVoiceForm, GenerateVoiceOverForm, RemoveVoiceButton, RemoveGenerationButton } from "@/components/VoiceStudioForms";

export default async function VoiceStudioPage() {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googlePickerApiKey = process.env.GOOGLE_PICKER_API_KEY;

  if (!elevenLabsConfigured()) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="page-title">AI Voice Studio</h1>
          <Link href="/creative" className="btn-secondary">
            Back to Creative Hub
          </Link>
        </div>
        <div className="card text-sm text-stone-600">
          AI voice-overs aren&apos;t set up yet — ask an Admin to add <code className="rounded bg-stone-100 px-1">ELEVENLABS_API_KEY</code>{" "}
          (see DEPLOY.md). Everything else in Creative Hub works as usual in the meantime.
        </div>
      </div>
    );
  }

  const voices = await db.voiceProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: true,
      generations: { orderBy: { createdAt: "desc" }, take: 5, include: { createdBy: true } },
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <SpeakerHigh size={22} weight="fill" aria-hidden="true" />
          </span>
          <div>
            <h1 className="page-title">AI Voice Studio</h1>
            <p className="text-sm text-stone-500">Pick a voice, add your script, and generate a voice-over.</p>
          </div>
        </div>
        <Link href="/creative" className="btn-secondary">
          Back to Creative Hub
        </Link>
      </div>

      <GenerateVoiceOverForm
        voices={voices.map((v) => ({ id: v.id, name: v.name, createdAt: v.createdAt.toISOString() }))}
        googleClientId={googleClientId}
        googlePickerApiKey={googlePickerApiKey}
      />

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
          <GearSix size={16} aria-hidden="true" className="transition-transform group-open:rotate-45" />
          Manage voices — clone a new one or remove an old one
        </summary>

        <div className="mt-4 space-y-6">
          <CloneVoiceForm googleClientId={googleClientId} googlePickerApiKey={googlePickerApiKey} />

          <div className="card">
            <h3 className="section-title mb-3">Cloned voices</h3>
            {voices.length === 0 ? (
              <p className="text-sm text-stone-400">No voices cloned yet.</p>
            ) : (
              <ul className="space-y-3">
                {voices.map((v) => (
                  <li key={v.id} className="rounded-lg bg-stone-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-ink-900">{v.name}</p>
                        <p className="text-xs text-stone-400">
                          Cloned by {v.createdBy.name} · {formatDateTime(v.createdAt)}
                        </p>
                      </div>
                      <RemoveVoiceButton voiceProfileId={v.id} />
                    </div>
                    {v.generations.length > 0 && (
                      <ul className="mt-2 space-y-2 border-t border-stone-200 pt-2">
                        {v.generations.map((g) => (
                          <li key={g.id} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                              <span className="truncate" title={g.text}>
                                {g.text.slice(0, 60)}
                                {g.text.length > 60 ? "…" : ""}
                              </span>
                              <div className="flex shrink-0 items-center gap-2">
                                <a href={g.audioUrl} download className="text-brand-700 hover:underline">
                                  Download
                                </a>
                                <RemoveGenerationButton voiceGenerationId={g.id} />
                              </div>
                            </div>
                            <audio controls src={g.audioUrl} className="h-8 w-full" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
