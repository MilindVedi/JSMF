import { JsmfApp, LegalDocumentType } from '@prisma/client';
import type { LegalSection } from './legal-document';

/**
 * Version 1.0 of each document, published once on first boot when a type has
 * no version at all (LegalSeedService). After that the admin panel owns the
 * text and this file is never read again — editing it changes nothing.
 *
 * Merged from the pages each app hardcoded before: the shared parts once, the
 * live-session parts for jsmf.me, the plan and practice parts for PYQs.
 */
const S = (id: string, heading: string, body: string, apps: JsmfApp[] = []): LegalSection => ({
  id,
  heading,
  body,
  apps,
});

const CONTACT = '[support@jsmf.me](mailto:support@jsmf.me)';

export const INITIAL_DOCUMENTS: Record<LegalDocumentType, { title: string; sections: LegalSection[] }> = {
  TERMS: {
    title: 'Terms of Service',
    sections: [
      S(
        'about',
        'About JSMF',
        `Jab Studies Met Fun (JSMF) is a medical learning and exam preparation platform designed to support students preparing for examinations such as NEET-PG, FMGE, and INI-CET.

JSMF may offer question practice, memory-based previous-year questions (PYQs), explanations, revision tools, study materials, and other educational features.

By accessing or using JSMF, or by creating an account, you agree to these Terms of Service.`,
      ),
      S(
        'account',
        'Account and Acceptable Use',
        `You must provide accurate information when creating an account and keep your login credentials secure.

Your account and access to JSMF are intended for your personal educational use. You must not:

- Share your account with others or allow unauthorized access.
- Copy, redistribute, publish, sell, or commercially exploit JSMF content without permission.
- Attempt to bypass access restrictions, interfere with the platform, or misuse its services.
- Use the platform for unlawful purposes or in ways that infringe the rights of others.`,
      ),
      S(
        'payments',
        'Subscriptions and Payments',
        `Certain features, products, or educational materials may require payment or a subscription.

The applicable price, features, duration, and other conditions will be displayed before purchase. Access to paid features is subject to successful payment and the applicable purchase terms.

Plans are one-time payments for a fixed access period and do not renew automatically. You are not charged again unless you choose to make a new purchase.

Payments, refunds, cancellations, and applicable purchase conditions are governed by the relevant purchase terms and JSMF's [Refund and Cancellation Policy](/refund-policy).`,
      ),
      S(
        'live-sessions',
        'Live Sessions',
        `- Registration for a live session is confirmed only after successful payment.
- Live-session registrations are personal and non-transferable unless otherwise permitted by JSMF.
- Participants are responsible for joining the session at the communicated date and time.
- Session recordings and study materials are provided for personal use only and must not be copied, recorded, uploaded, redistributed, or resold without permission.
- Recording or redistributing a session without permission is prohibited.
- JSMF does not guarantee any specific examination question, topic, score, rank, qualification, or result.`,
      ),
      S(
        'accuracy',
        'Educational Content and Accuracy',
        `JSMF provides educational content for medical learning and examination preparation. Questions described as previous-year questions may include memory-based or recall-based material rather than official examination papers.

We aim to provide useful and accurate questions, explanations, and learning resources, but we do not guarantee that all content will be error-free, complete, or up to date.

No particular question, topic, score, rank, qualification, or examination result is guaranteed. Your results depend on various factors, including your preparation and performance.

JSMF is an independent educational platform and is not affiliated with, endorsed by, or officially associated with NBEMS, AIIMS, or any examination-conducting body.`,
      ),
      S(
        'ip',
        'Intellectual Property and Content Restrictions',
        `JSMF's original platform design, branding, and content are protected by applicable intellectual property laws.

You may use the content made available to you only as permitted by JSMF and applicable law. You must not reproduce, distribute, upload, resell, or otherwise exploit JSMF content without authorization.

Content belonging to third parties remains subject to the rights and terms of its respective owners.`,
      ),
      S(
        'availability',
        'Availability and Changes to the Platform',
        `We may add, modify, suspend, or discontinue features, educational materials, or parts of the platform from time to time.

We aim to maintain reliable access to JSMF but do not guarantee uninterrupted or error-free availability. Maintenance, technical issues, or circumstances beyond our reasonable control may temporarily affect access.`,
      ),
      S(
        'changes',
        'Changes to These Terms',
        `We may update these Terms of Service from time to time. The revised version will be published on this page with an updated revision date.

Where required by applicable law, we will provide notice of material changes. Continued use of JSMF after revised terms take effect constitutes acceptance where permitted by law.`,
      ),
      S('contact', 'Contact', `For questions or concerns regarding these Terms of Service, contact us at ${CONTACT}.`),
    ],
  },

  PRIVACY: {
    title: 'Privacy Policy',
    sections: [
      S(
        'collect',
        'Information We Collect',
        'Jab Studies Met Fun (JSMF) collects information such as your name, email address, mobile number, account details, and purchase information to provide our services.',
      ),
      S(
        'collect-pyq',
        'Your Practice Data',
        'When you practise on JSMF, we also record your target exam, practice sessions, answers, bookmarks, and collections so your progress can be tracked and shown back to you.',
        [JsmfApp.PYQ],
      ),
      S(
        'use',
        'How We Use It',
        `We use this information to:

- Create and manage your account
- Process purchases and provide digital resources
- Register you for sessions
- Send important account, payment, and session-related communications
- Provide customer support and improve our services

We do not sell your personal data to third parties.`,
      ),
      S(
        'agreements',
        'Records of Your Agreement',
        'When you accept or acknowledge our Terms of Service or policies, we record which version you accepted, when, and the IP address and browser used, as a record of that agreement.',
      ),
      S(
        'third-parties',
        'Payments and Third-Party Services',
        `Payments are processed through third-party payment providers such as Razorpay. JSMF does not store your complete card, UPI, or banking credentials.

We may use third-party services for authentication, email, payments, cloud storage, analytics, and communication.`,
      ),
      S(
        'retention',
        'Security and Retention',
        `We take reasonable measures to protect your information and retain it only as necessary for providing our services and complying with applicable requirements.

You can request deletion of your account and associated data at any time by contacting us.`,
      ),
      S('contact', 'Contact', `For privacy-related questions, contact ${CONTACT}.`),
    ],
  },

  REFUND: {
    title: 'Refund & Cancellation Policy',
    sections: [
      S(
        'digital',
        'Digital Products',
        'JSMF (Jab Studies Met Fun) products are digital. Due to the digital nature of our products, purchases are generally non-refundable once access has been provided.',
      ),
      S(
        'pyq-plans',
        'PYQ Plans',
        `JSMF PYQ plans are one-time payments for a fixed access period, shown on the Pricing page before you pay. They do not renew automatically and you are never charged again without making a new purchase.

Buying the same plan again before it ends extends your access from the current expiry date, so no paid-for days are lost.

As there is no automatic renewal, there is nothing to cancel: your access simply ends on the expiry date unless you choose to buy again.`,
        [JsmfApp.PYQ],
      ),
      S(
        'live-sessions',
        'Live Sessions',
        `- If JSMF cancels a session and does not provide a suitable alternative, registered participants will be eligible for a refund.
- If a session is rescheduled, participants may attend the rescheduled session or receive a refund where applicable.
- Participant non-attendance generally does not qualify for a refund.`,
        [JsmfApp.MAIN],
      ),
      S(
        'problems',
        'Payment Problems',
        `If you are charged but cannot access what you purchased, or you are charged more than once for the same purchase, contact us and we will investigate the issue.

Approved refunds are processed to the original payment method.`,
      ),
      S('contact', 'Contact', `For refund or payment questions, contact us at ${CONTACT}.`),
    ],
  },
};
