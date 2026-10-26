# Running a live session: the admin guide

How to do each job, step by step, from the admin panel at
**resources.jsmf.me/admin/sessions**. For why things work the way they do, and
for the data model and API, see the [main website doc](./README.md). Each task
below names the section to read.

Who can do what: admins and educators can do everything on a session's page,
except **money** (buyers added by hand) and **deleting a feedback reply**, which
are admin only.

---

## The session page

Open **Sessions → a session**. Only the session's own form loads at first.
Everything below it is a **collapsible section**: closed, it loads nothing; click
it to open and it fetches its data then. Closing it again unloads it, so opening
it later shows fresh numbers. Which sections you leave open is remembered in your
browser.

| Section | Use it to |
| :--- | :--- |
| Registrations | See who registered and who has paid |
| Buyers added by hand | Add people who paid outside the website (admin only) |
| Session details sent | Send dates, the joining link, the Telegram link |
| Day materials | Give each day's PDFs to seat holders |
| Testimonials | Screenshots from a past session |
| Feedback forms | Collect feedback on the website after each day |
| Feedback sections | The "What students said after Day 1" blocks on the website |
| Included material | Only for sessions that hold their included PDF back |

---

## Before the session

### Create and publish a session
1. **Sessions → New**. Fill in the title, price, days (date, time, length),
   platform text and "what you'll learn".
2. **Title** is what the booking card on the website shows; reword it as often as you
   like. **Short name** (optional) is the session's steady name, such as "NEET-PG
   Revision Bootcamp". It is used in every email (confirmation, reminders, session
   details, PDFs, feedback, refunds) and in students' libraries. Leave it blank and the title is
   used there too. A change applies to emails sent from then on; ones already sent keep
   the old name.
3. Leave the days empty if the dates are not fixed yet. The website shows
   "To be announced" and registration stays open.
4. **Publish** when ready. It appears on jsmf.me. **Unpublish** hides it.
   **Archive** removes it from the website; paid seats stay valid and refundable.

### Sell seats after Day 1 has started
Turn on **Keep selling after the session has started** in the session form. It
stays on sale until the last day ends, then closes by itself. Lower the price
yourself as the days pass. See [§3c-bis](./README.md#3c-bis-selling-a-session-that-has-already-started).

### Send the dates, joining link or Telegram link
Saving these fields emails nobody. Open **Session details sent**.
1. The table shows, per person and per detail, whether they are up to date,
   never sent, or have an older value.
2. **Send everything outstanding** emails each person only what they still need.
   **Send to selected**, or the **Send** button on a row, does the same for
   chosen people.
3. Pressing it twice is safe: people who are up to date get nothing.

See [§3d](./README.md#3d-session-details-dates-joining-link-telegram-group).

### Add buyers who paid outside the website (admin only)
**Buyers added by hand → Add buyers**. Details in
[docs/offline-sales](../offline-sales/README.md).

---

## During the session

### Give each day its PDFs
1. Upload the PDF in **Products** like any store PDF. If it is only for seat
   holders, turn **Show in store** off in the product's Details step.
2. Open **Day materials**, find the day, click **Add a PDF** and pick it. A day can
   have as many PDFs as you like: the search stays open, so pick the next one, then
   click **Done**. The same PDF cannot be added twice to one day.
3. Seat holders have it in their library straight away. **No email is sent yet.**
4. When you want to tell them, press **Email everyone with new PDFs**. Each person
   gets one email listing only what is new to them.

Who gets earlier days' PDFs depends on **Late joiners get earlier days'
materials** in the session form (on by default).

To take a PDF back, click the bin next to it. Seat holders lose it (anyone who
bought it keeps it). A refund of a seat takes its PDFs back too. A day that has
PDFs cannot be deleted from the dates until they are removed.
See [§3d-bis](./README.md#3d-bis-day-materials-pdfs-for-each-day-of-a-session).

### Give a day a bundle of PDFs
A PDF bundle (see "PDF bundles" below) can be picked in **Day materials** like a
single PDF. Seat holders get every PDF in it, always its current ones: adding one
to the bundle reaches them within 5 minutes, and removing one takes it back.

### Hold the "included with a seat" PDF back
If the PDF is not ready when seats go on sale, set the session's delivery mode to
send it after the session instead of at payment. The **Included material** card
then shows who has it and lets you send it. See [§3c](./README.md#3c-deferred-delivery-of-the-included-pdf).

---

## After each day: collect feedback

This replaces the Google Form. Students fill in a form on jsmf.me.

### 1. Create the form
1. Open **Feedback forms → New form**.
2. **Which class is it about?** Pick the day, or "the whole session".
3. **Start from** one of:
   - **Ready-made templates:** After a class (standard), Quick pulse (2 questions),
     Detailed class review, End of the whole session, Recommend score only.
   - **Copy a form from this session**, such as Day 1's for Day 2.
   - **Import from an earlier session.** Any form you built before.
4. **Create draft.** A draft cannot be opened by students and sends no email.

### 2. Check the questions
Open the form, then the **Questions** tab. Edit them like a Google Form: pick the
type (stars, 0–10 scale, short answer, paragraph, one choice, checkboxes), mark
required ones, reorder, add, remove. Press **Save questions**.

Once a question has answers, its type is fixed, and removing it keeps its answers
in the results (shown as "removed from the form").

### 3. Choose the settings
On the **Settings** tab:

| Setting | What it does |
| :--- | :--- |
| Emails | **Automatic** sends each attendee their link when the class ends. **Only when I send them** waits for you |
| Minutes after the class ends | Delay for the automatic email. 0 sends as the class ends. The clock runs every 5 minutes |
| Stop taking replies at | Optional closing time |
| Take feedback on the Telegram link without signing in | On by default for new forms (a copied form keeps its source's setting; forms made before this keep what they had). On: the Telegram link needs no sign-in. Off: it asks people to sign in with Google and checks their seat. The form there gets one extra question, **Your name** (required). Anyone with the link can reply, and nothing stops one person replying twice from two phones, so these replies are marked **Telegram link · not verified**. Emailed links and signed-in seat holders work as before |
| Let students hide their name | Adds "Hide my name from the JSMF team". Their reply still counts once, but nothing in admin shows who wrote it. Not offered on the no-sign-in Telegram link, where people type their own name |
| Ask whether to show their name | Off by default. On: asks "Show my first name if JSMF shares my feedback on its website". Their answer is shown to you as guidance; you decide |
| Ask "Can we show this on our website?" | Off by default. On: only replies whose author said yes can be put on the website |

You can also write a note shown above the questions and your own thank-you
message.

### 4. Open the form
Click **Open form**. Students can now fill it in. In automatic mode, everyone who
attended gets their email once the class ends.

If the class **ends early**, press **Email attendees now** at the top of the form.
It emails everyone not yet emailed. The automatic email later skips them, so
nobody gets it twice. This works in either email mode.

### 5. Share the link in Telegram
Click **Copy Telegram link** and paste it in the group. People who open it sign in
with Google; the system checks they hold a seat. The emailed personal link needs
no sign-in. A student can open either link again to change their reply until the
form closes.

With **Take feedback on the Telegram link without signing in** on, people on the
Telegram link type their name instead of signing in. Coming back on the same phone
and browser, they change their reply rather than sending a new one. On another
phone it is a new reply. These replies are not in the **Who's been asked** table
(they have no account); it shows how many there are, and they appear under
**Replies**.

> **Hostel/Campus Wi-Fi & Scaling the 300 Limit:**
> - **Replies are NOT grouped by IP address:** Each student's phone browser generates a unique local key (`editKey`) and asks for their name. Even if 50 students submit from the exact same hostel Wi-Fi, each student receives their own separate reply in the admin panel and they will not overwrite one another.
> - **The 300/hour IP rate limit (`FEEDBACK_OPEN_LINK_PER_HOUR`):** This limit acts purely as a spam/DDoS barrier to prevent automated scripts from flooding the database. It defaults to 300 submissions per hour per IP.
> - **Scaling for larger classes:** If you scale to 300+ or 500+ students where many attendees share a single campus/hostel network, raise `FEEDBACK_OPEN_LINK_PER_HOUR` in Cloud Run's backend environment variables (e.g. set it to `1000` or `1500`). Sizing rule: `(Expected students on shared Wi-Fi) * 3`. No code rebuild is required.
> - **If spam occurs:** You can turn off "Take feedback on the Telegram link without signing in" at any time to require Google sign-in, or delete unwanted replies with one click.

### 6. Chase replies
Open **Who's been asked**. For each attendee it shows when they were emailed,
whether they opened the link and whether they replied.
- **Email everyone not yet emailed** sends to the rest.
- **Remind everyone who hasn't replied** sends a softer second email to people who
  were emailed but haven't replied.
- A **Retry** button appears on a row whose email failed, with the reason.

Anyone who has already replied to that form is never emailed again for it. Who is
asked: people who held a seat by the time that class ended. Someone who joined
after Day 1 is not asked about Day 1.

### 7. Read the replies
Open **Replies**. At the top are the numbers per question (average for ratings,
counts for choices). Below are all the replies. **Download CSV** gives a
spreadsheet. A reply from a student who hid their name shows as "Anonymous", with
no name or email, in the page and the CSV.

### 8. Show good replies on the website
1. Open the session's **Feedback sections** card and add a section, such as "What
   students said after Day 1", tied to the day.
2. In **Replies**, choose that section on a reply and press **Show on website**.
3. Tick or untick **With their first name**. It starts from the student's answer
   (ticked when they were not asked).
4. The reply appears as a quote card in that section on the home page and
   `/prep-kit`, next to any screenshots. A reply from an anonymous student always
   shows as "A JSMF student".
5. The tag on the reply ("Show on website in …") has a cross to take it down.

Make sure your Privacy Policy says that feedback may be shown on the website.

### Close it
**Close form** stops replies. Results stay. **Reopen form** brings it back.
A form with replies cannot be deleted; one without can (Settings tab).

See [§3f](./README.md#3f-feedback-forms-in-place-of-google-forms).

---

## PDF bundles

Several store PDFs sold together at one price.

1. Upload each PDF in **Products** first, as usual.
2. **Products → New product → A bundle of PDFs.** Give it a title and the bundle's
   price (the struck-through price works as usual).
3. Open the **Contents & cover** tab, click **Add a PDF**, pick each one, and choose
   **Also sell it on its own** (on or off) before **Add to bundle**. Use the arrows
   to set the order. Changes here save at once.
4. Add a cover, then **Publish**. A bundle with no PDFs cannot be published.

**Each PDF is still its own product.** For each one you choose:

- **Also sell it on its own: on.** It stays in the store at its own price, and the
  bundle's page links to it ("Also sold on its own for ₹99"), so a student can buy
  just that one.
- **Off (only in bundles).** It is hidden from the store and can be had only
  through a bundle it is in. Put it in one bundle or several, as you like.

The switch starts at the PDF's current **Show in store** setting, and you can
change it later on the PDF's Details. The contents list shows each one as **Also
sold on its own** or **Only in bundles**. Anyone who already bought a PDF keeps it
either way.

**Someone who already has some of the PDFs** (bought alone, from another bundle,
or from a session) sees "You have this" beside them on the bundle's page and "You
already have 1 of these 3 PDFs, so you pay only for the other 2". They pay the
bundle price × paid PDFs they lack ÷ all paid PDFs, rounded to the rupee. **Free
PDFs don't count**: having one takes nothing off, so claiming a free PDF is not a
way to a cheaper bundle. Someone with all of them is told so and sent to their
library instead of paying.

**Everyone who has the bundle always has its current PDFs.** Add a PDF and they
all get it at once. Remove one and everyone who got it through the bundle loses
it from their library (copies already downloaded stay on their device); anyone
who bought it on its own keeps it.

In a buyer's library the bundle is one card; **Show N PDFs** opens it to download
each one. A refund of the bundle takes all its PDFs back.

## Reading in the browser, samples and downloads

Buyers read their PDFs in the store's reader (**Read** in My Library, **Read now** on the product page). It reopens where they left off, on any device. How it works: [docs/pdf-platform/06-reader.md](../pdf-platform/06-reader.md).

**Give a product a sample** (Products → the product → **Files** → **Sample**):

1. To show the first pages, type how many in **First … pages** and press **Cut sample**. It has to be fewer pages than the PDF. When you later replace the PDF, the sample is cut again by itself.
2. For a sample that is not the first pages, use **Or upload a sample PDF** and press **Save**. This stops the automatic cutting.
3. **Open** shows what visitors will see. **Remove** stops offering a sample.

The product page then shows **Read a sample** to anyone who does not have the product. If the card says the sample is out of date, the new PDF was too short to cut it from: cut it again with fewer pages.

Cutting does not work for every PDF. Upload a sample instead when the card says:

- **password-protected**: the PDF is locked, so its pages cannot be copied;
- **over 50 MB**: too large to cut on the server (the limit is `SAMPLE_CUT_MAX_MB`);
- **links its first pages to later ones in a way that cannot be cut safely**: cutting would have hidden later pages inside the sample.

A cut sample keeps links to websites but not links between pages (a clickable table of contents). Those links could carry later pages into the sample.

**Turn downloads off** (for example when the apps launch): Settings → **Store downloads** → off. People can still read everything; the Download buttons go away and the server refuses to download the PDF. Extra files that cannot be read in the reader (a zip, images) stay downloadable. To make one product different, open it → **Details** → **Downloads** → **Always allow downloads** or **Read only**, then **Save**. Turning downloads off makes taking a copy harder, not impossible: a reader still receives the pages to show them.

**Show or hide the Med Prep link**: Settings → **Med Prep link**. This is the link to the
question-practice site that sits in the header of both jsmf.me and the store. Turning it off
removes it from both at once, without waiting for a deploy — use that the moment that site has a
problem.

Underneath it, **Mark it as new** gives the link a "New" badge, a faint purple tint and a slow
pulse, so people who already know the header notice something was added. Turn that off once it has
stopped being news; the link itself stays. It has no effect while the link is hidden, and the
switch is greyed out then to say so.

## Refunds (admin only)

Open **Orders**, find the order (search by order number or email), click **Refund**.

1. **How:**
   - **Refund through Razorpay**: JSMF asks Razorpay to send the money back. Greyed
     out when the payment did not go through Razorpay (a direct UPI sale) or while
     the server's `REFUNDS_ENABLED` is off.
   - **I already refunded it myself**: you sent it by UPI, bank transfer or cash.
     Pick which, the date, and paste the UTR as the reference. Nothing goes to Razorpay.
2. **Amount:** starts at everything that is left. Type less for a partial refund.
   You can refund again later, up to what was paid. More than is left is refused.
3. **Revoke access:** on for a full refund, off for a partial one, but it is your
   choice either way. On takes away everything the order gave: the PDF, a session
   seat with its day materials, a booked 1:1 call. Off lets them keep it all.
4. **Email the buyer:** on by default. The email says how much, how and when, and
   whether they still have access. Turn it off if you have already told them.
5. **Reason:** for your records only; it is not emailed.

Under the order's status you see each refund ("₹50 by UPI · UTR…") and, once
refunded, **Access kept** or **Access removed**. A refunded order that still gives
access has a **Revoke access** button to take it away later. No money moves and
nobody is emailed.

A refund made in the **Razorpay dashboard** still works by itself: a partial one
marks the order partially refunded, and the one that completes the full amount
always takes access away.

## Screenshots of messages

For WhatsApp or Telegram screenshots, use **Testimonials** (the original
"previous session" gallery) or a **Feedback section** (named, per day). Add
images, reorder with the arrows, remove with the button. Hiding a section keeps
it; deleting one deletes its images. See [§3e](./README.md#3e-testimonials).

---

## The website around it

- **Home page, top:** with a session open it shows **Book Your Spot Now** and, under
  it, **Book a 1:1 session** (only once a 1:1 offering is published). With no
  session open, only the 1:1 button shows, and the dark "Next session coming
  soon" band shows **Get notified on Telegram**.
- **Dr. Angad's portrait:** set on **Settings**, in the card **Dr. Angad's
  portrait**. It applies to the photo at the top of the jsmf.me home page,
  /prep-kit, and the resources.jsmf.me home page, all at once.
  - **Look:** **Poster** (the default) is an arched photo with the AIR 925 and
    AIR 9 medals floating on its edges and the name in purple across the
    bottom. **Card** is the earlier look: the framed photo with Instagram,
    YouTube and Telegram on top and a white card below listing the
    achievements. It saves as soon as you pick.
  - **Photo:** **Upload a photo** replaces the one that comes with the
    websites; **Use the original photo** goes back to it. The photo must be:
    - tall, in a **3:4 shape** — ideally **1200 × 1600 px**, at least
      900 × 1200 px (a phone photo taken upright is already 3:4);
    - JPEG, PNG or WebP, up to 8 MB;
    - with the face in the upper half and a little space above the head (the
      top strip holds the "Your doctor. Your mentor." label), and nothing
      important in the bottom third (his name covers it on the poster).

    A photo of the wrong shape or too small is stopped before it is sent, with
    its size and what to change. The preview beside the button shows where the
    label and the name fall. Replacing a photo deletes the one uploaded before
    it; the original photo is never deleted.
- **How student replies are laid out:** set on **Sessions**, in the card **How
  student replies are laid out**, above the one below. It applies everywhere the
  website shows written replies — the band between sessions, and each session's
  own feedback sections — so the two never disagree. Screenshots always sit in a
  row that scrolls, whichever you pick.
  - **One row that scrolls sideways** (the default): two or three replies in
    view, the next one part way in, arrows on wider screens. However many you
    pick, the band stays the same height.
  - **A block over several lines:** two or three across, wrapping onto as many
    lines as it takes, with nothing to scroll. Every reply is on the page at
    once, so the band grows as you pick more.
  - **When someone presses "Read more" on a long reply** (a second choice in
    the same card):
    - **Open it in a pop-up** (the default): the whole reply opens over the
      page and scrolls on its own; the cards keep their size.
    - **Grow the card in place:** that card gets taller to show it all, with
      **Show less** to fold it back. The cards beside it grow too, so the
      names stay in one line; a very long reply makes the whole row tall.
- **Testimonials when no session is upcoming:** set on **Sessions**, in the card
  **When no session is upcoming**, below the list. On by default.
  - **Whose testimonials:** **Automatic** (the latest past session that has
    screenshots), one session you pick (its Testimonials screenshots, in their
    order), or **Hand-picked**.
  - **Hand-picked** shows only what you choose, from any sessions:
    - Under **Add from a session**, choose a session. Tick its screenshots (from
      any of its galleries), and pick one of its feedback forms to see the
      replies. **Add to the band** adds a reply, with or without the student's
      first name; anonymous replies show as "A JSMF student". Where the form
      asked "Can we show this on our website?", only replies that said yes can
      be added.
    - **Picked replies** and **Picked screenshots** list what is chosen. Use
      the arrows to reorder, the pencil to tidy a reply's text or name (what the
      student wrote is unchanged), and ✕ to take it out. The first reply is
      the featured card.
    - Picks are saved as you make them, but the website switches to them only
      when you press **Save** with Hand-picked chosen. Switching back to
      Automatic or one session keeps your picks for later.
    - On the website the replies show as quote cards in their own row, the
      first in deep purple, with the screenshots in a row below. Both rows
      scroll sideways: two cards at a time on most screens, one on a narrow
      phone, with the next card part way into view and arrow buttons on
      wider screens. A long reply shows five lines and a **Read more** link,
      which opens the whole reply in a pop-up that scrolls on its own. Any
      reply can be shown, however long (up to 5,000 characters, the most a
      student can write); you can still shorten it with the pencil.
    - If a student later withdraws consent, their reply leaves the band on its
      own; if they hide their name, the card stays as "A JSMF student".
  - **Heading:** pick **What students said after the last session.** or
    **Feedbacks from previous sessions.**, then edit the text if you like.
  - **Text under the heading:** editable. Left empty it reads "From a previous
    revision session. A few moments students shared afterward."
  - While a session is upcoming, its own testimonials show instead and this card
    has no effect. Off hides the band between sessions, as before.
- **Header:** Home, Live Session, About, Reserve a Seat, Book 1:1 and **JSMF
  Resources**, which opens resources.jsmf.me in a new tab. Below 1280px wide the
  header becomes the ☰ menu.

---

## When something looks wrong

| You see | Why, and what to do |
| :--- | :--- |
| A student says they got no feedback email | Check **Who's been asked**: no email address, a failed send (press **Retry**), or they joined after that class ended and are not asked. They can use the Telegram link only if they hold a seat |
| A student says "this form is for attendees" | The account they signed in with has no seat. They should open the personal link from their email, or sign in with the account they registered with |
| Nothing was emailed when the class ended | The form is still a draft, or in "Only when I send them" mode, or the delay has not passed. The sweep runs every 5 minutes. Production needs the Cloud Scheduler `session-reminders` job |
| A quote card shows "A JSMF student" | The student hid their name, or you unticked "With their first name" |
| Cannot remove a day from the session | A feedback form or PDF is attached to it. Move or delete that first |
| A PDF is not in someone's library | Open **Day materials**: the late-joiner setting may exclude earlier days for them |
| "Refund through Razorpay" is greyed out | The payment did not go through Razorpay, or `REFUNDS_ENABLED` is off. Refund it yourself and record it with **I already refunded it myself** |
| A refunded buyer still has the PDF or seat | The refund was recorded with Revoke access off. Use **Revoke access** on the order |
| A bundled PDF can't be found in the store | It was added with **Also sell it on its own** off. Turn **Show in store** on in its Details |
| A bundle shows a lower price to one student | They already have some of its PDFs; they pay only for the rest |

---

## Keeping this guide current

When a feature changes how an admin does something, update the matching task here
in the same change. Put reasoning, data model and API in the main website doc, and
keep this guide to steps a person follows. Link between the two, don't copy.
