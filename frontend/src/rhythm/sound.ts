type Tone = {
  waveform: OscillatorType;
  pitch: number;
  endPitch?: number;
  length: number;
  volume: number;
  attack?: number;
};

/** 合成带渐入和衰减的单个音色。 */
export function tone(context: BaseAudioContext, start: number, settings: Tone) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const end = start + settings.length;
  oscillator.type = settings.waveform;
  oscillator.frequency.setValueAtTime(settings.pitch, start);
  if (settings.endPitch)
    oscillator.frequency.exponentialRampToValueAtTime(settings.endPitch, end);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(
    settings.volume,
    start + (settings.attack ?? 0.008),
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(envelope).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

/** 创建可供同一首曲子的多个打击声复用的噪声采样。 */
export function noiseBuffer(context: BaseAudioContext, seconds: number) {
  const buffer = context.createBuffer(
    1,
    Math.round(context.sampleRate * seconds),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  return buffer;
}
