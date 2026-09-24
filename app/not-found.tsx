/**
 * @module app/not-found
 * The page for any address the app does not have.
 *
 * Next's default was a black screen reading "404 | This page could not be
 * found." with no way back, which is where a mistyped or outdated link from a
 * group chat left a student.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found | RockyGPT',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e18b99]">
          Page not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          This page isn&rsquo;t part of RockyGPT
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          The link may be mistyped or out of date. Everything RockyGPT does starts from the chat.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[#4d161d] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#631c26]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to RockyGPT
        </Link>
      </div>
    </main>
  );
}
