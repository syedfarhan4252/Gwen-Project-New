import type { MediaAspectRatio } from '../types/gwen';

export interface VideoSceneSpec {
  title: string;
  caption: string;
  palette: [string, string, string];
  accentColor: string;
  motifs: Array<'stars' | 'mountains' | 'city' | 'waves' | 'aurora' | 'orb' | 'grid' | 'particles'>;
  cameraMotion: 'zoom_in' | 'zoom_out' | 'pan_right' | 'pan_left';
}

export interface VideoStoryboardSpec {
  title: string;
  mood: string;
  scenes: VideoSceneSpec[];
}

export function getDimensionsForAspect(
  aspectRatio: MediaAspectRatio,
  mode: 'image' | 'video'
): { width: number; height: number } {
  const scale = mode === 'image' ? 1 : 0.72;
  switch (aspectRatio) {
    case '16:9':
      return { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    case '9:16':
      return { width: Math.round(720 * scale), height: Math.round(1280 * scale) };
    case '4:3':
      return { width: Math.round(1024 * scale), height: Math.round(768 * scale) };
    case '1:1':
    default:
      return { width: Math.round(960 * scale), height: Math.round(960 * scale) };
  }
}

export function slugifyFilename(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'gwen-creation'
  );
}

export function downloadDataUrlToDevice(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadHtmlFile(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function renderSvgToPngDataUrl(
  rawSvg: string,
  aspectRatio: MediaAspectRatio,
  prompt: string
): Promise<{ dataUrl: string; filename: string }> {
  const { width, height } = getDimensionsForAspect(aspectRatio, 'image');
  const cleanedSvg = rawSvg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');

  const svgBlob = new Blob([cleanedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode generated SVG artwork'));
      el.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    const filename = `gwen-${slugifyFilename(prompt)}-${Date.now().toString().slice(-4)}.png`;
    return { dataUrl, filename };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: VideoSceneSpec,
  sceneProgress: number, // 0..1
  globalTime: number
) {
  const [c1, c2, c3] = scene.palette;
  const accent = scene.accentColor || '#2dd4bf';

  ctx.save();

  // Smooth camera Ken Burns transform
  let scale = 1.0;
  let tx = 0;
  if (scene.cameraMotion === 'zoom_in') {
    scale = 1.0 + sceneProgress * 0.08;
  } else if (scene.cameraMotion === 'zoom_out') {
    scale = 1.08 - sceneProgress * 0.08;
  } else if (scene.cameraMotion === 'pan_right') {
    scale = 1.06;
    tx = -w * 0.025 + sceneProgress * w * 0.05;
  } else {
    scale = 1.06;
    tx = w * 0.025 - sceneProgress * w * 0.05;
  }

  ctx.translate(w / 2 + tx, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  // Sky / Backdrop gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c1 || '#06111e');
  grad.addColorStop(0.55, c2 || '#0e253d');
  grad.addColorStop(1, c3 || '#09111c');
  ctx.fillStyle = grad;
  ctx.fillRect(-w * 0.1, -h * 0.1, w * 1.2, h * 1.2);

  const motifs = scene.motifs?.length ? scene.motifs : ['stars', 'orb', 'particles'];

  // Stars
  if (motifs.includes('stars')) {
    for (let i = 0; i < 65; i++) {
      const sx = ((i * 197.3) % 1) * w;
      const sy = ((i * 83.7) % 0.65) * h;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(globalTime * 2.2 + i));
      ctx.fillStyle = `rgba(255,255,255,${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 3) * 0.7 + 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Aurora ribbons
  if (motifs.includes('aurora')) {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      const baseY = h * (0.24 + band * 0.09);
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 24) {
        const y =
          baseY +
          Math.sin(x * 0.008 + globalTime * (1.2 + band * 0.3) + band) * 34 +
          Math.cos(x * 0.015 - globalTime * 0.8) * 16;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, baseY + 120);
      ctx.lineTo(0, baseY + 120);
      ctx.closePath();
      const ag = ctx.createLinearGradient(0, baseY - 30, 0, baseY + 120);
      ag.addColorStop(0, `${accent}00`);
      ag.addColorStop(0.45, `${accent}55`);
      ag.addColorStop(1, `${accent}00`);
      ctx.fillStyle = ag;
      ctx.fill();
    }
  }

  // Luminous celestial orb / sun / portal
  if (motifs.includes('orb')) {
    const ox = w * (0.5 + Math.sin(globalTime * 0.5) * 0.04);
    const oy = h * 0.36;
    const rad = Math.min(w, h) * (0.14 + Math.sin(globalTime * 1.4) * 0.008);
    const glow = ctx.createRadialGradient(ox, oy, rad * 0.1, ox, oy, rad * 2.4);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.28, accent);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ox, oy, rad * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Futuristic perspective grid
  if (motifs.includes('grid')) {
    const horizon = h * 0.58;
    ctx.strokeStyle = `${accent}44`;
    ctx.lineWidth = 1.2;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 24, horizon);
      ctx.lineTo(w / 2 + i * 160, h);
      ctx.stroke();
    }
    const speedOffset = (globalTime * 48) % 36;
    for (let r = 0; r < 10; r++) {
      const y = horizon + Math.pow((r * 36 + speedOffset) / 360, 1.7) * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // Layered mountains
  if (motifs.includes('mountains')) {
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const base = h * (0.72 + layer * 0.1);
      ctx.moveTo(0, h);
      ctx.lineTo(0, base);
      for (let x = 0; x <= w; x += 32) {
        const peak =
          Math.sin(x * (0.006 + layer * 0.003) + layer * 2.1) * (58 - layer * 16) +
          Math.cos(x * 0.014 - layer) * 24;
        ctx.lineTo(x, base - Math.abs(peak));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = layer === 0 ? 'rgba(9, 17, 29, 0.72)' : 'rgba(5, 10, 18, 0.94)';
      ctx.fill();
    }
  }

  // Futuristic city skyline
  if (motifs.includes('city')) {
    const bCount = 24;
    const bw = w / bCount;
    for (let i = 0; i < bCount; i++) {
      const bh = h * (0.14 + ((i * 37) % 100) / 360);
      const bx = i * bw;
      const by = h * 0.78 - bh;
      ctx.fillStyle = 'rgba(7, 12, 22, 0.92)';
      ctx.fillRect(bx + 2, by, bw - 4, bh + h * 0.25);

      // Lit neon windows
      ctx.fillStyle = i % 3 === 0 ? accent : 'rgba(255,255,255,0.28)';
      for (let wy = by + 10; wy < h * 0.76; wy += 16) {
        if ((i + Math.floor(wy)) % 2 === 0) {
          ctx.fillRect(bx + 6, wy, Math.max(3, bw - 14), 3);
        }
      }
    }
  }

  // Flowing ocean/energy waves
  if (motifs.includes('waves')) {
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const yBase = h * (0.68 + layer * 0.08);
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) {
        const wy = yBase + Math.sin(x * 0.012 + globalTime * (1.8 + layer * 0.5) + layer) * 14;
        ctx.lineTo(x, wy);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = layer === 0 ? `${accent}33` : layer === 1 ? `${accent}24` : 'rgba(5,12,24,0.85)';
      ctx.fill();
    }
  }

  // Floating luminous particles
  if (motifs.includes('particles')) {
    for (let i = 0; i < 36; i++) {
      const px = ((i * 73.1 + globalTime * (18 + (i % 5) * 6)) % (w + 40)) - 20;
      const py =
        h - (((i * 91.7 + globalTime * (22 + (i % 4) * 8)) % (h + 40)) - 20);
      ctx.fillStyle = i % 2 === 0 ? `${accent}aa` : 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(px, py, (i % 3) + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // Subtle cinematic caption bar at bottom
  const barH = Math.round(h * 0.14);
  const fade = ctx.createLinearGradient(0, h - barH * 1.4, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(3,6,12,0.86)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, h - barH * 1.4, w, barH * 1.4);

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.font = `600 ${Math.max(15, Math.round(w * 0.024))}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(scene.caption || scene.title, 28, h - 28);
}

export async function renderVideoStoryboardToWebM(
  storyboard: VideoStoryboardSpec,
  aspectRatio: MediaAspectRatio,
  durationSec = 6,
  onProgress?: (pct: number) => void
): Promise<{ dataUrl: string; mimeType: string; filename: string }> {
  const safeDuration = Math.max(3, Math.min(10, Math.round(durationSec)));
  const { width, height } = getDimensionsForAspect(aspectRatio, 'video');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for video rendering');

  const scenes =
    storyboard.scenes && storyboard.scenes.length > 0
      ? storyboard.scenes
      : [
          {
            title: storyboard.title || 'Gwen Motion Clip',
            caption: storyboard.title || 'AI Motion Scene',
            palette: ['#071324', '#122e4a', '#060c16'] as [string, string, string],
            accentColor: '#2dd4bf',
            motifs: ['stars', 'aurora', 'mountains', 'particles'] as VideoSceneSpec['motifs'],
            cameraMotion: 'zoom_in' as const,
          },
        ];

  const stream = canvas.captureStream(24);
  const preferredMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType: preferredMime,
    videoBitsPerSecond: 1_600_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const recordingDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: preferredMime }));
    recorder.onerror = () => reject(new Error('Video encoding failed in browser MediaRecorder'));
  });

  recorder.start(250);

  const totalMs = safeDuration * 1000;
  const startTime = performance.now();

  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / totalMs);
      onProgress?.(Math.round(progress * 96));

      const rawSceneIndex = Math.min(
        scenes.length - 1,
        Math.floor(progress * scenes.length)
      );
      const sceneDuration = 1 / scenes.length;
      const sceneProgress = Math.min(
        1,
        (progress - rawSceneIndex * sceneDuration) / sceneDuration
      );

      drawSceneFrame(ctx, width, height, scenes[rawSceneIndex], sceneProgress, elapsed / 1000);

      if (elapsed < totalMs) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const blob = await recordingDone;
  onProgress?.(100);

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to encode rendered video'));
    reader.readAsDataURL(blob);
  });

  const filename = `gwen-${slugifyFilename(storyboard.title || 'video')}-${Date.now().toString().slice(-4)}.webm`;
  return { dataUrl, mimeType: 'video/webm', filename };
}
