import { Vazirmatn } from "next/font/google";
import "../globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["latin", "arabic"],
  variable: "--font-vazirmatn",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Root layout for the /embed branch. No navbar, no sidebar, no AuthProvider.
// Sets the font variable and fills the viewport so the iframe host can size us.
// `dir` is intentionally NOT set here — it belongs to the locale layer.
export default function EmbedRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${vazirmatn.variable} font-sans h-dvh w-full bg-transparent`}>
      {children}
    </div>
  );
}
