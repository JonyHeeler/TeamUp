import { scheduleArrangement } from "./arrangement";
import type { Track } from "./chart";
import { noiseBuffer, tone } from "./sound";

const chords = [
  [73.42, 293.66, 349.23, 440, 523.25],
  [58.27, 233.08, 293.66, 349.23, 440],
  [87.31, 261.63, 349.23, 440, 523.25],
  [65.41, 261.63, 329.63, 392, 493.88],
];

/** 倒数后播放当局选定的曲目。 */
export function scheduleSoundtrack(
  context: BaseAudioContext,
  start: number,
  track: Track,
) {
  for (const offset of [2.45, 2, 1]) {
    tone(context, start - offset, {
      waveform: "sine",
      pitch: 620,
      length: 0.14,
      volume: 0.12,
    });
  }
  scheduleSong(context, start, track);
}

/** 播放曲目或指定时长的试听片段。 */
export function scheduleSong(
  context: BaseAudioContext,
  start: number,
  track: Track,
  limit = track.duration,
) {
  const { beat, cues, music } = track;
  if (music) {
    scheduleArrangement(context, start, music, beat, limit);
    return;
  }
  for (let index = 0; index < track.bars.length * 4; index += 1) {
    const offset = index * beat;
    if (offset >= limit) break;
    const time = start + offset;
    const chord = chords[Math.floor(index / 4) % chords.length];
    tone(context, time, {
      waveform: "sine",
      pitch: 146,
      endPitch: 47,
      length: 0.17,
      volume: index % 2 ? 0.11 : 0.26,
    });
    if (offset + beat / 2 < limit)
      tone(context, time + beat / 2, {
        waveform: "triangle",
        pitch: 1800,
        endPitch: 980,
        length: 0.04,
        volume: 0.023,
      });
    if (index % 2 === 0) {
      tone(context, time, {
        waveform: "triangle",
        pitch: chord[0],
        length: 0.48,
        volume: 0.1,
      });
    }
  }
  const phrase = [1, 3, 2, 4, 3, 2, 4, 3];
  for (const [index, cue] of cues.entries()) {
    if (cue.time >= limit) break;
    const chord = chords[Math.floor(cue.step / 16) % chords.length];
    tone(context, start + cue.time, {
      waveform: "triangle",
      pitch: chord[phrase[index % phrase.length]],
      length: cue.kind === "roll" ? 0.11 : 0.23,
      volume: cue.kind === "pair" ? 0.13 : 0.085,
    });
  }
}

/** 用数次紧邻的噪声瞬态合成拍手的音头和短尾音。 */
export function createClapSound(context: AudioContext) {
  const rate = context.sampleRate;
  const buffer = noiseBuffer(context, 0.16);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / rate;
    const body = Math.exp(-time * 33) * 0.2;
    const front = Math.exp(-time * 190) * 0.65;
    const slap = time >= 0.014 ? Math.exp(-(time - 0.014) * 145) * 0.75 : 0;
    samples[index] *= body + front + slap;
  }
  return buffer;
}

/** 命中后播放拍手声，双手击掌时加重音。 */
export function playClap(
  context: AudioContext,
  sound: AudioBuffer,
  paired: boolean,
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const volume = context.createGain();
  source.buffer = sound;
  filter.type = "bandpass";
  filter.frequency.value = paired ? 1550 : 1200;
  filter.Q.value = 0.7;
  volume.gain.value = paired ? 0.8 : 0.46;
  source.connect(filter).connect(volume).connect(context.destination);
  source.start();
}
