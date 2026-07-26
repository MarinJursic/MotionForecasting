import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Crossing Lab — Intersection Motion Review",
  description:
    "Understand an overhead intersection conflict through tracked motion, time-to-conflict, uncertainty, and controlled timing comparisons.",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('crossing-lab-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch{document.documentElement.dataset.theme='dark'}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
