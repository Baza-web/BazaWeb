"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub } from "@/lib/rbac";
import { cloneVoice, textToSpeech, deleteVoice, DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/lib/elevenlabs";
import { detectFileKind, saveUploadedFile, readUploadedFile } from "@/lib/uploads";
import { extractYoutubeAudio } from "@/lib/youtubeAudio";

const MAX_SCRIPT_CHARS = 5000;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function parseVoiceSettings(formData: FormData): VoiceSettings {
  const stability = formData.get("stability");
  const similarityBoost = formData.get("similarityBoost");
  const style = formData.get("style");
  return {
    stability: stability != null ? clamp01(Number(stability)) : DEFAULT_VOICE_SETTINGS.stability,
    similarityBoost: similarityBoost != null ? clamp01(Number(similarityBoost)) : DEFAULT_VOICE_SETTINGS.similarityBoost,
    style: style != null ? clamp01(Number(style)) : DEFAULT_VOICE_SETTINGS.style,
  };
}

async function requireCreativeAccess() {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");
  return session;
}

export async function fetchYoutubeAudioAction(formData: FormData): Promise<{ audioUrl?: string; error?: string }> {
  await requireCreativeAccess();

  const youtubeUrl = String(formData.get("youtubeUrl") || "").trim();
  if (!youtubeUrl) return { error: "Paste a YouTube link first." };

  const audio = await extractYoutubeAudio(youtubeUrl);
  if (!Buffer.isBuffer(audio)) return { error: audio.error };

  const audioFile = new File([audio], "youtube-clip.mp3", { type: "audio/mpeg" });
  const audioUrl = await saveUploadedFile(audioFile, "voice-samples", false, true);
  if (!audioUrl) return { error: "Downloaded that clip but couldn't save it — try again." };

  return { audioUrl };
}

export async function cloneVoiceAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireCreativeAccess();

  const name = String(formData.get("name") || "").trim();
  const consent = formData.get("consent") === "on";
  const sample = formData.get("sample");
  const sampleUrl = String(formData.get("sampleUrl") || "").trim();

  if (!name) return { error: "Give this voice a name (e.g. the speaker's name)." };
  if (!consent) return { error: "You must confirm the speaker consented to their voice being cloned." };

  let buffer: Buffer;
  if (sample instanceof File && sample.size > 0) {
    buffer = Buffer.from(await sample.arrayBuffer());
  } else if (sampleUrl) {
    const fetched = await readUploadedFile(sampleUrl);
    if (!fetched) return { error: "That fetched clip is no longer available — fetch it again." };
    buffer = fetched;
  } else {
    return { error: "Attach a voice recording or fetch one from a YouTube link first." };
  }

  const detected = detectFileKind(buffer);
  if (!detected || detected.kind !== "audio") {
    return { error: "That file isn't a recognizable audio recording (mp3/wav/m4a) — try another file." };
  }

  const result = await cloneVoice(name, buffer, `${name}${detected.ext}`);
  if ("error" in result) return { error: result.error };

  await db.voiceProfile.create({
    data: {
      name,
      elevenLabsVoiceId: result.voiceId,
      consentNote: `${session.role} ${session.staffId} confirmed the speaker's consent on ${new Date().toISOString()}`,
      createdById: session.staffId,
    },
  });

  revalidatePath("/creative/voice-studio");
  return {};
}

export async function removeVoiceProfileAction(voiceProfileId: string): Promise<{ error?: string }> {
  await requireCreativeAccess();

  const profile = await db.voiceProfile.findUnique({ where: { id: voiceProfileId } });
  if (!profile) return { error: "That voice no longer exists." };

  await db.voiceGeneration.deleteMany({ where: { voiceProfileId } });
  await db.voiceProfile.delete({ where: { id: voiceProfileId } });
  await deleteVoice(profile.elevenLabsVoiceId);

  revalidatePath("/creative/voice-studio");
  return {};
}

export async function generateSpeechAction(
  formData: FormData,
): Promise<{ id?: string; audioUrl?: string; error?: string }> {
  const session = await requireCreativeAccess();

  const voiceProfileId = String(formData.get("voiceProfileId") || "");
  const profile = await db.voiceProfile.findUnique({ where: { id: voiceProfileId } });
  if (!profile) return { error: "Choose a cloned voice first." };

  let text = String(formData.get("text") || "").trim();
  const scriptFile = formData.get("scriptFile");
  if (!text && scriptFile instanceof File && scriptFile.size > 0) {
    text = Buffer.from(await scriptFile.arrayBuffer()).toString("utf-8").trim();
  }
  if (!text) return { error: "Type a script, or upload/pick a plain-text (.txt) script file." };
  if (text.length > MAX_SCRIPT_CHARS) {
    return { error: `That script is ${text.length} characters — keep it under ${MAX_SCRIPT_CHARS} per generation.` };
  }

  const settings = parseVoiceSettings(formData);
  const audio = await textToSpeech(profile.elevenLabsVoiceId, text, settings);
  if (!Buffer.isBuffer(audio)) return { error: audio.error };

  const audioFile = new File([audio], `voiceover-${Date.now()}.mp3`, { type: "audio/mpeg" });
  const audioUrl = await saveUploadedFile(audioFile, "voice-generations", false, true);
  if (!audioUrl) return { error: "Generated audio but couldn't save it — try again." };

  const generation = await db.voiceGeneration.create({
    data: { voiceProfileId, text, audioUrl, createdById: session.staffId },
  });

  revalidatePath("/creative/voice-studio");
  return { id: generation.id, audioUrl };
}

export async function removeVoiceGenerationAction(voiceGenerationId: string): Promise<{ error?: string }> {
  await requireCreativeAccess();
  await db.voiceGeneration.delete({ where: { id: voiceGenerationId } }).catch(() => {});
  revalidatePath("/creative/voice-studio");
  return {};
}
