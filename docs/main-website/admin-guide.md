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
| Let students hide their name | Adds "Hide my name from the JSMF team". Their reply still counts once, but nothing in admin shows who wrote it |
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

---

## Keeping this guide current

When a feature changes how an admin does something, update the matching task here
in the same change. Put reasoning, data model and API in the main website doc, and
keep this guide to steps a person follows. Link between the two, don't copy.
