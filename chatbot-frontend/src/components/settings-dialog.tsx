"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Settings, Moon, Sun, Globe, Lock, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useChatPreset } from "@/context/chat-preset-context";
import type { PresetMode } from "@/lib/chat-preset";

interface SettingsDialogProps {
  children: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { preset, setMode, setExtra } = useChatPreset();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const MODES: ReadonlyArray<{ value: PresetMode; labelKey: string }> = [
    { value: "long", labelKey: "modeLong" },
    { value: "medium", labelKey: "modeMedium" },
    { value: "short", labelKey: "modeShort" },
  ];

  const modeDescriptionKey: Record<PresetMode, string> = {
    long: "modeLongDescription",
    medium: "modeMediumDescription",
    short: "modeShortDescription",
  };

  const handleLanguageSwitch = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder — will be wired to backend later
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Appearance Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {t("appearance")}
            </h3>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode">{t("darkMode")}</Label>
              <Switch
                id="dark-mode"
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              />
            </div>

            {/* Language */}
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t("language")}
              </Label>
              <div className="flex gap-1">
                <Button
                  variant={locale === "en" ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => handleLanguageSwitch("en")}
                >
                  English
                </Button>
                <Button
                  variant={locale === "fa" ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => handleLanguageSwitch("fa")}
                >
                  فارسی
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Answer Mode Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("answerMode")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("answerModeDescription")}
            </p>

            <div className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <Button
                  key={m.value}
                  variant={preset.mode === m.value ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setMode(m.value)}
                >
                  {t(m.labelKey)}
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {t(modeDescriptionKey[preset.mode])}
            </p>

            <div className="space-y-2">
              <Label htmlFor="preset-extra" className="text-xs">
                {t("extraPromptLabel")}
              </Label>
              <textarea
                id="preset-extra"
                value={preset.extra}
                onChange={(e) => setExtra(e.target.value.slice(0, 500))}
                placeholder={t("extraPromptPlaceholder")}
                rows={3}
                maxLength={500}
                className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 placeholder:text-muted-foreground disabled:opacity-50"
              />
            </div>
          </div>

          <Separator />

          {/* Security Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t("security")}
            </h3>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="current-password">{t("currentPassword")}</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                {t("changePassword")}
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
