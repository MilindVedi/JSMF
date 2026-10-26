"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/admin/change-password-card";
import { MentorPortraitCard } from "@/components/admin/mentor-portrait-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminSettingsApi, type AdminPlatformSettings } from "@/lib/api/settings";
import { mainWebsiteHost } from "@/lib/site-content";

/** Site-wide toggles that apply across the main website and the PDF store at once. */
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminPlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminSettingsApi
      .get()
      .then(setSettings)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load settings"));
  }, []);

  async function toggle(
    key: "showSpamFolderNote" | "downloadsEnabled" | "medPrepLinkEnabled" | "medPrepLinkHighlight",
    value: boolean,
  ) {
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
      <>
      <MentorPortraitCard settings={settings} onSaved={setSettings} />
      <Card>
        <CardHeader>
          <CardTitle>Email visibility</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="show-spam-folder-note"
              checked={settings.showSpamFolderNote}
              disabled={saving}
              onCheckedChange={(checked: boolean) => void toggle("showSpamFolderNote", checked)}
            />
            <Label htmlFor="show-spam-folder-note" className="text-sm font-medium">
              Show the &ldquo;check your spam folder&rdquo; note
            </Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown wherever a verification email or Google sign-in is offered — sign up, sign in, and
            registering for a live session — on both {mainWebsiteHost} and this store. Off hides it everywhere at once.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Store downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="downloads-enabled"
              checked={settings.downloadsEnabled}
              disabled={saving}
              onCheckedChange={(checked: boolean) => void toggle("downloadsEnabled", checked)}
            />
            <Label htmlFor="downloads-enabled" className="text-sm font-medium">Let buyers download PDFs</Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Everyone can always read what they have in the browser reader. Off removes the Download
            buttons and refuses downloads, so the store becomes read-only — the way the mobile apps
            will work. A product can override this either way from its own page.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Med Prep link</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="med-prep-link-enabled"
              checked={settings.medPrepLinkEnabled}
              disabled={saving}
              onCheckedChange={(checked: boolean) => void toggle("medPrepLinkEnabled", checked)}
            />
            <Label htmlFor="med-prep-link-enabled" className="text-sm font-medium">
              Show the &ldquo;Med Prep&rdquo; link in the header
            </Label>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A link to the question-practice site, in the header of both {mainWebsiteHost} and this
            store. Off removes it from both at once — so it can go the moment that site has a
            problem, without waiting for a deploy.
          </p>

          {/* Indented under the switch it depends on, and disabled while that
              one is off, so it never looks like a setting that is doing
              nothing. The server ignores it in that state too. */}
          <div className="mt-4 border-l-2 border-border pl-4">
            <div className="flex items-center gap-3">
              <Switch
                id="med-prep-link-highlight"
                checked={settings.medPrepLinkHighlight}
                disabled={saving || !settings.medPrepLinkEnabled}
                onCheckedChange={(checked: boolean) => void toggle("medPrepLinkHighlight", checked)}
              />
              <Label htmlFor="med-prep-link-highlight" className="text-sm font-medium">Mark it as new</Label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Gives the link a &ldquo;New&rdquo; badge, a faint brand tint and a slow pulse, so
              people who already know the header notice something was added. Turn it off once it
              has stopped being news — the link stays. Has no effect while the link is hidden.
            </p>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
