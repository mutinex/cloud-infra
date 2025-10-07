import { CloudInfraMeta } from './meta';
import { ConfigurationError } from './errors';
import * as pulumi from '@pulumi/pulumi';

export function withDefaults<T>(defaults: T, overrides: Partial<T> = {}): T {
  return { ...defaults, ...overrides } as T;
}

export function deriveRegion(meta: CloudInfraMeta): string {
  try {
    return meta.getRegion();
  } catch {
    return meta.getLocation();
  }
}

/**
 * Build a fully-qualified self-link for a VPC network of the form
 *   projects/{project}/global/networks/{network}
 * If the provided network already looks like a self-link (contains a slash) it is returned as-is.
 */
export function networkSelfLink(
  network: pulumi.Input<string>,
  project: pulumi.Input<string>
): pulumi.Output<string> {
  return pulumi.all([network, project]).apply(([net, proj]) => {
    if (net.includes('/')) {
      return net; // already self-link
    }
    return `projects/${proj}/global/networks/${net}`;
  });
}

/**
 * Ensure the provided CloudInfraMeta represents a single-region configuration and
 * return that region. Throws otherwise.
 */
export function assertSingleRegion(
  meta: CloudInfraMeta,
  component: string
): string {
  try {
    return meta.getRegion();
  } catch {
    throw new ConfigurationError(
      `${component} requires the component to be initialised with a single region (meta.getRegion()). Dual- or multi-region locations are not supported.`,
      component,
      'assertSingleRegion'
    );
  }
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) {
    // Only delete if the key exists to avoid TS complaints in strict mode
    if (key in result) {
      delete result[key as string];
    }
  }
  return result as Omit<T, K>;
}

/**
 * Generic type guard to check if an object has a specific method
 */
export function hasMethod<T extends string>(
  obj: unknown,
  methodName: T
): obj is Record<T, (...args: unknown[]) => unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    methodName in obj &&
    typeof (obj as Record<string, unknown>)[methodName] === 'function'
  );
}

/**
 * Generic type guard to check if an object has a specific property
 */
export function hasProperty<T extends string>(
  obj: unknown,
  propertyName: T
): obj is Record<T, unknown> {
  return typeof obj === 'object' && obj !== null && propertyName in obj;
}
