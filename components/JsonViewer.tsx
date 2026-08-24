'use client';

import { useState } from 'react';
import { Copy, Check, FileCode, ChevronDown, Download } from 'lucide-react';

interface JsonViewerProps {
  data: unknown;
  title?: string;
  initialExpanded?: boolean;
  /**
   * Render the payload permanently open with no show/hide control. For the
   * dedicated JSON view, where the whole point of the screen is the JSON —
   * making someone click "View" to see it is a step with no decision in it.
   */
  alwaysOpen?: boolean;
  /**
   * When set, the action becomes a download of this filename rather than a
   * copy. The full log stream runs to six figures of characters — far past
   * what anyone can usefully put on a clipboard.
   */
  downloadFileName?: string;
  className?: string;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Tokenizes a JSON string into syntax-highlighted HTML spans.
 */
function highlightJson(json: string): string {
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  };
  const escapeHtml = (str: string) => str.replace(/[&<>]/g, (s) => entityMap[s] || s);

  const jsonRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}[\],])/g;

  return escapeHtml(json).replace(jsonRegex, (match) => {
    let cls = 'text-neutral-300';

    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        // Key
        const keyPart = match.slice(0, -1);
        return `<span class="text-sky-300 font-semibold">${keyPart}</span><span class="text-neutral-500">:</span>`;
      } else {
        // String value
        cls = 'text-emerald-300';
      }
    } else if (/true|false/.test(match)) {
      // Boolean
      cls = 'text-purple-400 font-semibold';
    } else if (/null/.test(match)) {
      // Null
      cls = 'text-rose-400 font-semibold';
    } else if (/[0-9]/.test(match)) {
      // Number
      cls = 'text-amber-300 font-mono';
    } else if (/[{}[\],]/.test(match)) {
      // Brackets and punctuation
      cls = 'text-neutral-500 font-bold';
    }

    return `<span class="${cls}">${match}</span>`;
  });
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function JsonViewer({
  data,
  title = 'Telemetry Trace',
  initialExpanded = false,
  alwaysOpen = false,
  downloadFileName,
  className = '',
  chips,
  actions,
}: JsonViewerProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const isOpen = alwaysOpen || isExpanded;
  const setIsOpen = setIsExpanded;
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const lines = jsonString.split('\n');
  const byteSize = new Blob([jsonString]).size;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = URL.createObjectURL(new Blob([jsonString], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFileName!;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Release the object URL once the browser has taken the data.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className={`border-t border-white/5 bg-neutral-950/60 ${className}`}>
      {/* Integrated Footer Bar */}
      <div
        onClick={alwaysOpen ? undefined : () => setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-4 py-2 sm:px-5 transition-colors select-none flex-wrap gap-2 ${
          alwaysOpen ? '' : 'cursor-pointer hover:bg-white/[0.03]'
        }`}
      >
        {/* Left: Title + Metadata Chips */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-semibold text-neutral-300">{title}</span>
            <span className="text-[11px] font-mono text-neutral-500">
              · {formatByteSize(byteSize)}
            </span>
          </div>

          {/* Injected Mini Chips */}
          {chips}
        </div>

        {/* Right: Actions + Copy + Chevron */}
        <div className="flex items-center gap-2">
          {actions}

          {downloadFileName ? (
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900/90 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white border border-white/10 transition-colors shadow-sm"
              title={`Download ${downloadFileName} (${formatByteSize(byteSize)})`}
            >
              <Download className="h-3 w-3" />
              <span>Download JSON</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900/90 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white border border-white/10 transition-colors shadow-sm"
              title="Copy JSON Payload"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          )}

          {!alwaysOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors p-1"
            >
              <span className="text-[11px] font-medium">{isOpen ? 'Hide' : 'View'}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-sky-400' : ''
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Syntax-Highlighted Code Drawer */}
      {isOpen && (
        <div className="max-h-[480px] overflow-auto p-4 sm:px-5 bg-black/80 border-t border-white/5 scrollbar-thin scrollbar-thumb-neutral-800 animate-in fade-in duration-200">
          <div className="flex font-mono text-xs leading-relaxed">
            {/* Line numbers gutter */}
            <div className="select-none pr-4 text-right text-neutral-600 border-r border-white/5 mr-4 font-mono text-[11px]">
              {lines.map((_, i) => (
                <div key={i} className="leading-relaxed">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Highlighted code */}
            <pre
              className="flex-1 overflow-x-auto text-xs leading-relaxed"
              dangerouslySetInnerHTML={{ __html: highlightJson(jsonString) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
