"use client";

/**
 * Logging a stat by voice, for both logging forms.
 *
 * One tap opens the mic and it stays open until the entry is logged or
 * discarded, so a coach can say "shot", watch the play, say "seven", then
 * "wide", at their own pace. The form fills in as the words arrive; the
 * coach places it on the pitch and logs it exactly as if they had clicked.
 * Voice never logs anything by itself: what it heard is always on screen
 * first, so a mishearing is caught before it reaches the sheet.
 *
 * The engine is the browser's own speech recognition (Chrome, Edge, Safari),
 * which is free and needs no key. Chrome sends the audio to Google to
 * transcribe, so it needs a signal; Firefox has none, and the button is
 * simply not shown there. All the meaning is in `lib/hurling/voice.ts`, so a
 * paid engine could replace this one without the forms noticing.
 *
 * Three things the engine does that this has to absorb:
 *
 * - It takes a moment to open the mic after the tap, and anything said in
 *   that moment is lost, usually the stat's first and most important word.
 *   So the button only says "Listening" once audio is actually arriving, and
 *   says so again whenever a restart briefly closes the mic.
 * - It revises its guesses while someone is still talking. So every change
 *   re-reads the whole of what was heard since the mic opened and lays it
 *   over the form as it stood then, rather than adding words one at a time.
 * - It ends a session by itself after a stretch of silence. A coach watching
 *   play is silent a lot, so a session that ends while the mic is still meant
 *   to be open is restarted, carrying over what was already heard.
 *
 * A field the coach taps while the mic is open is pinned: their tap beats
 * anything heard afterwards, so a correction by hand is never undone by the
 * engine revising an older word.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { MicIcon } from "@/components/ui/Icon";
import { parseSpokenStat, speechScore } from "@/lib/hurling/voice";
import type { StatType } from "@/lib/hurling/stats";
import { detailForType, type StatDetail } from "./StatFields";

/* The Web Speech API is not in TypeScript's DOM types; this much of it is used. */
type Alternative = { transcript: string };
type Result = { readonly length: number; readonly [i: number]: Alternative };
type ResultEvent = { results: { readonly length: number; readonly [i: number]: Result } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  start(): void;
  abort(): void;
};
type RecognitionEngine = new () => Recognition;

function speechEngine(): RecognitionEngine | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionEngine;
    webkitSpeechRecognition?: RecognitionEngine;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** A mic left open by mistake should not listen to the whole half. */
const MAX_LISTEN_MS = 90_000;

const ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it for this site to log by voice.",
  "service-not-allowed": "The microphone is blocked. Allow it for this site to log by voice.",
  network: "Voice needs a signal. Tap the stat in instead.",
  "audio-capture": "No microphone found on this device.",
};

export type VoiceEntry = ReturnType<typeof useVoiceEntry>;

export function useVoiceEntry({
  statType,
  statTypes,
  detail,
  chooseType,
  setDetail,
  onStart,
  onRetake,
}: {
  statType: StatType;
  /** The stats this sheet logs, so a type the code lacks is never switched to. */
  statTypes: readonly StatType[];
  detail: StatDetail;
  /** The form's own type switch, so a spoken type behaves like a pressed tab. */
  chooseType: (type: StatType) => void;
  setDetail: Dispatch<SetStateAction<StatDetail>>;
  /** The mic opening is the moment the coach saw it, so the pad stamps the time here. */
  onStart?: () => void;
  /** "Scrap that": the form clears what voice cannot, the points on the map. */
  onRetake: () => void;
}) {
  const supported = useSyncExternalStore(noSubscribe, () => speechEngine() !== null, () => false);
  const [listening, setListening] = useState(false);
  // The mic is really open, not just asked for.
  const [hearing, setHearing] = useState(false);
  const [heard, setHeard] = useState("");
  const [caught, setCaught] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Heard in earlier sessions of this same entry, before the engine restarted.
  const earlier = useRef("");
  const latest = useRef("");
  // The form as it stood when the mic opened, and what has been tapped since.
  const base = useRef<{ type: StatType; detail: StatDetail } | null>(null);
  const pinned = useRef<Partial<StatDetail>>({});
  const pinnedType = useRef<StatType | null>(null);
  const appliedType = useRef<StatType | null>(null);
  const resets = useRef(0);

  // The engine's handlers outlive a render, so they read the form's latest
  // callbacks through a ref rather than the ones from when the mic opened.
  const callbacks = useRef({ chooseType, onStart, onRetake, statTypes });
  useEffect(() => {
    callbacks.current = { chooseType, onStart, onRetake, statTypes };
  });

  const apply = (text: string) => {
    const b = base.current;
    if (!b) return;
    const said = parseSpokenStat(text, b.type, callbacks.current.statTypes);
    if (said.resets > resets.current) {
      resets.current = said.resets;
      pinned.current = {};
      pinnedType.current = null;
      callbacks.current.onRetake();
    }
    const type = pinnedType.current ?? said.statType;
    if (type !== appliedType.current) {
      appliedType.current = type;
      callbacks.current.chooseType(type);
    }
    const from = type === b.type ? b.detail : detailForType(b.detail);
    setDetail({ ...from, ...said.fields, ...pinned.current });
    setCaught(said.hits > 0 || said.resets > 0);
  };

  const halt = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    base.current = null;
    const r = recognition.current;
    recognition.current = null;
    r?.abort();
    setListening(false);
    setHearing(false);
  };

  const start = () => {
    const Engine = speechEngine();
    if (!Engine || recognition.current) return;

    base.current = { type: statType, detail };
    pinned.current = {};
    pinnedType.current = null;
    appliedType.current = statType;
    resets.current = 0;
    earlier.current = "";
    latest.current = "";
    setHeard("");
    setCaught(true);
    setError(null);

    const r = new Engine();
    // Irish English, so the engine expects the accents it is about to hear.
    r.lang = "en-IE";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 5;

    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        // Of the engine's guesses for this stretch, the one that reads most
        // like a stat. "Shot seven point" beats "shop seven pint".
        const result = e.results[i];
        let best = result[0]?.transcript ?? "";
        let score = speechScore(best);
        for (let j = 1; j < result.length; j++) {
          const s = speechScore(result[j].transcript);
          if (s > score) {
            best = result[j].transcript;
            score = s;
          }
        }
        parts.push(best.trim());
      }
      const text = [earlier.current, ...parts].filter(Boolean).join(" ");
      latest.current = text;
      setHeard(text);
      apply(text);
    };

    r.onaudiostart = () => {
      if (recognition.current === r) setHearing(true);
    };
    r.onaudioend = () => {
      if (recognition.current === r) setHearing(false);
    };

    r.onerror = (e) => {
      // Silence and our own abort are not failures.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(ERRORS[e.error] ?? "Voice stopped. Tap the stat in, or try the mic again.");
      halt();
    };

    r.onend = () => {
      if (recognition.current !== r) return;
      earlier.current = latest.current;
      try {
        r.start();
      } catch {
        halt();
      }
    };

    recognition.current = r;
    try {
      r.start();
    } catch {
      recognition.current = null;
      setError("Voice could not start. Tap the stat in instead.");
      return;
    }
    timer.current = setTimeout(halt, MAX_LISTEN_MS);
    setListening(true);
    callbacks.current.onStart?.();
  };

  // A type tab pressed by hand while the mic is open is pinned, like a
  // tapped field. Voice's own switches are recorded before they happen, so
  // they never look like a press.
  useEffect(() => {
    if (base.current && statType !== appliedType.current) {
      pinnedType.current = statType;
      appliedType.current = statType;
    }
  }, [statType]);

  useEffect(() => halt, []);

  return {
    supported,
    listening,
    hearing,
    heard,
    caught,
    error,
    start,
    /** Stop listening, keeping what was heard on screen. */
    stop: halt,
    /** Stop listening and forget the phrase: the entry was logged or discarded. */
    reset: () => {
      halt();
      setHeard("");
      setCaught(true);
      setError(null);
    },
    /** A field the coach tapped. It beats anything heard after it. */
    pin: (patch: Partial<StatDetail>) => {
      if (base.current) pinned.current = { ...pinned.current, ...patch };
    },
  };
}

/**
 * The mic button, what it heard, and a way out. Not shown at all where the
 * browser has no speech recognition, rather than shown and broken.
 */
export function VoiceBar({ voice, onDiscard }: { voice: VoiceEntry; onDiscard: () => void }) {
  if (!voice.supported) return null;
  const { listening, hearing, heard, caught, error } = voice;
  const waiting = listening && !hearing;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={listening ? voice.stop : voice.start}
          aria-pressed={listening}
          className="btn-outline inline-flex items-center gap-2 text-sm"
          style={listening ? { borderColor: "var(--color-ink)", color: "var(--color-ink)" } : undefined}
        >
          {waiting ? (
            // A hollow dot while the mic opens; it fills once it can hear.
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--color-ink)" }} />
          ) : listening ? (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full motion-safe:animate-pulse"
              style={{ background: "var(--color-ink)" }}
            />
          ) : (
            <MicIcon size={14} />
          )}
          {waiting ? "Opening mic" : listening ? "Listening" : "Say it"}
        </button>
        {(listening || heard) && (
          <button
            type="button"
            onClick={() => {
              voice.reset();
              onDiscard();
            }}
            className="btn-ghost text-xs"
          >
            Discard
          </button>
        )}
      </div>

      {error ? (
        <p className="text-[12px]" style={{ color: "var(--color-danger-ink)" }}>
          {error}
        </p>
      ) : heard ? (
        <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          {caught ? "Heard: " : "Didn't catch a stat in that. Say it again, or tap it in. Heard: "}
          <span style={{ color: "var(--color-ink-dim)" }}>{heard}</span>
        </p>
      ) : waiting ? (
        <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Start speaking when it says Listening, or the first word is lost.
        </p>
      ) : listening ? (
        <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
          Say it as you would to the person beside you, for example &ldquo;shot seven point&rdquo;. Say
          &ldquo;scrap that&rdquo; to start again.
        </p>
      ) : null}
    </div>
  );
}
