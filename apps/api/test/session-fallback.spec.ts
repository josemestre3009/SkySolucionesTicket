import { describe, expect, it } from 'vitest';
import { resolveCachedSession } from '../../web/lib/api';
import type { OfflineSession } from '../../web/lib/offline';

const cached: OfflineSession = { user: { id: 'user-1', name: 'Ana', role: 'TECHNICIAN' }, expired: false };

describe('offline session fallback', () => {
  it('has nothing to fall back to without a cached session', () => {
    expect(resolveCachedSession(null, true)).toBeNull();
    expect(resolveCachedSession(null, false)).toBeNull();
  });

  it('keeps the cached session usable while offline', () => {
    expect(resolveCachedSession(cached, false)).toEqual(cached);
  });

  it('marks the cached session expired after a 401 without dropping it', () => {
    expect(resolveCachedSession(cached, true)).toEqual({ user: cached.user, expired: true });
  });

  it('keeps an already expired session expired', () => {
    expect(resolveCachedSession({ ...cached, expired: true }, false)).toEqual({ user: cached.user, expired: true });
  });
});
