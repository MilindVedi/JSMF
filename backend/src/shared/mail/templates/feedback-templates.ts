import { emailSignatureText } from './email-signature';
import {
  NOT_SPAM_NOTICE_TEXT,
  button,
  escapeHtml,
  layout,
  notSpamNoticeHtml,
  type RenderedMail,
} from './mail-templates';

/**
 * The feedback form email: a personal link that opens the form without
 * signing in. Kept apart from mail-templates.ts so the feedback module's mail
 * lives in one place, built from the same layout and button as every other
 * JSMF email.
 *
 * A reminder is the same email with softer wording: one button, one question,
 * nothing that reads like a chase.
 */
export function feedbackInvite(input: {
  attendeeName: string;
  sessionTitle: string;
  /** "Day 1", or null for a one-day session or a whole-session form. */
  dayLabel: string | null;
  formUrl: string;
  reminder: boolean;
  showNotSpamNotice?: boolean;
}): RenderedMail {
  const { attendeeName, sessionTitle, dayLabel, formUrl, reminder, showNotSpamNotice } = input;
  const what = dayLabel ? `${dayLabel} of ${sessionTitle}` : sessionTitle;

  const subject = reminder
    ? `JSMF - A minute for your ${dayLabel ? `${dayLabel} ` : ''}feedback?`
    : `JSMF - How was ${what}?`;

  const ask = reminder
    ? `If you have a minute, we would still love to hear how ${what} went for you.`
    : `Thank you for joining ${what}. How did it go? Your answers help Dr. Angad shape the next class.`;

  const text = [
    `Hi ${attendeeName},`,
    ``,
    ask,
    `It takes about a minute, and you do not need to sign in:`,
    ``,
    formUrl,
    ``,
    `This link is personal to you. You can open it again to change your answers.`,
    ``,
    ...(showNotSpamNotice ? [NOT_SPAM_NOTICE_TEXT, ``] : []),
    emailSignatureText(),
  ].join('\n');

  const html = layout(
    reminder ? 'A minute for your feedback?' : 'How was the class?',
    `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(attendeeName)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(ask)} It takes about a minute, and you do not need to sign in.</p>
    ${button(formUrl, 'Give feedback')}
    <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:#71717a;text-align:center;">If the button does not work, open this link:<br><span style="word-break:break-all;color:#3f3f46;">${escapeHtml(formUrl)}</span></p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#71717a;">This link is personal to you, so please do not forward it. You can open it again to change your answers.</p>
    ${showNotSpamNotice ? notSpamNoticeHtml() : ''}
    `,
  );

  return { subject, text, html };
}
