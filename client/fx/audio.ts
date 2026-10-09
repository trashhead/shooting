// Sound effects, synthesized on the fly with the Web Audio API instead of
// loaded audio files. AudioContext must be created/resumed after a user
// gesture (the browser's autoplay policy), so it's resumed on the same
// click that requests pointer lock.
export const audioCtx = new AudioContext();


function playNoiseBurst(duration: number, volume: number, filterFreq: number) {
  const now = audioCtx.currentTime;
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

export function playShootSound(volume = 1) {
  playNoiseBurst(0.12, 0.3 * volume, 3500);
}

