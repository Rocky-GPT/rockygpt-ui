/**
 * @module components/MessageJsonModal
 * Dev-only inspector for a single assistant message: one turn of the brain,
 * read top to bottom.
 *
 * The question heads it, the answer foots it, and the stages that produced the
 * answer scroll between. Everything is drawn from the response body as it
 * arrived, never from the component state the UI built out of it — when a turn
 * looks wrong, which field the brain actually sent is the whole question.
 *
 * There is no second view. Every field of the response is either a stage here,
 * the header, the footer, or deliberately undrawn — and the undrawn ones are
 * still in `Copy all JSON`, so nothing is unreachable.
 */

'use client';

import { Check, MessageCircle, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { MODAL_OVERLAY, MODAL_PANEL_SHORT } from '@/components/modalShell';
import { JsonViewer } from '@/components/JsonViewer';

interface MessageJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  question?: string;
  requestId?: string;
  /** Accepted for the caller's convenience; the header reads the brain's clock. */
  timestamp?: number;
  /** The response body as received, before the UI destructured it. */
  payload?: Record<string, unknown>;
  /** Step to the neighbouring turn. Absent at either end of the transcript. */
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * One box per stage of a turn, in the order the brain ran them. Reading down
 * the modal is reading the request: what was asked, what BRAIN #1 made of it,
 * what PYTHON did with that, and what BRAIN #3 wrote.
 *
 * The first box is the question and nothing else. The clock leads the BRAIN #1
 * box instead, because that is what the question was read against — and
 * because a `currentTime` sitting beside the question reads as something the
 * client sent, which it never is.
 */
/**
 * Hidden from the drawn payload, kept in every copy. Each earlier turn carries
 * its own id and timestamp, which is three lines of bookkeeping per turn in a
 * box whose point is the conversation.
 */
const BOOKKEEPING = ['requestId', 'createdAt'] as const;

/**
 * The clock and the modes ride in the header, so the memory box does not
 * repeat them. All three stay in the copy — `currentTime` especially, since it
 * is what BRAIN #1 resolved `tomorrow` against.
 */
const UNDRAWN_IN_MEMORY = [...BOOKKEEPING, 'currentTime', 'styleMode', 'responseMode'] as const;

/** The modes the client asked for, as `label · value` for the header. */
function modeChips(context: Record<string, unknown> | undefined): string[] {
  const chips: string[] = [];
  if (typeof context?.styleMode === 'string') chips.push(`style · ${context.styleMode}`);
  if (typeof context?.responseMode === 'string') chips.push(`response · ${context.responseMode}`);
  return chips;
}

/**
 * Earlier turns, as one exchange per entry.
 *
 * The wire carries a turn per speaker — `{role, content}` — which is the shape
 * the models are given and the shape a copy must reproduce. On screen it costs
 * two objects and six lines to say something that never varies: the questions
 * are always the student's and the answers are always Rocky's. Paired, an
 * exchange is two lines and reads as the conversation it is.
 *
 * Handles the brain's own memory shape too (`user`/`assistant` already in one
 * object), which is what a client that sends no history of its own gets back.
 */
function pairTurns(turns: readonly unknown[]): unknown[] {
  const exchanges: unknown[] = [];
  const open = (): Record<string, unknown> | undefined => {
    const last = exchanges[exchanges.length - 1];
    return last && typeof last === 'object' && !Array.isArray(last)
      ? (last as Record<string, unknown>)
      : undefined;
  };

  for (const turn of turns) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
      exchanges.push(turn);
      continue;
    }
    const { role, content, user, assistant, ...rest } = turn as Record<string, unknown>;
    if (user !== undefined || assistant !== undefined) {
      exchanges.push({ question: user, answer: assistant, ...rest });
    } else if (role === 'user') {
      exchanges.push({ question: content, ...rest });
    } else if (role === 'assistant') {
      const pending = open();
      // An assistant turn with no question before it keeps its own entry
      // rather than being folded into an unrelated exchange.
      if (pending && !('answer' in pending)) pending.answer = content;
      else exchanges.push({ answer: content, ...rest });
    } else {
      exchanges.push(turn);
    }
  }
  return exchanges;
}

/** The question stage, with its history paired up. */
function asExchanges(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.earlierTurns)) return data;
  return { ...record, earlierTurns: pairTurns(record.earlierTurns) };
}

/**
 * The routing answers, as marks rather than words.
 *
 * Only for the eye. The brain sends `Yes` and `No`, which is what the copied
 * JSON, the admin log and the terminal all keep — a tick is quicker to scan
 * down a column but is a poor thing to grep for, and it is two columns wide in
 * a terminal that assumed one.
 */
const MARK: Record<string, string> = { Yes: '✅', No: '❌' };

function withMarkedRouting(plan: unknown): unknown {
  if (!isRecord(plan) || !isRecord(plan.routing)) return plan;
  const routing = Object.fromEntries(
    Object.entries(plan.routing).map(([key, value]) => [
      key,
      typeof value === 'string' && value in MARK ? MARK[value] : value,
    ]),
  );
  return { ...plan, routing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STAGES: ReadonlyArray<{
  key: string;
  title: string;
  /** What this box draws. Defaults to the pipeline field named by `key`. */
  select?: (pipeline: Record<string, unknown>) => unknown;
  /** Starts shut behind a View control instead of being permanently open. */
  collapsed?: boolean;
  /**
   * Drop the box entirely when it has nothing in it, rather than drawing
   * `null`. For a stage that only some lanes have, an empty box reads as a
   * stage that failed — and in a pipeline where a failure stops the turn, that
   * is a alarming thing to show for a turn that went fine.
   */
  omitWhenEmpty?: boolean;
  preview?: (data: unknown) => unknown;
  /**
   * Fields to leave undrawn. A function when what is worth drawing depends on
   * the values — a field that merely repeats its neighbour is noise on the
   * turns it repeats and the whole point on the turns it does not. Display
   * only: `Copy all JSON` carries the trace whole either way.
   */
  hidden?: readonly string[] | ((data: unknown) => readonly string[]);
}> = [
  // `question` and `answer` are both absent: they are the two payloads that
  // are prose rather than structure, and they bracket the modal as the header
  // and footer instead. What scrolls between them is the machinery, in the
  // order it ran, with the context it ran against beneath it.
  // Context first: what the question drew on, before what BRAIN #1 made of
  // it. Absent when BRAIN #1 says the question needed nothing.
  { key: 'context', title: 'CONTEXT · what this question uses', omitWhenEmpty: true },
  // Each box below is one brain's own output. `lane` and `capability` sit with
  // the plan because BRAIN #2 decides them — they were in the understand box
  // while the split was cosmetic, which read as BRAIN #1 choosing the lane it
  // is deliberately never shown enough to choose.
  {
    key: 'understanding',
    title: 'BRAIN #1 · understand',
    // `usesContext` is undrawn: the context box above appears exactly when it
    // is true, so printing the flag as well says the same thing twice.
    //
    // `resolvedQuestion` goes the same way when it came back identical to
    // `normalizedQuestion` — the usual case, where nothing needed resolving
    // and the two lines are the same sentence printed twice. What is left is
    // a box that shows a resolution exactly when there was one to show.
    hidden: (data) => {
      const read = data as { normalizedQuestion?: unknown; resolvedQuestion?: unknown } | null;
      const echoed = read != null && read.resolvedQuestion === read.normalizedQuestion;
      return [...BOOKKEEPING, 'usesContext', ...(echoed ? ['resolvedQuestion'] : [])];
    },
  },
  {
    // Never omitted. PYTHON acts on this and nothing else, so a turn without a
    // plan section would be a turn with nothing to run.
    key: 'plan',
    title: 'BRAIN #2 · plan',
    select: (p) => withMarkedRouting(p.plan),
  },
  { key: 'execution', title: 'PYTHON · execute the lane' },
  // The memory is reference rather than pipeline: carried on every request
  // whether it matters or not, empty on a first turn and long on a tenth.
  {
    key: 'memory',
    title: 'MEMORY · short term',
    preview: asExchanges,
    hidden: UNDRAWN_IN_MEMORY,
    // Shut by default. With the clock and the modes in the header this is the
    // conversation and nothing else — empty on a first turn, long on a tenth,
    // and reference either way rather than part of the pipeline.
    collapsed: true,
  },
  // One box, not three. These are what the turn returned alongside the answer,
  // and two of them are `[]` on every turn today — three headers to say so was
  // more chrome than content. Gathered, they are still legible when the CODE
  // lane starts citing its sources and they stop being empty.
  {
    key: 'others',
    title: 'OTHERS · what else came back',
    select: (p) => pick(p, ['suggestedQuestions', 'citations', 'uiActions']),
    // Shut by default. Nothing in here explains an answer — it is what the
    // client does next — so it costs a screen of scrolling to say very little.
    // The byte count on its header still shows without opening it.
    collapsed: true,
  },
  // `answer` is deliberately absent: prose reads badly as a one-line JSON
  // string, so the last stage is the footer below instead. `Copy all JSON`
  // still carries it, because it copies the whole trace.
];

/**
 * Response fields the trace or the surrounding chrome already carries.
 * `brainTrace` becomes the stages, `answer` the footer, `question` the header,
 * so folding them in again would duplicate the whole turn.
 *
 * Everything else in the response is folded in — including `requestId` and
 * `route`, which no stage draws. They are undrawn, not dropped: the id ties a
 * turn to the admin log and `route` is what that log filters on, so both have
 * to survive `Copy all JSON`. An error turn carries none of these three, so
 * its whole body is folded in exactly when that is what you need.
 */
const CARRIED_ELSEWHERE = ['brainTrace', 'answer', 'question'] as const;

/** The named fields, in the order given, as one object. */
function pick(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

/** Top level only — a nested `answer` inside a uiAction is not a duplicate. */
function omitTopLevel(
  record: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * One turn as a single object: the trace's stages, then every other field of
 * the response.
 *
 * Exported because the transcript-wide copy builds the same thing for every
 * message. Two copy paths that disagreed about the shape would be worse than
 * one — whatever you paste should look the same whether it came from a turn or
 * from the whole conversation.
 */
export function turnPipeline(
  payload: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    ...(recordValue(payload?.brainTrace) ?? {}),
    ...(payload ? omitTopLevel(payload, CARRIED_ELSEWHERE) : {}),
  };
}

export function MessageJsonModal({
  isOpen,
  onClose,
  question,
  requestId,
  payload,
  onPrev,
  onNext,
}: MessageJsonModalProps) {
  const [copied, setCopied] = useState(false);
  // Which way the last step went, so the incoming turn enters from the side
  // you came from. Null on open, when there is no direction to imply.
  const [came, setCame] = useState<'next' | 'prev' | null>(null);
  const handleClose = () => {
    setCopied(false);
    setCame(null);
    onClose();
  };
  const dialogRef = useAccessibleDialog(isOpen, handleClose);

  // Left and right step through the turns. The dialog hook claims Escape and
  // Tab and leaves the arrows alone, so this can own them outright — nothing
  // in the panel is a text field or a horizontally-scrolling focus target.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const forward = event.key === 'ArrowRight';
      const step = forward ? onNext : event.key === 'ArrowLeft' ? onPrev : null;
      if (!step) return;
      event.preventDefault();
      setCopied(false);
      setCame(forward ? 'next' : 'prev');
      step();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onPrev, onNext]);

  if (!isOpen) return null;

  const trace = recordValue(payload?.brainTrace);
  const memory = recordValue(trace?.memory);
  // The server's clock, not the browser's. It is what both brains were handed
  // and what every time word in the plan resolved against; the browser's own
  // timestamp is a different clock measuring a different moment, and showing
  // it here only invited the two to be mistaken for each other.
  const clock = typeof memory?.currentTime === 'string' ? memory.currentTime : null;
  // The turn, as one object: the trace's stages, then every other field of the
  // response. The suggestions, citations and UI actions are produced by this
  // turn and only happen to live at the response's top level, so they read as
  // stages; `requestId` and `route` ride along undrawn.
  //
  // `citations` and `uiActions` are empty today — the brain hardcodes both to
  // `[]` — and showing them empty is the point: it is the difference between
  // "nothing was cited" and "citations are not wired up yet".
  const pipeline = turnPipeline(payload);
  const chips = modeChips(memory);
  const asked = recordValue(trace?.question)?.question;
  // The trace value is what the brain was actually sent; the prop is the UI's
  // own copy, and only stands in on an error turn that never parsed a body.
  const questionText = typeof asked === 'string' ? asked : (question ?? null);
  const answer = recordValue(trace?.answer)?.answer;
  const answerText = typeof answer === 'string' ? answer : null;

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(pipeline, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={MODAL_OVERLAY} onClick={handleClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Message JSON"
        tabIndex={-1}
        className={MODAL_PANEL_SHORT}
        onClick={(event) => event.stopPropagation()}
      >
        {/*
          Keyed on the turn so React rebuilds this subtree on every step, which
          is what re-runs the entry animation. The dialog element itself stays
          mounted — remounting it would drop the focus trap's ref.
        */}
        <div
          key={requestId ?? 'turn'}
          className={`flex min-h-0 flex-1 flex-col ${
            came === 'next' ? 'turn-glide-next' : came === 'prev' ? 'turn-glide-prev' : ''
          }`}
        >
          {/*
          The header is the copy target, not the whole card. Double-clicking
          inside a stage is how anyone selects a word in the JSON, and hijacking
          that would make the boxes unreadable.
        */}
          <div
            onDoubleClick={copyAll}
            title="Double-click to copy this turn as JSON"
            className="flex select-none items-start justify-between gap-4 border-b border-border px-5 py-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Question
                </span>
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-white/10 bg-neutral-900/90 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <h2 className="mt-1.5 text-base font-medium leading-snug text-foreground">
                {questionText ?? 'Message JSON'}
              </h2>
              {clock ? (
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{clock}</p>
              ) : null}
            </div>
            {/*
            Nothing here until a copy happens. The affordance is the header's
            tooltip; this is only the confirmation, because a copy you cannot
            tell happened is a copy you do not trust.
          */}
            {copied ? (
              <span
                aria-live="polite"
                className="flex shrink-0 items-center gap-1.5 text-[11px] text-emerald-400"
              >
                <Check className="h-3 w-3" />
                Copied
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {STAGES.filter(({ key, select, omitWhenEmpty }) => {
              if (!omitWhenEmpty) return true;
              const drawn = select ? select(pipeline) : pipeline[key];
              if (drawn == null) return false;
              // An object with no keys draws as `{}`, which reads as a stage
              // that ran and found nothing rather than one with nothing to do.
              return typeof drawn !== 'object' || Object.keys(drawn).length > 0;
            }).map(({ key, title, select, preview, hidden, collapsed }, index) => {
              const drawn = select ? select(pipeline) : (pipeline[key] ?? null);
              return (
              <JsonViewer
                key={key}
                data={drawn}
                title={title}
                alwaysOpen={!collapsed}
                hiddenKeys={typeof hidden === 'function' ? hidden(drawn) : (hidden ?? BOOKKEEPING)}
                previewTransform={preview}
                hideCopy
                className={index === 0 ? 'border-t-0' : undefined}
              />
              );
            })}
          </div>

          {/*
          The last stage, pinned rather than scrolled. It is the one payload
          that is prose, and it stays in view while the stages above it are
          read — which is the comparison anyone has this open to make.
        */}
          {answerText ? (
            <div className="shrink-0 border-t border-border bg-neutral-950/80 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                  BRAIN #3 · translate
                </span>
              </div>
              <p className="mt-2 max-h-32 overflow-auto text-sm leading-relaxed text-foreground">
                {answerText}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
