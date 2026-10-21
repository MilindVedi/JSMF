import { describe, expect, it } from 'vitest';
import { matchesSignature } from './file-signature';

describe('matchesSignature', () => {
  it('accepts each supported type by its leading bytes', () => {
    expect(matchesSignature('application/pdf', Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(matchesSignature('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true);
    expect(matchesSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesSignature('image/webp', Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(true);
    expect(matchesSignature('application/zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
  });

  it('finds a PDF header a few bytes in, as the format allows', () => {
    expect(matchesSignature('application/pdf', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('%PDF-1.4')]))).toBe(true);
  });

  it('refuses a renamed file, an empty one, and an unknown type', () => {
    expect(matchesSignature('application/pdf', Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(matchesSignature('application/pdf', Buffer.alloc(0))).toBe(false);
    expect(matchesSignature('image/png', Buffer.from('%PDF-1.7'))).toBe(false);
    expect(matchesSignature('text/html', Buffer.from('<html>'))).toBe(false);
  });

  it('looks for a PDF header only in the first 1024 bytes', () => {
    expect(matchesSignature('application/pdf', Buffer.concat([Buffer.alloc(1024, 0x20), Buffer.from('%PDF-')]))).toBe(false);
  });
});
