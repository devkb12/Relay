import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next, JetBrains_Mono, Newsreader } from 'next/font/google';
import './globals.css';

// Font budget: only the upright display face and the UI face are preloaded. The italic (accent words)
// and mono (small labels) load on demand; display:swap keeps text visible meanwhile.
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' });
const newsreaderItalic = Newsreader({ subsets: ['latin'], style: 'italic', variable: '--font-newsreader-italic', display: 'swap', preload: false });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--font-atkinson', display: 'swap', adjustFontFallback: false, fallback: ['Segoe UI', 'system-ui', 'sans-serif'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: { default: 'RELAY — Find the time. Pass the understanding.', template: '%s · RELAY' },
  description: 'RELAY finds when your study group can meet and runs the session in Discord: think privately, explain together, then try a fresh problem.',
};

export const viewport: Viewport = { themeColor: '#172032', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${newsreaderItalic.variable} ${atkinson.variable} ${mono.variable}`}>
      <body className="bg-paper text-text antialiased">
        {children}
      </body>
    </html>
  );
}
