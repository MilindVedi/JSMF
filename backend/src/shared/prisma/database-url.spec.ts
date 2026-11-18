import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../config/env';
import { connectTimeoutSeconds, DEFAULT_DATABASE_CONNECT_TIMEOUT_SECONDS, withConnectTimeout } from './database-url';

describe('withConnectTimeout', () => {
  it('adds connect_timeout to a Cloud SQL socket URL, keeping the socket path as is', () => {
    const url = 'postgresql://app:p%40ss@localhost/jsmf_db_prod?host=/cloudsql/proj:asia-south1:jsmf-postgres';
    expect(withConnectTimeout(url, 10)).toBe(`${url}&connect_timeout=10`);
  });

  it('starts the query string when the URL has none', () => {
    expect(withConnectTimeout('postgresql://app:pw@db:5432/jsmf', 10)).toBe(
      'postgresql://app:pw@db:5432/jsmf?connect_timeout=10',
    );
  });

  it('leaves a URL that sets connect_timeout itself alone', () => {
    const own = 'postgresql://app:pw@db:5432/jsmf?schema=public&connect_timeout=3';
    expect(withConnectTimeout(own, 10)).toBe(own);
    const first = 'postgresql://app:pw@db:5432/jsmf?connect_timeout=30&schema=public';
    expect(withConnectTimeout(first, 10)).toBe(first);
  });
});

describe('connectTimeoutSeconds', () => {
  it('uses a valid value and falls back to the default otherwise', () => {
    expect(connectTimeoutSeconds('20')).toBe(20);
    for (const raw of [undefined, '', 'abc', '0', '61', '2.5']) {
      expect(connectTimeoutSeconds(raw)).toBe(DEFAULT_DATABASE_CONNECT_TIMEOUT_SECONDS);
    }
  });
});

describe('DATABASE_CONNECT_TIMEOUT_SECONDS in the env schema', () => {
  // Only this setting's own complaint is looked at, so the test does not
  // break each time another setting becomes required.
  const complaintAbout = (value: string | undefined): boolean => {
    try {
      validateEnv({ DATABASE_CONNECT_TIMEOUT_SECONDS: value });
      return false;
    } catch (error) {
      return String(error).includes('DATABASE_CONNECT_TIMEOUT_SECONDS');
    }
  };

  it('accepts 1 to 60 or nothing, and refuses anything else', () => {
    for (const ok of [undefined, '1', '15', '60']) expect(complaintAbout(ok)).toBe(false);
    for (const bad of ['0', '61', '2.5', 'abc']) expect(complaintAbout(bad)).toBe(true);
  });
});
