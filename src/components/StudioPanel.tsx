import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from 'lucide-react';
import type {
  GeneratedMediaItem,
  GeneratedWebsiteItem,
  MediaAspectRatio,
} from '../types/gwen';
import { downloadDataUrlToDevice, downloadHtmlFile } from '../utils/mediaRenderer';

interface StudioPanelProps {
  mediaCreations: GeneratedMediaItem[];
  websiteCreations: GeneratedWebsiteItem[];
  isGeneratingMedia: boolean;
  generationLabel: string;
  generationProgress: number;
  onGenerateImage: (prompt: string, aspectRatio: MediaAspectRatio, style: string) => void;
  onGenerateVideo: (prompt: string, aspectRatio: MediaAspectRatio, duration: number) => void;
  onBuildWebsite: (description: string, title?: string) => void;
  onOpenWebsitePreview: (site: GeneratedWebsiteItem) => void;
  onDeleteMedia: (id: string) => void;
  onDeleteWebsite: (id: string) => void;
  onNotify: (msg: string) => void;
}

const ASPECT_OPTIONS: MediaAspectRatio[] = ['1:1', '16:9', '9:16', '4:3'];

export const StudioPanel: React.FC<StudioPanelProps> = ({
  mediaCreations,
  websiteCreations,
  isGeneratingMedia,
  generationLabel,
  generationProgress,
  onGenerateImage,
  onGenerateVideo,
  onBuildWebsite,
  onOpenWebsitePreview,
  onDeleteMedia,
  onDeleteWebsite,
  onNotify,
}) => {
  const [studioMode, setStudioMode] = useState<'image' | 'video' | 'website'>('image');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<MediaAspectRatio>('16:9');
  const [style, setStyle] = useState('cinematic digital illustration');
  const [duration, setDuration] = useState(6);
  const [siteTitle, setSiteTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGeneratingMedia) return;
    if (studioMode === 'image') {
      onGenerateImage(prompt.trim(), aspectRatio, style);
    } else if (studioMode === 'video') {
      onGenerateVideo(prompt.trim(), aspectRatio, duration);
    } else {
      onBuildWebsite(prompt.trim(), siteTitle.trim() || undefined);
    }
    setPrompt('');
    setSiteTitle('');
  };

  return (
    <div className="space-y-3.5">
      {/* Segmented Mode Switcher */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
        {(
          [
            { id: 'image', label: 'Image', icon: <ImageIcon className="h-3.5 w-3.5" /> },
            { id: 'video', label: 'Video', icon: <Film className="h-3.5 w-3.5" /> },
            { id: 'website', label: 'Website', icon: <Globe className="h-3.5 w-3.5" /> },
          ] as const
        ).map((tab) => {
          const active = studioMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStudioMode(tab.id)}
              className={`h-8 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                active
                  ? 'bg-white/[0.12] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className={active ? 'text-[var(--accent)]' : ''}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Creation Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl p-3.5 glass-card space-y-2.5">
        {studioMode === 'website' && (
          <input
            type="text"
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            placeholder="Website title (optional)"
            className="w-full h-9 px-3 rounded-xl border border-white/[0.08] bg-white/[0.05] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/45"
          />
        )}

        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            studioMode === 'image'
              ? 'Describe an image (e.g., Neon skyline over calm ocean at dusk)...'
              : studioMode === 'video'
                ? 'Describe a motion clip (e.g., Aurora ribbons gliding over peaks)...'
                : 'Describe your webpage (e.g., Modern coffee roastery landing page)...'
          }
          className="w-full p-3 rounded-xl border border-white/[0.08] bg-white/[0.05] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/45 resize-none"
        />

        {studioMode !== 'website' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1">
              {ASPECT_OPTIONS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setAspectRatio(ar)}
                  className={`h-7 px-2 rounded-full border text-[10px] font-mono-tabular cursor-pointer transition-colors ${
                    aspectRatio === ar
                      ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                      : 'bg-white/[0.04] border-white/[0.07] text-[var(--text-muted)]'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>

            {studioMode === 'image' ? (
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="flex-1 h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.05] text-[11px] text-[var(--text-primary)] outline-none"
              >
                <option value="cinematic digital illustration">Cinematic</option>
                <option value="cyberpunk neon sci-fi">Cyberpunk Neon</option>
                <option value="minimalist geometric vector">Minimalist</option>
                <option value="soft watercolor atmospheric">Watercolor</option>
              </select>
            ) : (
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1 h-7 px-2.5 rounded-full border border-white/[0.08] bg-white/[0.05] text-[11px] font-mono-tabular text-[var(--text-primary)] outline-none"
              >
                <option value={4}>4s Clip</option>
                <option value={6}>6s Clip</option>
                <option value={8}>8s Clip</option>
                <option value={10}>10s Clip</option>
              </select>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!prompt.trim() || isGeneratingMedia}
          className="w-full h-10 px-4 rounded-full glass-pill hover:bg-white/[0.12] border-cyan-400/30 text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-45"
        >
          {isGeneratingMedia ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              <span>{generationLabel || 'Rendering...'}</span>
            </>
          ) : (
            <span className="text-[var(--accent)]">
              {studioMode === 'image'
                ? 'Generate & Save Image'
                : studioMode === 'video'
                  ? 'Render Motion Video'
                  : 'Build & Preview Website'}
            </span>
          )}
        </button>

        {isGeneratingMedia && (
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full overflow-hidden bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-300"
                style={{ width: `${Math.max(12, generationProgress)}%` }}
              />
            </div>
            <p className="text-[10px] font-mono-tabular text-[var(--text-muted)] text-right">
              {generationProgress}%
            </p>
          </div>
        )}
      </form>

      {/* Local Gallery Archive */}
      {mediaCreations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            Saved Gallery ({mediaCreations.length})
          </h3>
          <div className="space-y-2">
            {mediaCreations.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-2xl glass-card overflow-hidden">
                {item.kind === 'image' ? (
                  <img
                    src={item.dataUrl}
                    alt={item.prompt}
                    className="w-full max-h-52 object-contain bg-black/40"
                  />
                ) : (
                  <video
                    src={item.dataUrl}
                    controls
                    playsInline
                    className="w-full max-h-52 bg-black"
                  />
                )}
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {item.prompt}
                    </p>
                    <p className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                      {item.kind === 'image' ? 'PNG' : `WebM · ${item.durationSec ?? 6}s`} · {item.aspectRatio}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        downloadDataUrlToDevice(item.dataUrl, item.filename);
                        onNotify('Saved to your gallery!');
                      }}
                      className="h-7 px-2.5 rounded-full glass-pill text-[11px] font-medium text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMedia(item.id)}
                      aria-label="Delete creation"
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Websites Archive */}
      {websiteCreations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            Local Websites ({websiteCreations.length})
          </h3>
          {websiteCreations.slice(0, 5).map((site) => (
            <div
              key={site.id}
              className="rounded-2xl glass-card p-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {site.title}
                </p>
                <p className="text-[10px] font-mono-tabular text-[var(--text-muted)] truncate">
                  {site.storagePath}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenWebsitePreview(site)}
                  className="h-7 px-2.5 rounded-full bg-cyan-400/15 border border-cyan-400/35 text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadHtmlFile(site.html, `${site.slug}-index.html`);
                    onNotify(`Saved ${site.storagePath}`);
                  }}
                  aria-label="Download HTML"
                  className="h-7 w-7 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWebsite(site.id)}
                  aria-label="Delete website"
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
