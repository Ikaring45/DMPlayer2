import type { Metadata, Viewport } from "next";
import "./globals.css";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const shareImageUrl = "https://ikaring45.github.io/DMPlayer2/og.png";

export const metadata: Metadata = {
  title: "DMPlayer2 — ローカルミュージックプレーヤー",
  description: "iPhoneとiPadのための、完全ローカル・オフライン対応ミュージックプレーヤー。",
  manifest: `${publicBasePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "DMPlayer2", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: `${publicBasePath}/icon.svg`, type: "image/svg+xml" },
      { url: `${publicBasePath}/icon-192.png`, type: "image/png", sizes: "192x192" },
    ],
    apple: `${publicBasePath}/apple-touch-icon.png`,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "DMPlayer2",
    title: "DMPlayer2 — 音楽を、この端末に。",
    description: "音源を外部へ送らず、iPhoneとiPadで楽しめるローカルミュージックプレーヤー。",
    images: [{
      url: shareImageUrl,
      width: 1731,
      height: 909,
      alt: "DMPlayer2のオーディオビジュアライザー",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DMPlayer2 — 音楽を、この端末に。",
    description: "完全ローカル・オフライン対応ミュージックプレーヤー。",
    images: [shareImageUrl],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#101014" },
  ],
};

const viewportBootstrap = `(() => {
  try {
    const theme = localStorage.getItem('dmplayer2:theme');
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      document.documentElement.dataset.theme = theme;
    }
  } catch {}
  const content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  const normalize = () => {
    const tags = [...document.querySelectorAll('meta[name="viewport"]')];
    if (!tags.length) return;
    tags[0].setAttribute('content', content);
    tags.slice(1).forEach((tag) => tag.remove());
  };
  normalize();
  new MutationObserver(normalize).observe(document.head, { childList: true, subtree: true });
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><head><script dangerouslySetInnerHTML={{ __html: viewportBootstrap }} /></head><body>{children}</body></html>;
}
