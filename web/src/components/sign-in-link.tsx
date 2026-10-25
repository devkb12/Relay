'use client';

import { usePathname } from 'next/navigation';

/**
 * "Sign in with Discord" that returns to this exact page afterwards. A full-page navigation to the
 * OAuth route handler; the backend accepts only a relative return path.
 */
export function SignInLink({ className, children = 'Sign in with Discord' }: { className?: string; children?: React.ReactNode }) {
  const path = usePathname() || '/room';
  return <a href={`/auth/discord/login?return_to=${encodeURIComponent(path)}`} className={className}>{children}</a>;
}
