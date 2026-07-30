const DEVICE_ID_STORAGE_KEY = 'tradepilot-device-id';

/**
 * A stable id for this browser, minted once and reused.
 *
 * It is what lets the sessions list show one row per device that keeps its
 * last-seen time updated, instead of a new entry on every sign-in. It is not a
 * security control and is not a fingerprint of the machine: clearing site data
 * mints a new one, which is the intended behaviour.
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);

    if (existing) {
      return existing;
    }

    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing or blocked storage: fall back to a per-load id so the
    // request still carries something rather than failing.
    return 'ephemeral';
  }
}
