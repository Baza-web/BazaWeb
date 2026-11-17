"use client";

import { useState } from "react";

// Same narrow, locally-scoped Google Identity Services shape used by
// FileDropInput (kept separate rather than shared, to avoid this small
// button depending on that larger component) — see FileDropInput.tsx for
// why this is a type assertion on `window` rather than a global augmentation.
type GoogleIdentityGlobal = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
};
function getGoogleIdentity(): GoogleIdentityGlobal | undefined {
  return (window as unknown as { google?: GoogleIdentityGlobal }).google;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

/** Uploads a same-origin file (e.g. a generated voice-over) into the signed-in user's own Google Drive, reusing the same drive.file OAuth scope as the Drive backup/picker features — no new consent screen. */
export function SaveToDriveButton({
  fileUrl,
  filename,
  mimeType,
  googleClientId,
}: {
  fileUrl: string;
  filename: string;
  mimeType: string;
  googleClientId?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLink, setSavedLink] = useState<string | null>(null);

  if (!googleClientId) return null;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await loadScript("https://accounts.google.com/gsi/client");
      const tokenClient = getGoogleIdentity()!.accounts.oauth2.initTokenClient({
        client_id: googleClientId!,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: async (resp) => {
          if (!resp.access_token) {
            setError("Google didn't grant access — try again.");
            setPending(false);
            return;
          }
          try {
            const fileRes = await fetch(fileUrl);
            if (!fileRes.ok) throw new Error("Couldn't read that file to upload it.");
            const blob = await fileRes.blob();

            const boundary = `baza-${Date.now()}`;
            const metadata = JSON.stringify({ name: filename, mimeType });
            const body = new Blob([
              `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
              `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
              blob,
              `\r\n--${boundary}--`,
            ]);

            const uploadRes = await fetch(
              "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resp.access_token}`,
                  "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
              },
            );
            if (!uploadRes.ok) throw new Error(`Drive upload failed (${uploadRes.status}).`);
            const data = (await uploadRes.json()) as { webViewLink?: string };
            setSavedLink(data.webViewLink ?? "saved");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save that to Drive.");
          } finally {
            setPending(false);
          }
        },
      });
      tokenClient.requestAccessToken();
    } catch {
      setError("Couldn't load Google Drive — check your connection and try again.");
      setPending(false);
    }
  }

  if (savedLink) {
    return savedLink === "saved" ? (
      <span className="text-xs text-green-700">Saved to Drive.</span>
    ) : (
      <a href={savedLink} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">
        Saved to Drive — open it
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={save} disabled={pending} className="btn-secondary text-xs">
        {pending ? "Saving to Drive…" : "Save to Google Drive"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
