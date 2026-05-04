"use client";

import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { KnowledgeSection } from "@/components/landing/knowledge-section";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <main className="islamic-pattern-bg min-h-dvh scroll-smooth">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <KnowledgeSection />
      <CTASection />
      <Footer />
    </main>
  );
}
