import { describe, expect, it } from 'vitest';
import { OfflinePaymentMethod } from '@prisma/client';
import { MAX_OFFLINE_SALE_ROWS, parseOfflineSaleRows } from './offline-sale-rows';

const NOW = new Date('2026-10-16T12:00:00Z');

const valid = {
  name: ' Riya Sharma ',
  email: 'Riya@Example.COM',
  whatsappNumber: '+919876543210',
  amountPaidMinor: 129900,
  discountMinor: '20000',
  method: 'UPI_DIRECT',
  reference: 'UTR123',
  note: 'Paid on WhatsApp',
  paidAt: '2026-10-10T14:30:00+05:30',
};

const fieldsOf = (raw: unknown) => parseOfflineSaleRows(raw, NOW).errors.map((e) => e.field);

describe('parseOfflineSaleRows', () => {
  it('reads a complete row into its checked shape', () => {
    const { rows, errors } = parseOfflineSaleRows([valid], NOW);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        index: 0,
        name: 'Riya Sharma',
        email: 'riya@example.com',
        whatsappNumber: '919876543210',
        amountPaidMinor: 129900n,
        discountMinor: 20000n,
        method: OfflinePaymentMethod.UPI_DIRECT,
        reference: 'UTR123',
        note: 'Paid on WhatsApp',
        paidAt: new Date('2026-10-10T09:00:00Z'),
        details: {},
      },
    ]);
  });

  it("accepts the first script's field names, and a bare 10-digit Indian mobile", () => {
    const { rows, errors } = parseOfflineSaleRows(
      [
        {
          name: 'Aman',
          email: 'aman@example.com',
          whatsappNumber: '9123456780',
          amountMinor: 149900,
          paidVia: 'razorpay-payment-page',
          razorpayPaymentId: 'pay_ABC123',
          paidAt: '2026-10-09T21:40:00+05:30',
        },
      ],
      NOW,
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      whatsappNumber: '919123456780',
      amountPaidMinor: 149900n,
      discountMinor: 0n,
      method: OfflinePaymentMethod.RAZORPAY_PAYMENT_PAGE,
      reference: 'pay_ABC123',
    });
  });

  it('passes fields it does not know to the product type as details', () => {
    const { rows } = parseOfflineSaleRows(
      [{ ...valid, exam: 'FMGE', details: { stage: 'Intern' } }],
      NOW,
    );
    expect(rows[0].details).toEqual({ exam: 'FMGE', stage: 'Intern' });
  });

  it('requires a time and a timezone on the payment date, and refuses the future', () => {
    expect(fieldsOf([{ ...valid, paidAt: '2026-10-10' }])).toEqual(['paidAt']);
    expect(fieldsOf([{ ...valid, paidAt: '2026-10-10T14:30:00' }])).toEqual(['paidAt']);
    expect(fieldsOf([{ ...valid, paidAt: '2026-10-20T10:00:00+05:30' }])).toEqual(['paidAt']);
    expect(fieldsOf([{ ...valid, paidAt: undefined }])).toEqual(['paidAt']);
    expect(fieldsOf([{ ...valid, paidAt: '2026-10-10T09:00:00Z' }])).toEqual([]);
  });

  it('wants whole paise, never rupees with decimals or negatives', () => {
    expect(fieldsOf([{ ...valid, amountPaidMinor: 1299.5 }])).toEqual(['amountPaidMinor']);
    expect(fieldsOf([{ ...valid, amountPaidMinor: -1 }])).toEqual(['amountPaidMinor']);
    expect(fieldsOf([{ ...valid, amountPaidMinor: '₹1,299' }])).toEqual(['amountPaidMinor']);
    expect(fieldsOf([{ ...valid, amountPaidMinor: undefined }])).toEqual(['amountPaidMinor']);
    expect(fieldsOf([{ ...valid, discountMinor: 'ten' }])).toEqual(['discountMinor']);
    expect(fieldsOf([{ ...valid, amountPaidMinor: 0, discountMinor: 149900 }])).toEqual([]);
  });

  it('checks the method, and the Razorpay payment id when it is a Payment Page sale', () => {
    expect(fieldsOf([{ ...valid, method: 'paytm' }])).toEqual(['method']);
    expect(fieldsOf([{ ...valid, method: undefined }])).toEqual(['method']);
    expect(fieldsOf([{ ...valid, method: 'RAZORPAY_PAYMENT_PAGE', reference: 'UTR123' }])).toEqual(['reference']);
    expect(fieldsOf([{ ...valid, method: 'bank-transfer', reference: 'CHQ 0042' }])).toEqual([]);
  });

  it('reports every mistake at once, against the row it is on', () => {
    const { rows, errors } = parseOfflineSaleRows(
      [valid, { ...valid, email: 'riya@example.com', whatsappNumber: '12345' }, { name: '' }],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(errors.filter((e) => e.index === 1).map((e) => e.field).sort()).toEqual(['email', 'whatsappNumber']);
    expect(errors.filter((e) => e.index === 2).map((e) => e.field)).toEqual(
      expect.arrayContaining(['name', 'email', 'amountPaidMinor', 'method', 'paidAt']),
    );
  });

  it('refuses the same Razorpay payment twice in one list', () => {
    const page = { ...valid, method: 'RAZORPAY_PAYMENT_PAGE', reference: 'pay_X1' };
    expect(fieldsOf([page, { ...page, email: 'other@example.com' }])).toEqual(['reference']);
  });

  it('wants a list of at least one and at most the limit', () => {
    expect(fieldsOf({ buyers: [] })).toEqual(['file']);
    expect(fieldsOf([])).toEqual(['file']);
    expect(fieldsOf(Array.from({ length: MAX_OFFLINE_SALE_ROWS + 1 }, () => valid))).toEqual(['file']);
    expect(fieldsOf(['not an object'])).toEqual(['row']);
  });
});
