import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Plearn — Learn. Solve. Earn.",
  description:
    "A decentralized challenge platform on Stellar. Browse challenges, submit solutions, and earn rewards.",
};

/**
 * Inline script injected into <head> before any paint.
 * Reads localStorage and system preference, then immediately adds or removes
 * the `dark` class on <html> — preventing a flash of the wrong theme (FOUC).
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('plearn-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored ? stored : (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`.trim();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <WalletProvider>
            <Navbar />
            <main>{children}</main>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
