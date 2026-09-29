import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/config.module';
import { WhatsAppBillingError, WhatsAppDeliveryError } from '../domain/whatsapp-provider.port';
import {
  classifyGraphError,
  libraryButtonSuffix,
  MetaWhatsAppAdapter,
  templateParameter,
} from './meta-whatsapp.adapter';

/**
 * The request is asserted field by field because Meta's authentication
 * template shape is unforgiving and non-obvious — the copy-code button must be
 * sent as `sub_type: "url"` with the code again — and a regression there fails
 * only in production, as a rejected message, at signup.
 */

const config = {
  get(key: string) {
    return (
      {
        WHATSAPP_ACCESS_TOKEN: 'token-abc',
        WHATSAPP_PHONE_NUMBER_ID: '1234567890',
        WHATSAPP_GRAPH_API_VERSION: 'v23.0',
        WHATSAPP_OTP_TEMPLATE_NAME: 'jsmf_verification_code',
        WHATSAPP_OTP_TEMPLATE_LANGUAGE: 'en',
        WHATSAPP_RECEIPT_TEMPLATE_NAME: 'jsmf_purchase_receipt',
        WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE: 'en',
      } as Record<string, string>
    )[key];
  },
} as unknown as AppConfig;

function respondWith(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Meta WhatsApp adapter', () => {
  it('sends an authentication template in the shape Meta requires', async () => {
    const fetchMock = respondWith(200, { messages: [{ id: 'wamid.X' }] });

    const result = await new MetaWhatsAppAdapter(config).send({
      to: '919876543210',
      message: { kind: 'authentication-code', code: '482913' },
    });

    expect(result).toEqual({ messageId: 'wamid.X', provider: 'meta' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '919876543210', type: 'template' });
    expect(body.template).toEqual({
      name: 'jsmf_verification_code',
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
      ],
    });
  });

  it('turns a Graph error into a delivery error with the hint', async () => {
    respondWith(400, { error: { code: 132001, message: 'Template name does not exist in the translation' } });

    const error = await new MetaWhatsAppAdapter(config)
      .send({ to: '919876543210', message: { kind: 'authentication-code', code: '1' } })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WhatsAppDeliveryError);
    expect((error as Error).message).toContain('check the name and language code');
  });

  it('reports a network failure as a delivery error, not a crash', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      new MetaWhatsAppAdapter(config).send({ to: '9198', message: { kind: 'authentication-code', code: '1' } }),
    ).rejects.toBeInstanceOf(WhatsAppDeliveryError);
  });
});

describe('Graph error classification', () => {
  it('treats a billing problem as not retryable', () => {
    // The one that must not become "try again shortly".
    expect(classifyGraphError({ code: 131042 }, 400, 'meta')).toBeInstanceOf(WhatsAppBillingError);
  });

  it.each([190, 131026, 131030, 130429, 132000])('treats %i as an ordinary failure', (code) => {
    expect(classifyGraphError({ code }, 400, 'meta')).toBeInstanceOf(WhatsAppDeliveryError);
  });

  it('survives an error body with nothing in it', () => {
    expect(classifyGraphError(undefined, 502, 'meta').message).toContain('HTTP 502');
  });
});

describe('purchase receipts', () => {
  it('sends the receipt template with its four parameters in order', async () => {
    const fetchMock = respondWith(200, { messages: [{ id: 'wamid.R' }] });

    await new MetaWhatsAppAdapter(config).send({
      to: '919876543210',
      message: {
        kind: 'purchase-receipt',
        buyerName: 'Ananya',
        items: 'Pathology Revision Notes',
        totalFormatted: '₹499',
        orderNumber: 'JSMF-2026-000123',
        libraryUrl: 'https://store.jsmf.me/library',
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

    // A different template from the OTP one: Meta prices and approves by
    // category, and an authentication template cannot carry a receipt.
    expect(body.template.name).toBe('jsmf_purchase_receipt');
    expect(body.template.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ananya' },
          { type: 'text', text: 'Pathology Revision Notes' },
          { type: 'text', text: '₹499' },
          { type: 'text', text: 'JSMF-2026-000123' },
        ],
      },
      // Only the tail of the URL: Meta fixes the domain when the template is
      // approved, so the button is configured as `https://store.jsmf.me/{{1}}`.
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'library' }],
      },
    ]);
  });

  it('fails clearly when no receipt template is configured', async () => {
    const withoutReceipt = {
      get: (key: string) => (key.startsWith('WHATSAPP_RECEIPT') ? undefined : config.get(key as never)),
    } as unknown as AppConfig;
    const fetchMock = respondWith(200, {});

    const error = await new MetaWhatsAppAdapter(withoutReceipt)
      .send({
        to: '919876543210',
        message: {
          kind: 'purchase-receipt',
          buyerName: 'A',
          items: 'B',
          totalFormatted: '₹1',
          orderNumber: 'C',
          libraryUrl: 'https://store.jsmf.me/library',
        },
      })
      .catch((cause: unknown) => cause);

    expect((error as Error).message).toContain('WHATSAPP_RECEIPT_TEMPLATE_NAME');
    // Named as configuration, not as a network problem — and nothing was sent.
    expect((error as Error).message).not.toContain('Could not reach');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Meta rejects the entire message — it does not trim — when a parameter holds a
 * newline, a tab, or four or more consecutive spaces. Product titles are
 * admin-entered text, so this is reachable from ordinary data entry, and the
 * cost is a receipt lost for a purchase that really happened.
 */
describe('template parameters', () => {
  it.each([
    ['Pathology\nRevision', 'Pathology Revision'],
    ['Pathology\tNotes', 'Pathology Notes'],
    ['Pathology    Notes', 'Pathology Notes'],
    ['  padded  ', 'padded'],
  ])('flattens %j', (input, expected) => {
    expect(templateParameter(input)).toBe(expected);
  });

  it('never returns an empty parameter', () => {
    // Meta refuses those too, and a placeholder beats a lost receipt.
    expect(templateParameter('   ')).toBe('—');
    expect(templateParameter('')).toBe('—');
  });

  it('marks a truncated value rather than passing it off as the real one', () => {
    const long = templateParameter('x'.repeat(2000));

    expect(long.length).toBeLessThanOrEqual(1021);
    expect(long.endsWith('…')).toBe(true);
  });
});

/**
 * The button carries only what follows the domain, because Meta fixes a
 * template button's domain at approval time. The corollary worth remembering:
 * the approved template's domain and `APP_PUBLIC_URL` are set in two different
 * places, and a mismatch misroutes buyers with no error anywhere.
 */
describe('library button', () => {
  it.each([
    ['https://store.jsmf.me/library', 'library'],
    ['https://store.jsmf.me/library?from=whatsapp', 'library?from=whatsapp'],
    ['http://localhost:3001/library', 'library'],
  ])('%s → %s', (url, expected) => {
    expect(libraryButtonSuffix(url)).toBe(expected);
  });

  it('falls back rather than throwing on a URL it cannot read', () => {
    // A receipt pointing somewhere sensible beats no receipt for a purchase
    // that really happened.
    expect(libraryButtonSuffix('not-a-url')).toBe('library');
    expect(libraryButtonSuffix('https://store.jsmf.me')).toBe('library');
  });
});
