"use client";

/**
 * Bringing matches across from another app.
 *
 * A club joining Ardawn has last season somewhere else, and if moving it is
 * a weekend's work it will not be moved. So this asks for as little as it
 * can: paste the download links, as many as there are, one per line or
 * straight out of an email. Each is looked at as soon as it lands, and comes
 * back as a match already named from its file, so mostly the coach only
 * reads down the list and presses one button. The server then fetches the
 * files itself, and the page can be closed.
 *
 * Where each app keeps the link is spelled out under the box, because that
 * is the one step the coach has to do on the other side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkFootageLink,
  importFootage,
  removeImport,
  retryImport,
} from "@/lib/actions/imports";
import { readNewMatch } from "@/lib/media/upload";
import type { ImportView } from "@/lib/queries/imports";
import { fileSize, matchDate } from "@/lib/format";

type Draft = {
  key: string;
  link: string;
  state: "checking" | "ready" | "failed" | "sending";
  error?: string;
  filename?: string;
  sizeBytes?: number;
  sourceLabel?: string;
  title: string;
  playedOn: string;
};

/** How often the page asks how the transfers are getting on. */
const POLL_MS = 3000;

/** Every web address in what was pasted: one per line, or scattered through an email. */
function linksIn(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s<>"']+/gi) ?? []));
}

export function FootageImport({ initial }: { initial: ImportView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [imports, setImports] = useState<ImportView[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // The page's own data wins when it reloads: it is what the server holds.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setImports(initial);
  }

  const patch = useCallback((key: string, change: Partial<Draft>) => {
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));
  }, []);

  const check = useCallback(
    (raw: string) => {
      const links = linksIn(raw);
      if (!links.length) return false;
      const fresh: Draft[] = links.map((link) => ({
        key: crypto.randomUUID(),
        link,
        state: "checking",
        title: "",
        playedOn: "",
      }));
      setDrafts((all) => [...all, ...fresh]);
      for (const d of fresh) {
        void checkFootageLink(d.link)
          .then((res) =>
            patch(
              d.key,
              res.ok
                ? {
                    state: "ready",
                    filename: res.filename,
                    sizeBytes: res.sizeBytes,
                    sourceLabel: res.sourceLabel,
                    title: res.title,
                    playedOn: res.playedOn,
                  }
                : { state: "failed", error: res.error },
            ),
          )
          .catch(() => patch(d.key, { state: "failed", error: "Could not reach Ardawn. Check the connection." }));
      }
      return true;
    },
    [patch],
  );

  const ready = drafts.filter((d) => d.state === "ready");

  async function bringAcross() {
    setSending(true);
    for (const d of ready) {
      const named = readNewMatch({ title: d.title, playedOn: d.playedOn });
      if ("error" in named) {
        patch(d.key, { error: named.error });
        continue;
      }
      patch(d.key, { state: "sending", error: undefined });
      try {
        const res = await importFootage({ link: d.link, title: d.title, playedOn: d.playedOn });
        if (res.ok) {
          setDrafts((all) => all.filter((x) => x.key !== d.key));
          setImports((all) => [...all, res.import]);
        } else {
          patch(d.key, { state: "ready", error: res.error });
        }
      } catch {
        patch(d.key, { state: "ready", error: "Could not reach Ardawn. Check the connection and try again." });
      }
    }
    setSending(false);
    router.refresh();
  }

  // Ask how the transfers are going while any is moving. One that has
  // vanished has finished, so the page reloads to show its match as ready.
  const moving = imports.some((i) => !i.error);
  const known = useRef(new Set<string>());
  useEffect(() => {
    known.current = new Set(imports.map((i) => i.id));
  }, [imports]);
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/import").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { imports: ImportView[] };
      const finished = [...known.current].some((id) => !body.imports.some((i) => i.id === id));
      setImports(body.imports);
      if (finished) router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [moving, router]);

  return (
    <div className="mb-6 space-y-4">
      {!open && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
            Matches already on Veo, Pixellot, Hudl, Spiideo, Google Drive or Dropbox?
          </p>
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
            Bring them across
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-4 p-4" style={{ border: "1px solid var(--color-line)", borderRadius: 4 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="title text-lg">Bring matches across</h3>
              <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
                Paste the download link for each match, as many as you have. Ardawn fetches the files
                itself, so nothing goes through this computer and you can close the page once they start.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
              Close
            </button>
          </div>

          <div>
            <label htmlFor="import-links" className="label mb-1.5 block">
              Download links
            </label>
            <textarea
              id="import-links"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                // Pasting is the whole job, so it starts looking straight away.
                const pasted = e.clipboardData.getData("text");
                if (check(pasted)) {
                  e.preventDefault();
                  setText("");
                }
              }}
              placeholder="Paste one link per line, or a whole email with the link in it"
              className="field"
            />
            {text.trim() && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (check(text)) setText("");
                  }}
                  className="btn-ghost text-xs"
                >
                  Look at these links
                </button>
              </div>
            )}
          </div>

          {drafts.length > 0 && (
            <ul>
              {drafts.map((d) => (
                <DraftRow
                  key={d.key}
                  draft={d}
                  onChange={(change) => patch(d.key, { ...change, error: undefined })}
                  onRemove={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}
                />
              ))}
            </ul>
          )}

          {ready.length > 0 && (
            <div className="flex justify-end">
              <button type="button" disabled={sending} onClick={() => void bringAcross()} className="btn-primary">
                {sending
                  ? "Starting…"
                  : ready.length === 1
                    ? "Bring this match across"
                    : `Bring these ${ready.length} matches across`}
              </button>
            </div>
          )}

          <WhereIsTheLink />
        </div>
      )}

      {imports.length > 0 && (
        <div>
          <p className="caption mb-1">
            Coming across from other apps. This carries on with the page closed.
          </p>
          <ul>
            {imports.map((i) => (
              <ImportRow key={i.id} item={i} onChanged={() => router.refresh()} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const busy = draft.state === "checking" || draft.state === "sending";

  return (
    <li className="fixture py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {draft.state === "checking" || draft.state === "failed" ? (
            <div className="truncate text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              {draft.link}
            </div>
          ) : (
            <div className="caption truncate">
              {draft.filename}, {fileSize(draft.sizeBytes ?? 0)}, from {draft.sourceLabel}
            </div>
          )}
          {draft.state === "checking" && <p className="caption mt-0.5">Looking at the link…</p>}
        </div>
        <button type="button" onClick={onRemove} disabled={draft.state === "sending"} className="btn-ghost text-xs">
          Remove
        </button>
      </div>

      {(draft.state === "ready" || draft.state === "sending") && (
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label htmlFor={`title-${draft.key}`} className="label mb-1 block">
              Match title
            </label>
            <input
              id={`title-${draft.key}`}
              value={draft.title}
              disabled={busy}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Who you played"
              autoComplete="off"
              className="field"
            />
          </div>
          <div>
            <label htmlFor={`date-${draft.key}`} className="label mb-1 block">
              Date played
            </label>
            <input
              id={`date-${draft.key}`}
              type="date"
              value={draft.playedOn}
              disabled={busy}
              onChange={(e) => onChange({ playedOn: e.target.value })}
              className="field"
            />
          </div>
        </div>
      )}

      {draft.error && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
          {draft.error}
        </p>
      )}
    </li>
  );
}

function ImportRow({ item, onChanged }: { item: ImportView; onChanged: () => void }) {
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pct = item.sizeBytes ? Math.floor((item.receivedBytes / item.sizeBytes) * 100) : 0;
  const label = `${item.opponent}, ${matchDate(item.playedOn)}`;

  async function retry() {
    setBusy(true);
    setProblem(null);
    const res = await retryImport(item.id, fresh).catch(() => ({
      ok: false as const,
      error: "Could not reach Ardawn. Check the connection.",
    }));
    setBusy(false);
    if (res.ok) {
      setFresh("");
      onChanged();
    } else setProblem(res.error);
  }

  return (
    <li className="fixture py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{label}</div>
          <div className="caption tabular mt-0.5 truncate">
            {item.error
              ? `Stopped at ${fileSize(item.receivedBytes)} of ${fileSize(item.sizeBytes)}, from ${item.sourceLabel}`
              : `${fileSize(item.receivedBytes)} of ${fileSize(item.sizeBytes)}, from ${item.sourceLabel}`}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Stop bringing across ${label}? The match stays, without its video.`)) return;
            setBusy(true);
            await removeImport(item.id).catch(() => {});
            onChanged();
          }}
          className="btn-ghost text-xs"
        >
          {item.error ? "Remove" : "Stop"}
        </button>
      </div>

      {!item.error && (
        <div
          role="progressbar"
          aria-label={`Bringing across ${label}`}
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

      {item.error && (
        <div className="mt-2 space-y-2">
          <p className="text-[13px]" style={{ color: "var(--color-danger-ink)" }}>
            {problem ?? item.error}
          </p>
          <div className="flex gap-2">
            <input
              value={fresh}
              onChange={(e) => setFresh(e.target.value)}
              placeholder="A fresh link, if the old one ran out"
              aria-label={`A fresh link for ${label}`}
              autoComplete="off"
              className="field min-w-0 flex-1"
            />
            <button type="button" disabled={busy} onClick={() => void retry()} className="btn-primary text-xs">
              {busy ? "Starting…" : "Try again"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The one step on the other side: getting the link. Kept to what each app
 * actually offers, a full match as a single download, and ending with the
 * browser trick that works for any of them.
 */
function WhereIsTheLink() {
  const steps: { app: string; how: string }[] = [
    {
      app: "Veo",
      how: "Open the match on app.veo.co, press Download, then Download full game. Copy the link of the download (see the last line below).",
    },
    {
      app: "Pixellot",
      how: "On the game's menu, choose Request HD export. Pixellot emails a link: paste the email, or just the link.",
    },
    {
      app: "Hudl",
      how: "Ask Hudl to download the game. Hudl emails a link that only lasts a while, so paste it the same day.",
    },
    {
      app: "Spiideo",
      how: "Make a download of the full game, then copy the link of the download once it is ready.",
    },
    {
      app: "Google Drive or Dropbox",
      how: "Share the file so anyone with the link can view it, then paste the share link.",
    },
    {
      app: "Any other app",
      how: "Start the download in your browser, open the list of downloads (Ctrl+J, or Cmd+Option+L on a Mac), right click the file's link and copy it. You can cancel the download after.",
    },
  ];

  return (
    <details>
      <summary className="cursor-pointer text-[14px] font-semibold">Where do I find the link?</summary>
      <dl className="mt-3 space-y-3">
        {steps.map((s) => (
          <div key={s.app}>
            <dt className="text-[14px] font-semibold">{s.app}</dt>
            <dd className="text-[14px]" style={{ color: "var(--color-ink-dim)" }}>
              {s.how}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
