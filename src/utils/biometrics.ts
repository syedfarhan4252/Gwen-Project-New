export function computeSpectralSignature(freqBins: Float32Array, bands = 16): number[] {
  const vector: number[] = [];
  const binPerBand = Math.max(1, Math.floor(freqBins.length / bands));
  let norm = 0;

  for (let b = 0; b < bands; b++) {
    let sum = 0;
    const start = b * binPerBand;
    const end = Math.min(freqBins.length, start + binPerBand);
    for (let i = start; i < end; i++) {
      // Shift dB values (-100..0) into positive range
      sum += Math.max(0, freqBins[i] + 100);
    }
    const avg = sum / Math.max(1, end - start);
    vector.push(avg);
    norm += avg * avg;
  }

  const mag = Math.sqrt(norm) || 1;
  return vector.map((v) => Number((v / mag).toFixed(4)));
}

export function extractFaceHistogram(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return [];

  // Sample central 50% crop where user's face typically sits
  const cw = Math.max(16, Math.floor(canvas.width * 0.5));
  const ch = Math.max(16, Math.floor(canvas.height * 0.5));
  const sx = Math.floor((canvas.width - cw) / 2);
  const sy = Math.floor((canvas.height - ch) / 2);

  const img = ctx.getImageData(sx, sy, cw, ch).data;
  const bins = new Array<number>(24).fill(0); // 8 R + 8 G + 8 B

  for (let i = 0; i < img.length; i += 16) {
    const rBin = Math.min(7, Math.floor((img[i] / 256) * 8));
    const gBin = Math.min(7, Math.floor((img[i + 1] / 256) * 8));
    const bBin = Math.min(7, Math.floor((img[i + 2] / 256) * 8));
    bins[rBin] += 1;
    bins[8 + gBin] += 1;
    bins[16 + bBin] += 1;
  }

  const mag = Math.sqrt(bins.reduce((acc, v) => acc + v * v, 0)) || 1;
  return bins.map((v) => Number((v / mag).toFixed(4)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

export function parseDurationSeconds(input: string): number {
  const lower = input.toLowerCase();
  let total = 0;

  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/);
  const secMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)/);

  if (hourMatch) total += Math.round(parseFloat(hourMatch[1]) * 3600);
  if (minMatch) total += Math.round(parseFloat(minMatch[1]) * 60);
  if (secMatch) total += Math.round(parseFloat(secMatch[1]));

  if (total === 0) {
    const bareNumber = lower.match(/(\d+)/);
    if (bareNumber) {
      const n = parseInt(bareNumber[1], 10);
      total = n > 60 ? n : n * 60;
    } else {
      total = 300;
    }
  }
  return Math.max(5, total);
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function playTimerChime() {
  try {
    const ctx = new AudioContext();
    const notes = [587.33, 880.0, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.45);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}
