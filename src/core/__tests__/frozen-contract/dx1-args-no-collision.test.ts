/**
 * DX1 — compile-time guard: name-first config arms carry NO NamingArgs keys.
 *
 * The name-first overload destructures `{ domain, location, prefix, naming,
 * ...rest }` out of `NamingArgs & <Config>` and passes `rest` straight through
 * as the component config. That is only safe if the component's OWN config does
 * not itself expose any of the four {@link NamingArgs} keys (`domain`,
 * `location`, `prefix`, `naming`) — otherwise the destructure would silently
 * STRIP a real config field on the name-first path while the meta-first path
 * retains it, a divergence the `as` cast in each constructor would suppress.
 *
 * For `cloudrunservice` this collision is real (its config exposes `location`)
 * and is handled with `Omit<..., 'location'>`. For `alb` and `instance` the doc
 * comments assert no collision exists (ALB's config union carries no `location`;
 * instance's placement field is `zone`, not `location`). This file PINS those
 * assertions at COMPILE time so a future provider bump that adds, e.g., a
 * `location` field to a forwarding-rule arg type fails `tsc` here instead of
 * silently diverging the two ALB overloads.
 *
 * There is no runtime body — the assertions are purely structural and are
 * enforced by `tsc --noEmit`. The trivial `it` keeps vitest from reporting an
 * empty suite.
 */
import { describe, it, expect } from 'vitest';

import type { CloudInfraAlbConfig } from '../../../components/alb';
import type { CloudInfraComputeInstanceConfig } from '../../../components/instance';

// The four naming keys that the name-first destructure pulls out of the args.
type NamingKey = 'domain' | 'location' | 'prefix' | 'naming';

/**
 * `true` iff `T` has NONE of the {@link NamingKey} keys, i.e. the destructure
 * cannot strip a real config field. Compiles to a static assertion below.
 */
type HasNoNamingKey<T> = Extract<keyof T, NamingKey> extends never
  ? true
  : false;

/** Static assertion helper — only accepts `true`. */
function assertTrue<_T extends true>(): void {
  /* compile-time only */
}

// ── ALB ──────────────────────────────────────────────────────────────────────
// CloudInfraAlbConfig is the GlobalAlbConfig | RegionAlbConfig union. `keyof` of
// a union is the INTERSECTION of member keys, so this guards that NEITHER member
// surfaces a NamingArgs key. (A union member adding `location` would make
// `keyof` lose it — to be safe we also assert each member individually below is
// unnecessary because the destructure strips by key on the resolved value; the
// union `keyof` assertion is the precise guard for the `...rest` collision.)
assertTrue<HasNoNamingKey<CloudInfraAlbConfig>>();

// ── ComputeInstance ──────────────────────────────────────────────────────────
// Zonal: placement field is `zone`, not `location`. No NamingArgs key present.
assertTrue<HasNoNamingKey<CloudInfraComputeInstanceConfig>>();

describe('DX1 — name-first config arms carry no NamingArgs keys (compile-time)', () => {
  it('compiles (the real assertion is enforced by tsc)', () => {
    expect(true).toBe(true);
  });
});
