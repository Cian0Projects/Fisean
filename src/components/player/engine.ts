/**
 * The transport engine.
 *
 * Deliberately not a React component. Player position changes 25–60 times a
 * second, and pushing that through React state would re-render the workspace
 * on every frame. Instead the engine keeps its state in plain fields and
 * notifies subscribers directly, so a timecode readout can update itself by
 * writing to a DOM node while the rest of the page stays still.
 *
 * Four things in here are what make the difference between this feeling like
 * an editing tool and feeling like a web page:
 *
 *  1. Seek coalescing. Dragging a scrubber fires pointermove dozens of times
 *     a second. Issuing a seek for each one queues up work the browser then
 *     has to grind through, and the playhead lags the cursor. We keep a queue
 *     of depth one, always holding only the newest target, and issue it when
 *     the previous seek reports done. Dozens of seeks become a handful.
 *  2. `fastSeek()` while dragging. Safari implements it and it snaps to the
 *     nearest keyframe far more cheaply than assigning `currentTime`. We use
 *     it during a drag and take the exact seek on release.
 *  3. `requestVideoFrameCallback` for position. `timeupdate` fires about four
 *     times a second, which is useless for frame-accurate in/out points.
 *     rVFC reports the presentation time of the frame actually on screen.
 *  4. Reverse shuttle via rAF. `playbackRate` cannot go negative, so running
 *     backwards means stepping `currentTime` down each animation frame.
 */

export type Transport = {
  playing: boolean;
  /** 0 when paused. Negative when shuttling in reverse. */
  rate: number;
  /** Position in the source file, milliseconds. */
  positionMs: number;
  durationMs: number;
  /** True between a seek being issued and the browser reporting it landed. */
  seeking: boolean;
  bufferedMs: number;
};

export type Bounds = { startMs: number; endMs: number } | null;

const SHUTTLE_STEPS = [1, 2, 4, 8] as const;
/** Browsers reject rates much above this. */
const MAX_RATE = 16;

export class PlayerEngine {
  private video: HTMLVideoElement | null = null;
  private listeners = new Set<(t: Transport) => void>();

  /** Depth-one seek queue; see note 1 above. */
  private pendingSeekMs: number | null = null;
  private seekInFlight = false;
  private dragging = false;

  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;
  private reverseHandle: number | null = null;
  private lastReverseTs = 0;

  /** Frames per second, for frame stepping. Refined from rVFC as we go. */
  fps = 25;
  private frameTimes: number[] = [];

  /** When set, playback stops at `endMs` — this is how a clip plays. */
  bounds: Bounds = null;
  onBoundsEnd: (() => void) | null = null;

  private state: Transport = {
    playing: false,
    rate: 0,
    positionMs: 0,
    durationMs: 0,
    seeking: false,
    bufferedMs: 0,
  };

  /* ------------------------------------------------------------- wiring */

  attach(video: HTMLVideoElement, fps?: number) {
    if (this.video === video) return;
    this.detach();
    this.video = video;
    if (fps && fps > 0) this.fps = fps;

    video.addEventListener("seeked", this.handleSeeked);
    video.addEventListener("play", this.handlePlayState);
    video.addEventListener("pause", this.handlePlayState);
    video.addEventListener("loadedmetadata", this.handleMetadata);
    video.addEventListener("progress", this.handleProgress);
    video.addEventListener("ratechange", this.handlePlayState);

    if (video.readyState >= 1) this.handleMetadata();
    this.startFrameClock();
  }

  detach() {
    const v = this.video;
    if (!v) return;
    v.removeEventListener("seeked", this.handleSeeked);
    v.removeEventListener("play", this.handlePlayState);
    v.removeEventListener("pause", this.handlePlayState);
    v.removeEventListener("loadedmetadata", this.handleMetadata);
    v.removeEventListener("progress", this.handleProgress);
    v.removeEventListener("ratechange", this.handlePlayState);
    this.stopFrameClock();
    this.stopReverse();
    this.video = null;
  }

  subscribe(fn: (t: Transport) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  get snapshot(): Transport {
    return this.state;
  }

  private emit(patch: Partial<Transport>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /* ------------------------------------------------------ frame clock */

  private startFrameClock() {
    const v = this.video;
    if (!v) return;

    // rVFC is available in Chrome 83+, Safari 15.4+, Firefox 132+. Where it
    // is missing we fall back to rAF polling, which is less precise but keeps
    // everything working rather than breaking the readout.
    if ("requestVideoFrameCallback" in v) {
      const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
        this.observeFrame(meta.mediaTime * 1000);
        this.rvfcHandle = v.requestVideoFrameCallback(tick);
      };
      this.rvfcHandle = v.requestVideoFrameCallback(tick);
    } else {
      const tick = () => {
        if (this.video) this.observeFrame(this.video.currentTime * 1000);
        this.rafHandle = requestAnimationFrame(tick);
      };
      this.rafHandle = requestAnimationFrame(tick);
    }
  }

  private stopFrameClock() {
    const v = this.video;
    if (v && this.rvfcHandle != null && "cancelVideoFrameCallback" in v) {
      v.cancelVideoFrameCallback(this.rvfcHandle);
    }
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.rvfcHandle = null;
    this.rafHandle = null;
  }

  private observeFrame(positionMs: number) {
    this.refineFps(positionMs);

    // Clip playback: stop cleanly on the out point rather than running past it.
    if (this.bounds && this.state.playing && positionMs >= this.bounds.endMs) {
      this.pause();
      this.emit({ positionMs: this.bounds.endMs });
      this.onBoundsEnd?.();
      return;
    }

    this.emit({ positionMs });
  }

  /**
   * The video element will not tell us its frame rate, so infer it from the
   * gaps between presented frames. Needed for `,`/`.` frame stepping to land
   * on real frame boundaries.
   */
  private refineFps(positionMs: number) {
    const prev = this.frameTimes[this.frameTimes.length - 1];
    if (prev !== undefined) {
      const delta = positionMs - prev;
      // Ignore seeks and stalls; only trust plausible consecutive frames.
      if (delta > 4 && delta < 100) {
        this.frameTimes.push(positionMs);
        if (this.frameTimes.length > 30) {
          const first = this.frameTimes[0];
          const last = this.frameTimes[this.frameTimes.length - 1];
          const inferred = ((this.frameTimes.length - 1) * 1000) / (last - first);
          if (inferred > 10 && inferred < 130) this.fps = Math.round(inferred);
          this.frameTimes = [];
        }
        return;
      }
    }
    this.frameTimes = [positionMs];
  }

  /* ----------------------------------------------------------- handlers */

  private handleMetadata = () => {
    const v = this.video;
    if (!v) return;
    const durationMs = Number.isFinite(v.duration) ? v.duration * 1000 : 0;
    this.emit({ durationMs, positionMs: v.currentTime * 1000 });
  };

  private handlePlayState = () => {
    const v = this.video;
    if (!v) return;
    const reversing = this.reverseHandle != null;
    this.emit({
      playing: reversing || !v.paused,
      rate: reversing ? this.state.rate : v.paused ? 0 : v.playbackRate,
    });
  };

  private handleProgress = () => {
    const v = this.video;
    if (!v || v.buffered.length === 0) return;
    // Report the buffered run that covers the playhead, which is what the
    // timeline should shade and what tells us a seek would be free.
    const t = v.currentTime;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= t && t <= v.buffered.end(i)) {
        this.emit({ bufferedMs: v.buffered.end(i) * 1000 });
        return;
      }
    }
    this.emit({ bufferedMs: v.buffered.end(v.buffered.length - 1) * 1000 });
  };

  private handleSeeked = () => {
    this.seekInFlight = false;
    this.emit({ seeking: false });

    // Issue whatever the newest requested target is, discarding everything
    // that piled up behind it.
    if (this.pendingSeekMs != null) {
      const next = this.pendingSeekMs;
      this.pendingSeekMs = null;
      this.applySeek(next);
    }
  };

  /* -------------------------------------------------------------- seeking */

  /** Tell the engine a scrub drag is in progress, so it can seek cheaply. */
  setDragging(dragging: boolean) {
    this.dragging = dragging;
    // On release, land exactly where the user let go.
    if (!dragging) this.seek(this.state.positionMs, { exact: true });
  }

  seek(ms: number, opts: { exact?: boolean } = {}) {
    const clamped = this.clamp(ms);
    // Paint the playhead immediately; the decode catches up.
    this.emit({ positionMs: clamped });

    if (this.seekInFlight && !opts.exact) {
      this.pendingSeekMs = clamped;
      return;
    }
    this.applySeek(clamped);
  }

  private applySeek(ms: number) {
    const v = this.video;
    if (!v) return;
    this.seekInFlight = true;
    this.emit({ seeking: true });

    const seconds = ms / 1000;
    // fastSeek snaps to the nearest keyframe far more cheaply than assigning
    // currentTime. Safari has it; Chrome does not, so feature-detect.
    if (this.dragging && typeof v.fastSeek === "function") {
      v.fastSeek(seconds);
    } else {
      v.currentTime = seconds;
    }
  }

  nudge(ms: number) {
    this.seek(this.state.positionMs + ms);
  }

  stepFrames(frames: number) {
    this.pause();
    this.seek(this.state.positionMs + (frames * 1000) / this.fps, { exact: true });
  }

  private clamp(ms: number): number {
    const max = this.state.durationMs || Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(0, ms), max);
  }

  /* ------------------------------------------------------------ transport */

  async play() {
    const v = this.video;
    if (!v) return;
    this.stopReverse();
    // Re-entering a clip after it ran to its out point should start again,
    // not sit stuck on the final frame.
    if (this.bounds && this.state.positionMs >= this.bounds.endMs - 40) {
      this.seek(this.bounds.startMs, { exact: true });
    }
    try {
      await v.play();
    } catch {
      // Autoplay refusal before a user gesture; the UI stays paused.
    }
  }

  pause() {
    this.stopReverse();
    this.video?.pause();
  }

  toggle() {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  setRate(rate: number) {
    const v = this.video;
    if (!v) return;
    this.stopReverse();
    v.playbackRate = Math.min(MAX_RATE, Math.max(0.1, rate));
    if (v.paused) void this.play();
  }

  /**
   * J / L shuttle. Repeated presses ramp 1× → 2× → 4× → 8×, and pressing the
   * opposite key steps back down before reversing, which is how every editor
   * behaves and what anyone coming from Hudl will expect.
   */
  shuttle(direction: -1 | 1) {
    const current = this.state.rate;
    const sameWay = Math.sign(current) === direction;
    const magnitude = Math.abs(current);

    let next: number;
    if (!sameWay || magnitude === 0) {
      next = direction;
    } else {
      const idx = SHUTTLE_STEPS.findIndex((s) => s >= magnitude);
      next = direction * SHUTTLE_STEPS[Math.min(idx + 1, SHUTTLE_STEPS.length - 1)];
    }

    if (next > 0) {
      this.setRate(next);
      this.emit({ rate: next });
    } else {
      this.startReverse(Math.abs(next));
    }
  }

  /** `playbackRate` cannot be negative, so run backwards by hand. */
  private startReverse(rate: number) {
    const v = this.video;
    if (!v) return;
    v.pause();
    this.stopReverse();
    this.lastReverseTs = performance.now();
    this.emit({ playing: true, rate: -rate });

    const tick = (now: number) => {
      const dt = now - this.lastReverseTs;
      this.lastReverseTs = now;
      const next = this.state.positionMs - dt * rate;
      const floor = this.bounds?.startMs ?? 0;
      if (next <= floor) {
        this.seek(floor, { exact: true });
        this.stopReverse();
        return;
      }
      this.seek(next);
      this.reverseHandle = requestAnimationFrame(tick);
    };
    this.reverseHandle = requestAnimationFrame(tick);
  }

  private stopReverse() {
    if (this.reverseHandle != null) {
      cancelAnimationFrame(this.reverseHandle);
      this.reverseHandle = null;
      this.emit({ playing: false, rate: 0 });
    }
  }

  /* --------------------------------------------------------------- clips */

  /** Play a range of the source file. This is what "playing a clip" means. */
  playRange(startMs: number, endMs: number, onEnd?: () => void) {
    this.bounds = { startMs, endMs };
    this.onBoundsEnd = onEnd ?? null;
    this.seek(startMs, { exact: true });
    void this.play();
  }

  clearBounds() {
    this.bounds = null;
    this.onBoundsEnd = null;
  }
}
