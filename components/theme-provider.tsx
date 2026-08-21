/**
 * @module components/theme-provider
 * Light/dark theme provider wrapper using `next-themes`.
 *
 * Wraps child components in a theme context so any part of the app can
 * respect the user's system preference or an explicit theme toggle.
 */

"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * App-wide theme provider wrapper for Next themes.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
