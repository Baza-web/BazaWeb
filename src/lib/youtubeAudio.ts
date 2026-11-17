import "server-only";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const YOUTUBE_URL_RE = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
const MAX_CLIP_SECONDS = 90;
const TIMEOUT_MS = 120_000;

/**
 * Extracts the first ~90 seconds of audio from a YouTube video as mp3, for
 * use as a voice-cloning reference clip — scoped to a staff member's own or
 * otherwise consented footage (see the consent checkbox in cloneVoiceAction).
 * Only youtube.com/youtu.be URLs are accepted; the URL is passed to yt-dlp
 * as a single argv entry (never through a shell), so it can't inject flags
 * or commands even if it weren't already validated.
 */
export async function extractYoutubeAudio(url: string): Promise<Buffer | { error: string }> {
  if (!YOUTUBE_URL_RE.test(url)) {
    return { error: "That doesn't look like a youtube.com or youtu.be video link." };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "yt-audio-"));
  const outputTemplate = path.join(dir, "clip.%(ext)s");

  try {
    await runYtDlp([
      url,
      "-x",
      "--audio-format",
      "mp3",
      "--download-sections",
      `*0-${MAX_CLIP_SECONDS}`,
      "--no-playlist",
      "-o",
      outputTemplate,
    ]);
    return await readFile(path.join(dir, "clip.mp3"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't fetch audio from that link." };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Fetching that video's audio took too long — try a shorter or different video."));
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("YouTube import isn't set up on this server yet — ask an Admin to install yt-dlp and ffmpeg (see DEPLOY.md)."));
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Couldn't download that video's audio. ${stderr.trim().slice(-300)}`));
    });
  });
}
