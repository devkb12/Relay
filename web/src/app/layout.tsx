import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next, JetBrains_Mono, Newsreader } from 'next/font/google';
import './globals.css';

const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', axes: ['opsz'], display: 'swap' });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--font-atkinson', display: 'swap', adjustFontFallback: false, fallback: ['Segoe UI', 'system-ui', 'sans-serif'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'RELAY — Find the time. Pass the understanding.', template: '%s · RELAY' },
  description: 'RELAY finds when your study group can meet and runs the session in Discord: think privately, explain together, then try a fresh problem.',
  icons: { icon: '/brand/relay-mark-draft.svg' },
};

export const viewport: Viewport = { themeColor: '#152237', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${atkinson.variable} ${mono.variable}`}>
      <body className="bg-paper text-text antialiased">
        {children}
      </body>
    </html>
  );
}
