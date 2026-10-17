"use client";

/**
 * Getting a match file in from the browser.
 *
 * The person doing this is a club secretary or a manager on the clubhouse
 * laptop, so there are two ways in and both are obvious: drag the file from
 * the desktop anywhere onto the squad page, or press Upload video and pick
 * it. The match does not exist until its footage does, so one short form
 * follows — the match's title and the day it was played — and the match is
 * made with the upload. This is the only way to add a match.
 *
 * The file goes up as numbered parts, three at a time, each PUT straight to
 * a signed URL — Cloudflare R2 when hosted, the app's local stand-in for it
 * on a laptop; this code cannot tell which (see src/lib/media/upload.ts and
 * src/lib/storage/). A dropped connection is retried quietly with a growing
 * pause, and an expired link is swapped for a fresh one. If the upload dies
 * altogether — the laptop is closed, the tab is shut — dropping the same file
 * again sends only the parts the store does not already hold, rather than
 * starting three gigabytes over.
 *
 * Upload state lives in one provider so the page-wide drop target, the
 * Footage panel all feed the same queue.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_URLS_PER_REQUEST,
  PARALLEL_PARTS,
  VIDEO_ACCEPT,
  isAcceptedVideo,
  localDay,
  partBytes,
  readNewMatch,
} from "@/lib/media/upload";
import { fileSize, matchDate } from "@/lib/format";

type Upload = {
  id: string;
  filename: string;
  matchLabel: string;
  total: number;
  sent: number;
  state: "sending" | "finishing" | "failed";
  error?: string;
  videoId?: string;
};

type Uploads = {
  uploads: Upload[];
  begin: (files: File[], matchId?: string) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
};

const UploadContext = createContext<Uploads | null>(null);

export function useUploads(): Uploads {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads must be used inside <UploadProvider>.");
  return ctx;
}

/** Network drops retried before giving up: roughly a minute and a half of waiting. */
const RETRIES = 6;

function matchLabel(m: { opponent: string; playedOn: string }): string {
  return `${m.opponent}, ${matchDate(m.playedOn)}`;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** What /api/upload answers: the part layout, and any parts already held. */
type Started = { videoId: string; partSize: number; partCount: number; done: number[] };

/**
 * Send every part the store does not hold yet, a few at a time, each to its
 * own signed URL. Calls `onProgress` with the bytes held after each part.
 */
async function sendParts(
  file: File,
  start: Started,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<void> {
  const plan = { partSize: start.partSize, count: start.partCount };
  const held = new Set(start.done);
  const todo: number[] = [];
  for (let n = 1; n <= plan.count; n++) if (!held.has(n)) todo.push(n);

  let sent = start.done.reduce((total, n) => total + partBytes(n, plan, file.size), 0);
  onProgress(sent);

  // Links are signed in batches, ahead of need, and one batch at a time so
  // parallel senders do not each ask for the same ones.
  const urls = new Map<number, string>();
  let signing: Promise<void> | null = null;
  async function urlFor(n: number, index: number): Promise<string> {
    while (!urls.has(n)) {
      signing ??= (async () => {
        const batch = todo.slice(index, index + MAX_URLS_PER_REQUEST).filter((m) => !urls.has(m));
        const res = await fetch(`/api/upload/${start.videoId}?parts=${batch.join(",")}`, { signal });
        const body = await readJson(res);
        if (!res.ok) throw new Error(String(body.error ?? "Could not get upload links."));
        for (const [k, url] of Object.entries(body.urls as Record<string, string>)) urls.set(Number(k), url);
      })().finally(() => {
        signing = null;
      });
      await signing;
    }
    return urls.get(n)!;
  }

  async function sendPart(n: number, index: number): Promise<void> {
    const from = (n - 1) * plan.partSize;
    const body = file.slice(from, from + partBytes(n, plan, file.size));
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(await urlFor(n, index), { method: "PUT", body, signal });
        if (res.ok) return;
        // Most likely an expired link: forget it, and the retry signs a fresh one.
        if (res.status === 403) urls.delete(n);
        else if (res.status < 500) throw new Error("The upload was refused.");
      } catch (err) {
        // fetch rejects with a TypeError when the network drops; anything else
        // (a refusal above, or a cancel) is final.
        if (signal.aborted || !(err instanceof TypeError)) throw err;
      }
      if (attempt >= RETRIES) {
        throw new Error(
          "The connection kept dropping. Drop the same file again and it carries on from where it stopped.",
        );
      }
      await wait(Math.min(30_000, 1000 * 2 ** attempt), signal);
    }
  }

  let next = 0;
  let failure: unknown = null;
  async function sender(): Promise<void> {
    while (next < todo.length && failure === null) {
      const index = next++;
      try {
        await sendPart(todo[index], index);
      } catch (err) {
        failure ??= err;
        return;
      }
      sent += partBytes(todo[index], plan, file.size);
      onProgress(sent);
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, todo.length) }, sender));
  if (failure !== null) throw failure;
}

/** Where a file should go, as far as the browser knows when it starts. */
type Target = { matchId?: string; newMatch?: { title: string; playedOn: string } };

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<Upload[]>([]);
  /** Files waiting for the coach to name the match they are of. */
  const [waiting, setWaiting] = useState<File[]>([]);
  const live = useRef(new Map<string, { abort: AbortController; videoId: string }>());

  const patch = useCallback((id: string, change: Partial<Upload>) => {
    setUploads((all) => all.map((u) => (u.id === id ? { ...u, ...change } : u)));
  }, []);

  const fail = useCallback((file: File, error: string) => {
    setUploads((all) => [
      ...all,
      { id: crypto.randomUUID(), filename: file.name, matchLabel: "", total: file.size, sent: 0, state: "failed", error },
    ]);
  }, []);

  const send = useCallback(
    async (file: File, target: Target) => {
      let res: Response;
      let start: Record<string, unknown>;
      try {
        res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size, ...target }),
        });
        start = await readJson(res);
      } catch {
        fail(file, "Could not reach Ardawn. Check the connection and try again.");
        return;
      }

      // A new file with nowhere to go yet: ask for the match's title.
      if (start.needsMatch) {
        setWaiting((w) => [...w, file]);
        return;
      }
      if (!res.ok) {
        fail(file, String(start.error ?? "The upload could not start."));
        return;
      }
      // Show the new match in the list straight away, with its file arriving.
      if (start.createdMatch) router.refresh();

      const id = crypto.randomUUID();
      const abort = new AbortController();
      const videoId = String(start.videoId);
      const match = start.match as { opponent: string; playedOn: string };
      live.current.set(id, { abort, videoId });
      setUploads((all) => [
        ...all,
        { id, filename: file.name, matchLabel: matchLabel(match), total: file.size, sent: 0, state: "sending", videoId },
      ]);

      try {
        await sendParts(
          file,
          {
            videoId,
            partSize: Number(start.partSize),
            partCount: Number(start.partCount),
            done: Array.isArray(start.done) ? (start.done as number[]) : [],
          },
          abort.signal,
          (sent) => patch(id, { sent }),
        );

        patch(id, { state: "finishing" });
        const done = await fetch(`/api/upload/${videoId}`, { method: "POST", signal: abort.signal });
        if (done.status === 409) {
          throw new Error("Some of the file did not arrive. Drop the same file again to finish it.");
        }
        if (!done.ok) throw new Error(String((await readJson(done)).error ?? "The upload could not finish."));

        // The finished file now shows in the footage list, with any codec
        // warning beside it, so the queue entry has done its job.
        live.current.delete(id);
        setUploads((all) => all.filter((u) => u.id !== id));
        router.refresh();
      } catch (err) {
        if (abort.signal.aborted) return;
        live.current.delete(id);
        patch(id, { state: "failed", error: (err as Error).message });
      }
    },
    [fail, patch, router],
  );

  const begin = useCallback(
    (files: File[], matchId?: string) => {
      for (const file of files) {
        if (!isAcceptedVideo(file.name)) {
          fail(file, "That is not a video Ardawn can play. Use an MP4, MOV or WebM file.");
          continue;
        }
        // Without a match the server either resumes this file, if it is
        // part-way up already, or says it needs naming.
        void send(file, matchId ? { matchId } : {});
      }
    },
    [fail, send],
  );

  const cancel = useCallback(
    (id: string) => {
      const entry = live.current.get(id);
      live.current.delete(id);
      entry?.abort.abort();
      setUploads((all) => all.filter((u) => u.id !== id));
      if (entry) {
        void fetch(`/api/upload/${entry.videoId}`, { method: "DELETE" }).then(() => router.refresh());
      }
    },
    [router],
  );

  const dismiss = useCallback((id: string) => {
    setUploads((all) => all.filter((u) => u.id !== id));
  }, []);

  // Closing the tab mid-upload loses nothing on the server, but it does stop
  // the upload, so say so before it happens.
  const busy = uploads.some((u) => u.state !== "failed");
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  return (
    <UploadContext.Provider value={{ uploads, begin, cancel, dismiss }}>
      {children}
      <PageDropTarget />
      {waiting.length > 0 && (
        <NameMatch
          // A fresh form per file, so each starts from its own date.
          key={`${waiting.length}-${waiting[0].name}-${waiting[0].lastModified}`}
          file={waiting[0]}
          onSubmit={(newMatch) => {
            void send(waiting[0], { newMatch });
            setWaiting((w) => w.slice(1));
          }}
          onCancel={() => setWaiting((w) => w.slice(1))}
        />
      )}
    </UploadContext.Provider>
  );
}

/**
 * The whole page is a drop target while a file is being dragged over it, so
 * there is nothing to aim for. Only files raise it; dragging a link or a bit
 * of selected text does not.
 */
function PageDropTarget() {
  const { begin } = useUploads();
  const [over, setOver] = useState(false);

  useEffect(() => {
    // dragenter and dragleave fire for every child crossed, so count them.
    let depth = 0;
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overPage = (e: DragEvent) => {
      // Without this the browser opens the file and navigates away.
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) begin(files);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overPage);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overPage);
      window.removeEventListener("drop", drop);
    };
  }, [begin]);

  if (!over) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "color-mix(in oklab, var(--color-stage) 82%, transparent)" }}
    >
      <div
        className="flex w-full max-w-xl flex-col items-center gap-2 px-8 py-16 text-center"
        style={{ border: "2px dashed var(--color-line-strong)", borderRadius: 4 }}
      >
        <p className="display text-4xl">Drop the match here</p>
        <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          MP4, MOV or WebM. Then give the match a title and it goes up.
        </p>
      </div>
    </div>
  );
}

/**
 * Name the match this file is of. The match is made with the upload, so this
 * asks for what it needs — a title and a date — rather than offering a list
 * of matches the file could not yet belong to. The date starts at the day
 * the file was last changed, which is usually the day it was recorded.
 */
function NameMatch({
  file,
  onSubmit,
  onCancel,
}: {
  file: File;
  onSubmit: (match: { title: string; playedOn: string }) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [playedOn, setPlayedOn] = useState(() => localDay(new Date(file.lastModified || Date.now())));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] p-6 backdrop:bg-[color-mix(in_oklab,var(--color-stage)_75%,transparent)]"
      style={{
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-line)",
        borderRadius: 4,
      }}
    >
      <h2 className="title text-xl">Name this match</h2>
      <p className="caption mt-1 truncate">
        {file.name}, {fileSize(file.size)}
      </p>

      <form
        className="mt-5 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const read = readNewMatch({ title, playedOn });
          if ("error" in read) {
            setError(read.error);
            return;
          }
          onSubmit({ title, playedOn });
        }}
      >
        <div>
          <label htmlFor="upload-title" className="label mb-1.5 block">
            Match title
          </label>
          <input
            id="upload-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="Sarsfields"
            autoComplete="off"
            autoFocus
            className="field"
          />
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
            Usually who you played. It is how the match is listed for the panel.
          </p>
        </div>

        <div>
          <label htmlFor="upload-date" className="label mb-1.5 block">
            Date played
          </label>
          <input
            id="upload-date"
            type="date"
            value={playedOn}
            onChange={(e) => {
              setPlayedOn(e.target.value);
              setError(null);
            }}
            className="field"
          />
        </div>

        {error && (
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Upload
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** A button that opens the file picker. With a match, it adds to that match and asks nothing. */
export function UploadButton({
  matchId,
  className,
  children,
}: {
  matchId?: string;
  className: string;
  children: React.ReactNode;
}) {
  const { begin } = useUploads();
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple={!matchId}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared so choosing the same file again (to resume) still fires.
          e.target.value = "";
          if (files.length) begin(files, matchId);
        }}
      />
    </>
  );
}

/** The visible drop area in the Footage panel, plus whatever is on its way up. */
export function UploadArea() {
  const { uploads, cancel, dismiss } = useUploads();

  return (
    <div className="mb-6 space-y-3">
      <div
        className="flex flex-col items-center gap-3 px-4 py-7 text-center"
        style={{ border: "1px dashed var(--color-line-strong)", borderRadius: 4 }}
      >
        <p className="text-[15px]" style={{ color: "var(--color-ink-dim)" }}>
          Drag a match file onto this page
        </p>
        <UploadButton className="btn-primary">Or choose a file</UploadButton>
      </div>

      {uploads.length > 0 && (
        <ul>
          {uploads.map((u) => (
            <UploadRow
              key={u.id}
              upload={u}
              onCancel={() => cancel(u.id)}
              onDismiss={() => dismiss(u.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadRow({
  upload,
  onCancel,
  onDismiss,
}: {
  upload: Upload;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const pct = upload.total ? Math.floor((upload.sent / upload.total) * 100) : 0;
  const failed = upload.state === "failed";

  return (
    <li className="fixture py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{upload.filename}</div>
          <div className="caption tabular mt-0.5">
            {failed
              ? upload.matchLabel || "Not uploaded"
              : upload.state === "finishing"
                ? `Reading the file, ${upload.matchLabel}`
                : `${fileSize(upload.sent)} of ${fileSize(upload.total)}, ${upload.matchLabel}`}
          </div>
        </div>
        <button onClick={failed ? onDismiss : onCancel} className="btn-ghost text-xs">
          {failed ? "Dismiss" : "Cancel"}
        </button>
      </div>

      {failed ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {upload.error}
        </p>
      ) : (
        <div
          role="progressbar"
          aria-label={`Uploading ${upload.filename}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-2 h-1 overflow-hidden"
          style={{ background: "var(--color-line)", borderRadius: 1 }}
        >
          <div
            className="h-full transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${pct}%`, background: "var(--color-ash)" }}
          />
        </div>
      )}
    </li>
  );
}
