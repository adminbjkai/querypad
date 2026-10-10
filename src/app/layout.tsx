import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Instrument Sans for the interface (its width axis gives page titles a drafted, condensed cut);
// IBM Plex Mono for SQL and data cells.
const ui = Instrument_Sans({ variable: "--font-ui", subsets: ["latin"], axes: ["wdth"] });
const code = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500", "600"] });

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
    { media: "(prefers-color-scheme: light)", color: "#e9eee8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c110e" },
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
