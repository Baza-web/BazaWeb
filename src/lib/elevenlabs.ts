import "server-only";

const BASE = "https://api.elevenlabs.io/v1";

export function elevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * Clones a voice from a short reference recording — this is a real
 * person's voice likeness, so the caller must have already confirmed
 * consent before calling this (see VoiceProfile.consentNote).
 */
export async function cloneVoice(
  name: string,
  audioBuffer: Buffer,
  filename: string,
): Promise<{ voiceId: string } | { error: string }> {
  if (!elevenLabsConfigured()) {
    return { error: "AI voice cloning isn't set up yet — ask an Admin to add ELEVENLABS_API_KEY." };
  }
  const form = new FormData();
  form.append("name", name);
  form.append("files", new Blob([audioBuffer]), filename);

  try {
    const res = await fetch(`${BASE}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `ElevenLabs couldn't clone that voice (${res.status}). ${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as { voice_id: string };
    return { voiceId: data.voice_id };
  } catch {
    return { error: "Couldn't reach ElevenLabs — check your connection and try again." };
  }
}

export type VoiceSettings = { stability: number; similarityBoost: number; style: number };

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { stability: 0.5, similarityBoost: 0.75, style: 0 };

export async function textToSpeech(
  voiceId: string,
  text: string,
  settings: VoiceSettings = DEFAULT_VOICE_SETTINGS,
): Promise<Buffer | { error: string }> {
  if (!elevenLabsConfigured()) {
    return { error: "AI voice generation isn't set up yet — ask an Admin to add ELEVENLABS_API_KEY." };
  }
  try {
    const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarityBoost,
          style: settings.style,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `ElevenLabs couldn't generate that audio (${res.status}). ${body.slice(0, 300)}` };
    }
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return { error: "Couldn't reach ElevenLabs — check your connection and try again." };
  }
}

/** Best-effort — if this fails (e.g. ElevenLabs is briefly unreachable) the local VoiceProfile row is still removed; a stray voice sitting in the ElevenLabs account isn't a correctness problem, just tidiness. */
export async function deleteVoice(voiceId: string): Promise<void> {
  if (!elevenLabsConfigured()) return;
  await fetch(`${BASE}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
  }).catch(() => {});
}
