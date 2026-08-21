import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Database, LockKeyhole, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy | RockyGPT',
  description: 'What RockyGPT stores, how long it is retained, and who processes it.',
};

const facts = [
  {
    icon: Database,
    title: 'Questions and answers',
    body: 'RockyGPT stores every valid submitted question for up to 30 days to improve answer quality. When a request succeeds, its answer and structured fact response are stored with it; failed and timed-out requests retain the question. Questions from the same browser-tab session receive the same pseudonymous label. Recognized sensitive patterns—including student numbers, email addresses, phone numbers, payment or Social Security numbers, and secrets—are redacted before storage.',
  },
  {
    icon: ShieldCheck,
    title: 'Crisis and emotional-distress conversations',
    body: 'These conversations are included in transcript logging and follow the same redaction and 30-day retention rules as other submitted questions.',
  },
  {
    icon: LockKeyhole,
    title: 'Operational metrics and feedback',
    body: 'RockyGPT keeps operational metadata—such as route, timing, dataset version, and failure categories—and submitted ratings or redacted feedback comments for up to 90 days. Operational metrics do not contain the question or answer text.',
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
          className="mt-10 rounded-2xl border border-emerald-400/35 bg-emerald-400/10 p-5"
        >
          <h2 id="logging-status" className="font-semibold">
            Transcript logging is enabled
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Every valid submitted question is logged. The 30-day redaction and retention controls
            below apply.
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
            RockyGPT creates a random identifier for the current browser-tab session so questions
            from that session can be reviewed together. Only a one-way hash is stored with the
            transcript—not the raw identifier, an account, a name, or a raw IP address. The hash
            expires with the transcript after 30 days and does not by itself identify the person.
            Network addresses are separately converted to keyed hashes for short-lived abuse
            prevention; raw IP addresses are not used as storage keys.
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
          Last updated July 19, 2026. This notice describes the invite-only RockyGPT pilot.
        </p>
      </div>
    </main>
  );
}
