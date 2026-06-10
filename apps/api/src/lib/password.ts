// Phase 5 (foundation) — password hashing + opaque session tokens.
//
// SCAFFOLD, flagged for human security review (SECURITY.md B3): this provides a
// real, non-toy primitive (scrypt + constant-time compare, hashed session tokens)
// but the surrounding auth *flow* — email verification, password reset, lockout,
// rotation, CSRF posture — is deliberately out of scope and must be human-designed
// before this is used with multiple real users.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const SCRYPT_KEYLEN = 64

/** Hash a password as `scrypt$<saltB64>$<hashB64>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** Constant-time verification against a stored `scrypt$salt$hash` string. */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'base64')
  const expected = Buffer.from(parts[2], 'base64')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** A fresh opaque session token (returned to the client, never stored raw). */
export function newSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/** SHA-256 of a session token — this is what we persist + look up. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
