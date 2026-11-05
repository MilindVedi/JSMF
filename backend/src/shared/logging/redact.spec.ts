import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact';

/**
 * Two directions, both asserted: what must never reach a log is gone, and a
 * stack trace is still usable afterwards.
 */
describe('redactSecrets', () => {
  it('drops query strings and fragments, where codes and signatures live', () => {
    expect(redactSecrets('GET https://jsmf.me/auth/reset?code=123456&email=a@b.co failed')).toBe(
      'GET https://jsmf.me/auth/reset failed',
    );
    expect(redactSecrets('fetch /api/files/download?sig=abc#x')).toBe('fetch /api/files/download');
  });

  it('keeps line and column of a script URL in a stack frame', () => {
    const frame = '    at render (https://prep.jsmf.me/_next/static/chunks/0a1b2c3d4e5f6789.js?dpl=dpl_7Hq:1:2345)';
    expect(redactSecrets(frame)).toBe(
      '    at render (https://prep.jsmf.me/_next/static/chunks/0a1b2c3d4e5f6789.js:1:2345)',
    );
    const safari = 'render@https://prep.jsmf.me/_next/static/chunks/main.js:12:40';
    expect(redactSecrets(safari)).toBe(safari);
  });

  it('removes tokens and named secrets', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl';
    expect(redactSecrets(`token rejected: ${jwt}`)).toBe('token rejected: [jwt]');
    expect(redactSecrets('Authorization: Bearer abc.def-ghi_jkl')).not.toContain('abc.def');
    expect(redactSecrets('{"password":"hunter22","otp": "482913"}')).toBe('{"password":"[redacted]","otp": "[redacted]"}');
    expect(redactSecrets('refreshToken=r0t4t1ng&x=1')).toContain('[redacted]');
    expect(redactSecrets('key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')).toBe('key [hex]');
  });

  it('removes personal details someone typed', () => {
    expect(redactSecrets('no account for priya.s+1@gmail.com')).toBe('no account for [email]');
    expect(redactSecrets('OTP sent to +91 98765 43210')).not.toContain('98765');
    expect(redactSecrets('OTP sent to 9876543210')).toBe('OTP sent to [phone]');
    expect(redactSecrets('card 4111 1111 1111 1111 declined')).toBe('card [number] declined');
  });

  it('strips control characters but keeps newlines and tabs', () => {
    expect(redactSecrets('a\u001b[31mred\u0000\n\tb')).toBe('a[31mred\n\tb');
  });

  it('does not mistake ordinary names for secrets', () => {
    expect(redactSecrets('statusCode=500 errorCode: E_TIMEOUT')).toBe('statusCode=500 errorCode: E_TIMEOUT');
  });

  it('leaves ordinary error text alone', () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'options')\n    at QuestionCard (webpack:///./src/q.tsx:42:17)";
    expect(redactSecrets(text)).toBe(text);
  });
});
