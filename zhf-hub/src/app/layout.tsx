import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Zachary Horton Foundation", template: "%s · Zachary Horton Foundation" },
  description: "Donate, volunteer and join events with the Zachary Horton Foundation — breaking the stigma of addiction.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
