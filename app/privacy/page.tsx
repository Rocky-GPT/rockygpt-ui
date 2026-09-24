import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Database, Smartphone, ThumbsUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy | RockyGPT',
  description: 'What RockyGPT stores, how long it is retained, and who processes it.',
};

// Each statement here was checked against the code that does it (September
// 2026): the Brain's turn records, its feedback write and redaction, the UI's
// rate limiter and browser storage. The earlier notice described a retired
// logger (30-day transcripts, a session ID, a cookie, transcript exports)
// that no longer exists.
const facts = [
  {
    icon: Database,
    title: 'Your questions and answers',
    body: 'Each question goes to the RockyGPT service and to the AI model that writes the answer. RockyGPT’s record of a turn holds no question or answer text: only an ID, when it happened, how long it took, which campus data it used, what it cost and whether it succeeded. Requests to the AI provider are sent with storage turned off, though the provider’s own account-level policies still apply.',
  },
  {
    icon: ThumbsUp,
    title: 'When you rate an answer',
    body: 'Rating an answer saves the question you asked, the answer, your rating and any reason or comment, so a wrong answer can be found and fixed. Before anything is saved, email addresses, personal phone numbers, student ID numbers, Social Security numbers and card numbers are removed from your question and comment. Feedback does not expire; email the address below to have yours removed.',
  },
  {
    icon: Smartphone,
    title: 'On your device',
    body: 'The current conversation is kept in this browser tab so it survives a reload, and it is gone when the tab closes, along with a random value the tab sends only for the chat limit described below. Your browser also remembers that you have seen the welcome tour and the role you picked, if you picked one. RockyGPT sets no cookies and uses no analytics or advertising trackers.',
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#b84a5c]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to RockyGPT
        </Link>

        <header className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e18b99]">
            Student privacy notice
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            What happens to your chat
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            RockyGPT answers general Ramapo College questions without student accounts. Do not enter
            passwords, student ID numbers, health details, financial information, or other personal
            or sensitive information.
          </p>
        </header>

        <section
          aria-labelledby="logging-status"
          className="mt-10 rounded-2xl border border-border bg-muted/35 p-5"
        >
          <h2 id="logging-status" className="font-semibold">
            RockyGPT does not keep your questions
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Questions and answers are used to answer you, then dropped. They are saved only when
            you rate an answer, as described below.
          </p>
        </section>

        <section aria-labelledby="stored-data" className="mt-12">
          <h2 id="stored-data" className="text-2xl font-semibold tracking-tight">
            What RockyGPT stores
          </h2>
          <div className="mt-5 grid gap-4">
            {facts.map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-2xl border border-border bg-muted/35 p-5 sm:p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 rounded-xl bg-[#862633]/25 p-2.5 text-[#ef9baa]">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="identifiers" className="mt-12 space-y-4">
          <h2 id="identifiers" className="text-2xl font-semibold tracking-tight">
            Identifiers and service providers
          </h2>
          <p className="leading-7 text-muted-foreground">
            RockyGPT does not identify you. It has no accounts, and nothing it keeps links one
            question to another or to a person.
          </p>
          <p className="leading-7 text-muted-foreground">
            To limit automated abuse, each browser tab can ask 12 questions a minute, and one
            network can ask 120. The website combines your network address and the tab&rsquo;s
            random value into a keyed digest and keeps only a request counter in memory for about a
            minute. Neither the address, the tab value nor the digest is written to logs or the
            database.
          </p>
          <p className="leading-7 text-muted-foreground">
            The website runs on Vercel and the answering service on Render. Campus data, turn
            records and feedback are stored in a Neon Postgres database. Answers are written by an
            AI model provider, currently OpenAI. The hosting providers keep their own request logs
            under their own policies.
          </p>
          <p className="leading-7 text-muted-foreground">
            RockyGPT does not have access to your student account, grades, schedule,
            financial-aid record, or other private College systems.
          </p>
        </section>

        <section aria-labelledby="contact" className="mt-12 rounded-2xl border border-border p-6">
          <h2 id="contact" className="text-2xl font-semibold tracking-tight">
            Questions or privacy concerns
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            RockyGPT is an independent project built by a Ramapo graduate. It is not an official
            Ramapo College service, it is not affiliated with or endorsed by the College, and no
            College office administers it. Email{' '}
            <a className="font-medium text-[#ef9baa] underline" href="mailto:drajakum@ramapo.edu">
              drajakum@ramapo.edu
            </a>{' '}
            with any question about this notice or the data it describes.
          </p>
        </section>

        <p className="mt-10 text-xs leading-5 text-muted-foreground">
          Last updated September 24, 2026.
        </p>
      </div>
    </main>
  );
}
