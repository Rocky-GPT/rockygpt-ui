import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  GraduationCap,
  MapPin,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About | RockyGPT',
  description:
    'The story behind RockyGPT — from a 2023 SGA campaign promise to a campus assistant for Ramapo College.',
};

const timeline = [
  {
    year: '2023',
    title: 'A campaign promise',
    body: 'RockyGPT began with a promise I made during my 2023 SGA election campaign to improve Rocky the Roadrunner and make campus information easier for students to access.',
  },
  {
    year: 'Then',
    title: 'A business plan',
    body: 'The idea later became a business plan in my entrepreneurship class, and eventually my senior capstone project.',
  },
  {
    year: 'After graduation',
    title: 'A campus assistant',
    body: 'After graduating from Ramapo, I kept building it — turning that idea into a campus assistant for dining, shuttles, buildings, faculty, clubs, and more.',
  },
  {
    year: 'Today',
    title: 'For the Roadrunner community',
    body: 'What started as a campaign promise became something I wanted to leave behind for the Roadrunner community.',
  },
];

const topics = [
  { icon: Utensils, label: 'Dining', desc: 'Menus, hours and meal swipes' },
  { icon: Bus, label: 'Shuttles', desc: 'Campus and shopping routes' },
  { icon: MapPin, label: 'Buildings', desc: 'Rooms, lots and the campus map' },
  { icon: GraduationCap, label: 'Faculty', desc: 'Offices and contact details' },
  { icon: Users, label: 'Clubs', desc: '100+ student organizations' },
  { icon: CalendarDays, label: 'Events', desc: 'Activities and key dates' },
];

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // The onboarding modal opens this in its own tab, where "back" would strand
  // the reader on a second copy of the app instead of returning them.
  const openedInNewTab = (await searchParams).from === 'onboarding';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        {!openedInNewTab && (
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#b84a5c]"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to RockyGPT
          </Link>
        )}

        <header className={openedInNewTab ? '' : 'mt-8'}>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e18b99]">
            About RockyGPT
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Everything Ramapo, one conversation away
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            RockyGPT is an AI guide to Ramapo College. Ask about dining, shuttles, campus locations,
            faculty, clubs, events and deadlines without digging through different campus websites
            and PDFs.
          </p>
        </header>

        <section
          aria-labelledby="story"
          className="mt-12"
        >
          <h2 id="story" className="text-2xl font-semibold tracking-tight">
            The story behind RockyGPT
          </h2>
          <ol className="mt-6 space-y-0">
            {timeline.map((entry, index) => (
              <li key={entry.title} className="relative flex gap-4 pb-8 last:pb-0">
                {/* Connector line, stopping at the final milestone */}
                {index < timeline.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[13px] top-8 bottom-0 w-px bg-border"
                  />
                )}
                <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#862633]/60 bg-[#862633]/25 text-[#ef9baa]">
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e18b99]">
                    {entry.year}
                  </p>
                  <h3 className="mt-1 font-semibold">{entry.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="what-it-does" className="mt-12">
          <h2 id="what-it-does" className="text-2xl font-semibold tracking-tight">
            What you can ask about
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {topics.map(({ icon: Icon, label, desc }) => (
              <article
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-border bg-muted/35 p-4"
              >
                <div className="mt-0.5 rounded-xl bg-[#862633]/25 p-2 text-[#ef9baa]">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="mt-12 space-y-4">
          <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="leading-7 text-muted-foreground">
            RockyGPT answers from official campus information that is collected and refreshed on a
            schedule — dining menus, shuttle timetables, the building and room directory, faculty
            listings, the academic calendar and the student organization directory. Answers cite
            what they were drawn from, so you can check the source rather than take Rocky at its
            word.
          </p>
          <p className="leading-7 text-muted-foreground">
            It is free to use and needs no account. RockyGPT has no access to your student account,
            grades, schedule or financial-aid record — for anything binding, confirm with the
            office that owns it.
          </p>
          <p className="rounded-2xl border border-border bg-muted/35 p-5 text-sm leading-6 text-muted-foreground">
            RockyGPT is an independent project built by a Ramapo graduate. It is not an official
            Ramapo College service, it is not affiliated with or endorsed by the College, and no
            College office administers it.
          </p>
        </section>

        <section aria-labelledby="feedback" className="mt-12 rounded-2xl border border-border p-6">
          <h2 id="feedback" className="text-2xl font-semibold tracking-tight">
            Found something wrong?
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Every answer has a feedback control beneath it. Rating an answer and leaving a comment
            is the fastest way to flag a wrong menu, a stale shuttle time or a missing club — those
            reports are what the next round of fixes gets built from. For anything else, email{' '}
            <a className="font-medium text-[#ef9baa] underline" href="mailto:drajakum@ramapo.edu">
              drajakum@ramapo.edu
            </a>
            .
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {!openedInNewTab && (
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-[#b84a5c]"
              >
                <Rocket aria-hidden="true" className="h-4 w-4" />
                Start asking
              </Link>
            )}
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-[#b84a5c]"
            >
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Privacy notice
            </Link>
          </div>
        </section>

        <p className="mt-10 text-xs leading-5 text-muted-foreground">
          Built for the Ramapo College community. Free to use · No account required · Built for
          Roadrunners.
        </p>
      </div>
    </main>
  );
}
