import type { Metadata, Viewport } from "next";
import "./globals.css";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "DMPlayer2 — ローカルミュージックプレーヤー",
  description: "iPhoneとiPadのための、完全ローカル・オフライン対応ミュージックプレーヤー。",
  manifest: `${publicBasePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "DMPlayer2", statusBarStyle: "black-translucent" },
  icons: { icon: `${publicBasePath}/icon.svg`, apple: `${publicBasePath}/icon.svg` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#101014" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
