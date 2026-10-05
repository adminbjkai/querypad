import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ui = Schibsted_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "QueryPad — understand your data files",
  description:
    "A local-first data workspace: drop CSV, Parquet, JSON or Excel files, see how they connect, and query them with SQL or plain English. Runs on DuckDB in your browser.",
  metadataBase: new URL("https://querypad.bjk.ai"),
  openGraph: {
    title: "QueryPad",
    description: "Drop data files, see how they connect, query them with SQL or plain English.",
    siteName: "QueryPad",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QueryPad",
    description: "Drop data files, see how they connect, query them with SQL or plain English.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d131a" },
  ],
};

// Apply the saved (or system) theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("querypad:theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
