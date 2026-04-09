function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function noiseAt(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453123;
  return ((value - Math.floor(value)) * 2) - 1;
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let output = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    output += String.fromCharCode(...chunk);
  }

  return btoa(output);
}

export function sineWave(frequency, time, phase = 0) {
  return Math.sin((Math.PI * 2 * frequency * time) + phase);
}

export function triangleWave(frequency, time) {
  return (2 / Math.PI) * Math.asin(Math.sin(Math.PI * 2 * frequency * time));
}

export function squareWave(frequency, time) {
  return Math.sign(sineWave(frequency, time)) || 1;
}

export function sawWave(frequency, time) {
  return (2 * ((frequency * time) - Math.floor(0.5 + (frequency * time))));
}

export function smoothEnvelope(time, duration, attack = 0.02, release = 0.08) {
  if (time < 0 || time > duration) {
    return 0;
  }

  const attackAmount = attack > 0 ? Math.min(1, time / attack) : 1;
  const releaseAmount = release > 0 ? Math.min(1, (duration - time) / release) : 1;
  return Math.min(attackAmount, releaseAmount);
}

export function createWavDataUri({
  durationSec,
  sampleRate = 16000,
  generator,
}) {
  const sampleCount = Math.max(1, Math.floor(durationSec * sampleRate));
  const byteRate = sampleRate * 2;
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const sample = clampSample(generator(time, index, sampleRate));
    view.setInt16(44 + (index * 2), sample * 32767, true);
  }

  return `data:audio/wav;base64,${bufferToBase64(buffer)}`;
}

export function noiseWave(index) {
  return noiseAt(index);
}
