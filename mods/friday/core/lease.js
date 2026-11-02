// Leases in shared(). Every pane is its own copy of the mod with its own module scope (spike
// note, question 1), so copies cannot share a poller. Instead the copy that takes a source's lease
// fetches it for all of them. `setShared` is last-writer-wins, so a copy that claims a free lease
// writes it, waits a moment and reads it back; a lost race costs nothing, because the loser just
// does not fetch. The holder renews the lease when less than RENEW_BELOW is left, so a lease costs
// one `setShared` per 15 s, and a closed pane's lease frees itself within LEASE_TTL.

export const LEASE_TTL = 30_000;
export const RENEW_BELOW = 15_000;
/** How long a claimant waits before it reads the lease back. */
export const CONFIRM_AFTER = 400;

export const leaseKey = (source) => `friday.lease.${source}`;

/**
 * What `copy` does with a source's lease at `now`:
 * "skip" (another live copy holds it), "hold" (mine, fresh, nothing to write), "renew" (mine, so
 * write it again and carry on) or "claim" (free: write it, then confirm).
 */
export function leaseAction(lease, copy, now) {
  const live = lease && typeof lease.until === "number" && lease.until > now;
  if (!live) return "claim";
  if (lease.copy !== copy) return "skip";
  return lease.until - now < RENEW_BELOW ? "renew" : "hold";
}

export function leaseValue(copy, now) {
  return { copy, until: now + LEASE_TTL };
}

/** After a claim: still mine when read back. */
export function leaseIsMine(lease, copy, now) {
  return Boolean(lease) && lease.copy === copy && lease.until > now;
}
