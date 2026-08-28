'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { JsonViewer } from '@/components/JsonViewer';
import { DevPageMenu } from '@/components/DevPageMenu';
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Cookie,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  User,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

interface ChatLogItem {
  id: string;
  session_id: string;
  visitor_id?: string;
  user_message: string;
  assistant_message: string;
  route: string;
  question_origin?: 'client' | 'dev' | 'bot';
  tools_invoked: string[];
  tool_arguments: Record<string, unknown>;
  citations: Array<{ title: string; url: string }>;
  facts_extracted: Array<{ key: string; kind: string; value: unknown }>;
  debug_info?: Record<string, unknown>;
  latency_ms: number;
  /**
   * Operator feedback. Absent from the wire when unset (the brain serializes
   * with `exclude_none`); `null` only as the local cleared-by-toggle state.
   */
  feedback?: 'positive' | 'negative' | null;
  /**
   * Student-submitted feedback, joined from rockygpt_v2.feedback. Every field
   * here is ABSENT from the payload when the student left none — never `null`.
   * Test with `=== undefined`, never `=== null`.
   */
  feedback_rating?: -1 | 1;
  feedback_category?: string;
  feedback_comment?: string;
  created_at: string;
}

interface LogMetrics {
  totalLogs: number;
  avgLatencyMs: number;
  uniqueSessions: number;
  uniqueVisitors?: number;
  errorCount: number;
  clientCount: number;
  devCount: number;
  botCount: number;
}

export function LogsDashboard() {
  const [logs, setLogs] = useState<ChatLogItem[]>([]);
  const [metrics, setMetrics] = useState<LogMetrics>({
    totalLogs: 0,
    avgLatencyMs: 0,
    uniqueSessions: 0,
    errorCount: 0,
    clientCount: 0,
    devCount: 0,
    botCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'devices' | 'sessions' | 'cards' | 'json'>('sessions');
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [collapsedDevices, setCollapsedDevices] = useState<Set<string>>(new Set());

  const toggleDevice = (deviceId: string) => {
    setCollapsedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const toggleOrigin = (key: string) => {
    setSelectedOrigins((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Close menus when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsFilterMenuOpen(false);
        setIsViewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Polling runs whenever the tab is actually being looked at. There is no
  const [tabVisible, setTabVisible] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const lastKnownVersionRef = useRef<string | null>(null);

  const fetchLogs = useCallback(async (showLoading = false, checkVersion = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedRoutes.length > 0) params.set('route', selectedRoutes.join(','));
      if (selectedOrigins.length > 0) params.set('origin', selectedOrigins.join(','));
      if (checkVersion && lastKnownVersionRef.current) {
        params.set('version', lastKnownVersionRef.current);
      }
      params.set('limit', '100');

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (res.status === 304) {
        // No changes in database! Return with zero state churn.
        return;
      }
      if (res.ok) {
        const data = await res.json();
        // If conditional check returned modified: false
        if (data && data.modified === false) {
          return;
        }
        setLogs(data.logs || []);
        if (data.metrics) setMetrics(data.metrics);
        if (data.version) lastKnownVersionRef.current = data.version;
        setLastUpdated(Date.now());
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 1200);
      }
    } catch (err) {
      console.error('Failed to fetch chat logs:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [search, selectedRoutes, selectedOrigins]);

  // Initial load & search/filter change: always fetch fresh without version constraint
  useEffect(() => {
    lastKnownVersionRef.current = null;
    fetchLogs(true, false);
  }, [fetchLogs]);

  // Track whether this tab is on screen. A hidden tab has nobody reading it,
  // so polling it only burns database compute.
  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(!document.hidden);
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // 1. Real-time Server-Sent Events (SSE) stream: receives instant push notifications
  // when chat turns are logged or feedback is updated.
  useEffect(() => {
    if (!tabVisible) return;
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/logs/stream');
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'change') {
            // Instant real-time database change detected!
            startTransition(() => {
              fetchLogs(false, true);
            });
          }
        } catch {
          // Ignore non-json or heartbeat comments
        }
      };
    } catch (err) {
      console.error('SSE connection error:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [tabVisible, fetchLogs]);

  // 2. Smart background check (every 10s while tab is visible): sends lightweight version
  // watermark so it only updates if another process or instance modified the DB.
  useEffect(() => {
    if (!tabVisible) return;
    const timer = setInterval(() => {
      startTransition(() => {
        fetchLogs(false, true);
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [tabVisible, fetchLogs]);

  // Drive the "updated Ns ago" label without re-fetching anything.
  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => setSecondsAgo(Math.round((Date.now() - lastUpdated) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFeedback = async (logId: string, feedbackType: 'positive' | 'negative') => {
    // Optimistic UI state update
    setLogs((prev) =>
      prev.map((l) => {
        if (l.id !== logId) return l;
        const nextFeedback = l.feedback === feedbackType ? null : feedbackType;
        return { ...l, feedback: nextFeedback };
      })
    );

    try {
      const currentLog = logs.find((l) => l.id === logId);
      const nextFeedback = currentLog?.feedback === feedbackType ? null : feedbackType;

      await fetch('/api/logs/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId, feedback: nextFeedback }),
      });
    } catch (err) {
      console.error('Failed to submit log feedback', err);
    }
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLogIds(new Set(logs.map((l) => l.id)));
  };

  const collapseAll = () => {
    setExpandedLogIds(new Set());
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

      if (diffSec < 15) return 'Just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;

      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getOriginIcon = (origin?: string) => {
    const o = origin || 'client';
    if (o === 'client') {
      return (
        <div
          title="Client (Student Inquiry)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30"
        >
          <User className="h-4 w-4" />
        </div>
      );
    }
    if (o === 'dev') {
      return (
        <div
          title="Dev (Internal Terminal/Test)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30"
        >
          <Terminal className="h-4 w-4" />
        </div>
      );
    }
    return (
      <div
        title="Bot (Automated Test)"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30"
      >
        <Bot className="h-4 w-4" />
      </div>
    );
  };

  const getRouteBadge = (route: string) => {
    const r = route.toLowerCase();
    if (r.includes('error')) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-300 border border-rose-500/30">
          <ShieldAlert className="h-3 w-3" /> Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-300 border border-sky-500/30">
        <Sparkles className="h-3 w-3" /> Standard
      </span>
    );
  };

  const getLatencyBadge = (ms: number) => {
    if (ms < 50) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-950/70 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800/40">
          <Zap className="h-3 w-3" /> {ms}ms
        </span>
      );
    }
    if (ms < 1000) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-950/70 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-800/40">
          <Clock className="h-3 w-3" /> {ms}ms
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-950/70 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-800/40">
        <Clock className="h-3 w-3" /> {(ms / 1000).toFixed(2)}s
      </span>
    );
  };

  // Group the flat log list into conversations. Order is preserved, so groups
  // come out newest-first exactly like the feed, and a session whose turns are
  // split across a filter boundary still renders as one group.
  const visibleGroups = useMemo(() => {
    if (viewMode !== 'sessions') {
      return [{ sessionId: '__all__', logs }];
    }
    const order: string[] = [];
    const bySession = new Map<string, ChatLogItem[]>();
    for (const log of logs) {
      const key = log.session_id || 'unknown';
      if (!bySession.has(key)) {
        bySession.set(key, []);
        order.push(key);
      }
      bySession.get(key)!.push(log);
    }
    return order.map((sessionId) => ({ sessionId, logs: bySession.get(sessionId)! }));
  }, [logs, viewMode]);

  // Group logs by Device / Cookie visitor ID. Sub-groups by conversation session ID.
  const visibleDeviceGroups = useMemo(() => {
    if (viewMode !== 'devices') return [];
    const order: string[] = [];
    const byVisitor = new Map<string, ChatLogItem[]>();
    for (const log of logs) {
      const key = log.visitor_id || log.session_id || 'anonymous_visitor';
      if (!byVisitor.has(key)) {
        byVisitor.set(key, []);
        order.push(key);
      }
      byVisitor.get(key)!.push(log);
    }
    return order.map((visitorId) => {
      const visitorLogs = byVisitor.get(visitorId)!;
      const sessOrder: string[] = [];
      const bySess = new Map<string, ChatLogItem[]>();
      for (const l of visitorLogs) {
        const sKey = l.session_id || 'unknown';
        if (!bySess.has(sKey)) {
          bySess.set(sKey, []);
          sessOrder.push(sKey);
        }
        bySess.get(sKey)!.push(l);
      }
      const sessions = sessOrder.map((sessionId) => ({
        sessionId,
        logs: bySess.get(sessionId)!,
      }));
      return {
        visitorId,
        logs: visitorLogs,
        sessions,
      };
    });
  }, [logs, viewMode]);

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // One turn card. Shared by the flat feed and the grouped session view so the
  // two modes cannot drift apart.
  const renderLogCard = (log: ChatLogItem) => {
    const isExpanded = expandedLogIds.has(log.id);
    const tools = Array.isArray(log.tools_invoked)
      ? log.tools_invoked
      : typeof log.tools_invoked === 'string'
      ? JSON.parse(log.tools_invoked || '[]')
      : [];
    const citations = Array.isArray(log.citations)
      ? log.citations
      : typeof log.citations === 'string'
      ? JSON.parse(log.citations || '[]')
      : [];
    const debugPayload =
      typeof log.debug_info === 'string'
        ? (() => {
            try {
              return JSON.parse(log.debug_info);
            } catch {
              return {};
            }
          })()
        : log.debug_info || {};

    const toolArgs =
      typeof log.tool_arguments === 'string'
        ? (() => {
            try {
              return JSON.parse(log.tool_arguments);
            } catch {
              return {};
            }
          })()
        : log.tool_arguments || {};

    // Complete Full Turn Object for JSON inspection
    const fullTurnJson = {
      id: log.id,
      session_id: log.session_id,
      question_origin: log.question_origin || 'client',
      created_at: log.created_at,
      latency_ms: log.latency_ms,
      user_message: log.user_message,
      assistant_message: log.assistant_message,
      route: log.route,
      tools_invoked: tools,
      tool_arguments: Object.keys(toolArgs).length > 0 ? toolArgs : undefined,
      citations: citations,
      debug: debugPayload,
    };

    return (
      <div
        key={log.id}
        className={`group overflow-hidden rounded-2xl border transition-all duration-200 ${
          isExpanded
            ? 'border-sky-500/40 bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-md'
            : 'border-white/10 bg-neutral-900/60 hover:border-white/20 hover:bg-neutral-900/80'
        }`}
      >
        {/* Single Unified Row (Origin + Question + Badges + Latency + Timestamp + Chevron) */}
        <div
          onClick={() => toggleLogExpand(log.id)}
          className={`flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${
            isExpanded ? 'bg-neutral-950/60 border-b border-white/5' : ''
          }`}
        >
          {/* Left: Origin Icon + Question Text */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {getOriginIcon(log.question_origin)}
            <p className="text-sm font-medium text-white leading-relaxed truncate">
              {log.user_message}
            </p>
          </div>

          {/* Right: Badges, Latency, Timestamp & Chevron */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              {getRouteBadge(log.route)}
              {getLatencyBadge(log.latency_ms)}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTimestamp(log.created_at)}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-neutral-500 transition-transform duration-200 shrink-0 ${
                isExpanded ? 'rotate-180 text-sky-400' : 'group-hover:text-white'
              }`}
            />
          </div>
        </div>

        {/* Expanded Section: RockyGPT Response + Telemetry & JSON */}
        {isExpanded && (
          <div className="bg-black/20 animate-in fade-in duration-200">
            {/* RockyGPT Response with Rich Markdown (Direct, No Nested Bubble) */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 space-y-3 relative group/answer">
              {/* Quick Copy Answer Action */}
              <div className="absolute top-3 right-5 sm:right-6">
                <button
                  type="button"
                  onClick={() => copyToClipboard(log.assistant_message, `answer-${log.id}`)}
                  className="opacity-0 group-hover/answer:opacity-100 transition-opacity flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 hover:text-white bg-neutral-900/90 border border-white/10 rounded-md px-2.5 py-1 shadow-sm backdrop-blur-sm"
                  title="Copy RockyGPT Answer"
                >
                  {copiedId === `answer-${log.id}` ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-300 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Answer</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-sm text-neutral-200 leading-relaxed space-y-2 pr-28">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ ...props }) => <strong className="font-semibold text-white" {...props} />,
                    p: ({ ...props }) => <p className="leading-relaxed my-1" {...props} />,
                    ul: ({ ...props }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5" {...props} />,
                    ol: ({ ...props }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5" {...props} />,
                    li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                    a: ({ href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 underline hover:text-sky-300 transition-colors"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {log.assistant_message}
                </ReactMarkdown>
              </div>

              {/* Student feedback submitted from the live site */}
              {(log.feedback_comment ||
                log.feedback_category ||
                log.feedback_rating !== undefined) && (
                <div
                  className={`pt-2 border-t border-white/5`}
                >
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Student Feedback:
                  </div>
                  <div
                    className={`rounded-lg border p-3 ${
                      log.feedback_rating === 1
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : log.feedback_rating === -1
                          ? 'bg-rose-500/5 border-rose-500/20'
                          : 'bg-neutral-500/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {log.feedback_rating !== undefined && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            log.feedback_rating === 1
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {log.feedback_rating === 1 ? (
                            <ThumbsUp className="h-3 w-3" />
                          ) : (
                            <ThumbsDown className="h-3 w-3" />
                          )}
                          {log.feedback_rating === 1 ? 'Helpful' : 'Not helpful'}
                        </span>
                      )}
                      {log.feedback_category && (
                        <span className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-mono text-neutral-300 border border-white/10">
                          {log.feedback_category.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {log.feedback_comment && (
                      <div className="mt-2 flex gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                          {log.feedback_comment}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attached Citations */}
              {citations.length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Citations Attached:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {citations.map((c: { title: string; url: string }, i: number) => (
                      <a
                        key={i}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-900/80 px-2.5 py-1 text-xs text-sky-400 hover:bg-neutral-800 hover:text-sky-300 border border-white/10 transition-colors"
                      >
                        <span>{c.title}</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Integrated Toggleable JSON Footer Drawer */}
            <JsonViewer
              data={fullTurnJson}
              chips={
                <div className="flex items-center gap-1.5 flex-wrap">
                  {tools.length > 0 && (
                    <div
                      title={`Tools Invoked: ${tools.join(', ')}`}
                      className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-mono text-purple-300 border border-purple-500/20 shadow-xs"
                    >
                      <Wrench className="h-3 w-3 text-purple-400" />
                      <span className="truncate max-w-[160px]">{tools.join(', ')}</span>
                    </div>
                  )}
                </div>
              }
              actions={
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded-lg bg-neutral-900/90 p-0.5 border border-white/10"
                >
                  <button
                    type="button"
                    onClick={() => handleFeedback(log.id, 'positive')}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                      log.feedback === 'positive'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                        : 'text-neutral-400 hover:text-emerald-300 hover:bg-neutral-800'
                    }`}
                    title="Mark as Accurate & Helpful (👍)"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFeedback(log.id, 'negative')}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                      log.feedback === 'negative'
                        ? 'bg-rose-500/20 text-rose-300 font-semibold'
                        : 'text-neutral-400 hover:text-rose-300 hover:bg-neutral-800'
                    }`}
                    title="Flag Issue / Inaccurate (👎)"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </div>
              }
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sticky Header with DevPageMenu on Left and Live Status on Right */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/85 shadow-sm backdrop-blur-xl">
        <div className="container mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <DevPageMenu title="Logs" subtitle="Live chat telemetry & conversations" />

          {/* Smart Real-Time Live Status Indicator (Right Side) */}
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium backdrop-blur-md shadow-sm transition-all duration-300 ${
              isSyncing
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300 ring-2 ring-emerald-400/40 shadow-emerald-500/20'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
            title={
              lastUpdated === null
                ? 'Smart Sync • Listening for real-time database changes'
                : secondsAgo < 5
                  ? 'Updated just now • Real-time push active'
                  : `Last change ${secondsAgo}s ago • Real-time push active`
            }
            aria-label={
              lastUpdated === null
                ? 'Smart Sync • Listening for real-time database changes'
                : secondsAgo < 5
                  ? 'Updated just now • Real-time push active'
                  : `Last change ${secondsAgo}s ago • Real-time push active`
            }
          >
            <span
              className={`h-2 w-2 rounded-full transition-transform ${
                isSyncing
                  ? 'bg-emerald-300 scale-125 animate-ping'
                  : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="font-semibold tracking-wide">
              {isSyncing
                ? 'SYNCED'
                : lastUpdated === null
                  ? 'LIVE'
                  : secondsAgo < 5
                    ? 'LIVE'
                    : `${secondsAgo}s ago`}
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto min-w-0 max-w-7xl px-6 py-8 space-y-6">
        {/* 1. TOP STATS BAR */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Inquiries & Breakdown */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Inquiries
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <MessageSquare className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {metrics.totalLogs.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">turns</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="text-blue-400 font-medium">{metrics.clientCount} Client</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">{metrics.devCount} Dev</span>
            <span>·</span>
            <span className="text-neutral-400 font-medium">{metrics.botCount} Bot</span>
          </div>
        </div>

        {/* Average Latency */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Avg Latency
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">
              {metrics.avgLatencyMs < 1000
                ? `${metrics.avgLatencyMs}ms`
                : `${(metrics.avgLatencyMs / 1000).toFixed(2)}s`}
            </span>
            <span className="text-xs text-muted-foreground">per response</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400/80 font-medium">
            Real-time latency
          </div>
        </div>

        {/* Total Responses Logged */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Responses
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {metrics.totalLogs.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">responses</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {metrics.errorCount === 0 ? 'Zero errors' : `${metrics.errorCount} errors`}
          </div>
        </div>

        {/* Unique Sessions */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Unique Sessions
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-purple-300">
              {metrics.uniqueSessions.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">conversations</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Continuous multi-turn tracking
          </div>
        </div>
      </div>

      {/* 2. SEARCH & DUAL FILTER CONTROLS (Unified Single Row) */}
      <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-3.5 backdrop-blur-md shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-2.5 justify-between">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student questions, answers, routes, or session IDs..."
              className="h-10 w-full rounded-xl border border-white/10 bg-neutral-950/80 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* Filter Dropdown Menu */}
            <div ref={filterMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                aria-expanded={isFilterMenuOpen}
                aria-haspopup="menu"
                title="Filter by Origin & Route"
                aria-label="Filter by Origin & Route"
                className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-all shadow-sm ${
                  selectedOrigins.length > 0 || selectedRoutes.length > 0
                    ? 'border-sky-500/40 bg-sky-500/15 text-white'
                    : 'border-white/10 bg-neutral-950/80 text-foreground hover:bg-neutral-800 hover:text-white'
                }`}
              >
                <SlidersHorizontal
                  className={`h-4 w-4 ${
                    selectedOrigins.length > 0 || selectedRoutes.length > 0
                      ? 'text-sky-400'
                      : 'text-sky-400'
                  }`}
                />
                <span>Filters</span>
                {selectedOrigins.length + selectedRoutes.length > 0 && (
                  <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white leading-none">
                    {selectedOrigins.length + selectedRoutes.length}
                  </span>
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                    isFilterMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isFilterMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-2xl border border-white/15 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Filter Logs
                    </span>
                    {(selectedOrigins.length > 0 || selectedRoutes.length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrigins([]);
                          setSelectedRoutes([]);
                        }}
                        className="text-[11px] font-medium text-rose-400 hover:text-rose-300 transition-colors"
                      >
                        Reset All
                      </button>
                    )}
                  </div>

                  {/* Section 1: Origin */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-neutral-400">Origin</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'client', label: '👤 Client (Student)' },
                        { key: 'dev', label: '💻 Dev (Internal)' },
                        { key: 'bot', label: '🤖 Bot (Automated)' },
                      ].map((tab) => {
                        const isSelected = selectedOrigins.includes(tab.key);
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => toggleOrigin(tab.key)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                              isSelected
                                ? 'bg-sky-500 text-white font-semibold shadow-sm'
                                : 'bg-neutral-950/70 text-muted-foreground hover:bg-neutral-800 hover:text-white border border-white/5'
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* View Dropdown Menu */}
            <div ref={viewMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsViewMenuOpen((prev) => !prev)}
                aria-expanded={isViewMenuOpen}
                aria-haspopup="menu"
                title="Select View"
                aria-label="Select View"
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/80 px-3 text-xs font-medium text-foreground hover:bg-neutral-800 hover:text-white transition-all shadow-sm"
              >
                {viewMode === 'sessions' && <Users className="h-4 w-4 text-purple-400" />}
                {viewMode === 'devices' && <Cookie className="h-4 w-4 text-emerald-400" />}
                {viewMode === 'cards' && <LayoutGrid className="h-4 w-4 text-sky-400" />}
                {viewMode === 'json' && <FileJson className="h-4 w-4 text-amber-400" />}
                <span>View</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                    isViewMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isViewMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-white/15 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="pb-2.5 mb-2.5 border-b border-white/10">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      View Layout
                    </span>
                  </div>

                  <div className="space-y-1">
                    {[
                      {
                        key: 'sessions',
                        label: 'Conversations',
                        desc: 'Grouped by session ID',
                        icon: Users,
                        color: 'text-purple-400',
                      },
                      {
                        key: 'devices',
                        label: 'By Device / Cookie',
                        desc: 'Grouped by visitor cookie',
                        icon: Cookie,
                        color: 'text-emerald-400',
                      },
                      {
                        key: 'cards',
                        label: 'Questions Feed',
                        desc: 'Individual card breakdown',
                        icon: LayoutGrid,
                        color: 'text-sky-400',
                      },
                      {
                        key: 'json',
                        label: 'JSON Stream',
                        desc: 'Raw inspectable logs',
                        icon: FileJson,
                        color: 'text-amber-400',
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = viewMode === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setViewMode(item.key as 'devices' | 'cards' | 'sessions' | 'json');
                            setIsViewMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                              : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{item.label}</div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 text-sky-400 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. LOG FEED STREAM (CARDS VIEW OR JSON STREAM) */}
      {viewMode === 'json' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-white">Full JSON Logs Stream ({logs.length} records)</h3>
          </div>
          <JsonViewer data={logs} alwaysOpen downloadFileName="rockygpt-logs.json" />
        </div>
      ) : (
        <div className="space-y-3">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-sky-400 mb-3" />
              <p className="text-sm">Connecting to PostgreSQL chat logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/40 py-20 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 text-neutral-600 mb-3" />
              <h3 className="text-base font-semibold text-white">No chat logs found</h3>
              <p className="mt-1 text-sm max-w-sm">
                {search || selectedRoutes.length > 0 || selectedOrigins.length > 0
                  ? 'Try adjusting your search query or origin/route filters.'
                  : 'Student questions and Rocky responses will stream here in real time as chats occur.'}
              </p>
            </div>
          ) : viewMode === 'devices' ? (
            <div className="space-y-4">
              {visibleDeviceGroups.map((devGroup) => {
                const isDevCollapsed = collapsedDevices.has(devGroup.visitorId);
                const last = devGroup.logs[0];
                const feedbackCount = devGroup.logs.filter(
                  (l) => l.feedback_rating !== undefined
                ).length;
                const negativeCount = devGroup.logs.filter((l) => l.feedback_rating === -1).length;

                return (
                  <div
                    key={devGroup.visitorId}
                    className="rounded-3xl border border-emerald-500/20 bg-neutral-950/60 overflow-hidden shadow-lg"
                  >
                    {/* Device Header */}
                    <div
                      onClick={() => toggleDevice(devGroup.visitorId)}
                      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-emerald-500/10 bg-emerald-500/[0.04]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                          <Cookie className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-emerald-300 truncate">
                              {devGroup.visitorId}
                            </span>
                            <span className="text-[10px] uppercase font-bold tracking-wider rounded-md bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 border border-emerald-500/30">
                              Cookie Device
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span>
                              {devGroup.sessions.length}{' '}
                              {devGroup.sessions.length === 1 ? 'conversation' : 'conversations'}
                            </span>
                            <span>•</span>
                            <span>
                              {devGroup.logs.length} total{' '}
                              {devGroup.logs.length === 1 ? 'turn' : 'turns'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {feedbackCount > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                              negativeCount > 0
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            }`}
                          >
                            {negativeCount > 0 ? (
                              <ThumbsDown className="h-3 w-3" />
                            ) : (
                              <ThumbsUp className="h-3 w-3" />
                            )}
                            {feedbackCount}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(last.created_at)}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-neutral-500 transition-transform duration-200 ${
                            isDevCollapsed ? '-rotate-90' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Device Body (Conversations inside this device) */}
                    {!isDevCollapsed && (
                      <div className="p-3 sm:p-4 space-y-3 bg-neutral-900/20">
                        {devGroup.sessions.map((session) => {
                          const isSessCollapsed = collapsedSessions.has(session.sessionId);
                          const sessLast = session.logs[0];

                          return (
                            <div
                              key={session.sessionId}
                              className="rounded-2xl border border-white/10 bg-neutral-950/40 overflow-hidden"
                            >
                              <div
                                onClick={() => toggleSession(session.sessionId)}
                                className="flex items-center justify-between gap-3 px-4 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-white/5"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Users className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                  <span className="font-mono text-xs text-neutral-300 truncate">
                                    {session.sessionId}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-300 border border-white/10">
                                    {session.logs.length}{' '}
                                    {session.logs.length === 1 ? 'turn' : 'turns'}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    {formatTimestamp(sessLast.created_at)}
                                  </span>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 text-neutral-500 transition-transform duration-200 ${
                                      isSessCollapsed ? '-rotate-90' : ''
                                    }`}
                                  />
                                </div>
                              </div>
                              {!isSessCollapsed && (
                                <div className="space-y-2 p-2 sm:p-3">
                                  {session.logs.map(renderLogCard)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            visibleGroups.map((group) => {
              if (viewMode !== 'sessions') {
                return (
                  <div key={group.sessionId} className="space-y-3">
                    {group.logs.map(renderLogCard)}
                  </div>
                );
              }

              const isCollapsed = collapsedSessions.has(group.sessionId);
              const first = group.logs[group.logs.length - 1];
              const last = group.logs[0];
              const spanMs =
                new Date(last.created_at).getTime() - new Date(first.created_at).getTime();
              const feedbackCount = group.logs.filter(
                (l) => l.feedback_rating !== undefined
              ).length;
              const negativeCount = group.logs.filter((l) => l.feedback_rating === -1).length;

              return (
                <div
                  key={group.sessionId}
                  className="rounded-2xl border border-white/10 bg-neutral-950/40 overflow-hidden"
                >
                  {/* Conversation header */}
                  <div
                    onClick={() => toggleSession(group.sessionId)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Users className="h-4 w-4 text-sky-400 shrink-0" />
                      <span className="font-mono text-xs text-neutral-300 truncate">
                        {group.sessionId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-300 border border-white/10">
                        {group.logs.length} {group.logs.length === 1 ? 'turn' : 'turns'}
                      </span>
                      {spanMs > 1000 && (
                        <span className="hidden sm:inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400 border border-white/10">
                          {spanMs < 60000
                            ? `${Math.round(spanMs / 1000)}s`
                            : `${Math.round(spanMs / 60000)}m`}
                        </span>
                      )}
                      {feedbackCount > 0 && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                            negativeCount > 0
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          }`}
                        >
                          {negativeCount > 0 ? (
                            <ThumbsDown className="h-3 w-3" />
                          ) : (
                            <ThumbsUp className="h-3 w-3" />
                          )}
                          {feedbackCount}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(last.created_at)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-neutral-500 transition-transform duration-200 ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="space-y-2 p-2 sm:p-3">{group.logs.map(renderLogCard)}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Floating Expand / Collapse All FAB (Bottom Right) */}
      {viewMode === 'cards' && logs.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={expandedLogIds.size === logs.length ? collapseAll : expandAll}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-neutral-900/90 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-neutral-800 active:scale-95 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            title={expandedLogIds.size === logs.length ? 'Collapse all answers' : 'Expand all answers'}
            aria-label={expandedLogIds.size === logs.length ? 'Collapse all answers' : 'Expand all answers'}
          >
            {expandedLogIds.size === logs.length ? (
              <EyeOff className="h-5 w-5 text-amber-400 transition-transform" />
            ) : (
              <Eye className="h-5 w-5 text-sky-400 transition-transform" />
            )}
          </button>
        </div>
      )}
      </main>
    </>
  );
}
