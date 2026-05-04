"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FadeIn } from "@/components/motion/fade-in";
import { UserPlus } from "lucide-react";

const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "sqlite" ? "sqlite" : "keycloak";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const { signUp, registerWithCredentials } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (AUTH_PROVIDER === "keycloak") {
    return (
      <FadeIn direction="up" delay={0.2}>
        <div className="space-y-2 text-center mb-6">
          <h2 className="text-xl font-semibold text-white">{t("title")}</h2>
          <p className="text-sm text-white/60">{t("subtitle")}</p>
        </div>

        <Button
          type="button"
          onClick={() => signUp("/chat")}
          className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur-sm"
        >
          <UserPlus className="size-4 me-2" />
          {t("submit")}
        </Button>

        <p className="mt-6 text-center text-sm text-white/60">
          {t("hasAccount")}{" "}
          <Link href="/login" className="text-white font-medium hover:underline">
            {t("login")}
          </Link>
        </p>
      </FadeIn>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await registerWithCredentials({
        email: email.trim(),
        password,
        name: name.trim(),
      });
      router.push("/chat");
    } catch {
      setError(t("error"));
      setSubmitting(false);
    }
  }

  return (
    <FadeIn direction="up" delay={0.2}>
      <div className="space-y-2 text-center mb-6">
        <h2 className="text-xl font-semibold text-white">{t("title")}</h2>
        <p className="text-sm text-white/60">{t("subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="register-name" className="text-white/80">
            {t("name")}
          </Label>
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-email" className="text-white/80">
            {t("email")}
          </Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-password" className="text-white/80">
            {t("password")}
          </Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-confirm" className="text-white/80">
            {t("confirmPassword")}
          </Label>
          <Input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={
            submitting ||
            name.length === 0 ||
            email.length === 0 ||
            password.length === 0 ||
            confirmPassword.length === 0
          }
          className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur-sm"
        >
          <UserPlus className="size-4 me-2" />
          {t("submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-white font-medium hover:underline">
          {t("login")}
        </Link>
      </p>
    </FadeIn>
  );
}
