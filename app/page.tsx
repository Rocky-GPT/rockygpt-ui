/**
 * @module app/page
 * Primary chat interface for RockyGPT.
 *
 * Manages message state, PWA install prompts,
 * typed UI actions, and renders the message timeline with source citations, feedback
 * buttons, and quick-access modal triggers.
 */

'use client';

import { readChatStream, ChatStreamError } from '@/lib/chat-stream';
import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Bus, Calendar, Check, ChevronRight, ChevronUp, Copy, CreditCard, Download, ExternalLink, FileText, GraduationCap, Info, MapPin, Phone, Printer, Send, Shield, Sparkles, Square, SquarePen, ThumbsDown, ThumbsUp, Users, Utensils, X } from 'lucide-react';
import { MenuModal } from '@/components/MenuModal';
import { BusModal } from '@/components/BusModal';
import { PrintModal } from '@/components/PrintModal';
import { MapModal } from '@/components/MapModal';
import { WelcomeModal } from '@/components/WelcomeModal';
import { PageLoadingScreen } from '@/components/PageLoadingScreen';
import {
  DirectoryModal,
  SafetyModal,
  EventsModal,
  ClubsModal,
  CalendarModal,
  MajorsModal,
} from '@/components/QuickAccessButtons';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { bindGlobalTapHaptics, destroyHaptics, triggerHaptic } from '@/lib/haptics';
import { useViewportBand } from '@/lib/visual-viewport';
import { MAX_MESSAGE_LENGTH } from '@/lib/brain-api';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { buildRequestMessages } from '@/lib/chat-conversation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  citations?: Citation[];
  requestId?: string;
  question?: string;
  uiActions?: UiAction[];
  suggestedQuestions?: string[];
  isError?: boolean;
  retryContent?: string;
  retryUserMessageId?: string;
  isTyping?: boolean;
  brainTrace?: BrainTrace;
  resources?: Citation[];
  /** Epoch ms before which Try again would only hit the same limit. */
  retryAt?: number;
}

interface Citation {
  id?: string;
  title: string;
  url: string;
  collection?: string;
  snippet?: string;
  collected_at?: string;
  freshness?: string;
}

interface UiAction {
  type: 'VIEW_MENU' | 'VIEW_BUS' | 'VIEW_PRINT' | 'VIEW_EVENTS' | 'VIEW_MAP' | 'VIEW_DIRECTORY';
  payload?: Record<string, string>;
}

interface BrainTrace {
  question: Record<string, unknown>;
  memory: Record<string, unknown>;
  understanding: Record<string, unknown>;
  context: Record<string, unknown>;
  plan: Record<string, unknown>;
  normalizedPlan: Record<string, unknown>;
  execution: Record<string, unknown>;
  answer: Record<string, unknown>;
}

interface ChatApiResponse {
  requestId?: string;
  answer?: string;
  citations?: Citation[];
  uiActions?: UiAction[];
  suggestedQuestions?: string[];
  brainTrace?: BrainTrace;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
    resetAt?: string;
    resources?: Citation[];
  };
}

interface ActiveChatRequest {
  controller: AbortController;
  assistantMessageId: string;
}

class ChatRequestFailure extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
    readonly retryable = true,
    readonly resources: Citation[] = [],
    readonly retryAt?: number
  ) {
    super(message);
    this.name = 'ChatRequestFailure';
  }
}

// Active during local development (`npm run dev`) for instant inspection; automatically hidden in production builds
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const ANSWER_REVEAL_INTERVAL_MS = 20;
const ANSWER_REVEAL_MIN_CHARS = 3;
const ANSWER_REVEAL_MAX_STEPS = 120;
let localMessageSequence = 0;

/**
 * Message creation only happens in user/request event paths. Keeping the
 * clock read outside the React component also makes that render-purity
 * boundary explicit to the hooks lint rule.
 */
function createLocalMessageIdentity(): Pick<ChatMessage, 'id' | 'timestamp'> {
  const timestamp = Date.now();
  localMessageSequence += 1;
  return { id: `${timestamp}-${localMessageSequence}`, timestamp };
}

/**
 * The reveal slices finished markdown by characters, so halfway through a
 * link it read "[Ramapo Dining](https" in raw syntax until its last
 * character landed. While typing, an unfinished link shows only its label
 * and an unpaired ** or backtick is held back. The final answer is untouched.
 */
function settlePartialMarkdown(partial: string): string {
  let text = partial.replace(/\[([^\]\n]*)\]\([^)\n]*$/, '$1').replace(/\[([^\]\n]*)$/, '$1');
  if ((text.match(/\*\*/g) || []).length % 2 === 1) text = text.replace(/\*\*(?![\s\S]*\*\*)/, '');
  if ((text.match(/`/g) || []).length % 2 === 1) text = text.replace(/`(?![\s\S]*`)/, '');
  return text;
}

/**
 * A random value for this browser tab, sent with each question so the chat
 * limit counts tabs instead of whole networks: a campus Wi-Fi puts a dorm
 * behind a few addresses. It lives in sessionStorage and ends with the tab;
 * the server keeps only a keyed hash of it, in memory, for a minute.
 */
let fallbackTabToken: string | null = null;
function chatClientToken(): string {
  const fresh = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  try {
    const existing = window.sessionStorage.getItem('rockygpt_tab');
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
    const created = fresh();
    window.sessionStorage.setItem('rockygpt_tab', created);
    return created;
  } catch {
    // Storage blocked: one value per page load still counts this tab alone.
    return (fallbackTabToken ??= fresh());
  }
}

async function revealAnswer(
  answer: string,
  signal: AbortSignal,
  onProgress: (content: string) => void
): Promise<boolean> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onProgress(answer);
    return !signal.aborted;
  }

  const characters = Array.from(answer);
  const charactersPerStep = Math.max(
    ANSWER_REVEAL_MIN_CHARS,
    Math.ceil(characters.length / ANSWER_REVEAL_MAX_STEPS)
  );
  let visible = '';

  for (let index = 0; index < characters.length; index += charactersPerStep) {
    if (signal.aborted) return false;
    await new Promise<void>((resolve) => window.setTimeout(resolve, ANSWER_REVEAL_INTERVAL_MS));
    if (signal.aborted) return false;
    visible += characters.slice(index, index + charactersPerStep).join('');
    onProgress(visible);
  }

  return true;
}

const TRANSACT_BALANCE_URL = 'https://idx.transactcampus.com/accounts/ramapo-edu/id-card/home';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const ESCAPE_REGEX = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Curated list of primary actionable campus venues, dining spots, and key offices (avoids over-chipping generic parent complexes)
const PRIMARY_ACTIONABLE_LOCATIONS = [
  // Primary Dining Venues
  'Starbucks at Common Grounds',
  'Common Grounds (Starbucks)',
  'Common Grounds',
  'Birch Tree Inn',
  'The Atrium',
  'Atrium',
  "Dunkin'",
  "Dunkin’",
  'Dunkin',
  'Roadrunner Express',
  // Primary Administrative & Student Hub Offices
  'Center for Student Involvement (CSI)',
  'Center for Student Involvement',
  'Center for Student Success',
  'Office of Residence Life',
  'Residence Life Office',
  'Office of Financial Aid',
  'Financial Aid Office',
  'Office of the Registrar',
  'Registrar Office',
  'Office of Student Accounts',
  'Bursar Office',
  'The Lodge (CPA)',
  'The Lodge',
  'Public Safety',
  // Primary Special Facilities
  'Bradley Center',
  'Salameno Spiritual Center',
  'Sharp Sustainability Center',
  'Berrie Center',
  'Potter Library',
];

const COMPILED_LOCATION_NAMES = Array.from(new Set(PRIMARY_ACTIONABLE_LOCATIONS))
  .map((s) => s.trim())
  .sort((a, b) => b.length - a.length);

const COMPILED_LOCATIONS_REGEX = new RegExp(
  `(?:^|(?<=[^\\w]))(${COMPILED_LOCATION_NAMES.map(ESCAPE_REGEX).join('|')})(?=[^\\w]|$)`,
  'gi'
);

const ROAD_PREFIXES = new Set(['I', 'US', 'NJ', 'NY', 'PA', 'CR', 'SR', 'RT', 'RTE']);

// Helper to auto-link phone numbers, emails, and rooms to smart interactive pills
function linkSmartChips(text: string): string {
  if (!text) return '';

  const links: string[] = [];
  const protectLink = (markdown: string): string => {
    const idx = links.length;
    links.push(markdown);
    return `___SMARTLINK_${idx}___`;
  };
  // Code is quoted text. A ramapo.edu URL in backticks came back as raw
  // "[url](url)" markdown, so code spans and fences are set aside first.
  let protectedText = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, (code) => protectLink(code));
  protectedText = protectedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
    if (/^\(?201\)?[-.\s]?684[-.\s]?\d{4}$/.test(label.trim())) {
      const clean = label.replace(/[^\d]/g, '');
      href = 'tel:' + clean;
    }
    return protectLink(`[${label}](${href})`);
  });

  // 1. Auto-link emails (e.g. success@ramapo.edu)
  protectedText = protectedText.replace(
    /\b([a-zA-Z0-9._%+-]+@ramapo\.edu)\b/g,
    // Later bare-domain linking must not rewrite the email label or mailto target.
    (_, email) => protectLink(`[${email}](mailto:${email})`)
  );

  // 5. Auto-link bare ramapo domains (e.g. ramapo.edu, archway.ramapo.edu, ramapo.edu/map).
  // Runs before rooms and venues so a code inside a path stays part of its URL.
  // Punctuation inside a path belongs to it ("?utm=", "catalog.pdf"); only
  // punctuation ending the sentence is left outside the link.
  protectedText = protectedText.replace(
    /\b((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*ramapo\.edu(?:\/[^\s<>()[\]*`'"]*)?)/g,
    (match: string) => {
      const url = match.replace(/[.,!?;:]+$/, '');
      const trailing = match.slice(url.length);
      const cleanHref = url.startsWith('http') ? url : `https://${url}`;
      return `${protectLink(`[${url}](${cleanHref})`)}${trailing}`;
    }
  );

  // 2. Auto-link unlinked Ramapo phone numbers ((201) 684-XXXX, 201-684-XXXX, 201.684.XXXX)
  protectedText = protectedText.replace(
    /(?:^|[^\w\d\[])(\(?201\)?[-.\s]?684[-.\s]?\d{4})(?=[^\w\d\]]|$)/g,
    (m, phone) => {
      const clean = phone.replace(/[^\d]/g, '');
      const prefix = m.startsWith(phone) ? '' : m[0];
      return `${prefix}${protectLink(`[${phone}](tel:${clean})`)}`;
    }
  );

  // 3. Auto-link Room / Office Numbers (e.g. C-102, D-207, SC-202, ASB-333, E-210, B-214)
  // Road names share the shape: I-287 or US-202 is not a room to put on the map.
  protectedText = protectedText.replace(
    /\b([A-Z]{1,3}-\d{3}[A-Z]?)\b/g,
    (match, room: string) =>
      ROAD_PREFIXES.has(room.split('-')[0]) ? match : protectLink(`[${room}](#map:${room})`)
  );

  // 4. Auto-link all Campus Dining Spots, Offices, Buildings, and Key Landmarks into interactive map chips
  protectedText = protectedText.replace(
    COMPILED_LOCATIONS_REGEX,
    (matched) => protectLink(`[${matched}](#map:${encodeURIComponent(matched)})`)
  );

  // 6. Natural phrasing transformation for smart chips & links (replaces robotic colon notation)
  protectedText = protectedText.replace(
    /(\]\[?[^\]]*\]?\([^)]+\)(?:\*\*|\*)?)\s*:\s*(closed|open|located|temporarily|operating)\b/gi,
    (_, pill, word) => `${pill} is ${word.toLowerCase()}`
  );
  protectedText = protectedText.replace(
    /(\]\[?[^\]]*\]?\([^)]+\)(?:\*\*|\*)?)\s*:\s*([A-Za-z0-9])/g,
    (_, pill, nextChar) => `${pill} ${nextChar}`
  );

  // Restore protected links
  let restored = protectedText.replace(/___SMARTLINK_(\d+)___/g, (_, idx) => links[Number(idx)] || '');

  // Apply natural phrasing to restored links as well
  restored = restored.replace(
    /(\]\([^)]+\)(?:\*\*|\*)?)\s*:\s*(closed|open|located|temporarily|operating)\b/gi,
    (_, pill, word) => `${pill} is ${word.toLowerCase()}`
  );
  restored = restored.replace(
    /(\]\([^)]+\)(?:\*\*|\*)?)\s*:\s*([A-Za-z0-9])/g,
    (_, pill, nextChar) => `${pill} ${nextChar}`
  );

  return restored;
}

/**
 * react-markdown hands every override its syntax-tree `node`. Spread onto a
 * DOM element it rendered node="[object Object]" on every paragraph.
 */
function domProps<T extends object>(props: T): Omit<T, 'node'> {
  const rest = { ...props } as T & { node?: unknown };
  delete rest.node;
  return rest;
}

interface AnswerMarkdownProps {
  content: string;
  onOpenMap: (locationKey: string | null) => void;
}

/**
 * Keeps completed answers out of React's work while the newest answer reveals.
 * Only the active answer's content changes, so prior Markdown trees are reused.
 */
const AnswerMarkdown = memo(function AnswerMarkdown({
  content,
  onOpenMap,
}: AnswerMarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      strong: ({ ...props }) => (
        <strong className="font-semibold text-foreground" {...domProps(props)} />
      ),
      em: ({ ...props }) => <em className="italic text-foreground/90" {...domProps(props)} />,
      h1: ({ ...props }) => (
        <h1 className="mb-2 mt-5 text-xl font-semibold leading-tight text-foreground first:mt-0" {...domProps(props)} />
      ),
      h2: ({ ...props }) => (
        <h2 className="mb-2 mt-5 text-lg font-semibold leading-tight text-foreground first:mt-0" {...domProps(props)} />
      ),
      h3: ({ ...props }) => (
        <h3 className="mb-2 mt-4 text-base font-semibold leading-snug text-foreground first:mt-0" {...domProps(props)} />
      ),
      h4: ({ ...props }) => (
        <h4 className="mb-2 mt-4 text-sm font-semibold leading-snug text-foreground first:mt-0" {...domProps(props)} />
      ),
      ul: ({ ...props }) => (
        <ul className="mb-3 list-disc space-y-1 pl-6 marker:text-muted-foreground" {...domProps(props)} />
      ),
      ol: ({ ...props }) => (
        <ol className="mb-3 list-decimal space-y-1 pl-6 marker:text-muted-foreground" {...domProps(props)} />
      ),
      li: ({ ...props }) => <li className="pl-1 leading-7" {...domProps(props)} />,
      a: ({ href, children, ...props }) => {
        const textContent =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
              ? children.map((child) => (typeof child === 'string' ? child : '')).join('')
              : '';
        const isPhone =
          href?.startsWith('tel:') || /^\(?201\)?[-.\s]?684[-.\s]?\d{4}$/.test(textContent.trim());

        if (isPhone) {
          const telHref = href?.startsWith('tel:')
            ? href
            : `tel:${textContent.replace(/[^\d]/g, '')}`;
          return (
            <a
              href={telHref}
              className="inline cursor-pointer font-medium text-rose-400 underline decoration-1 decoration-rose-500/40 underline-offset-4 transition-colors hover:text-rose-300 hover:decoration-rose-300 active:opacity-70"
              title={`Call ${textContent}`}
              {...domProps(props)}
            >
              <span>{children}</span>
            </a>
          );
        }
        if (href?.startsWith('mailto:')) {
          return (
            <a
              href={href}
              className="inline cursor-pointer font-medium text-rose-400 underline decoration-1 decoration-rose-500/40 underline-offset-4 transition-colors hover:text-rose-300 hover:decoration-rose-300 active:opacity-70"
              title={`Email ${href.replace('mailto:', '')}`}
              {...domProps(props)}
            >
              <span>{children}</span>
            </a>
          );
        }
        if (href?.startsWith('#map:')) {
          const roomKey = decodeURIComponent(href.replace('#map:', ''));
          return (
            <button
              type="button"
              onClick={() => onOpenMap(roomKey)}
              className="inline cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-rose-400 underline decoration-1 decoration-rose-500/40 underline-offset-4 transition-colors hover:text-rose-300 hover:decoration-rose-300 active:opacity-70"
              title={`View ${roomKey} on Campus Map`}
            >
              <span>{children}</span>
            </button>
          );
        }
        const safeHref =
          href?.startsWith('http://') ||
          href?.startsWith('https://') ||
          href?.startsWith('tel:') ||
          href?.startsWith('mailto:') ||
          href?.startsWith('#')
            ? href
            : `https://${href}`;

        return (
          <a
            href={safeHref}
            className="inline font-medium text-rose-400 underline decoration-1 decoration-rose-500/40 underline-offset-4 transition-colors hover:text-rose-300 hover:decoration-rose-300 active:opacity-70"
            target="_blank"
            rel="noopener noreferrer"
            {...domProps(props)}
          >
            <span>{children}</span>
          </a>
        );
      },
      p: ({ ...props }) => <p className="mb-3 last:mb-0" {...domProps(props)} />,
      code: ({ ...props }) => (
        <code
          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground [overflow-wrap:anywhere]"
          {...domProps(props)}
        />
      ),
      pre: ({ ...props }) => (
        <pre
          className="my-4 overflow-x-auto rounded-xl border border-border/50 bg-muted/50 p-4 font-mono text-xs leading-6 text-foreground [&>code]:bg-transparent [&>code]:p-0"
          {...domProps(props)}
        />
      ),
      blockquote: ({ ...props }) => (
        <blockquote
          className="my-4 border-l-2 border-rose-400/50 pl-4 text-muted-foreground"
          {...domProps(props)}
        />
      ),
      hr: () => <hr className="my-5 border-border/60" />,
      table: ({ ...props }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-border/50 scrollbar-none">
          <table className="w-full border-collapse text-xs sm:text-sm" {...domProps(props)} />
        </div>
      ),
      thead: ({ ...props }) => <thead className="bg-muted/50" {...domProps(props)} />,
      th: ({ ...props }) => (
        <th
          className="border border-border/50 px-4 py-2 text-left font-bold"
          {...domProps(props)}
        />
      ),
      td: ({ ...props }) => <td className="border border-border/50 px-4 py-2" {...domProps(props)} />,
    }),
    [onOpenMap]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {linkSmartChips(content)}
    </ReactMarkdown>
  );
});

// Helper to format timestamp
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  if (isToday) return `Today at ${date.toLocaleTimeString([], options)}`;
  if (isYesterday) return `Yesterday at ${date.toLocaleTimeString([], options)}`;

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

function cleanCitations(citations?: Citation[]): Citation[] {
  if (!Array.isArray(citations)) return [];

  const seen = new Set<string>();
  return citations
    .filter((citation) => citation?.url && citation?.title)
    .filter((citation) => {
      const key = `${citation.title}|${citation.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanSuggestedQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 0 && item.length <= 120)
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

const LEGACY_VISITOR_STORAGE_KEY = 'rockygpt_visitor_id';
function retryDelayLabel(rawValue: string | null): string | null {
  const seconds = Number(rawValue);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

async function chatFailureFromResponse(response: Response): Promise<ChatRequestFailure> {
  const payload = (await response.json().catch(() => ({}))) as ChatApiResponse;
  const code = typeof payload.error === 'object' ? payload.error?.code : undefined;
  const requestId = payload.requestId || response.headers.get('X-Request-Id') || undefined;
  const retryDelay = retryDelayLabel(response.headers.get('Retry-After'));
  const canRetry = payload.error?.retryable !== false;

  if (response.status === 504 || code === 'model_timeout') {
    return new ChatRequestFailure(
      'RockyGPT took too long to answer.' + (canRetry ? ' Please try again.' : ''),
      requestId,
      canRetry
    );
  }
  if (code === 'invalid_model_output' || code === 'model_provider_error') {
    return new ChatRequestFailure(
      (code === 'invalid_model_output'
        ? 'RockyGPT couldn’t produce a reliable answer.'
        : 'The AI service couldn’t complete this request.') +
        (canRetry ? ' Please try again.' : ''),
      requestId,
      canRetry
    );
  }
  if (typeof payload.error === 'object' && payload.error?.retryable === false) {
    const reset = payload.error.resetAt ? new Date(payload.error.resetAt) : null;
    const resetMessage =
      reset && Number.isFinite(reset.getTime())
        ? ` Resets ${new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/New_York',
          }).format(reset)} (New York).`
        : '';
    const resources = cleanCitations(payload.error.resources)
      .filter((resource) => {
        if (typeof resource.title !== 'string' || typeof resource.url !== 'string') return false;
        try {
          const url = new URL(resource.url);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      })
      .slice(0, 8);
    return new ChatRequestFailure(
      (payload.error.message?.trim() || 'RockyGPT is currently unavailable.') + resetMessage,
      requestId,
      false,
      resources
    );
  }
  if (code === 'busy') {
    // The Brain is at capacity. Saying "you've reached the chat limit" blamed
    // the student for everyone else's questions.
    return new ChatRequestFailure(
      'RockyGPT is answering a lot of questions right now. Please try again in a moment.',
      requestId
    );
  }
  if (response.status === 429 || code === 'RATE_LIMITED') {
    const retryAfterSeconds = Number(response.headers.get('Retry-After'));
    return new ChatRequestFailure(
      retryDelay
        ? `You’ve reached the chat limit for now. Please try again in ${retryDelay}.`
        : 'You’ve reached the chat limit for now. Please wait a little while and try again.',
      requestId,
      true,
      [],
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Date.now() + retryAfterSeconds * 1000
        : undefined
    );
  }
  if (response.status === 503 || code === 'SERVICE_UNAVAILABLE' || code === 'DATASET_UNAVAILABLE') {
    // Preserve the Brain's student-facing message and retryability.
    const said =
      typeof payload.error === 'object' && code !== 'SERVICE_UNAVAILABLE'
        ? payload.error?.message?.trim()
        : undefined;
    const retryable =
      typeof payload.error === 'object' ? payload.error?.retryable !== false : true;
    return new ChatRequestFailure(
      said || 'RockyGPT is temporarily unavailable. Please try again in a few minutes.',
      requestId,
      retryable
    );
  }
  if (response.status >= 400 && response.status < 500) {
    return new ChatRequestFailure(
      'We couldn’t send that request. Check it and try again.',
      requestId,
      false
    );
  }
  return new ChatRequestFailure(
    'Something went wrong while getting an answer. Please try again.',
    requestId
  );
}

/**
 * Main RockyGPT chat page.
 */
export default function Home() {
  const router = useRouter();
  // Publishes `--keyboard-inset` for as long as this page is mounted. The
  // composer and the modal shell read it from CSS; subscribing here is what
  // keeps it measured, and one subscription is all the measurement needs.
  useViewportBand();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('Sending your question…');
  const [progressContext, setProgressContext] = useState('');
  const [draftPreview, setDraftPreview] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuMealContext, setMenuMealContext] = useState('lunch');
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapModalInitialKey, setMapModalInitialKey] = useState<string | null>(null);
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [isClubsModalOpen, setIsClubsModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isMajorsModalOpen, setIsMajorsModalOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isActionMenuClosing, setIsActionMenuClosing] = useState(false);
  const actionMenuCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isSplashDismissed, setIsSplashDismissed] = useState(false);
  const [shouldOpenWelcomeOnLoad, setShouldOpenWelcomeOnLoad] = useState(false);
  // Guards the auto-open below so the welcome modal is only ever raised once per
  // page load, no matter how often the splash reports its fade.
  const welcomeAutoOpenedRef = useRef(false);

  // Restore active conversation from sessionStorage on load
  useEffect(() => {
    try {
      const isAutomatedTest = typeof navigator !== 'undefined' && navigator.webdriver;
      const isDev =
        process.env.NODE_ENV === 'development' ||
        (typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

      if (isAutomatedTest || isDev) {
        setIsSplashDismissed(true);
      }
      // In dev mode: refreshing the page resets to a clean chat state
      if (!isDev) {
        const savedMessages = window.sessionStorage.getItem('rockygpt_session_messages');
        if (savedMessages) {
          const parsed = JSON.parse(savedMessages);
          // Threads saved before placeholders were filtered can still hold one.
          const restored = Array.isArray(parsed)
            ? (parsed as ChatMessage[]).filter(
                (message) => message.role === 'user' || message.isError || message.content
              )
            : [];
          if (restored.length > 0) {
            setMessages(restored);
            setIsSplashDismissed(true);
          }
        }
      } else {
        window.sessionStorage.removeItem('rockygpt_session_messages');
      }
      // RockyGPT no longer keeps a visitor identity. Remove the value older
      // versions persisted in the browser indefinitely.
      window.localStorage.removeItem(LEGACY_VISITOR_STORAGE_KEY);
      const seen = window.localStorage.getItem('rockygpt_welcome_seen');
      if (!seen) {
        if (isAutomatedTest) {
          setIsWelcomeModalOpen(true);
        } else {
          setShouldOpenWelcomeOnLoad(true);
        }
      }
    } catch {
      // Ignore localStorage errors in restricted environments
    }

    // Safety fallback: ensure home content is never indefinitely hidden
    const fallbackTimer = setTimeout(() => {
      setIsSplashDismissed(true);
    }, 3500);
    return () => clearTimeout(fallbackTimer);
  }, []);

  // Synchronize active chat messages with sessionStorage
  useEffect(() => {
    // Development reloads intentionally start with a clean chat, so persisting
    // every reveal frame there only blocks the bulk runner with unused work.
    // In production, wait for the animated answer to settle before writing the
    // same final conversation state that was persisted previously.
    if (IS_DEVELOPMENT || messages.some((message) => message.isTyping)) return;
    try {
      // An answer still on its way is an empty placeholder. Saved as-is, a
      // reload mid-answer restored a blank bubble with copy and rating buttons.
      const settled = messages.filter(
        (message) => message.role === 'user' || message.isError || message.content
      );
      if (settled.length > 0) {
        window.sessionStorage.setItem('rockygpt_session_messages', JSON.stringify(settled));
      } else {
        window.sessionStorage.removeItem('rockygpt_session_messages');
      }
    } catch {
      // Ignore
    }
  }, [messages]);

  const handleSplashFadeStart = useCallback(() => {
    setIsSplashDismissed(true);
  }, []);

  // Raise the first-visit welcome modal once the splash is out of the way. This
  // is driven off state rather than the splash callback directly so it does not
  // depend on whether the splash faded before or after the flag was read.
  useEffect(() => {
    if (!isSplashDismissed || !shouldOpenWelcomeOnLoad) return;
    if (welcomeAutoOpenedRef.current) return;
    welcomeAutoOpenedRef.current = true;
    setIsWelcomeModalOpen(true);
  }, [isSplashDismissed, shouldOpenWelcomeOnLoad]);

  // "What's on the menu today?" was answered with a question back (which hall,
  // which meal?), and "When is the next shuttle?" named no route. The first
  // prompt asks about the meal Birch is serving at this hour on campus; it is
  // set after mount so the server render and the first client render agree.
  const [mealPrompt, setMealPrompt] = useState("What's for lunch at Birch today?");
  useEffect(() => {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'America/New_York',
      }).format(new Date())
    );
    setMealPrompt(
      hour < 10
        ? "What's for breakfast at Birch today?"
        : hour < 14
          ? "What's for lunch at Birch today?"
          : hour < 20
            ? "What's for dinner at Birch tonight?"
            : "What's for lunch at Birch tomorrow?"
    );
  }, []);

  // Home-screen shortcuts in manifest.json open a panel directly. They used to
  // point at /?q=dining, which nothing read, so they just opened the home page.
  useEffect(() => {
    const panel = new URLSearchParams(window.location.search).get('open');
    if (!panel) return;
    const openers: Record<string, () => void> = {
      menu: () => setIsMenuOpen(true),
      events: () => setIsEventsModalOpen(true),
      shuttle: () => setIsBusModalOpen(true),
      directory: () => setIsDirectoryModalOpen(true),
      safety: () => setIsSafetyModalOpen(true),
    };
    openers[panel]?.();
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const handleCloseWelcome = useCallback(() => {
    setIsWelcomeModalOpen(false);
    setShouldOpenWelcomeOnLoad(false);
    try {
      window.localStorage.setItem('rockygpt_welcome_seen', 'true');
    } catch {
      // Ignore
    }
  }, []);

  const closeCampusActions = useCallback((callback?: () => void) => {
    if (isActionMenuClosing) return;
    setIsActionMenuClosing(true);
    if (actionMenuCloseTimerRef.current) clearTimeout(actionMenuCloseTimerRef.current);
    actionMenuCloseTimerRef.current = setTimeout(() => {
      setIsActionMenuOpen(false);
      setIsActionMenuClosing(false);
      actionMenuTriggerRef.current?.focus({ preventScroll: true });
      callback?.();
      // Leaving should be quicker than arriving: the reversed 800ms wave made
      // every dismissal wait for thirteen cards to fall away in turn.
    }, 180);
  }, [isActionMenuClosing]);

  // Picking an item dismisses the menu instantly instead of playing the exit
  // wave: the dismiss animation is for backing out, and making someone watch it
  // before their destination opens just delays the thing they asked for.
  const selectCampusAction = useCallback((action: () => void) => {
    if (actionMenuCloseTimerRef.current) clearTimeout(actionMenuCloseTimerRef.current);
    setIsActionMenuClosing(false);
    setIsActionMenuOpen(false);
    actionMenuTriggerRef.current?.focus({ preventScroll: true });
    action();
  }, []);

  const toggleCampusActions = useCallback(() => {
    if (isActionMenuOpen) {
      closeCampusActions();
    } else {
      if (actionMenuCloseTimerRef.current) clearTimeout(actionMenuCloseTimerRef.current);
      setIsActionMenuClosing(false);
      setIsActionMenuOpen(true);
    }
  }, [isActionMenuOpen, closeCampusActions]);

  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const activeRequestRef = useRef<ActiveChatRequest | null>(null);

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // `isLoading` mirrored into a ref, so an async caller that captured
  // `sendMessage` once still reads a value that is current at await time
  // rather than at capture time.
  const isLoadingRef = useRef(false);
  const setLoading = (value: boolean) => {
    isLoadingRef.current = value;
    setIsLoading(value);
  };




  // Install PWA logic
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  useEffect(() => {
    // Check if it's iOS. iPadOS reports a Mac user agent, but a Mac has no touch.
    const isIOSDevice =
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) &&
      !('MSStream' in window);
    setIsIOS(isIOSDevice);
    // Safari never fires beforeinstallprompt, so on iOS the Install entry (and
    // the instructions behind it) could never appear. Offer it directly.
    if (isIOSDevice && !window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallButton(true);
    }

    // Listen for install prompt (Chrome/Edge/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallButton(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const unbindTapHaptics = bindGlobalTapHaptics();
    return () => {
      unbindTapHaptics();
      destroyHaptics();
    };
  }, []);

  // Handle install button click
  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') triggerHaptic('success');
    // A prompt can be shown once. After a dismissal the button stayed and did
    // nothing, so it goes either way until the browser offers a new prompt.
    setShowInstallButton(false);
    setDeferredPrompt(null);
  };

  // Stop owns the whole visible lifecycle and immediately removes an empty
  // assistant placeholder. Clearing the active request prevents an older
  // aborted request from settling a newer request's loading state.
  const stopGeneration = () => {
    triggerHaptic('warning');
    const activeRequest = activeRequestRef.current;
    activeRequest?.controller.abort();
    activeRequestRef.current = null;
    if (activeRequest) {
      setMessages((prev) =>
        prev.flatMap((message) => {
          if (message.id !== activeRequest.assistantMessageId) return [message];
          return message.content ? [{ ...message, isTyping: false }] : [];
        })
      );
    }
    setLoading(false);
  };

  // There was no way to start over. The thread is restored on reload, so once
  // it grew long the only way out was a new tab. A new chat also cancels any
  // answer still on its way, so it cannot land in the fresh thread.
  const startNewChat = () => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    setLoading(false);
    setMessages([]);
    setInput('');
    window.scrollTo({ top: 0 });
  };

  const openBalancePortal = () => {
    window.open(TRANSACT_BALANCE_URL, '_blank', 'noopener,noreferrer');
  };

  const sendMessage = async (
    content: string,
    historyMessages: ChatMessage[] = messagesRef.current
  ): Promise<boolean> => {
    // Read the ref, not `isLoading`: callers like the bulk runner hold this
    // function across many awaits, so the captured state value is frozen at
    // whatever it was when the run started and never reflects reality again.
    const normalizedContent = content.trim();
    if (
      !normalizedContent ||
      normalizedContent.length > MAX_MESSAGE_LENGTH ||
      isLoadingRef.current ||
      activeRequestRef.current
    ) {
      return false;
    }

    const userIdentity = createLocalMessageIdentity();
    const userMessage: ChatMessage = {
      ...userIdentity,
      role: 'user',
      content: normalizedContent,
    };
    const assistantIdentity = createLocalMessageIdentity();
    const assistantMessageId = assistantIdentity.id;
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        ...assistantIdentity,
        id: assistantMessageId,
        role: 'assistant',
        content: '',
      } as ChatMessage,
    ]);
    setInput('');
    setProgressLabel('Sending your question…');
    setProgressContext('');
    setDraftPreview('');
    setLoading(true);

    const controller = new AbortController();
    activeRequestRef.current = { controller, assistantMessageId };

    try {
      const requestMessages = buildRequestMessages(historyMessages, userMessage);
      const upstreamResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-rockygpt-client': chatClientToken(),
        },
        body: JSON.stringify({ messages: requestMessages }),
        signal: controller.signal,
      });

      const response = await readChatStream(upstreamResponse, (label, detail, draft) => {
        if (!controller.signal.aborted && activeRequestRef.current?.controller === controller) {
          setProgressLabel(label);
          setProgressContext(detail);
          setDraftPreview(draft);
        }
      });
      if (!response.ok) {
        throw await chatFailureFromResponse(response);
      }

      const data = (await response.json()) as ChatApiResponse;
      const finalAnswer = typeof data.answer === 'string' ? data.answer.trim() : '';
      const responseCitations = cleanCitations(data.citations);
      const responseActions = Array.isArray(data.uiActions) ? data.uiActions : [];
      const responseSuggestions = cleanSuggestedQuestions(data.suggestedQuestions);
      if (!finalAnswer) {
        throw new ChatRequestFailure(
          'RockyGPT returned an incomplete answer. Please try again.',
          data.requestId || response.headers.get('X-Request-Id') || undefined
        );
      }
      if (controller.signal.aborted || activeRequestRef.current?.controller !== controller)
        return true;

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              isTyping: true,
            };
          }
          return msg;
        })
      );

      const revealCompleted = await revealAnswer(
        finalAnswer,
        controller.signal,
        (partialAnswer) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: settlePartialMarkdown(partialAnswer) }
                : msg
            )
          );
        }
      );
      if (
        !revealCompleted ||
        controller.signal.aborted ||
        activeRequestRef.current?.controller !== controller
      ) {
        return true;
      }

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: finalAnswer,
              isTyping: false,
              citations: responseCitations,
              requestId: data.requestId,
              question: userMessage.content,
              uiActions: responseActions,
              suggestedQuestions: responseSuggestions,
              brainTrace: data.brainTrace,
            };
          }
          return msg;
        })
      );
      if (finalAnswer.length > 0) {
        requestAnimationFrame(() => triggerHaptic('nudge', 1));
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        setMessages((prev) =>
          prev.flatMap((msg) => {
            if (msg.id !== assistantMessageId) return [msg];
            return msg.content ? [{ ...msg, isTyping: false }] : [];
          })
        );
      } else {
        console.error('Chat error:', error);
        triggerHaptic('error');
        const requestFailure =
          error instanceof ChatRequestFailure
            ? error
            : new ChatRequestFailure(
                error instanceof ChatStreamError
                  ? error.message
                  : error instanceof TypeError
                  ? 'We couldn’t reach RockyGPT. Check your connection and try again.'
                  : 'Something went wrong while getting an answer. Please try again.'
              );
        const errorIdentity = createLocalMessageIdentity();
        // Remove the empty assistant message if request failed, then show error
        setMessages((prev) => {
          const newMessages = prev.filter((msg) => msg.id !== assistantMessageId);

          return [
            ...newMessages,
            {
              ...errorIdentity,
              role: 'assistant',
              content: requestFailure.message,
              requestId: requestFailure.requestId,
              isError: true,
              resources: requestFailure.resources,
              retryContent: requestFailure.retryable ? userMessage.content : undefined,
              retryUserMessageId: userMessage.id,
              retryAt: requestFailure.retryAt,
            } as ChatMessage,
          ];
        });
      }
    } finally {
      if (activeRequestRef.current?.controller === controller) {
        activeRequestRef.current = null;
        setLoading(false);
      }
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // On a phone the on-screen keyboard covers the answer, so sending dismisses
    // it. With a mouse and a real keyboard there is nothing to dismiss, and
    // dropping focus forces a click before every follow-up question.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      chatInputRef.current?.focus();
    } else {
      chatInputRef.current?.blur();
    }
    sendMessage(input);
  };

  const handleSuggestionClick = (q: string) => {
    sendMessage(q);
  };

  const retryMessage = (failedMessage: ChatMessage) => {
    if (!failedMessage.retryContent) return;
    // With another answer in flight sendMessage refuses, so removing the
    // failed turn first used to delete the question and send nothing.
    if (isLoadingRef.current || activeRequestRef.current) return;
    const retryHistory = messages.filter(
      (message) =>
        message.id !== failedMessage.id && message.id !== failedMessage.retryUserMessageId
    );
    setMessages(retryHistory);
    void sendMessage(failedMessage.retryContent, retryHistory);
  };

  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      triggerHaptic('success');
    } catch (error) {
      console.error('Clipboard error:', error);
      triggerHaptic('error');
    }
  };

  const openMapModal = useCallback((locationKey: string | null = null) => {
    setMapModalInitialKey(locationKey);
    setIsMapModalOpen(true);
  }, []);

  const runUiAction = (action: UiAction) => {
    switch (action.type) {
      case 'VIEW_MENU':
        if (action.payload?.meal) setMenuMealContext(action.payload.meal);
        setIsMenuOpen(true);
        break;
      case 'VIEW_BUS':
        setIsBusModalOpen(true);
        break;
      case 'VIEW_PRINT':
        setIsPrintModalOpen(true);
        break;
      case 'VIEW_EVENTS':
        setIsEventsModalOpen(true);
        break;
      case 'VIEW_MAP':
        openMapModal(action.payload?.locationKey || null);
        break;
      case 'VIEW_DIRECTORY':
        setIsDirectoryModalOpen(true);
        break;
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    // An empty chat has nothing to reveal. Scrolling to its end on load slid
    // the greeting under the header on shorter phones: 101px at 375x667 cut
    // "What can I help with?" in half, and 344px at 320x568 hid it entirely.
    if (messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const latest = messages[messages.length - 1];
      scrollToBottom(latest?.isTyping ? 'auto' : 'smooth');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading]);

  // Treat the campus actions popup as a keyboard-operable menu. Unlike the
  // full dialogs below it does not trap focus, but closing it always returns
  // focus to its trigger so keyboard users keep their place.
  useEffect(() => {
    if (!isActionMenuOpen || isActionMenuClosing) return;

    const menuItems = () =>
      Array.from(actionMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

    const focusFirstItem = window.requestAnimationFrame(() => {
      menuItems()[0]?.focus({ preventScroll: true });
    });

    function handleClickOutside(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        if (actionMenuTriggerRef.current?.contains(event.target as Node)) return;
        closeCampusActions();
      }
    }

    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCampusActions();
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = menuItems();
      if (!items.length) return;

      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Home') {
        items[0].focus();
      } else if (event.key === 'End') {
        items[items.length - 1].focus();
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + direction + items.length) % items.length;
        items[nextIndex].focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstItem);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [closeCampusActions, isActionMenuClosing, isActionMenuOpen]);


  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip font-sans">
      <header className={`sticky top-0 z-50 bg-background ${isSplashDismissed ? 'animate-hero-header' : 'opacity-0'}`}>
        <div className="container flex h-14 max-w-2xl mx-auto items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">RockyGPT</span>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNewChat}
                aria-label="New chat"
                title="New chat"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <SquarePen aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsWelcomeModalOpen(true)}
              aria-label="Campus guide & welcome tour"
              title="Campus Guide & Welcome Tour"
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 rounded-2xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors text-xs font-semibold cursor-pointer"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4 text-rose-400" />
              {/* Mid-conversation the header also holds New chat, so Guide
                  gives up its label to keep the row inside a 360px screen. */}
              <span className={messages.length > 0 ? 'hidden sm:inline' : 'hidden xs:inline'}>Guide</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSafetyModalOpen(true)}
              aria-label="Campus safety"
              className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-bold"
            >
              <Shield aria-hidden="true" className="h-4 w-4" />
              <span className="hidden xs:inline">Safety</span>
            </button>
            {showInstallButton && (
              <button
                type="button"
                onClick={handleInstall}
                aria-label="Install RockyGPT"
                className="hidden min-h-11 min-w-11 items-center justify-center gap-2 px-3 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium sm:flex"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                <span className="hidden xs:inline">Install</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-32 pt-6 sm:pb-40">
        <div className="container max-w-2xl mx-auto px-4 flex flex-col gap-6">
          {messages.length === 0 && (
            <div className="flex flex-col gap-8 pt-8">
              <div
                className={`space-y-1 ${isSplashDismissed ? 'animate-hero-greeting' : 'opacity-0'}`}
                style={{ animationDelay: '40ms' }}
              >
                <p className="text-muted-foreground text-lg">Hi roadrunner</p>
                <h1 className="text-3xl font-semibold tracking-tight">What can I help with?</h1>
              </div>

              <div className="space-y-3">
                {[
                  { q: mealPrompt, color: 'bg-purple-500' },
                  { q: 'When does the Roadrunner Express leave campus today?', color: 'bg-blue-500' },
                ].map(({ q, color }, index) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestionClick(q)}
                    className={`flex items-center gap-3 text-left hover:opacity-70 transition-opacity ${isSplashDismissed ? 'animate-hero-prompt' : 'opacity-0'}`}
                    style={{ animationDelay: `${120 + index * 50}ms` }}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    <span className="text-foreground">{q}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { icon: Utensils, label: 'Birch Menu', action: () => setIsMenuOpen(true) },
                  { icon: Bus, label: 'Shuttle Schedule', action: () => setIsBusModalOpen(true) },
                  {
                    icon: Printer,
                    label: 'Print Locations',
                    action: () => setIsPrintModalOpen(true),
                  },
                  { icon: Users, label: 'Clubs & Orgs', action: () => setIsClubsModalOpen(true) },
                  {
                    icon: Calendar,
                    label: 'Campus Events',
                    action: () => setIsEventsModalOpen(true),
                  },
                  {
                    icon: Calendar,
                    label: 'Academic Calendar',
                    action: () => setIsCalendarModalOpen(true),
                  },
                  {
                    icon: GraduationCap,
                    label: 'Majors',
                    action: () => setIsMajorsModalOpen(true),
                  },
                  { icon: MapPin, label: 'Campus Map', action: () => openMapModal() },
                  {
                    icon: Phone,
                    label: 'Phone Directory',
                    action: () => setIsDirectoryModalOpen(true),
                  },
                ].map(({ icon: Icon, label, action }, index) => (
                  <button
                    key={label}
                    onClick={action}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-muted hover:bg-muted/70 text-sm font-medium transition-colors ${isSplashDismissed ? 'animate-hero-pill' : 'opacity-0'}`}
                    style={{ animationDelay: `${180 + index * 35}ms` }}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m: ChatMessage, index: number) => {

            // Hide the assistant message if it's currently loading and empty (we'll show the thinking animation instead)
            if (
              m.role === 'assistant' &&
              !m.content &&
              isLoading &&
              index === messages.length - 1
            ) {
              return null;
            }

            return (
              <div
                key={m.id}
                className={`flex flex-col gap-4 ${m.role === 'user' ? 'items-end' : 'items-start w-full'}`}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 160px' }}
              >
                {m.role === 'user' ? (
                  <div className="max-w-[80%]">
                    <div className="px-4 py-2.5 rounded-2xl bg-muted/80 text-foreground text-[15px] whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex items-end gap-3">
                      <Sparkles className="h-5 w-5 text-white" />
                      <div className="flex items-center gap-2">
                        {m.timestamp && (
                          <span className="text-sm text-muted-foreground/80 mt-0.5">
                            {formatTimestamp(m.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                    {m.isError ? (
                      <div
                        role="alert"
                        className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-foreground"
                      >
                        <p className="font-medium leading-6">{m.content}</p>
                        {m.resources && m.resources.length > 0 && (
                          <ul className="mt-3 list-disc space-y-1 pl-5">
                            {m.resources.map((resource) => (
                              <li key={resource.url}>
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline underline-offset-4"
                                >
                                  {resource.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        {m.requestId && (
                          <p className="mt-2 break-all text-xs text-muted-foreground">
                            Support ID: <code>{m.requestId}</code>
                          </p>
                        )}
                        {m.retryContent && (
                          <RetryButton
                            retryAt={m.retryAt}
                            busy={isLoading}
                            onRetry={() => retryMessage(m)}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div
                          aria-busy={m.isTyping || undefined}
                          className={`text-[15px] leading-7 text-foreground prose prose-invert prose-sm max-w-none [overflow-wrap:anywhere] ${
                            m.isTyping ? 'rocky-answer-typing' : ''
                          }`}
                        >
                          <AnswerMarkdown content={m.content} onOpenMap={openMapModal} />
                        </div>
                        {!m.isTyping &&
                          ((m.uiActions?.length || 0) > 0 ||
                            cleanCitations(m.citations).length > 0) && (
                            <div className="flex max-w-full flex-wrap items-center gap-2">
                              {m.uiActions?.map((action, actionIndex) => (
                                <button
                                  key={`${action.type}-${actionIndex}`}
                                  onClick={() => runUiAction(action)}
                                  className="group inline-flex min-h-9 items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
                                >
                                  <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />
                                  {actionLabel(action.type)}
                                </button>
                              ))}
                              <SourceLinks citations={m.citations} />
                            </div>
                          )}
                        {!m.isTyping && (
                          <div className="-ml-3 flex flex-wrap items-center gap-1 text-muted-foreground">
                            <button
                              type="button"
                              aria-label="Copy answer"
                              data-no-haptic="true"
                              onClick={() => handleCopyContent(m.content)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/5 hover:text-foreground"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <FeedbackButtons requestId={m.requestId} question={m.question} answer={m.content} />
                          </div>
                        )}
                        {/*
                          A list, not a row of chips: each is a whole question
                          and wants its own line. They sit under the answer they
                          follow rather than in the fixed composer, where a
                          sideways row hid two of three off a phone's edge and a
                          stacked one would have covered the answer itself.
                          Choosing one sends it.
                        */}
                        {index === messages.length - 1 &&
                          !isLoading &&
                          !m.isTyping &&
                          (m.suggestedQuestions?.length || 0) > 0 && (
                            <div
                              role="group"
                              aria-label="Suggested follow-up questions"
                              className="flex flex-col items-start gap-2"
                            >
                              {m.suggestedQuestions?.map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  onClick={() => handleSuggestionClick(question)}
                                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[#f4a8b5]/60 hover:bg-muted hover:text-foreground"
                                >
                                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                                  <span className="min-w-0">{question}</span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading &&
            messages[messages.length - 1]?.role === 'assistant' &&
            !messages[messages.length - 1]?.content && (
              <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 items-start gap-2.5 py-1">
                <Sparkles className="h-5 w-5 text-[#f4a8b5] animate-thinking-star shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate whitespace-nowrap text-sm font-medium tracking-wide animate-thinking-shimmer select-none">
                    {progressLabel}
                  </div>
                  {progressContext && (
                    <div className="mt-1 truncate whitespace-nowrap text-xs leading-5 text-zinc-500 dark:text-zinc-400" title={progressContext}>
                      {progressContext}
                    </div>
                  )}
                  {draftPreview && (
                    <div className="mt-3 text-zinc-500 dark:text-zinc-400">
                      <div className="mb-1 text-xs font-medium">Draft · not verified</div>
                      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                        {draftPreview}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Campus Quick Actions Hub (Full screen height above prompt area) */}
      {isActionMenuOpen && (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end pointer-events-none pb-[6.75rem] sm:pb-[7rem] pt-3 sm:pt-4 px-2 sm:px-4">
          <div
            className={`absolute inset-0 bg-black/25 backdrop-blur-md pointer-events-auto transition-opacity duration-200 ${isActionMenuClosing ? 'opacity-0' : 'opacity-100'}`}
            style={{
              // Mirrors the entrance: the backdrop fades in first, so on the
              // way out it fades last — over the final 200ms of the wave.
              transitionDelay: '0ms',
            }}
            onClick={() => closeCampusActions()}
          />
          <div
            id="campus-actions-menu"
            ref={actionMenuRef}
            role="menu"
            aria-label="Campus actions"
            className={`relative w-full max-w-2xl mx-auto pointer-events-auto overflow-hidden flex flex-col h-full transition-opacity duration-150 ${isActionMenuClosing ? 'opacity-0' : 'opacity-100'}`}
          >
            {/* List Body (Floating Solid Action Cards with Visible Gaps) */}
            <div className="flex-1 overflow-y-auto px-1 py-1 scrollbar-none">
              <div className="flex flex-col gap-3">
                {[
                  {
                    icon: Sparkles,
                    label: 'Campus Guide & Tour',
                    desc: 'Welcome guide & quick overview',
                    action: () => setIsWelcomeModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Utensils,
                    label: 'Birch Menu',
                    desc: 'Menus & dining hours',
                    action: () => setIsMenuOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Bus,
                    label: 'Shuttle Schedule',
                    desc: 'Campus & shopping routes',
                    action: () => setIsBusModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: MapPin,
                    label: 'Campus Map',
                    desc: 'Buildings, rooms & lots',
                    action: () => openMapModal(),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Printer,
                    label: 'Print Locations',
                    desc: 'Wepa cloud printing kiosks',
                    action: () => setIsPrintModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Calendar,
                    label: 'Campus Events',
                    desc: 'Activities & workshops',
                    action: () => setIsEventsModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Users,
                    label: 'Clubs & Orgs',
                    desc: 'Archway clubs & organizations',
                    action: () => setIsClubsModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Calendar,
                    label: 'Academic Calendar',
                    desc: 'Key dates, finals & breaks',
                    action: () => setIsCalendarModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: GraduationCap,
                    label: 'Majors & Programs',
                    desc: 'Degree programs & minors',
                    action: () => setIsMajorsModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: CreditCard,
                    label: 'ID Card & Balance',
                    desc: 'Swipes & flex points',
                    action: openBalancePortal,
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Phone,
                    label: 'Phone Directory',
                    desc: 'Offices & staff contacts',
                    action: () => setIsDirectoryModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Shield,
                    label: 'Campus Safety',
                    desc: 'Public Safety & emergency',
                    action: () => setIsSafetyModalOpen(true),
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  // A fourth header button does not fit a phone, so there
                  // installing lives here with the other campus actions.
                  ...(showInstallButton
                    ? [
                        {
                          icon: Download,
                          label: 'Add to Home Screen',
                          desc: 'Open RockyGPT like an app',
                          action: () => void handleInstall(),
                          color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                        },
                      ]
                    : []),
                  {
                    icon: FileText,
                    label: 'Privacy Policy',
                    desc: 'Terms & data practices',
                    action: () => {
                      setIsActionMenuOpen(false);
                      router.push('/privacy');
                    },
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Info,
                    label: 'About RockyGPT',
                    desc: 'The story & who built it',
                    action: () => {
                      setIsActionMenuOpen(false);
                      router.push('/about');
                    },
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                ].map((item, idx, arr) => (
                  <button
                    key={idx}
                    type="button"
                    role="menuitem"
                    aria-label={item.label}
                    style={
                      // Closing fades the whole menu at once; only the entrance
                      // staggers, bottom card first.
                      isActionMenuClosing
                        ? { pointerEvents: 'none' }
                        : { animationDelay: `${(arr.length - 1 - idx) * 35}ms` }
                    }
                    onClick={() => {
                      selectCampusAction(() => item.action());
                    }}
                    className={`${isActionMenuClosing ? '' : 'animate-action-card'} flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#1c1c20] hover:bg-[#28282e] active:scale-[0.98] border border-white/10 hover:border-white/20 text-left transition-[background-color,border-color,box-shadow] duration-200 hover:scale-[1.008] shadow-md group cursor-pointer`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`p-2.5 rounded-xl border ${item.color} shrink-0 transition-transform duration-200 group-hover:scale-105`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground group-hover:text-white transition-colors">
                          {item.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[70] bg-gradient-to-t from-background via-background to-transparent px-2 pb-4 pt-6 sm:px-4 ${isSplashDismissed ? 'animate-hero-input' : 'opacity-0'}`}
      >
        <div className="mx-auto flex max-w-2xl min-w-0 items-center gap-2 sm:gap-3">
          <button
              id="action-menu-trigger"
              ref={actionMenuTriggerRef}
              type="button"
              onClick={toggleCampusActions}
              aria-label={isActionMenuOpen ? 'Close campus actions menu' : 'Open campus actions menu'}
              aria-expanded={isActionMenuOpen}
              aria-haspopup="menu"
              aria-controls="campus-actions-menu"
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 shadow-lg transition-all duration-300 ${isActionMenuOpen && !isActionMenuClosing ? 'bg-[#631c26] rotate-180 scale-90' : 'bg-[#4d161d] hover:bg-[#631c26]'}`}
            >
              <ChevronUp aria-hidden="true" className="w-6 h-6 text-white" />
            </button>
            <form
              onSubmit={handleSubmit}
              className="relative flex min-w-0 flex-1 items-center rounded-2xl border border-border bg-muted focus-within:ring-2 focus-within:ring-[#f4a8b5] focus-within:ring-offset-2 focus-within:ring-offset-background"
            >
              <label htmlFor="chat-input" className="sr-only">
                Message RockyGPT
              </label>
              <input
                id="chat-input"
                ref={chatInputRef}
                name="message"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground sm:px-5"
                placeholder="Ask RockyGPT"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
              />
              {isLoading ? (
                <button
                  aria-label="Stop response"
                  data-no-haptic="true"
                  type="button"
                  onClick={stopGeneration}
                  className="mr-2 h-10 w-10 flex items-center justify-center rounded-xl bg-red-600 text-white"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  aria-label="Send message"
                  data-haptic="medium"
                  type="submit"
                  disabled={!input?.trim()}
                  className="mr-2 h-10 w-10 flex items-center justify-center rounded-xl bg-[#862633] text-white disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
        </div>
        <div className="mx-auto mt-1 hidden max-w-2xl px-1 sm:block">
          <p className="rounded-xl bg-background/90 px-3 py-1 text-center text-xs leading-4 text-muted-foreground shadow-sm">
            Built for Roadrunners. Ask, explore, and verify.
          </p>
        </div>
      </div>

      <MenuModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        defaultMeal={menuMealContext}
      />
      <BusModal isOpen={isBusModalOpen} onClose={() => setIsBusModalOpen(false)} />
      <PrintModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} />
      {isMapModalOpen && (
        <MapModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          initialLocationKey={mapModalInitialKey}
        />
      )}
      <DirectoryModal
        isOpen={isDirectoryModalOpen}
        onClose={() => setIsDirectoryModalOpen(false)}
      />
      <SafetyModal isOpen={isSafetyModalOpen} onClose={() => setIsSafetyModalOpen(false)} />
      <EventsModal isOpen={isEventsModalOpen} onClose={() => setIsEventsModalOpen(false)} />
      <ClubsModal isOpen={isClubsModalOpen} onClose={() => setIsClubsModalOpen(false)} />
      <CalendarModal isOpen={isCalendarModalOpen} onClose={() => setIsCalendarModalOpen(false)} />
      <MajorsModal isOpen={isMajorsModalOpen} onClose={() => setIsMajorsModalOpen(false)} />
      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={handleCloseWelcome}
        onSelectPrompt={(prompt) => {
          handleCloseWelcome();
          handleSuggestionClick(prompt);
        }}
      />
      <PageLoadingScreen
        onFadeStart={handleSplashFadeStart}
        onComplete={() => setIsSplashDismissed(true)}
      />

      {showIOSInstructions && (
        <IOSInstallInstructions onClose={() => setShowIOSInstructions(false)} />
      )}

    </div>
  );
}

/**
 * Try again, held back while another answer loads (sending then was refused
 * after the old question had already been removed) and until a rate limit's
 * wait is over, so a tap cannot spend the next attempt on the same refusal.
 */
/**
 * How to install on iOS, where Safari has no install prompt to call. The
 * dialog used to say only "Add RockyGPT to your home screen" with no steps.
 */
function IOSInstallInstructions({ onClose }: { onClose: () => void }) {
  const dialogRef = useAccessibleDialog(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        tabIndex={-1}
        className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="ios-install-title" className="text-lg font-bold mb-3">
          Add RockyGPT to your Home Screen
        </h3>
        <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            In Safari, tap the <span className="font-medium text-foreground">Share</span> button
            (the square with an arrow pointing up).
          </li>
          <li>
            Scroll down and tap <span className="font-medium text-foreground">Add to Home Screen</span>.
          </li>
          <li>
            Tap <span className="font-medium text-foreground">Add</span>.
          </li>
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-medium"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function RetryButton({
  retryAt,
  busy,
  onRetry,
}: {
  retryAt?: number;
  busy: boolean;
  onRetry: () => void;
}) {
  const [waiting, setWaiting] = useState(() => Boolean(retryAt && retryAt > Date.now()));
  useEffect(() => {
    if (!retryAt) return;
    const remaining = retryAt - Date.now();
    if (remaining <= 0) {
      setWaiting(false);
      return;
    }
    setWaiting(true);
    const timer = window.setTimeout(() => setWaiting(false), remaining);
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy || waiting}
      className="mt-3 min-h-11 rounded-xl border border-foreground/30 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {waiting ? 'Try again shortly' : 'Try again'}
    </button>
  );
}

/** "birch-tree-inn" → "Birch Tree Inn"; a site's root is its "Home". */
function pageName(url: string): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (!segment) return 'Home';
    return decodeURIComponent(segment)
      .replace(/\.[a-z0-9]+$/i, '')
      .split(/[-_]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return 'Page';
  }
}

/**
 * Two different pages published under one title ("Ramapo Dining" for the
 * dining home page and for Birch Tree Inn's page) showed as two identical
 * chips, with no way to tell which was which. A repeated title is labelled
 * with the page it opens.
 */
function sourceLabels(sources: Citation[]): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.title, (counts.get(source.title) ?? 0) + 1);
  return sources.map((source) =>
    (counts.get(source.title) ?? 0) > 1 ? `${source.title} · ${pageName(source.url)}` : source.title
  );
}

function SourceLinks({ citations }: { citations?: Citation[] }) {
  const sources = cleanCitations(citations);
  if (sources.length === 0) return null;
  const labels = sourceLabels(sources);

  return (
    <div className="contents" data-testid="answer-sources">
      {sources.map((citation, index) => (
        <a
          key={`${citation.url}-${index}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          title={citation.snippet || citation.title}
          className="group inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
        >
          <ExternalLink
            aria-hidden="true"
            className="h-3 w-3 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
          <span className="truncate">{labels[index] || `Source ${index + 1}`}</span>
        </a>
      ))}
    </div>
  );
}

function actionLabel(type: UiAction['type']): string {
  const labels: Record<UiAction['type'], string> = {
    VIEW_MENU: 'View menu',
    VIEW_BUS: 'View shuttle schedule',
    VIEW_PRINT: 'View print locations',
    VIEW_EVENTS: 'View events',
    VIEW_MAP: 'Open campus map',
    VIEW_DIRECTORY: 'Open directory',
  };
  return labels[type];
}

// The Brain keeps no student text with a turn, so a rating that arrived with
// only its request ID was stored against "N/A": nobody could tell which answer
// was wrong. The rated question and answer travel with the rating.
function FeedbackButtons({
  requestId,
  question,
  answer,
}: {
  requestId?: string;
  question?: string;
  answer?: string;
}) {
  // Try again resends the whole vote. Resending only the rating dropped the
  // reason and comment the student had already given.
  const lastVoteRef = useRef<{ rating: 'up' | 'down'; category?: string; comments?: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'reason' | 'comment' | 'error'>('idle');
  const [selectedRating, setSelectedRating] = useState<'up' | 'down' | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const REASON_PLACEHOLDERS: Record<string, string> = {
    could_be_better: 'How could it be improved?',
    inaccurate: 'What was incorrect?',
    incomplete: 'What details were missing?',
    outdated: 'What info is old or changed?',
    other: 'Tell us what went wrong...',
  };

  const handleVote = async (rating: 'up' | 'down', category?: string, comments?: string) => {
    lastVoteRef.current = { rating, category, comments };
    setSelectedRating(rating);
    if (rating === 'up') {
      setStatus('saving');
    }
    try {
      if (!requestId) throw new Error('Missing request ID for feedback.');
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          rating: rating === 'up' ? 1 : -1,
          category: category || null,
          comments: comments || null,
          question: question || null,
          answer: answer || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean };
      if (!response.ok || payload.success !== true) {
        throw new Error(`Feedback request failed with status ${response.status}.`);
      }

      if (rating === 'down' && !category && !comments) {
        setStatus('reason');
      } else if (category && !comments) {
        setSelectedReason(category);
        setStatus('comment');
      } else {
        setStatus('saved');
      }
      triggerHaptic('success');
    } catch (error) {
      console.error('Feedback error:', error);
      setStatus('error');
      triggerHaptic('error');
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) {
      setStatus('saved');
      return;
    }
    handleVote('down', selectedReason || 'other', commentText.trim());
  };

  if (!requestId) return null;

  if (status === 'saved') {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium animate-in fade-in duration-200">
        <Check className="h-3 w-3 text-emerald-400" />
        {selectedRating === 'up' ? 'Thanks for the feedback! 💙' : "Thanks! We'll make RockyGPT smarter. 💙"}
      </span>
    );
  }

  if (status === 'reason') {
    const reasons = [
      { id: 'inaccurate', label: 'Inaccurate' },
      { id: 'incomplete', label: 'Incomplete' },
      { id: 'could_be_better', label: 'Could be better' },
      { id: 'outdated', label: 'Outdated' },
    ];

    return (
      <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in duration-200">
        <span className="text-[11px] text-muted-foreground mr-0.5">Why?</span>
        {reasons.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              handleVote('down', r.id);
            }}
            className="inline-flex min-h-9 items-center rounded-lg bg-neutral-900/90 border border-white/10 px-3 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-white/20 transition-all shadow-xs"
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSelectedReason('other');
            setStatus('comment');
          }}
          className="inline-flex min-h-9 items-center rounded-lg bg-neutral-900/90 border border-white/10 px-3 text-xs text-sky-400 hover:bg-sky-500/10 hover:text-sky-300 hover:border-sky-500/30 transition-all shadow-xs"
        >
          Other…
        </button>
        <button
          type="button"
          onClick={() => setStatus('saved')}
          aria-label="Skip the reason"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-300"
          title="Skip"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (status === 'comment') {
    const placeholder =
      (selectedReason && REASON_PLACEHOLDERS[selectedReason]) || 'Tell us what went wrong...';
    const isTextValid = commentText.trim().length > 0;

    return (
      <form onSubmit={handleCommentSubmit} className="flex flex-wrap items-center gap-1.5 animate-in fade-in duration-200">
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={placeholder}
          aria-label="What went wrong with this answer"
          maxLength={1000}
          className="min-h-10 w-full text-base sm:text-xs bg-neutral-900/90 border border-white/15 rounded-lg px-3 py-1.5 text-white placeholder:text-neutral-500 focus:outline-none focus:border-sky-500 sm:w-64 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!isTextValid}
          className="min-h-10 rounded-lg bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 disabled:cursor-not-allowed px-4 text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          Send
        </button>
      </form>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
        <span>Feedback wasn’t saved.</span>
        <button
          type="button"
          data-no-haptic="true"
          onClick={() => {
            const vote = lastVoteRef.current;
            if (vote) handleVote(vote.rating, vote.category, vote.comments);
          }}
          className="rounded-lg border border-amber-300/50 px-2 py-1 font-semibold hover:bg-amber-300/10"
        >
          Try again
        </button>
        <span className="break-all text-muted-foreground">Support ID: {requestId}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Helpful answer"
        aria-pressed={selectedRating === 'up'}
        data-no-haptic="true"
        disabled={status === 'saving'}
        onClick={() => handleVote('up')}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-emerald-400 hover:bg-white/5 transition-colors disabled:cursor-wait disabled:opacity-50"
        title="Helpful answer (👍)"
      >
        <ThumbsUp aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Unhelpful answer"
        aria-pressed={selectedRating === 'down'}
        data-no-haptic="true"
        disabled={status === 'saving'}
        onClick={() => handleVote('down')}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-rose-400 hover:bg-white/5 transition-colors disabled:cursor-wait disabled:opacity-50"
        title="Needs improvement (👎)"
      >
        <ThumbsDown aria-hidden="true" className="h-4 w-4" />
      </button>
      {status === 'saving' && (
        <span role="status" className="text-xs text-muted-foreground">
          Saving…
        </span>
      )}
    </div>
  );
}
