"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cloneVoiceAction, generateSpeechAction, removeVoiceProfileAction } from "@/app/(app)/creative/voice-studio/actions";
import { FileDropInput } from "@/components/FileDropInput";
import { SaveToDriveButton } from "@/components/SaveToDriveButton";

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
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const outcome = await cloneVoiceAction(fd);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        formRef.current?.reset();
        setResetKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <h2 className="font-medium">Clone a voice</h2>
        <p className="mt-1 text-sm text-stone-500">
          Upload a short, clean recording (30 seconds or more, one speaker, minimal background noise) of the person whose
          voice you want to use for voice-overs.
        </p>
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
          required
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
          driveViewId="DOCS"
          driveMimeTypes="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
        />
      </div>

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setAudioUrl(null);
    startTransition(async () => {
      const outcome = await generateSpeechAction(fd);
      if (outcome.error) setError(outcome.error);
      else setAudioUrl(outcome.audioUrl ?? null);
    });
  }

  if (voices.length === 0) {
    return <p className="card text-sm text-stone-500">Clone a voice first, then come back here to generate speech.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <h2 className="font-medium">Generate a voice-over</h2>
        <p className="mt-1 text-sm text-stone-500">Type a script, or upload/pick a plain-text (.txt) script file.</p>
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

      <div>
        <label className="label">Or a script file</label>
        <FileDropInput
          key={resetKey}
          name="scriptFile"
          accept=".txt"
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
          driveViewId="DOCS"
          driveMimeTypes="text/plain,application/vnd.google-apps.document"
        />
      </div>

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Generating…" : "Generate voice-over"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {audioUrl && (
        <div className="space-y-2 rounded-lg bg-green-50 px-3 py-3">
          <audio controls src={audioUrl} className="w-full" />
          <div className="flex items-center gap-3">
            <a href={audioUrl} download className="btn-secondary text-xs">
              Download
            </a>
            <SaveToDriveButton
              fileUrl={audioUrl}
              filename={`voiceover-${Date.now()}.mp3`}
              mimeType="audio/mpeg"
              googleClientId={googleClientId}
            />
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
