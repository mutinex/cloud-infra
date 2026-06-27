/**
 * **`@mutinex/cloud-infra/output`** – public export surface.
 *
 * Re-exports the core {@link CloudInfraOutput} class along with all related
 * types. No runtime logic lives in this file; it purely aggregates symbols
 * so callers can write succinct imports such as:
 *
 * ```ts
 * import { CloudInfraOutput } from "@mutinex/cloud-infra/output";
 * ```
 */

// Export the main class
export { CloudInfraOutput } from './output-manager';

// Export types
export type {
  OutputResource,
  OutputResourceEntry,
  FlatOutputRecord,
} from './output-manager';
