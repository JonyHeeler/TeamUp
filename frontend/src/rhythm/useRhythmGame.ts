import { useCallback, useEffect, useRef, useState } from "react";
import { createClapSound, playClap, scheduleSoundtrack } from "./audio";
import { laneForKey, lanes, leadIn, type Lane, type Track } from "./chart";
import { Round, hitWindow } from "./round";

type Session = {
  audio: AudioContext | null;
  clapSound: AudioBuffer | null;
  clock: (() => number) | null;
  duration: number;
  round: Round;
  animation: number;
};

/** 驱动谱面时钟，并在退出时释放声音、动画和按键监听。 */
export function useRhythmGame(track: Track) {
  const active = useRef<Session | null>(null);
  const pressTimers = useRef({ left: 0, right: 0 });
  const [pressedPads, setPressedPads] = useState({ left: false, right: false });
  const [starting, setStarting] = useState(false);
  const [frame, setFrame] = useState<{ time: number; round: Round } | null>(
    null,
  );

  /** 停止仍在运行的音频和动画帧。 */
  const stop = useCallback(() => {
    const session = active.current;
    if (!session) return;
    active.current = null;
    cancelAnimationFrame(session.animation);
    if (session.audio && session.audio.state !== "closed") {
      void session.audio.close().catch(() => {});
    }
  }, []);

  /** 换曲或切走页面时清除本局状态。 */
  const reset = useCallback(() => {
    stop();
    setFrame(null);
    setStarting(false);
  }, [stop]);

  /** 从用户手势启动音频，音频不可用时继续按视觉节拍运行。 */
  async function start() {
    if (active.current) return;
    const session: Session = {
      audio: null,
      clapSound: null,
      clock: null,
      duration: track.duration,
      round: new Round(track.notes),
      animation: 0,
    };
    active.current = session;
    setStarting(true);
    try {
      session.audio = new AudioContext();
      await session.audio.resume();
      if (active.current !== session) return;
      session.clapSound = createClapSound(session.audio);
    } catch {
      if (session.audio && session.audio.state !== "closed") {
        void session.audio.close().catch(() => {});
      }
      session.audio = null;
    }
    if (active.current !== session) return;

    const audio = session.audio;
    const now = audio
      ? () => audio.currentTime
      : () => performance.now() / 1000;
    const zero = now() + leadIn;
    const clock = () => now() - zero;
    session.clock = clock;
    if (audio) scheduleSoundtrack(audio, zero, track);
    setStarting(false);
    setFrame({ time: -leadIn, round: session.round });

    /** 将判定和画面推进到当前节拍。 */
    function tick() {
      const time = clock();
      session.round.advance(time);
      setFrame({ time, round: session.round });
      if (time >= session.duration) stop();
      else session.animation = requestAnimationFrame(tick);
    }
    session.animation = requestAnimationFrame(tick);
  }

  const strike = useCallback((lane: Lane) => {
    setPressedPads((current) => ({ ...current, [lane]: true }));
    window.clearTimeout(pressTimers.current[lane]);
    pressTimers.current[lane] = window.setTimeout(() => {
      setPressedPads((current) => ({ ...current, [lane]: false }));
    }, 150);
    const session = active.current;
    const time = session?.clock?.();
    if (
      !session ||
      time === undefined ||
      time < -hitWindow ||
      time >= session.duration
    )
      return;
    const result = session.round.strike(lane, time);
    if (result && session.audio && session.clapSound) {
      playClap(session.audio, session.clapSound, result === "pair");
    }
  }, []);

  useEffect(() => {
    /** 将物理键位交给对应的击打轨道。 */
    function onKeyDown(event: KeyboardEvent) {
      const lane = laneForKey(event);
      if (lane) {
        event.preventDefault();
        strike(lane);
      }
    }

    /** 页面隐藏后停止本局，返回时可重新开拍。 */
    function onVisibilityChange() {
      if (!document.hidden || !active.current) return;
      reset();
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const lane of lanes) window.clearTimeout(pressTimers.current[lane]);
      stop();
    };
  }, [reset, stop, strike]);

  return { start, strike, frame, starting, pressedPads, reset };
}
