/**
 * Certificate ID — pure helpers
 *
 * Defines the canonical format for certificate identifiers per ADR-001:
 *   {ORG_PREFIX}-{YYYYMMDD}-{4-char hex (uppercase)}
 *
 * Kept side-effect-free so it is unit-testable without Firebase mocks.
 *
 * @module utils/certificateId
 */

const HEX_REGEX = /^[0-9A-F]{4}$/;

/**
 * Generate a new certificate ID using the current date and a random hex suffix.
 */
export const generateCertId = (orgPrefix: string): string => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hex = Math.random().toString(16).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `${orgPrefix}-${dateStr}-${hex}`;
};

/**
 * Validate that a string conforms to the certificate ID shape for the given prefix.
 */
export const isValidCertId = (certId: string, orgPrefix: string): boolean => {
  const pattern = new RegExp(`^${escapeRegExp(orgPrefix)}-(\\d{8})-([0-9A-F]{4})$`);
  const match = pattern.exec(certId);
  if (!match) return false;
  return isValidYyyymmdd(match[1]) && HEX_REGEX.test(match[2]);
};

/**
 * Build the canonical Firebase Storage path for a certificate PDF.
 */
export const certificateStoragePath = (
  orgId: string,
  userId: string,
  courseId: string,
  certId: string
): string => `certificates/${orgId}/${userId}/${courseId}/${certId}.pdf`;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isValidYyyymmdd = (s: string): boolean => {
  if (s.length !== 8) return false;
  const yyyy = Number(s.slice(0, 4));
  const mm = Number(s.slice(4, 6));
  const dd = Number(s.slice(6, 8));
  if (!Number.isInteger(yyyy) || yyyy < 2020 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  return true;
};
