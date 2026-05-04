import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tariq AI",
  description: "Intelligent AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
