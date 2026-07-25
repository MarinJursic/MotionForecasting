import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Vector Field — Autonomous Motion Forecasting Lab",
  description:
    "An interactive 3D laboratory for multimodal autonomous-driving forecasts, occupancy risk, calibration, and counterfactual replay.",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
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
