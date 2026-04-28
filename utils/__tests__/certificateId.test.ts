/**
 * Certificate ID — Unit Tests
 *
 * Locks the canonical certificate ID format. Any change to the format
 * is a breaking change for already-issued certs and CMS audit trails;
 * these tests must fail loudly if the shape drifts.
 */

import {
  generateCertId,
  isValidCertId,
  certificateStoragePath,
} from '../certificateId';

describe('generateCertId', () => {
  it('produces an ID matching {PREFIX}-{YYYYMMDD}-{4HEX}', () => {
    const id = generateCertId('PHS');
    expect(id).toMatch(/^PHS-\d{8}-[0-9A-F]{4}$/);
  });

  it('respects an alternate org prefix', () => {
    const id = generateCertId('CHS');
    expect(id.startsWith('CHS-')).toBe(true);
    expect(isValidCertId(id, 'CHS')).toBe(true);
  });

  it('embeds the current UTC date (YYYYMMDD)', () => {
    const id = generateCertId('PHS');
    const expected = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const datePart = id.split('-')[1];
    expect(datePart).toBe(expected);
  });

  it('produces unique IDs across rapid calls (high entropy)', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCertId('PHS')));
    // 50 calls with 16^4 = 65,536 possible suffixes — collisions are statistically improbable.
    expect(ids.size).toBeGreaterThan(45);
  });
});

describe('isValidCertId', () => {
  it('accepts a well-formed ID', () => {
    expect(isValidCertId('PHS-20260427-A1B2', 'PHS')).toBe(true);
  });

  it('rejects wrong prefix', () => {
    expect(isValidCertId('PHS-20260427-A1B2', 'CHS')).toBe(false);
  });

  it('rejects lowercase hex', () => {
    expect(isValidCertId('PHS-20260427-a1b2', 'PHS')).toBe(false);
  });

  it('rejects non-numeric date', () => {
    expect(isValidCertId('PHS-2026XX27-A1B2', 'PHS')).toBe(false);
  });

  it('rejects out-of-range month/day', () => {
    expect(isValidCertId('PHS-20261327-A1B2', 'PHS')).toBe(false);
    expect(isValidCertId('PHS-20260432-A1B2', 'PHS')).toBe(false);
  });

  it('rejects truncated or extended hex', () => {
    expect(isValidCertId('PHS-20260427-A1B', 'PHS')).toBe(false);
    expect(isValidCertId('PHS-20260427-A1B23', 'PHS')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCertId('', 'PHS')).toBe(false);
  });
});

describe('certificateStoragePath', () => {
  it('produces canonical path: certificates/{orgId}/{userId}/{courseId}/{certId}.pdf', () => {
    expect(certificateStoragePath('parrish', 'user_42', 'course_1', 'PHS-20260427-A1B2'))
      .toBe('certificates/parrish/user_42/course_1/PHS-20260427-A1B2.pdf');
  });

  it('does not URL-encode segments — caller is responsible for safe IDs', () => {
    // documents the invariant
    expect(certificateStoragePath('o', 'u', 'c', 'id'))
      .toBe('certificates/o/u/c/id.pdf');
  });
});
