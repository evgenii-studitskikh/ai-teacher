import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import LanguageProvider from "./components/LanguageProvider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-rounded",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "AI Teacher",
  description: "A local voice AI teacher for kids, built on ElevenLabs Agents.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
