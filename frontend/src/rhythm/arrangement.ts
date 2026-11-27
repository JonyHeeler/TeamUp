import { noiseBuffer, tone } from "./sound";
import type { Arrangement } from "./tracks/types";

const leadVoices = {
  bell: { waveform: "sine", volume: 0.2, attack: 0.005 },
  pluck: { waveform: "triangle", volume: 0.17, attack: 0.009 },
  chip: { waveform: "square", volume: 0.09, attack: 0.004 },
} as const;

/** 将 MIDI 音高换算为合成器使用的赫兹。 */
function frequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 以滤波噪声和短包络生成军鼓或踩镲。 */
function percussion(
  context: BaseAudioContext,
  sample: AudioBuffer,
  at: number,
  hit: "snare" | "hat",
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const snare = hit === "snare";
  const end = at + (snare ? 0.14 : 0.058);
  source.buffer = sample;
  filter.type = snare ? "bandpass" : "highpass";
  filter.frequency.value = snare ? 1850 : 6300;
  filter.Q.value = 0.7;
  envelope.gain.setValueAtTime(snare ? 0.27 : 0.075, at);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(at);
  source.stop(end);
}

/** 将原创旋律、贝斯、和声和鼓组排到同一个谱面时钟。 */
export function scheduleArrangement(
  context: BaseAudioContext,
  start: number,
  arrangement: Arrangement,
  beat: number,
  limit: number,
) {
  const stepLength = beat / 4;
  const voice = leadVoices[arrangement.leadVoice];
  const noise = noiseBuffer(context, 0.15);
  for (const [barIndex, bar] of arrangement.bars.entries()) {
    const offset = barIndex * beat * 4;
    if (offset >= limit) break;
    for (const [step, midi, length, velocity = 1] of bar.lead ?? []) {
      const time = offset + step * stepLength;
      if (time >= limit) continue;
      const pitch = frequency(midi);
      const duration = Math.max(0.02, length * stepLength);
      tone(context, start + time, {
        ...voice,
        pitch,
        length: duration,
        volume: voice.volume * velocity,
      });
      if (arrangement.leadVoice === "bell") {
        tone(context, start + time, {
          waveform: "sine",
          pitch: pitch * 2.01,
          length: duration * 0.5,
          volume: 0.041 * velocity,
        });
      }
    }
    for (const [step, midi, length, velocity = 1] of bar.bass ?? []) {
      const time = offset + step * stepLength;
      if (time >= limit) continue;
      const waveform = arrangement.bassWave;
      tone(context, start + time, {
        waveform,
        pitch: frequency(midi),
        length: Math.max(0.02, length * stepLength),
        volume: (waveform === "square" ? 0.065 : 0.145) * velocity,
      });
    }
    for (const [step, midi, length, velocity = 1] of bar.harmony ?? []) {
      const time = offset + step * stepLength;
      if (time >= limit) continue;
      tone(context, start + time, {
        waveform: "triangle",
        pitch: frequency(midi),
        length: Math.max(0.04, length * stepLength),
        volume: 0.055 * velocity,
        attack: 0.025,
      });
    }
    for (const step of bar.kick ?? []) {
      const time = offset + step * stepLength;
      if (time >= limit) continue;
      tone(context, start + time, {
        waveform: "sine",
        pitch: 148,
        endPitch: 44,
        length: 0.16,
        volume: 0.24,
        attack: 0.004,
      });
    }
    for (const step of bar.snare ?? []) {
      const time = offset + step * stepLength;
      if (time < limit) percussion(context, noise, start + time, "snare");
    }
    for (const step of bar.hat ?? []) {
      const time = offset + step * stepLength;
      if (time < limit) percussion(context, noise, start + time, "hat");
    }
  }
}
