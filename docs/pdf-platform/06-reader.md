# The reader

Built 2026-10-25. Buyers read their PDFs in the browser at `/read/{productId}`
on the store, and anyone can read a product's sample at
`/read/{productId}?sample=1`. Downloading stays available until the mobile
apps ship, behind an admin switch.

The long-term aim is a Kindle-like reader across the web and the apps. This
first release is the reading core plus reading position across devices. The
seams below are where the next pieces go.

## What a reader gets

- **One page at a time, turned sideways** (the default, as on Kindle), or one
  continuous scroll; the reader picks with the layout button in the top bar
  and it is remembered in the browser. One page at a time:
  - **computer:** the whole page fits the screen; turn with the arrows either
    side, ← / →, Space, or the wheel / a sideways trackpad swipe (one flick is
    one page);
  - **phone:** the page fits the width (a whole A4 page would be too small to
    read), so you scroll down within it; swipe sideways or tap near the left or
    right edge to turn; a tap in the middle does nothing;
  - zoomed in, scrolling and dragging move around the page, and only a push
    past its edge turns it. The wheel works per gesture, not per event: a
    flick and its glide turn at most one page, and only if the gesture
    started at the page's edge (a glide that reaches the bottom stops there).
    Going back by wheel or ↑ lands on the bottom of the previous page;
  - a held key turns one page, not the book; Space and the arrows are left to
    a focused button, the tabs and the side panel; a mouse click on a reader
    button leaves the keyboard on the pages;
  - a turning tap never clicks what the new page has under the finger;
    swipes from the screen's very edge are left to the phone (iOS "back"),
    and a sideways trackpad swipe never becomes the browser's "back";
  - the side arrows are on phones too, for screen readers only;
  - the new page slides in a little from the side it came from (off with
    "reduce motion").
- Only the pages near the screen are drawn, with selectable text and working
  links inside the PDF.
- A page box (type a number), arrow keys / Page Up / Page Down / Home / End
  (left and right pan instead once zoomed past the screen), and zoom: − / + /
  fit to width, pinch on a phone, Ctrl + wheel or a trackpad pinch on a
  computer. Fit to width re-fits when the panel opens or the phone turns.
- Search inside the PDF (Ctrl/⌘ + F): every match is highlighted, with a
  count, and Enter / Shift + Enter for the next and previous match.
- A side panel with page pictures, and the PDF's own table of contents when
  it has one. It opens on the contents when there are any, and keeps the tab
  the reader picks. Pictures are drawn one at a time and kept as small images,
  so a 400-page strip stays light on a phone.
- Light, sepia and dark pages, remembered in the browser; until a reader
  picks, pages follow the site's light or dark theme. The controls take the
  page colour (the store's own light and dark tokens, warmed for sepia),
  whatever the site's theme — `globals.css`, "The reader".
- Full screen, and a thin progress bar along the bottom.
- **Reopens where you left off.** Signed in, the place is kept on the
  account, so another device opens at the same page. Without an account it
  is kept in that browser. The last save on closing the tab is sent with
  `keepalive`, and Back waits for it, so the library shows the right page.
- A **Download** button, only where downloads are allowed.

- A shared sample link (no `back`) leads back to the product page. A `back`
  that would leave the site (`/\evil.com`, `//evil.com`) is ignored.

In the store:

- **My Library:** each PDF shows **Read** (or **Continue reading** once
  started), "Page 30 of 40" with a bar, and **Download** only where allowed.
  A **Continue reading** shelf shows the last three things being read,
  including PDFs inside bundles.
- **Product page:** owners and free items get **Read now** (plus Download
  where allowed). Everyone else gets **Read a sample** when the product has
  one.

## How it fits together

```
 pdf-web                                         backend
 ───────                                         ───────
 app/read/[id]/page.tsx  (route, session)
   └ components/reader/reader.tsx  (UI only)
       ├ ReaderEngine  ◄── components/reader/pdf-engine.ts   (the only pdf.js import)
       │     └ SignedRangeLoader (lib/reader)  ── Range GET ──►  storage (GCS)
       ├ ReaderSource  (lib/reader/sources.ts) ── GET /products/:id/read|sample ──► ContentAccessService
       └ ProgressStore (lib/reader/progress.ts) ── GET/PUT /me/reading/:id ──► ReadingProgressService
```

Each arrow is an interface in `pdf-web/src/lib/reader/types.ts`, so each piece
can be replaced on its own:

| Seam | Today | Can become |
|---|---|---|
| `ReaderEngine` | pdf.js 5.7 (`PDFViewer`, `PDFFindController`) | another engine, or EPUB later |
| `ReaderSource` | the API's read / sample routes | an offline copy in the apps |
| `ProgressStore` | the account (signed in) or the browser | a sync queue in the apps |

The backend side is the same for the apps: `GET /products/:id/read`,
`GET /products/:id/sample`, and `GET/PUT /me/reading/:productId`.

### One access rule for everything

`ContentAccessService.grant({ purpose })`
(`backend/src/modules/entitlements/application/content-access.service.ts`)
replaced `DownloadService`. It is the only place that decides who gets which
file:

| Purpose | Who | File | Link |
|---|---|---|---|
| `DOWNLOAD` | owners, or anyone for a free item in the store, **and** downloads allowed | the PDF (or an attachment) | `attachment` |
| `READ` | owners, or anyone for a free item in the store | the PDF | `inline` |
| `SAMPLE` | anyone, for a product in the store | the sample file | `inline` |

Every first link is logged in `content_access_events` with its `purpose`.

The download switch covers the PDF itself (`PRIMARY_FILE`). Extras the
reader cannot open (attachments: a zip, images) stay downloadable.

The routes are public, so an expired sign-in there counts as a visitor, not a
401. The reader refreshes a stale sign-in before asking
(`ensureFreshAccessToken` in `lib/api/client.ts`). Otherwise a signed-in owner
would be served as a visitor, without their saved page.

### Why the file is fetched piece by piece, and how the link stays valid

The reader asks storage for byte ranges (256 KB pieces) as pages come into
view, straight from Google Cloud Storage through signed links. Our server never
carries the file. That makes opening a large PDF fast, and nobody pays to
download pages they never read.

Signed links last 5 minutes (`STORAGE_SIGNED_URL_TTL_SECONDS`), but people read
for an hour. `SignedRangeLoader` (`pdf-web/src/lib/reader/signed-range-loader.ts`)
asks for a fresh link 20 seconds before expiry, or when storage refuses an
expired one, with `?renew=true`.

- **Timing:** renewals are timed by `expiresInSeconds` from the API, not the
  device clock, so a phone whose clock is off neither renews on every piece
  nor misses the expiry.
- **Checks and logging:** a renewal is checked exactly like the first request,
  so access revoked mid-read ends the session. It is logged only if this reader
  was not logged for this file within the hour, because `renew` is the
  client's word.
- **Bad connections:** a piece that fails on the network or with a storage
  5xx is tried three more times (0.5 s, 1.5 s, 4 s) before the reader shows
  **Try again**. A failed early renewal is ignored while the current link
  still works.
- **A replaced file:** the reader says so and **Reopen** opens the new version
  in place, rather than mixing pieces of two files.

Closing the reader tears pdf.js down fully: the viewer's listeners (one
`AbortSignal`), the pages' text layers (`setDocument(null)`), the worker. An
open still in progress is cancelled too.

The engine uses pdf.js's **legacy** build. The modern build needs browser
features from 2024 and fails on iPhones a year or two behind (iOS 17, 18.0–18.3).

### Samples: cut, never hidden

A sample is its own short file (`product_assets` kind `SAMPLE_PREVIEW`). It is
never the full PDF with pages hidden: the reader would then hold the whole
book, one save away.

Admins make it either way, on the product's **Files** tab:

- **Cut from the PDF:** "First N pages". The server copies those pages into a
  new file (`ProductSampleService`, using `pdf-lib`) and records which version
  of the PDF it came from (`derived_from_asset_id`).
  - When the PDF is replaced, the sample is cut again from the new one. This
    happens through `ProductAssetService.onCurrentChanged`, so the upload code
    knows nothing about samples.
  - Restoring an old cut sample re-cuts it from the current PDF.
  - If the new PDF is too short or unreadable, the old sample stays and the
    card says it is out of date.
  - N must be less than the PDF's page count.
  - **Nothing from later pages travels with the cut.** Copying a page copies
    everything it references, and a page can reference later pages: a
    table-of-contents link, a form field, an article thread, a page action.
    These are stripped first; only links to websites survive. Then the cut is
    checked: if the new file holds any page object beyond its N pages, it is
    refused (`withoutWayOut` in `ProductSampleService`).
  - **Refused, with an "upload a sample instead":**
    - password-protected PDFs (pdf-lib cannot decrypt them);
    - PDFs over `SAMPLE_CUT_MAX_MB` (50). A cut holds the whole file in
      memory at several times its size, on a 512 MiB instance.
  - **Concurrency:** writes to one product's files take turns
    (`ProductAssetService.lockFiles`, a row lock on the product). An automatic
    re-cut that finds the ground moved — a newer PDF, or the sample removed
    or re-cut by hand meanwhile — stands down instead of overwriting it.
    Before this, two uploads at once could collide on the unique index with a
    500.
- **Upload a sample PDF:** for samples that are not simply the first pages.
  This stops the automatic cutting.

### The download switch

- **Store-wide:** Admin → Settings → **Store downloads**
  (`platform_settings.downloads_enabled`, on by default).
- **Per product:** Details → **Downloads** (`products.download_policy`).
  `INHERIT` follows the store setting; `ALLOWED` or `BLOCKED` override it.

Reading is never affected. When downloads are off, the API refuses them (403)
and every Download button disappears.

## Limits to be honest about

- **A web reader cannot stop copying.** The pages are drawn in the browser, so
  the file reaches the browser. Turning downloads off makes copying
  inconvenient, not impossible. The realistic web deterrent is a per-buyer
  watermark (name or email on each page). Real protection needs the apps,
  which can store files encrypted on the device.
- **Fonts and character maps** that a few PDFs need (non-embedded standard
  fonts, Asian scripts) load from jsDelivr, pinned to the same pdf.js version
  (`PDFJS_ASSETS` in `pdf-engine.ts`). Most PDFs embed their fonts and never
  ask. Self-hosting them is a small follow-up.
- **The production bucket needs GET in its CORS rule** before the reader works
  there. See `05-storage.md` "Bucket CORS rule".
- **Cutting a sample blocks that API instance while it parses the PDF**, for a
  second or two on a large file. It is a rare admin action and the size limit
  bounds it. If samples are ever cut often, move the cut to a worker thread or
  a background job.
- **Position saves are last-write-wins.** A stale save from a device that was
  offline can move someone back. Fine on the web. The apps' offline sync will
  need a client timestamp.

## Next, on these foundations

1. **Bookmarks, highlights and notes.** A `reader_annotations` table (page,
   a text-quote anchor, colour, note, the asset version), a notes panel, and
   export. pdf.js's text layer already gives the text positions.
2. **Per-buyer watermark** on the pages (drawn over the canvas, or stamped
   into a per-buyer copy).
3. **Reading time and streaks**, from position saves.
4. **The apps:** the same three API routes, plus encrypted offline copies.
   Turn store downloads off once they ship.
