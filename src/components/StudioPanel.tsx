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
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1.5">
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
              className="min-h-[40px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Creation Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border p-3.5 space-y-3"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        {studioMode === 'website' && (
          <input
            type="text"
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            placeholder="Website title (optional)"
            className="w-full min-h-[40px] px-3 rounded-xl border text-xs outline-none"
            style={{
              backgroundColor: 'var(--bg-canvas)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--text-primary)',
            }}
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
                ? 'Describe a motion scene (e.g., Aurora ribbons gliding over snowy peaks)...'
                : 'Describe your webpage (e.g., Modern coffee roastery landing page with menu)...'
          }
          className="w-full p-3 rounded-xl border text-xs outline-none resize-none"
          style={{
            backgroundColor: 'var(--bg-canvas)',
            borderColor: 'var(--border-hairline)',
            color: 'var(--text-primary)',
          }}
        />

        {studioMode !== 'website' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {ASPECT_OPTIONS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setAspectRatio(ar)}
                  className="h-8 px-2 rounded-lg border text-[11px] font-mono-tabular cursor-pointer"
                  style={{
                    backgroundColor: aspectRatio === ar ? 'var(--accent-soft)' : 'transparent',
                    borderColor: aspectRatio === ar ? 'var(--accent)' : 'var(--border-hairline)',
                    color: aspectRatio === ar ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {ar}
                </button>
              ))}
            </div>

            {studioMode === 'image' ? (
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="flex-1 min-h-[32px] px-2 rounded-lg border text-[11px] outline-none"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--text-primary)',
                }}
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
                className="flex-1 min-h-[32px] px-2 rounded-lg border text-[11px] font-mono-tabular outline-none"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--text-primary)',
                }}
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
          className="w-full min-h-[42px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          {isGeneratingMedia ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{generationLabel || 'Rendering...'}</span>
            </>
          ) : (
            <span>
              {studioMode === 'image'
                ? 'Generate & Save Image'
                : studioMode === 'video'
                  ? 'Render & Save Motion Video'
                  : 'Build & Preview Website'}
            </span>
          )}
        </button>

        {isGeneratingMedia && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/10">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.max(12, generationProgress)}%`,
                  backgroundColor: 'var(--accent)',
                }}
              />
            </div>
            <p className="text-[11px] font-mono-tabular text-[var(--text-muted)] text-right">
              {generationProgress}%
            </p>
          </div>
        )}
      </form>

      {/* Local Gallery Archive (Images & Videos) */}
      {mediaCreations.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Saved Gallery ({mediaCreations.length})
            </h3>
            <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
              Pictures/Gwen & Movies/Gwen
            </span>
          </div>

          <div className="space-y-2.5">
            {mediaCreations.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-hairline)',
                }}
              >
                {item.kind === 'image' ? (
                  <img
                    src={item.dataUrl}
                    alt={item.prompt}
                    className="w-full max-h-56 object-contain bg-black/40"
                  />
                ) : (
                  <video
                    src={item.dataUrl}
                    controls
                    playsInline
                    className="w-full max-h-56 bg-black"
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
                      className="h-8 px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      style={{
                        borderColor: 'var(--border-hairline)',
                        color: 'var(--accent)',
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMedia(item.id)}
                      aria-label="Delete creation"
                      className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer text-[var(--text-muted)] hover:text-red-400"
                      style={{ borderColor: 'var(--border-hairline)' }}
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
              className="rounded-2xl border p-3 flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-hairline)',
              }}
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
                  className="h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
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
                  className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWebsite(site.id)}
                  aria-label="Delete website"
                  className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer text-[var(--text-muted)] hover:text-red-400"
                  style={{ borderColor: 'var(--border-hairline)' }}
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
