"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/admin/change-password-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminSettingsApi, type PlatformSettings } from "@/lib/api/settings";
import { mainWebsiteHost } from "@/lib/site-content";

/** Site-wide toggles that apply across the main website and the PDF store at once. */
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminSettingsApi
      .get()
      .then(setSettings)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load settings"));
  }, []);

  async function toggle(key: keyof PlatformSettings, value: boolean) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaving(true);
    try {
      setSettings(await adminSettingsApi.update({ [key]: value }));
      toast.success("Saved");
    } catch (error) {
      setSettings(settings);
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your account, and site-wide toggles that apply across both {mainWebsiteHost} and this
          store at once.
        </p>
      </div>

      {/* Your own account, not a site-wide toggle — hence its own card above
          the platform settings rather than mixed in among them. Deliberately
          outside the `settings` loading gate: locking yourself out of a
          password change because an unrelated request failed would be the
          worst possible moment for this card to be missing. */}
      <ChangePasswordCard />

      {!settings ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Email visibility</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.showSpamFolderNote}
              disabled={saving}
              onCheckedChange={(checked: boolean) => void toggle("showSpamFolderNote", checked)}
            />
            <Label className="text-sm font-medium">Show the &ldquo;check your spam folder&rdquo; note</Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown wherever a verification email or Google sign-in is offered — sign up, sign in, and
            registering for a live session — on both {mainWebsiteHost} and this store. Off hides it everywhere at once.
          </p>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
