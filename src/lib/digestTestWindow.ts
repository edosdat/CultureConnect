/**
 * Instant where the Thursday digest starts requiring the mail checkbox.
 * Client-safe: the first-connection popup and the recipient gate share it.
 */

/** 1 Dec 2026 00:00 Europe/Paris. Opt-in gate starts at this instant. */
export const DIGEST_OPT_IN_GATE_AT = Date.parse('2026-12-01T00:00:00+01:00');

export function digestOptInGateActive(now = new Date()): boolean {
  return now.getTime() >= DIGEST_OPT_IN_GATE_AT;
}

/** Test window: every stored Google email still receives the Thursday digest. */
export function digestTestWindowOpen(now = new Date()): boolean {
  return !digestOptInGateActive(now);
}
