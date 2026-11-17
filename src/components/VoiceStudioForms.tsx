"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cloneVoiceAction,
  fetchYoutubeAudioAction,
  generateSpeechAction,
  removeVoiceProfileAction,
  removeVoiceGenerationAction,
} from "@/app/(app)/creative/voice-studio/actions";
import { FileDropInput } from "@/components/FileDropInput";
import { SaveToDriveButton } from "@/components/SaveToDriveButton";
import { Microphone, SpeakerHigh, GearSix, DownloadSimple, Play } from "@/components/icons";

type VoiceProfile = { id: string; name: string; createdAt: string };

export function CloneVoiceForm({
  googleClientId,
  googlePickerApiKey,
}: {
  googleClientId?: string;
  googlePickerApiKey?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [ytPending, startYtTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [hasFile, setHasFile] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeAudioUrl, setYoutubeAudioUrl] = useState<string | null>(null);

  function handleFetchFromYoutube() {
    setYoutubeError(null);
    const fd = new FormData();
    fd.set("youtubeUrl", youtubeUrl);
    startYtTransition(async () => {
      const outcome = await fetchYoutubeAudioAction(fd);
      if (outcome.error) setYoutubeError(outcome.error);
      else setYoutubeAudioUrl(outcome.audioUrl ?? null);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasFile && !youtubeAudioUrl) {
      setError("Attach a recording, or fetch one from a YouTube link, first.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const outcome = await cloneVoiceAction(fd);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        formRef.current?.reset();
        setResetKey((k) => k + 1);
        setHasFile(false);
        setYoutubeUrl("");
        setYoutubeAudioUrl(null);
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <Microphone size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-medium">Clone a voice</h2>
          <p className="mt-1 text-sm text-stone-500">
            Upload a short, clean recording (30 seconds or more, one speaker, minimal background noise) of the person
            whose voice you want to use for voice-overs — or paste a link to one of your own team&apos;s YouTube videos
            below.
          </p>
        </div>
      </div>

      <div>
        <label className="label">Speaker&apos;s name</label>
        <input className="input" name="name" placeholder="e.g. Amaya Perera" required />
      </div>

      <div>
        <label className="label">Reference recording</label>
        <FileDropInput
          key={resetKey}
          name="sample"
          accept=".mp3,.wav,.m4a"
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
          driveViewId="DOCS"
          driveMimeTypes="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
          preview="audio"
          onFileChange={(file) => setHasFile(Boolean(file))}
        />
        <p className="mt-1 text-xs text-stone-400">Listen back above before cloning — a clean, single-speaker clip clones best.</p>
      </div>

      <div className="flex items-center gap-3 text-xs font-medium text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        or paste a YouTube link (internal/consented footage only)
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          type="url"
          placeholder="https://youtube.com/watch?v=…"
          value={youtubeUrl}
          onChange={(e) => {
            setYoutubeUrl(e.target.value);
            setYoutubeAudioUrl(null);
          }}
        />
        <button
          type="button"
          onClick={handleFetchFromYoutube}
          disabled={ytPending || !youtubeUrl}
          className="btn-secondary shrink-0 text-sm"
        >
          {ytPending ? "Fetching…" : "Fetch audio"}
        </button>
      </div>
      {youtubeError && <p className="text-sm text-red-600">{youtubeError}</p>}
      {youtubeAudioUrl && (
        <div className="space-y-1">
          <audio controls src={youtubeAudioUrl} className="w-full" />
          <p className="text-xs text-stone-400">First 90 seconds of that video&apos;s audio — listen back before cloning.</p>
        </div>
      )}
      <input type="hidden" name="sampleUrl" value={youtubeAudioUrl ?? ""} />

      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input type="checkbox" name="consent" className="mt-0.5" required />
        <span>
          I confirm the person in this recording has agreed to have their voice cloned and used to generate speech for
          Baza Boutique.
        </span>
      </label>

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Cloning voice…" : "Clone voice"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function GenerateVoiceOverForm({
  voices,
  googleClientId,
  googlePickerApiKey,
}: {
  voices: VoiceProfile[];
  googleClientId?: string;
  googlePickerApiKey?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<{ id: string; audioUrl: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);

  function generate(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const outcome = await generateSpeechAction(fd);
      if (outcome.error) setError(outcome.error);
      else if (outcome.id && outcome.audioUrl) setTake({ id: outcome.id, audioUrl: outcome.audioUrl });
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTake(null);
    generate(new FormData(e.currentTarget));
  }

  function handleTryAgain() {
    if (!formRef.current) return;
    generate(new FormData(formRef.current));
  }

  function handleDiscard() {
    if (!take) return;
    const discarded = take;
    setTake(null);
    startTransition(async () => {
      await removeVoiceGenerationAction(discarded.id);
      router.refresh();
    });
  }

  if (voices.length === 0) {
    return <p className="card text-sm text-stone-500">Clone a voice first, then come back here to generate speech.</p>;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <SpeakerHigh size={18} weight="fill" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-medium">Generate a voice-over</h2>
          <p className="mt-1 text-sm text-stone-500">Pick a voice, add your script, and hit Generate.</p>
        </div>
      </div>

      <div>
        <label className="label">Voice</label>
        <select className="input" name="voiceProfileId" required>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Script</label>
        <textarea className="input" name="text" rows={5} placeholder="Type the words to speak…" />
      </div>

      <div className="flex items-center gap-3 text-xs font-medium text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        or upload a script file
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <FileDropInput
        key={resetKey}
        name="scriptFile"
        accept=".txt"
        googleClientId={googleClientId}
        googlePickerApiKey={googlePickerApiKey}
        driveViewId="DOCS"
        driveMimeTypes="text/plain,application/vnd.google-apps.document"
        preview="text"
      />

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
          <GearSix size={14} aria-hidden="true" className="transition-transform group-open:rotate-45" />
          Advanced voice settings
        </summary>
        <div className="mt-3 space-y-3 rounded-lg bg-stone-50 p-3">
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Stability — steadier vs. more expressive</span>
              <span>{stability.toFixed(2)}</span>
            </div>
            <input
              type="range"
              name="stability"
              min="0"
              max="1"
              step="0.05"
              value={stability}
              onChange={(e) => setStability(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Similarity to the cloned voice</span>
              <span>{similarityBoost.toFixed(2)}</span>
            </div>
            <input
              type="range"
              name="similarityBoost"
              min="0"
              max="1"
              step="0.05"
              value={similarityBoost}
              onChange={(e) => setSimilarityBoost(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>Style exaggeration</span>
              <span>{style.toFixed(2)}</span>
            </div>
            <input
              type="range"
              name="style"
              min="0"
              max="1"
              step="0.05"
              value={style}
              onChange={(e) => setStyle(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </details>

      <button type="submit" disabled={isPending} className="btn-primary flex w-full items-center justify-center gap-2">
        <Play size={16} weight="fill" aria-hidden="true" />
        {isPending ? "Generating…" : "Generate voice-over"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {take && (
        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50/60 p-4">
          <audio controls src={take.audioUrl} className="w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <a href={take.audioUrl} download className="btn-secondary flex items-center gap-1.5 text-xs">
              <DownloadSimple size={14} aria-hidden="true" />
              Download
            </a>
            <SaveToDriveButton
              fileUrl={take.audioUrl}
              filename={`voiceover-${Date.now()}.mp3`}
              mimeType="audio/mpeg"
              googleClientId={googleClientId}
            />
            <button type="button" onClick={handleTryAgain} disabled={isPending} className="btn-secondary text-xs">
              {isPending ? "Regenerating…" : "Edit script above & try again"}
            </button>
            <button type="button" onClick={handleDiscard} disabled={isPending} className="text-xs text-red-600 hover:underline">
              Discard this take
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function RemoveVoiceButton({ voiceProfileId }: { voiceProfileId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (!confirm("Remove this voice? This deletes the clone from ElevenLabs and can't be undone.")) return;
    startTransition(async () => {
      await removeVoiceProfileAction(voiceProfileId);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleRemove} disabled={isPending} className="text-xs text-red-600 hover:underline">
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}

export function RemoveGenerationButton({ voiceGenerationId }: { voiceGenerationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await removeVoiceGenerationAction(voiceGenerationId);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleRemove} disabled={isPending} className="shrink-0 text-xs text-red-600 hover:underline">
      {isPending ? "…" : "Delete"}
    </button>
  );
}
