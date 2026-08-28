/**
 * @module app/page
 * Primary chat interface for RockyGPT.
 *
 * Manages message state, PWA install prompts,
 * typed UI actions, and renders the message timeline with source citations, feedback
 * buttons, and quick-access modal triggers.
 */

'use client';

import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Bus, Calendar, Check, ChevronRight, ChevronUp, Copy, CreditCard, Download, ExternalLink, FileText, GraduationCap, Info, Layers, MapPin, Pause, Phone, Play, Printer, Send, Shield, Sparkles, Square, ThumbsDown, ThumbsUp, Users, Utensils, X } from 'lucide-react';
import { buildTranscriptExport, transcriptFileName } from '../chat/transcript-export';
import { MenuModal } from '@/components/MenuModal';
import { BusModal } from '@/components/BusModal';
import { PrintModal } from '@/components/PrintModal';
import { MapModal } from '@/components/MapModal';
import { WelcomeModal } from '@/components/WelcomeModal';
import { BulkQuestionModal } from '@/components/BulkQuestionModal';
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
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, type ChatTurnV2 } from '@/lib/brain-api';
import { rockyModeCommandForMessage } from '../chat/rocky-mode';
import { DevPageMenu } from '@/components/DevPageMenu';
import { MessageJsonModal, turnPipeline } from '@/components/MessageJsonModal';

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
  /**
   * The response body exactly as received, kept only to back the dev-only
   * JSON inspector. Held verbatim rather than rebuilt from the fields above
   * so it still shows anything this component does not model — `route`, for
   * one, which the brain sends and the UI never reads.
   */
  debugPayload?: Record<string, unknown>;
}

interface Citation {
  sourceId?: string;
  title: string;
  url: string;
  sourcePath?: string;
  snippet?: string;
  collectedAt?: string;
}

interface UiAction {
  type: 'VIEW_MENU' | 'VIEW_BUS' | 'VIEW_PRINT' | 'VIEW_EVENTS' | 'VIEW_MAP' | 'VIEW_DIRECTORY';
  payload?: Record<string, string>;
}

/** What a bulk run turned out to be, once it ended however it ended. */
interface BulkOutcome {
  asked: number;
  total: number;
  stopped: boolean;
  reason?: string;
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
    readonly retryable = true
  ) {
    super(message);
    this.name = 'ChatRequestFailure';
  }
}

// Active during local development (`npm run dev`) for instant inspection; automatically hidden in production builds
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const MAX_HISTORY_TURN_LENGTH = 2000;
const ANSWER_REVEAL_INTERVAL_MS = 20;
// How long a bulk run tolerates a loading flag with no request behind it.
const BULK_STALE_LOADING_MS = 5000;
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

// Helper to auto-link phone numbers, emails, and rooms to smart interactive pills
function linkSmartChips(text: string): string {
  if (!text) return '';

  const links: string[] = [];
  let protectedText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
    if (/^\(?201\)?[-.\s]?684[-.\s]?\d{4}$/.test(label.trim())) {
      const clean = label.replace(/[^\d]/g, '');
      href = 'tel:' + clean;
    }
    const idx = links.length;
    links.push(`[${label}](${href})`);
    return `___SMARTLINK_${idx}___`;
  });

  // 1. Auto-link emails (e.g. success@ramapo.edu)
  protectedText = protectedText.replace(
    /\b([a-zA-Z0-9._%+-]+@ramapo\.edu)\b/g,
    (_, email) => `[${email}](mailto:${email})`
  );

  // 2. Auto-link unlinked Ramapo phone numbers ((201) 684-XXXX, 201-684-XXXX, 201.684.XXXX)
  protectedText = protectedText.replace(
    /(?:^|[^\w\d\[])(\(?201\)?[-.\s]?684[-.\s]?\d{4})(?=[^\w\d\]]|$)/g,
    (m, phone) => {
      const clean = phone.replace(/[^\d]/g, '');
      const prefix = m.startsWith(phone) ? '' : m[0];
      return `${prefix}[${phone}](tel:${clean})`;
    }
  );

  // 3. Auto-link Room / Office Numbers (e.g. C-102, D-207, SC-202, ASB-333, E-210, B-214)
  protectedText = protectedText.replace(
    /\b([A-Z]{1,3}-\d{3}[A-Z]?)\b/g,
    (_, room) => `[${room}](#map:${room})`
  );

  // 4. Auto-link all Campus Dining Spots, Offices, Buildings, and Key Landmarks into interactive map chips
  protectedText = protectedText.replace(
    COMPILED_LOCATIONS_REGEX,
    (matched) => `[${matched}](#map:${encodeURIComponent(matched)})`
  );

  // 5. Auto-link bare ramapo domains (e.g. ramapo.edu, archway.ramapo.edu, ramapo.edu/map)
  protectedText = protectedText.replace(
    /\b((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*ramapo\.edu(?:\/[^\s)\].,!?;]*)?)/g,
    (url) => {
      const cleanHref = url.startsWith('http') ? url : `https://${url}`;
      return `[${url}](${cleanHref})`;
    }
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
        <strong className="font-semibold text-foreground" {...props} />
      ),
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
              className="inline cursor-pointer font-medium text-emerald-400 underline decoration-1 decoration-emerald-500/40 underline-offset-4 transition-colors hover:text-emerald-300 hover:decoration-emerald-300 active:opacity-70"
              title={`Call ${textContent}`}
              {...props}
            >
              <span>{children}</span>
            </a>
          );
        }
        if (href?.startsWith('mailto:')) {
          return (
            <a
              href={href}
              className="inline cursor-pointer font-medium text-violet-400 underline decoration-1 decoration-violet-500/40 underline-offset-4 transition-colors hover:text-violet-300 hover:decoration-violet-300 active:opacity-70"
              title={`Email ${href.replace('mailto:', '')}`}
              {...props}
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
            {...props}
          >
            <span>{children}</span>
          </a>
        );
      },
      p: ({ ...props }) => <p className="mb-3 last:mb-0" {...props} />,
      table: ({ ...props }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-border/50 scrollbar-none">
          <table className="w-full border-collapse text-xs sm:text-sm" {...props} />
        </div>
      ),
      thead: ({ ...props }) => <thead className="bg-muted/50" {...props} />,
      th: ({ ...props }) => (
        <th
          className="border border-border/50 px-4 py-2 text-left font-bold"
          {...props}
        />
      ),
      td: ({ ...props }) => <td className="border border-border/50 px-4 py-2" {...props} />,
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
    })
    .slice(0, 3);
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

const ANONYMOUS_CONVERSATION_KEY = 'rockygpt_anonymous_conversation_v1';
const LEGACY_VISITOR_STORAGE_KEY = 'rockygpt_visitor_id';
const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUUID(): string {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && typeof window.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateConversationId(): string {
  try {
    const existing = window.sessionStorage.getItem(ANONYMOUS_CONVERSATION_KEY);
    if (existing && CONVERSATION_ID_PATTERN.test(existing)) return existing.toLowerCase();
    const created = generateUUID();
    window.sessionStorage.setItem(ANONYMOUS_CONVERSATION_KEY, created);
    return created;
  } catch {
    return generateUUID();
  }
}

function buildRequestHistory(messages: ChatMessage[]): ChatTurnV2[] {
  const history: ChatTurnV2[] = [];

  for (let index = messages.length - 1; index >= 0 && history.length < MAX_HISTORY_MESSAGES; index--) {
    const message = messages[index];
    if (message.isError) continue;
    const content = message.content.trim();
    if (!content) continue;

    history.push({
      role: message.role,
      content: content.slice(0, MAX_HISTORY_TURN_LENGTH),
    });
  }

  return history.reverse();
}

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

  if (response.status === 429 || code === 'RATE_LIMITED') {
    return new ChatRequestFailure(
      retryDelay
        ? `You’ve reached the chat limit for now. Please try again in ${retryDelay}.`
        : 'You’ve reached the chat limit for now. Please wait a little while and try again.',
      requestId
    );
  }
  if (response.status === 503 || code === 'SERVICE_UNAVAILABLE' || code === 'DATASET_UNAVAILABLE') {
    // Say what the brain said. A 503 is no longer one thing: a lookup Rocky
    // cannot do yet, a data service that did not answer, a planner that
    // failed. The brain distinguishes them and words each for a student —
    // `public_message` is that field's whole job — so overwriting it with one
    // sentence about being "temporarily unavailable" turns a permanent gap
    // into an outage and offers a retry that can only fail.
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
  // Publishes `--keyboard-inset` for as long as this page is mounted. The
  // composer and the modal shell read it from CSS; subscribing here is what
  // keeps it measured, and one subscription is all the measurement needs.
  useViewportBand();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            setIsSplashDismissed(true);
          }
        }
      } else {
        window.sessionStorage.removeItem('rockygpt_session_messages');
      }
      // Visitor identity is now a short-lived, HTTP-only server cookie. Remove
      // the older indefinitely persisted browser value during migration.
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
      if (messages.length > 0) {
        window.sessionStorage.setItem('rockygpt_session_messages', JSON.stringify(messages));
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
      // 420ms card animation + 11 * 35ms stagger = 805ms, matching the
      // entrance wave exactly.
    }, 810);
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
  const [copyTranscriptState, setCopyTranscriptState] = useState<
    'idle' | 'copied' | 'downloaded' | 'failed'
  >('idle');
  const exportClickTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(
    () => () => {
      if (exportClickTimerRef.current) clearTimeout(exportClickTimerRef.current);
    },
    []
  );

  const [rockyMode, setRockyMode] = useState(false);
  const [previewMode, setPreviewMode] = useState<'dev' | 'student'>('dev');
  const activeRequestRef = useRef<ActiveChatRequest | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // `isLoading` mirrored into a ref. Long-lived async callers (the bulk
  // runner) capture `sendMessage` once and then await across many renders, so
  // they need a value that is current at await time, not at capture time.
  const isLoadingRef = useRef(false);
  const setLoading = (value: boolean) => {
    isLoadingRef.current = value;
    setIsLoading(value);
  };

  // Per-message JSON inspector (Dev Mode only). Holds the id rather than the
  // message so the panel keeps following that message as it re-renders.
  const [jsonMessageId, setJsonMessageId] = useState<string | null>(null);

  // Bulk Questions Runner state (Dev Mode only)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  // Set when the runner is opened on the live conversation rather than on the
  // saved set. Null is "show what was saved".
  const [bulkPrefill, setBulkPrefill] = useState<string | null>(null);
  // A double-click fires click first, so the single-click action waits long
  // enough to be cancelled by the second.
  const bulkClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [isBulkPaused, setIsBulkPaused] = useState(false);
  const bulkRunningRef = useRef(false);
  const bulkPausedRef = useRef(false);
  // True while the runner is holding for the chat to go idle. Without it the
  // panel reports "Answering..." next to a question it has not asked yet,
  // because `isLoading` belongs to whatever was already in flight.
  const [isBulkAwaitingIdle, setIsBulkAwaitingIdle] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rockygpt_preview_mode') as 'dev' | 'student' | null;
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('mode') === 'student' || urlParams.get('preview') === 'prod') {
        setPreviewMode('student');
      } else if (urlParams.get('mode') === 'dev') {
        setPreviewMode('dev');
      } else if (saved === 'student' || saved === 'dev') {
        setPreviewMode(saved);
      }
    }
  }, []);

  const togglePreviewMode = () => {
    const next = previewMode === 'dev' ? 'student' : 'dev';
    setPreviewMode(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rockygpt_preview_mode', next);
    }
    triggerHaptic('selection');
  };

  const isDevViewActive = IS_DEVELOPMENT && previewMode === 'dev';

  // Install PWA logic
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  useEffect(() => {
    // Check if it's iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    setIsIOS(isIOSDevice);

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
    if (outcome === 'accepted') {
      setShowInstallButton(false);
      triggerHaptic('success');
    }
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
    const rockyModeCommand = rockyModeCommandForMessage(normalizedContent);
    const requestedStyleMode =
      rockyModeCommand === 'enable'
        ? 'rocky'
        : rockyModeCommand === 'disable'
          ? 'standard'
          : rockyMode
            ? 'rocky'
            : 'standard';
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
    setLoading(true);

    const controller = new AbortController();
    activeRequestRef.current = { controller, assistantMessageId };

    try {
      const history = buildRequestHistory(historyMessages);
      const conversationId = conversationIdRef.current || getOrCreateConversationId();
      conversationIdRef.current = conversationId;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          history,
          conversationId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language,
          responseMode: 'concise',
          styleMode: requestedStyleMode,
        }),
        signal: controller.signal,
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
      if (rockyModeCommand) {
        setRockyMode(rockyModeCommand === 'enable');
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
              msg.id === assistantMessageId ? { ...msg, content: partialAnswer } : msg
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
              debugPayload: IS_DEVELOPMENT
                ? (data as unknown as Record<string, unknown>)
                : undefined,
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
                error instanceof TypeError
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
              retryContent: requestFailure.retryable ? userMessage.content : undefined,
              retryUserMessageId: userMessage.id,
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

  /** Copy every completed brain trace (model call in, model call out) in chat order. */
  const copyBrainTraces = async () => {
    const turns = messages.flatMap((message) =>
      // The same object the per-message inspector copies, so a transcript and
      // a single turn paste in the same shape.
      message.role === 'assistant' && message.brainTrace
        ? [turnPipeline(message.debugPayload ?? { brainTrace: message.brainTrace })]
        : []
    );
    try {
      if (turns.length === 0) throw new Error('No brain trace is available.');
      await navigator.clipboard.writeText(JSON.stringify({ turns }, null, 2));
      setCopyTranscriptState('copied');
      triggerHaptic('success');
    } catch {
      setCopyTranscriptState('failed');
      triggerHaptic('error');
    }
    window.setTimeout(() => setCopyTranscriptState('idle'), 2000);
  };

  const downloadTranscript = () => {
    try {
      const transcript = buildTranscriptExport(messages, {
        conversationId: conversationIdRef.current,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rockyMode,
      });
      const blob = new Blob([JSON.stringify(transcript, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = transcriptFileName(
        transcript.exportedAt,
        transcript.timezone,
        transcript.conversationId
      );
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopyTranscriptState('downloaded');
      triggerHaptic('success');
    } catch {
      setCopyTranscriptState('failed');
      triggerHaptic('error');
    }
    window.setTimeout(() => setCopyTranscriptState('idle'), 2000);
  };

  const handleExportClick = () => {
    if (exportClickTimerRef.current) {
      clearTimeout(exportClickTimerRef.current);
      exportClickTimerRef.current = null;
      downloadTranscript();
    } else {
      exportClickTimerRef.current = setTimeout(() => {
        exportClickTimerRef.current = null;
        void copyBrainTraces();
      }, 250);
    }
  };

  /**
   * Runs the queue and reports what actually happened.
   *
   * The return value matters to the terminal remote: a run stopped from the
   * panel used to leave the CLI printing the full queue length as if it had
   * finished, which is the UI's decision being overruled by a caller that
   * never heard about it.
   */
  const startBulkSequence = async (
    questions: string[],
    delayMs: number
  ): Promise<BulkOutcome> => {
    if (questions.length === 0) return { asked: 0, total: 0, stopped: false };
    setBulkQueue(questions);
    setBulkIndex(0);
    setIsBulkRunning(true);
    setIsBulkPaused(false);
    bulkRunningRef.current = true;
    bulkPausedRef.current = false;
    triggerHaptic('selection');

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let asked = 0;
    let reason: string | undefined;

    /** Blocks while paused. Returns false if the run was stopped meanwhile. */
    const settlePause = async () => {
      while (bulkPausedRef.current && bulkRunningRef.current) {
        await sleep(200);
      }
      return bulkRunningRef.current;
    };

    /**
     * The chat drops a message sent while another one is in flight, so a run
     * started mid-answer would silently discard every question in the queue.
     * Wait for the chat to go idle instead of firing into it.
     *
     * A real in-flight request is waited on for as long as it takes: answers
     * are slow, and a backgrounded tab throttles the reveal timers to a crawl,
     * neither of which is a reason to abandon the run. Stop is the way out.
     * Only a loading flag with no request behind it — a desync that should not
     * happen — gets a deadline.
     */
    const waitForIdle = async () => {
      let staleLoadingSince: number | null = null;
      while (activeRequestRef.current || isLoadingRef.current) {
        if (!bulkRunningRef.current) return false;
        if (activeRequestRef.current) {
          staleLoadingSince = null;
        } else {
          staleLoadingSince ??= Date.now();
          if (Date.now() - staleLoadingSince > BULK_STALE_LOADING_MS) return false;
        }
        await sleep(150);
      }
      return true;
    };

    /**
     * A run that ends early used to just make the panel disappear, which reads
     * exactly like a clean finish. Say so in the transcript instead.
     */
    const reportEarlyStop = (reason: string, remaining: number) => {
      setMessages((prev) => [
        ...prev,
        {
          ...createLocalMessageIdentity(),
          role: 'assistant',
          content: `Bulk run stopped early: ${reason}. ${remaining} question${
            remaining === 1 ? '' : 's'
          } left unasked.`,
          isError: true,
        } as ChatMessage,
      ]);
    };

    for (let i = 0; i < questions.length; i++) {
      if (!bulkRunningRef.current) {
        reason = 'stopped from the panel';
        break;
      }
      if (!(await settlePause())) {
        reason = 'stopped from the panel';
        break;
      }

      setIsBulkAwaitingIdle(true);
      const becameIdle = await waitForIdle();
      setIsBulkAwaitingIdle(false);
      if (!becameIdle) {
        // Stopping is the user's own doing and needs no report; anything else
        // means the chat never freed up.
        reason = bulkRunningRef.current
          ? 'the chat never became available'
          : 'stopped from the panel';
        if (bulkRunningRef.current) {
          reportEarlyStop('the chat never became available', questions.length - i);
        }
        break;
      }

      setBulkIndex(i);
      const q = questions[i];
      if (q && !(await sendMessage(q, messagesRef.current))) {
        // Refused rather than sent: stop instead of racing through the rest of
        // the queue asking nothing.
        reportEarlyStop('the chat refused the next question', questions.length - i);
        reason = 'the chat refused the next question';
        break;
      }
      asked += 1;

      if (!bulkRunningRef.current) {
        reason = 'stopped from the panel';
        break;
      }

      // Delay between questions so the run is watchable. Paused time does not
      // count against it, otherwise resuming fires the next question instantly.
      if (i < questions.length - 1) {
        let remaining = delayMs;
        while (remaining > 0 && bulkRunningRef.current) {
          if (bulkPausedRef.current) {
            await sleep(200);
            continue;
          }
          const step = Math.min(100, remaining);
          await sleep(step);
          remaining -= step;
        }
      }
    }

    bulkRunningRef.current = false;
    setIsBulkRunning(false);
    setIsBulkPaused(false);
    setIsBulkAwaitingIdle(false);
    return { asked, total: questions.length, stopped: asked < questions.length, reason };
  };

  const pauseBulkSequence = () => {
    bulkPausedRef.current = true;
    setIsBulkPaused(true);
    triggerHaptic('selection');
  };

  const resumeBulkSequence = () => {
    bulkPausedRef.current = false;
    setIsBulkPaused(false);
    triggerHaptic('selection');
  };

  const stopBulkSequence = () => {
    bulkRunningRef.current = false;
    bulkPausedRef.current = false;
    setIsBulkRunning(false);
    setIsBulkPaused(false);
    stopGeneration();
    triggerHaptic('warning');
  };

  // Terminal remote control (Dev View only).
  //
  // Commands run through the page rather than around it — a remote `ask` calls
  // the same `sendMessage` a keystroke does — so what the terminal drives is
  // what a student would have got, and it is visible in the tab while it runs.
  useEffect(() => {
    if (!isDevViewActive) return;
    const source = new EventSource('/api/remote');

    const report = (id: string, value: unknown) =>
      fetch('/api/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultFor: id, value }),
      }).catch(() => undefined);

    source.onmessage = (event) => {
      const command = JSON.parse(event.data) as {
        id: string;
        type: string;
        text?: string;
        questions?: string[];
        delayMs?: number;
      };
      if (command.type === 'ask' && command.text) {
        void sendMessage(command.text).then(async (ok) => {
          // `sendMessage` resolves while the answer is still being revealed a
          // character at a time, so the message it leaves behind is half
          // written and has no trace yet. Wait for the trace to land — it
          // arrives with the finished content — and give up rather than hang
          // on an error turn, which never gets one.
          const settled = await new Promise<ChatMessage | undefined>((resolve) => {
            const deadline = Date.now() + 20_000;
            const poll = () => {
              const last = messagesRef.current[messagesRef.current.length - 1];
              if (last?.brainTrace || Date.now() > deadline) resolve(last);
              else setTimeout(poll, 100);
            };
            poll();
          });
          // The same object `Copy all JSON` puts on the clipboard, so what the
          // terminal prints and what the panel copies cannot drift apart.
          // `ok` is false when the chat refused the question outright; a
          // `Stop` press mid-answer instead leaves a message with no trace,
          // because the trace only lands with a finished turn. Either way the
          // terminal is told, rather than being shown a success it did not get.
          const stopped = !ok || (!settled?.brainTrace && !settled?.isError);
          report(command.id, {
            ok: ok && !stopped,
            stopped,
            answer: settled?.content ?? null,
            turn: settled?.brainTrace
              ? turnPipeline(settled.debugPayload ?? { brainTrace: settled.brainTrace })
              : null,
          });
        });
      } else if (command.type === 'bulk' && command.questions?.length) {
        void startBulkSequence(command.questions, command.delayMs ?? 1500).then((outcome) =>
          report(command.id, { ok: !outcome.stopped, ...outcome })
        );
      } else if (command.type === 'clear') {
        setMessages([]);
        report(command.id, { ok: true });
      }
    };
    return () => source.close();
    // `sendMessage` and `startBulkSequence` are redefined every render; binding
    // the listener to them would tear the stream down and rebuild it on every
    // keystroke, so the effect deliberately depends only on the dev flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevViewActive]);

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

  const latestMessage = messages[messages.length - 1];
  const composerSuggestedQuestions =
    [...messages].reverse().find((message) => (message.suggestedQuestions?.length || 0) > 0)
      ?.suggestedQuestions ?? [];
  // Offered while the composer is empty and withdrawn the moment you write
  // your own question. These are what to ask *next*, not completions of what
  // is being typed, so narrowing them by keystrokes would leave an empty list
  // for anything the last answer did not happen to suggest.
  const shouldShowComposerSuggestions =
    !isLoading &&
    !isBulkRunning &&
    !isActionMenuOpen &&
    !input.trim() &&
    latestMessage?.role === 'assistant' &&
    !latestMessage.isError &&
    (latestMessage.suggestedQuestions?.length || 0) > 0;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip font-sans">
      <header className={`sticky top-0 z-50 bg-background ${isSplashDismissed ? 'animate-hero-header' : 'opacity-0'}`}>
        <div className="container flex h-14 max-w-2xl mx-auto items-center justify-between px-4">
          {isDevViewActive ? (
            <DevPageMenu title="RockyGPT" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white">
                <Bot className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold tracking-tight">RockyGPT</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {IS_DEVELOPMENT && (
              <button
                type="button"
                onClick={togglePreviewMode}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all text-xs font-semibold border ${
                  previewMode === 'student'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20'
                }`}
                title={
                  previewMode === 'student'
                    ? 'Currently mirroring Production Student View. Click to switch to Dev View.'
                    : 'Currently in Dev View. Click to mirror Production Student View.'
                }
              >
                {previewMode === 'student' ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>Student View</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <span>Dev View</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsWelcomeModalOpen(true)}
              aria-label="Campus guide & welcome tour"
              title="Campus Guide & Welcome Tour"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors text-xs font-semibold cursor-pointer"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4 text-rose-400" />
              <span className="hidden xs:inline">Guide</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSafetyModalOpen(true)}
              aria-label="Campus safety"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-bold"
            >
              <Shield aria-hidden="true" className="h-4 w-4" />
              <span className="hidden xs:inline">Safety</span>
            </button>
            {showInstallButton && (
              <button
                type="button"
                onClick={handleInstall}
                aria-label="Install RockyGPT"
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                <span className="hidden xs:inline">Install</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-52 pt-6 sm:pb-40">
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
                  { q: "What's on the menu today?", color: 'bg-purple-500' },
                  { q: 'When is the next shuttle?', color: 'bg-blue-500' },
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
                  { icon: Users, label: 'Student Orgs', action: () => setIsClubsModalOpen(true) },
                  {
                    icon: Calendar,
                    label: 'Campus Event',
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
                    <div className="px-4 py-2.5 rounded-2xl bg-muted/80 text-foreground text-[15px]">
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
                        {isDevViewActive && !m.isTyping && (
                          <button
                            type="button"
                            onClick={() => setJsonMessageId(m.id)}
                            title="Inspect the raw response for this message"
                            className="mt-0.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-sky-300 transition-colors hover:bg-sky-400/20 hover:text-sky-200"
                          >
                            JSON
                          </button>
                        )}
                      </div>
                    </div>
                    {m.isError ? (
                      <div
                        role="alert"
                        className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-foreground"
                      >
                        <p className="font-medium leading-6">{m.content}</p>
                        {m.requestId && (
                          <p className="mt-2 break-all text-xs text-muted-foreground">
                            Support ID: <code>{m.requestId}</code>
                          </p>
                        )}
                        {m.retryContent && !isBulkRunning && (
                          <button
                            type="button"
                            onClick={() => retryMessage(m)}
                            className="mt-3 rounded-xl border border-foreground/30 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10"
                          >
                            Try again
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div
                          aria-busy={m.isTyping || undefined}
                          className={`text-[15px] leading-7 text-foreground prose prose-invert prose-sm max-w-none ${
                            m.isTyping ? 'rocky-answer-typing' : ''
                          }`}
                        >
                          <AnswerMarkdown content={m.content} onOpenMap={openMapModal} />
                        </div>
                        {!m.isTyping &&
                          ((m.uiActions?.length || 0) > 0 ||
                            cleanCitations(m.citations).length > 0) && (
                            <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                              {m.uiActions?.map((action, actionIndex) => (
                                <button
                                  key={`${action.type}-${actionIndex}`}
                                  onClick={() => runUiAction(action)}
                                  className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-300 transition-colors hover:border-violet-400/50 hover:bg-violet-400/20 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                                >
                                  {actionLabel(action.type)}
                                </button>
                              ))}
                              <SourceLinks citations={m.citations} />
                            </div>
                          )}
                        {!m.isTyping && (
                          <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
                            <button
                              type="button"
                              aria-label="Copy answer"
                              data-no-haptic="true"
                              onClick={() => handleCopyContent(m.content)}
                              className="hover:text-foreground transition-colors"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <FeedbackButtons requestId={m.requestId} />
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
              <div className="flex items-center gap-2.5 py-1">
                <Sparkles className="h-5 w-5 text-[#f4a8b5] animate-thinking-star shrink-0" />
                <span className="text-sm font-medium tracking-wide animate-thinking-shimmer select-none">
                  Thinking...
                </span>
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
              transitionDelay: isActionMenuClosing ? '605ms' : '0ms',
            }}
            onClick={() => closeCampusActions()}
          />
          <div
            id="campus-actions-menu"
            ref={actionMenuRef}
            role="menu"
            aria-label="Campus actions"
            className="relative w-full max-w-2xl mx-auto pointer-events-auto overflow-hidden flex flex-col h-full animate-in fade-in duration-200"
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
                    label: 'Dining',
                    desc: 'Menus, hours & nutrition',
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
                    label: 'Student Orgs',
                    desc: '100+ Archway clubs',
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
                    label: 'Majors & Courses',
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
                  {
                    icon: FileText,
                    label: 'Privacy Policy',
                    desc: 'Terms & data practices',
                    action: () => {
                      setIsActionMenuOpen(false);
                      window.location.href = '/privacy';
                    },
                    color: 'text-[#f4a8b5] bg-[#4d161d]/80 border-[#8E0A26]/40',
                  },
                  {
                    icon: Info,
                    label: 'About RockyGPT',
                    desc: 'The story & who built it',
                    action: () => {
                      setIsActionMenuOpen(false);
                      window.location.href = '/about';
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
                      // The exit is the entrance run backwards: the card that
                      // popped in last is the first to leave, so the stagger
                      // order flips along with the keyframes.
                      isActionMenuClosing
                        ? {
                            animationDelay: `${idx * 35}ms`,
                            pointerEvents: 'none',
                          }
                        : {
                            animationDelay: `${(arr.length - 1 - idx) * 35}ms`,
                          }
                    }
                    onClick={() => {
                      selectCampusAction(() => item.action());
                    }}
                    className={`${isActionMenuClosing ? 'animate-action-card-exit' : 'animate-action-card'} flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#1c1c20] hover:bg-[#28282e] active:scale-[0.98] border border-white/10 hover:border-white/20 text-left transition-[background-color,border-color,box-shadow] duration-200 hover:scale-[1.008] shadow-md group cursor-pointer`}
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
        {/*
          A list, not a row of chips. A chip row scrolls sideways, so the third
          suggestion is off the edge of a phone and the longer ones truncate
          mid-question — and a truncated question cannot be judged, only
          guessed at. These are whole sentences and each wants a line, which is
          why an address bar stacks its suggestions rather than lining them up.
          The chevron says what the row does: choosing one sends it.
        */}
        {composerSuggestedQuestions.length > 0 && (
          <div
            aria-hidden={!shouldShowComposerSuggestions}
            className={`mx-auto max-w-2xl origin-bottom transition-[max-height,margin,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
              shouldShowComposerSuggestions
                ? 'mb-2 max-h-14 translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none mb-0 max-h-0 translate-y-2 scale-[0.98] overflow-hidden opacity-0'
            }`}
          >
            <div
              role="group"
              aria-label="Suggested follow-up questions"
              className="scrollbar-none flex max-w-full gap-2 overflow-x-auto px-1 py-0.5"
            >
              {composerSuggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={!shouldShowComposerSuggestions}
                  onClick={() => handleSuggestionClick(question)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-border/70 bg-background/95 px-3 py-2 text-left text-sm text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:border-[#f4a8b5]/60 hover:bg-muted hover:text-foreground disabled:cursor-default"
                >
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto flex max-w-2xl min-w-0 items-center gap-2 sm:gap-3">
          {!isBulkRunning && (
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
          )}
          {isDevViewActive && isBulkRunning ? (
            <div className="relative flex min-h-[64px] min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-neutral-950/95 px-4 py-3 shadow-lg backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Layers className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-300">
                      Bulk Runner
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-300 bg-neutral-800/90 px-2 py-0.5 rounded-full border border-white/5">
                      {bulkIndex + 1} of {bulkQueue.length}
                    </span>
                    {isBulkAwaitingIdle ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                        Waiting for chat...
                      </span>
                    ) : isLoading ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-sky-400 animate-pulse">
                        Answering...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        Waiting next...
                      </span>
                    )}
                    {isBulkPaused && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
                        <Pause className="h-3 w-3" /> Paused
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-neutral-300 font-mono">
                    {bulkQueue[bulkIndex]}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="hidden sm:block w-20 sm:w-28 h-2 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{
                      width: `${Math.round(((bulkIndex + 1) / Math.max(bulkQueue.length, 1)) * 100)}%`,
                    }}
                  />
                </div>

                {isBulkPaused ? (
                  <button
                    type="button"
                    onClick={resumeBulkSequence}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
                    aria-label="Resume sequence"
                    title="Resume sequence"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span className="hidden xs:inline">Resume</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pauseBulkSequence}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
                    aria-label="Pause sequence"
                    title="Pause sequence"
                  >
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    <span className="hidden xs:inline">Pause</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopBulkSequence}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
                  aria-label="Stop sequence"
                  title="Stop sequence"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span className="hidden xs:inline">Stop</span>
                </button>
              </div>
            </div>
          ) : (
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
                  className="mr-3 h-9 w-9 flex items-center justify-center rounded-xl bg-red-600 text-white"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  aria-label="Send message"
                  data-haptic="medium"
                  type="submit"
                  disabled={!input?.trim()}
                  className="mr-3 h-9 w-9 flex items-center justify-center rounded-xl bg-[#862633] text-white disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </form>
          )}
          {isDevViewActive && !isBulkRunning && (
            <button
              type="button"
              onClick={() => {
                if (bulkClickTimer.current) clearTimeout(bulkClickTimer.current);
                bulkClickTimer.current = setTimeout(() => {
                  setBulkPrefill(null);
                  setIsBulkModalOpen(true);
                }, 220);
              }}
              onDoubleClick={() => {
                if (bulkClickTimer.current) clearTimeout(bulkClickTimer.current);
                const asked = messages
                  .filter((message) => message.role === 'user' && message.content.trim())
                  .map((message) => message.content.trim());
                setBulkPrefill(asked.join('\n'));
                setIsBulkModalOpen(true);
              }}
              aria-label="Bulk Questions Runner"
              title="Click to run the saved set; double-click to load this conversation"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-muted text-muted-foreground transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300 cursor-pointer"
            >
              <Layers aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
          {isDevViewActive && !isBulkRunning && messages.length > 0 && (
            <button
              type="button"
              onClick={handleExportClick}
              aria-label="Copy transcript (click to copy full chat JSON, double-click to download)"
              title="Click to copy all brain IN/OUT turns; double-click to download transcript"
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
                copyTranscriptState === 'copied'
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : copyTranscriptState === 'downloaded'
                    ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                    : copyTranscriptState === 'failed'
                      ? 'border-red-500/50 bg-red-500/15 text-red-300'
                      : 'border-white/10 bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {copyTranscriptState === 'copied' ? (
                <Check aria-hidden="true" className="h-5 w-5" />
              ) : copyTranscriptState === 'downloaded' ? (
                <Download aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Copy aria-hidden="true" className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
        <div className="mx-auto mt-1 max-w-2xl px-1">
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
      <BulkQuestionModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onStartSequence={startBulkSequence}
        prefill={bulkPrefill}
      />
      {(() => {
        // Resolved at render so a message updated after the panel opened
        // shows its current payload rather than a snapshot.
        const jsonMessage = jsonMessageId
          ? messages.find((msg) => msg.id === jsonMessageId)
          : undefined;
        // The turns the panel can show, in transcript order, so the arrow keys
        // step over answers and skip the questions and errors between them.
        const inspectable = messages.filter((msg) => msg.role === 'assistant' && msg.brainTrace);
        const at = inspectable.findIndex((msg) => msg.id === jsonMessageId);
        const step = (to: number) => () => setJsonMessageId(inspectable[to].id);
        return (
          <MessageJsonModal
            isOpen={isDevViewActive && !!jsonMessage}
            onClose={() => setJsonMessageId(null)}
            question={jsonMessage?.question}
            requestId={jsonMessage?.requestId}
            timestamp={jsonMessage?.timestamp}
            payload={jsonMessage?.debugPayload}
            onPrev={at > 0 ? step(at - 1) : undefined}
            onNext={at >= 0 && at < inspectable.length - 1 ? step(at + 1) : undefined}
          />
        );
      })()}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div
            className="bg-background rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Install RockyGPT</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add RockyGPT to your home screen for quick access.
            </p>
            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {IS_DEVELOPMENT && previewMode === 'student' && (
        <div className="fixed bottom-20 left-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={togglePreviewMode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/95 text-neutral-300 hover:text-white border border-amber-500/40 text-xs font-medium backdrop-blur-md shadow-xl transition-all hover:scale-105 active:scale-95"
            title="Click to exit Student View and return to Dev View"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-amber-300">Student Preview</span>
            <span className="text-neutral-600">|</span>
            <span className="text-sky-400 font-semibold hover:underline">Exit to Dev ⚡</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SourceLinks({ citations }: { citations?: Citation[] }) {
  const sources = cleanCitations(citations);
  if (sources.length === 0) return null;

  return (
    <div className="contents" data-testid="answer-sources">
      {sources.map((citation, index) => (
        <a
          key={`${citation.url}-${index}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          title={citation.snippet || citation.title}
          className="group inline-flex min-h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
        >
          <ExternalLink
            aria-hidden="true"
            className="h-3 w-3 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
          <span className="truncate">{citation.title || `Source ${index + 1}`}</span>
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

function FeedbackButtons({ requestId }: { requestId?: string }) {
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
            className="rounded-md bg-neutral-900/90 border border-white/10 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-white/20 transition-all shadow-xs"
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
          className="rounded-md bg-neutral-900/90 border border-white/10 px-2 py-0.5 text-[11px] text-sky-400 hover:bg-sky-500/10 hover:text-sky-300 hover:border-sky-500/30 transition-all shadow-xs"
        >
          Other…
        </button>
        <button
          type="button"
          onClick={() => setStatus('saved')}
          className="text-[11px] text-neutral-500 hover:text-neutral-300 p-0.5 ml-0.5"
          title="Skip"
        >
          <X className="h-3 w-3" />
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
          className="text-xs bg-neutral-900/90 border border-white/15 rounded-md px-2.5 py-1 text-white placeholder:text-neutral-500 focus:outline-none focus:border-sky-500 w-48 sm:w-64 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!isTextValid}
          className="rounded-md bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 disabled:cursor-not-allowed px-2.5 py-1 text-xs font-semibold transition-colors shadow-sm cursor-pointer"
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
          onClick={() => selectedRating && handleVote(selectedRating)}
          className="rounded-lg border border-amber-300/50 px-2 py-1 font-semibold hover:bg-amber-300/10"
        >
          Try again
        </button>
        <span className="break-all text-muted-foreground">Support ID: {requestId}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Helpful answer"
        aria-pressed={selectedRating === 'up'}
        data-no-haptic="true"
        disabled={status === 'saving'}
        onClick={() => handleVote('up')}
        className="p-1 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-white/5 transition-colors disabled:cursor-wait disabled:opacity-50"
        title="Helpful answer (👍)"
      >
        <ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Unhelpful answer"
        aria-pressed={selectedRating === 'down'}
        data-no-haptic="true"
        disabled={status === 'saving'}
        onClick={() => handleVote('down')}
        className="p-1 rounded-md text-muted-foreground hover:text-rose-400 hover:bg-white/5 transition-colors disabled:cursor-wait disabled:opacity-50"
        title="Needs improvement (👎)"
      >
        <ThumbsDown aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {status === 'saving' && (
        <span role="status" className="text-xs text-muted-foreground">
          Saving…
        </span>
      )}
    </div>
  );
}
