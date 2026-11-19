import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Monitor,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import type { GeneratedWebsiteItem } from '../types/gwen';
import { downloadHtmlFile } from '../utils/mediaRenderer';

interface WebsitePreviewModalProps {
  website: GeneratedWebsiteItem | null;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const WebsitePreviewModal: React.FC<WebsitePreviewModalProps> = ({
  website,
  onClose,
  onNotify,
}) => {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!website) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(website.html);
      setCopied(true);
      onNotify('Copied complete HTML/CSS/JS code');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify('Could not copy code automatically');
    }
  };

  const handleDownload = () => {
    downloadHtmlFile(website.html, `${website.slug || 'gwen-site'}-index.html`);
    onNotify(`Saved ${website.storagePath}`);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: website.title,
          text: `Website created with Gwen AI (by Syed Farhan): ${website.title}`,
        });
      } else {
        await handleCopy();
      }
    } catch {
      // User cancelled share
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[75] flex flex-col p-3 sm:p-5"
      style={{ backgroundColor: 'rgba(3, 7, 13, 0.9)' }}
    >
      <div
        className="flex-1 flex flex-col rounded-3xl border overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Top Modal Action Bar */}
        <div
          className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)] truncate">
              {website.title}
            </h2>
            <p className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate">
              {website.storagePath}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                borderColor: viewport === 'desktop' ? 'var(--accent)' : 'var(--border-hairline)',
                color: viewport === 'desktop' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                borderColor: viewport === 'mobile' ? 'var(--accent)' : 'var(--border-hairline)',
                color: viewport === 'mobile' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Mobile</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                borderColor: showCode ? 'var(--accent)' : 'var(--border-hairline)',
                color: showCode ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{showCode ? 'Preview' : 'Code'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--text-secondary)',
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save HTML</span>
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--text-secondary)',
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--text-secondary)',
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Interactive Sandboxed WebView / Code View */}
        <div
          className="flex-1 overflow-auto flex items-center justify-center p-3"
          style={{ backgroundColor: 'var(--bg-canvas)' }}
        >
          {showCode ? (
            <pre className="w-full h-full overflow-auto rounded-2xl p-4 text-xs font-mono-tabular text-[var(--text-secondary)] bg-black/40 border border-[var(--border-hairline)]">
              {website.html}
            </pre>
          ) : (
            <iframe
              title={website.title}
              srcDoc={website.html}
              sandbox="allow-scripts allow-forms"
              className="h-full bg-white rounded-2xl border border-[var(--border-strong)] shadow-lg transition-all duration-300"
              style={{
                width: viewport === 'mobile' ? '390px' : '100%',
                maxWidth: '100%',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
