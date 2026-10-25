import { Providers } from '@/components/providers';

/** Motion config (reduced motion) and the toaster load only where screens use them. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
