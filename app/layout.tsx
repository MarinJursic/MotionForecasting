import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vector Field — Autonomous Motion Forecasting Lab",
  description:
    "An interactive 3D laboratory for multimodal autonomous-driving forecasts, occupancy risk, calibration, and counterfactual replay.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('vector-field-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch{document.documentElement.dataset.theme='dark'}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
