"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub } from "@/lib/rbac";
import { cloneVoice, textToSpeech, deleteVoice } from "@/lib/elevenlabs";
import { detectFileKind, saveUploadedFile } from "@/lib/uploads";

const MAX_SCRIPT_CHARS = 5000;

async function requireCreativeAccess() {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");
  return session;
}

export async function cloneVoiceAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireCreativeAccess();

  const name = String(formData.get("name") || "").trim();
  const consent = formData.get("consent") === "on";
  const sample = formData.get("sample");

  if (!name) return { error: "Give this voice a name (e.g. the speaker's name)." };
  if (!consent) return { error: "You must confirm the speaker consented to their voice being cloned." };
  if (!(sample instanceof File) || sample.size === 0) return { error: "Attach a short voice recording first." };

  const buffer = Buffer.from(await sample.arrayBuffer());
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

export async function generateSpeechAction(formData: FormData): Promise<{ audioUrl?: string; error?: string }> {
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

  const audio = await textToSpeech(profile.elevenLabsVoiceId, text);
  if (!Buffer.isBuffer(audio)) return { error: audio.error };

  const audioFile = new File([audio], `voiceover-${Date.now()}.mp3`, { type: "audio/mpeg" });
  const audioUrl = await saveUploadedFile(audioFile, "voice-generations", false, true);
  if (!audioUrl) return { error: "Generated audio but couldn't save it — try again." };

  await db.voiceGeneration.create({
    data: { voiceProfileId, text, audioUrl, createdById: session.staffId },
  });

  revalidatePath("/creative/voice-studio");
  return { audioUrl };
}
