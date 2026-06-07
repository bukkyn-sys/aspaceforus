import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";
import ZoomPref from "@/components/zoom-pref";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// iPhone portrait resolutions (CSS width/height + device-pixel-ratio). iOS only
// shows a launch image whose media query matches the device exactly, so each one
// needs its own entry; anything not listed falls back to the (cream) body paint.
const APPLE_DEVICES = [
  { cw: 440, ch: 956, r: 3 }, // 16 Pro Max
  { cw: 402, ch: 874, r: 3 }, // 16 Pro
  { cw: 430, ch: 932, r: 3 }, // 14/15 Pro Max, 15/16 Plus
  { cw: 393, ch: 852, r: 3 }, // 14 Pro, 15, 16
  { cw: 428, ch: 926, r: 3 }, // 12/13 Pro Max, 14 Plus
  { cw: 390, ch: 844, r: 3 }, // 12, 13, 14
  { cw: 375, ch: 812, r: 3 }, // X, XS, 11 Pro, 12/13 mini
  { cw: 414, ch: 896, r: 3 }, // XS Max, 11 Pro Max
  { cw: 414, ch: 896, r: 2 }, // XR, 11
  { cw: 414, ch: 736, r: 3 }, // 6+/7+/8 Plus
  { cw: 375, ch: 667, r: 2 }, // SE 2/3, 6/7/8
  { cw: 320, ch: 568, r: 2 }, // SE 1
];

const startupImage = APPLE_DEVICES.flatMap(({ cw, ch, r }) => {
  const w = cw * r;
  const h = ch * r;
  const base = `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`;
  return [
    { url: `/startup-image/${w}x${h}`, media: `${base} and (prefers-color-scheme: light)` },
    { url: `/startup-image/${w}x${h}d`, media: `${base} and (prefers-color-scheme: dark)` },
  ];
});

export const metadata: Metadata = {
  title: "us.",
  description: "just the two of you",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "us.",
    startupImage,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F8F6" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A18" },
  ],
  viewportFit: "cover",
};

// Applies the saved theme before first paint to avoid a flash of the wrong mode.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${plusJakarta.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full antialiased">
        <PwaRegister />
        <ZoomPref />
        {children}
        {/* Portrait-only: phones in landscape see this instead of the app. */}
        <div className="landscape-lock" aria-hidden>
          <span className="text-2xl">↻</span>
          <p className="text-sm font-medium">please rotate to portrait</p>
        </div>
      </body>
    </html>
  );
}
