import { useCallback, useEffect, useRef, useState } from "react";
import { scheduleSong } from "./audio";
import type { Track } from "./chart";

/** 播放选中曲目的前三小节，并在换曲、开局或离开时关闭音频。 */
export function useTrackPreview() {
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef(0);
  const [state, setState] = useState<"idle" | "playing" | "unavailable">(
    "idle",
  );

  /** 关闭旧片段并取消它的定时器。 */
  const release = useCallback(() => {
    window.clearTimeout(timer.current);
    const previous = audio.current;
    audio.current = null;
    if (previous && previous.state !== "closed")
      void previous.close().catch(() => {});
  }, []);

  /** 返回可再次试听的状态。 */
  const stop = useCallback(() => {
    release();
    setState("idle");
  }, [release]);

  /** 由试听按钮的用户手势打开音频。 */
  async function toggle(track: Track) {
    if (audio.current) {
      stop();
      return;
    }
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      audio.current = context;
      setState("playing");
      await context.resume();
      if (audio.current !== context) return;
      const duration = Math.min(track.duration, 12 * track.beat);
      scheduleSong(context, context.currentTime + 0.04, track, duration);
      timer.current = window.setTimeout(stop, (duration + 0.14) * 1000);
    } catch {
      if (context && audio.current !== context) return;
      release();
      setState("unavailable");
    }
  }

  useEffect(() => {
    /** 浏览器切走时立即停止试听。 */
    function onVisibilityChange() {
      if (document.hidden && audio.current) stop();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, [release, stop]);
  return { state, toggle, stop };
}
