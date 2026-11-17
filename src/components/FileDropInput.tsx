"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// Narrow, locally-scoped shapes for the Google API Loader (gapi) and Identity
// Services (google.accounts) + Picker (google.picker) scripts — accessed via
// a type assertion on `window` rather than a global `Window` augmentation, so
// this doesn't collide with the separate, unrelated `window.google.maps`
// ambient type declared for the Attendance map picker (src/lib/loadGoogleMaps.ts).
type PickerDoc = { id: string; name: string; mimeType: string };
type PickerResponse = { action: string; docs?: PickerDoc[] };
type GapiGlobal = { load: (api: string, cb: () => void) => void };
type PickerDocsView = {
  setIncludeFolders: (v: boolean) => PickerDocsView;
  setMimeTypes: (v: string) => PickerDocsView;
};
type GooglePickerBuilder = {
  addView: (view: PickerDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (cb: (data: PickerResponse) => void) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};
type GoogleIdentityGlobal = {
  picker: {
    DocsView: new (viewId: unknown) => PickerDocsView;
    ViewId: { SPREADSHEETS: unknown; DOCS: unknown };
    PickerBuilder: new () => GooglePickerBuilder;
    Action: { PICKED: string };
  };
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
function getGapi(): GapiGlobal | undefined {
  return (window as unknown as { gapi?: GapiGlobal }).gapi;
}
function getGoogleIdentity(): GoogleIdentityGlobal | undefined {
  return (window as unknown as { google?: GoogleIdentityGlobal }).google;
}

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOC_MIME = "application/vnd.google-apps.document";
const TEXT_MIME = "text/plain";

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

/**
 * A single file input that accepts a file three ways — click to browse,
 * drag-and-drop, or (when the googleClientId/googlePickerApiKey props are
 * passed in, i.e. GOOGLE_CLIENT_ID/GOOGLE_PICKER_API_KEY are configured
 * server-side) pick one straight out
 * of Google Drive — and always ends up setting the *same* real, named
 * `<input type="file">`'s FileList via DataTransfer, so every existing
 * form/action that reads `inputRef.current.files[0]` or submits via
 * `new FormData(form)` keeps working completely unchanged.
 */
export const FileDropInput = forwardRef<
  HTMLInputElement,
  {
    name: string;
    accept: string;
    required?: boolean;
    onFileChange?: (file: File | null) => void;
    /** Passed down from a server component reading process.env.GOOGLE_CLIENT_ID / GOOGLE_PICKER_API_KEY — not read directly here, since that would need a NEXT_PUBLIC_-prefixed duplicate of a value the server already has. */
    googleClientId?: string;
    googlePickerApiKey?: string;
    /** "SPREADSHEETS" (default, existing bulk-import behavior) or "DOCS" for a general file browser — e.g. picking a script/text file. */
    driveViewId?: "SPREADSHEETS" | "DOCS";
    /** Optional Picker MIME-type filter, e.g. "text/plain,application/vnd.google-apps.document". */
    driveMimeTypes?: string;
  }
>(function FileDropInput(
  { name, accept, required, onFileChange, googleClientId, googlePickerApiKey, driveViewId = "SPREADSHEETS", driveMimeTypes },
  forwardedRef,
) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current!, []);
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [drivePending, setDrivePending] = useState(false);

    const driveConfigured = Boolean(googleClientId && googlePickerApiKey);

    function setFile(file: File | null) {
      if (!inputRef.current) return;
      const dt = new DataTransfer();
      if (file) dt.items.add(file);
      inputRef.current.files = dt.files;
      setFileName(file?.name ?? null);
      onFileChange?.(file);
    }

    function handleDrop(e: React.DragEvent) {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) setFile(file);
    }

    async function openDrivePicker() {
      setDriveError(null);
      setDrivePending(true);
      try {
        await Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")]);
        const tokenClient = getGoogleIdentity()!.accounts.oauth2.initTokenClient({
          client_id: googleClientId!,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: async (resp) => {
            if (!resp.access_token) {
              setDriveError("Google didn't grant access — try again.");
              setDrivePending(false);
              return;
            }
            try {
              await pickAndDownload(resp.access_token);
            } catch (err) {
              setDriveError(err instanceof Error ? err.message : "Couldn't read that file from Drive.");
            } finally {
              setDrivePending(false);
            }
          },
        });
        tokenClient.requestAccessToken();
      } catch {
        setDriveError("Couldn't load Google Drive picker — check your connection and try again.");
        setDrivePending(false);
      }
    }

    function pickAndDownload(accessToken: string): Promise<void> {
      return new Promise((resolve, reject) => {
        getGapi()!.load("picker", () => {
          const google = getGoogleIdentity()!;
          let view = new google.picker.DocsView(google.picker.ViewId[driveViewId]).setIncludeFolders(false);
          if (driveMimeTypes) view = view.setMimeTypes(driveMimeTypes);
          const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(accessToken)
            .setDeveloperKey(googlePickerApiKey!)
            .setCallback(async (data: PickerResponse) => {
              if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]) return resolve();
              const doc = data.docs[0];
              try {
                let url: string;
                let filename = doc.name;
                if (doc.mimeType === SHEET_MIME) {
                  url = `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`;
                  filename = `${doc.name}.xlsx`;
                } else if (doc.mimeType === DOC_MIME) {
                  url = `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(TEXT_MIME)}`;
                  filename = `${doc.name}.txt`;
                } else {
                  url = `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;
                }
                const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (!res.ok) throw new Error(`Drive returned ${res.status}`);
                const blob = await res.blob();
                setFile(new File([blob], filename, { type: blob.type }));
                resolve();
              } catch (err) {
                reject(err);
              }
            })
            .build();
          picker.setVisible(true);
        });
      });
    }

    return (
      <div className="space-y-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
            dragOver ? "border-brand-500 bg-brand-50" : "border-stone-300 hover:border-brand-400"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            name={name}
            accept={accept}
            required={required}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setFileName(file?.name ?? null);
              onFileChange?.(file);
            }}
          />
          {fileName ? (
            <span className="font-medium text-ink-900">{fileName}</span>
          ) : (
            <>
              <span className="text-stone-500">Drag and drop a file here, or click to browse</span>
              <span className="text-xs text-stone-400">{accept.replaceAll(",", ", ")}</span>
            </>
          )}
        </div>
        {driveConfigured && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openDrivePicker();
            }}
            disabled={drivePending}
            className="btn-secondary text-xs"
          >
            {drivePending ? "Opening Google Drive…" : "Choose from Google Drive"}
          </button>
        )}
        {driveError && <p className="text-xs text-red-600">{driveError}</p>}
      </div>
    );
  },
);
