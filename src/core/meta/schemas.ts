import { z } from 'zod';
import {
  Domains,
  GcpMultiRegions,
  prefixLengthLimit,
  isZone,
  validateZone,
} from './locations';

/**
 * Schema for generic GCP resource names.
 * Validates lowercase letters, numbers, and hyphens with specific constraints.
 */
export const gcpGenericNameSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+$/,
    'Name must only contain lowercase letters, numbers, and hyphens'
  )
  .max(30, { message: 'Name must be at most 30 characters long.' })
  .regex(/^[a-z]/, { message: 'Name must start with a lowercase letter.' })
  .refine(s => !s.endsWith('-'), {
    message: 'Name must not end with a hyphen.',
  });

/**
 * Schema for GCP Service Account names with stricter length constraints.
 */
export const gcpServiceAccountNameSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+$/,
    'Service Account ID must only contain lowercase letters, numbers, and hyphens'
  )
  .max(12, {
    message: 'Service Account ID must be at most 12 characters long.',
  })
  .regex(/^[a-z]/, {
    message: 'Service Account ID must start with a lowercase letter.',
  })
  .refine(s => !s.endsWith('-'), {
    message: 'Service Account ID must not end with a hyphen.',
  });

/**
 * Schema for GCP region strings (e.g., "us-west1", "europe-west3").
 */
const gcpRegionStringSchema = z.string().regex(/^[a-z]+(?:-[a-z]+)*[0-9]$/, {
  message:
    "Region must be a lowercase GCP location like 'us-central1' or 'europe-west3'.",
});

/**
 * Schema for GCP zone strings (e.g., "us-central1-a", "europe-west3-b").
 */
const gcpZoneStringSchema = z.string().refine(
  val => {
    try {
      return isZone(val) && validateZone(val);
    } catch {
      return false;
    }
  },
  {
    message:
      "Zone must be a lowercase GCP zone like 'us-central1-a' or 'europe-west3-b'.",
  }
);

/**
 * Schema for GCP location strings - accepts both regions and zones.
 */
const gcpLocationStringSchema = z.union(
  [gcpRegionStringSchema, gcpZoneStringSchema],
  {
    errorMap: () => ({
      message:
        "Location must be a lowercase GCP region like 'us-central1' or zone like 'us-central1-a'.",
    }),
  }
);

/**
 * Comprehensive schema for CloudInfraMeta input validation.
 * Handles naming, location, environment, and various configuration options.
 */
export const CloudInfraMetaSchema = z
  .object({
    /**
     * The base name for the component, or an array of names for creating
     * multiple related resources. Each name must conform to GCP naming standards.
     * @see gcpGenericNameSchema
     * @example "api-server"
     * @example ["database", "cache", "queue"]
     */
    name: z
      .union([gcpGenericNameSchema, z.array(gcpGenericNameSchema)])
      .describe(
        'The base name(s) for the component. Can be a single string or an array for creating multiple instances. This name may be transformed based on other properties.'
      ),

    /**
     * The primary geographic domain for the resource.
     * This is used to infer a default region if `location` is not provided.
     * - `au`: Australia
     * - `us`: United States
     * - `gl`: Global (default)
     */
    domain: z.enum(Domains).optional(),

    /**
     * Explicitly sets the GCP location. This can be a single region, zone,
     * multi-region identifier (e.g., "us"), or a two-element array defining
     * a dual-region. If omitted, a default region is inferred from the `domain`.
     * @example "australia-southeast1"
     * @example "australia-southeast1-a"
     * @example "nam4"
     * @example ["us-central1", "us-east1"]
     */
    location: z
      .union([
        gcpLocationStringSchema, // single arbitrary region or zone
        z.enum(GcpMultiRegions), // predefined multi-region identifiers
        z
          .array(gcpLocationStringSchema)
          .min(1, { message: 'Provide at least one location in the array.' }),
      ])
      .optional(),

    /**
     * If `true`, the final generated name will not be prefixed with the
     * project prefix. The name will be in the format `<name>-<location>`
     * instead of `<prefix>-<name>-<location>`.
     * @default false
     */
    omitPrefix: z
      .boolean()
      .optional()
      .describe(
        "If true, the generated name will not include the prefix. The name will be in format 'name-location' instead of 'prefix-name-location'."
      ),

    /**
     * If provided, generates a name for a temporary "preview" or ephemeral
     * resource. This takes precedence over other naming rules, resulting in a
     * name like `<prefix>-<name>-<hash(preview)>`.
     * This is useful for creating resources in CI/CD for pull requests.
     * @example "pr-123"
     */
    preview: z
      .string()
      .optional()
      .describe(
        "If provided, generates a preview-specific name, typically for temporary or test resources. This usually takes precedence over the standard naming convention but not over 'nested: true'. Cannot be used with 'nested'."
      ),

    gcpProject: z
      .union([z.string(), z.object({}).passthrough()])
      .optional()
      .describe(
        'The GCP project to use. Can be a string or Pulumi Input<string>.'
      ),

    /**
     * A custom prefix to override the one derived from the Pulumi project name.
     * Must be 12 characters or less.
     */
    prefix: z.string().optional(),

    /**
     * If `true`, the automatically-derived domain/location/region segment is NOT
     * appended to the generated name. This is useful for global resources
     * where a geographic suffix is not desired.
     * @default false
     */
    omitDomain: z.boolean().optional(),

    /**
     * If `true`, the location segment is NOT appended to the generated name.
     * This is a more explicit alternative to omitDomain for when you specifically
     * want to exclude location information from the resource name.
     * @default false
     */
    omitLocation: z.boolean().optional(),

    /**
     * If `true`, bypasses strict naming validations (like length limits) in components.
     * Use with caution - only when you need to override GCP naming restrictions for
     * specific use cases (e.g., legacy resource names, external integrations).
     * @default false
     */
    overrideNamingRules: z
      .boolean()
      .optional()
      .describe(
        'If true, bypasses strict naming validations in cloud-infra components. Use with caution - may result in resources that violate GCP naming standards.'
      ),
  })
  .superRefine((data, ctx) => {
    if (data.prefix && data.prefix.length > prefixLengthLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Prefix must not exceed ${prefixLengthLimit} characters`,
        path: ['prefix'],
      });
    }
  })
  .transform(data => ({
    ...data,
    domain: (data.domain ?? 'gl') as 'au' | 'us' | 'gl',
  }));

/**
 * TypeScript type for input to CloudInfraMeta constructor (domain is optional).
 */
export type CloudInfraMetaInput = z.input<typeof CloudInfraMetaSchema>;

/**
 * TypeScript type for parsed/processed CloudInfraMeta data (domain is guaranteed).
 */
export type CloudInfraMetaData = z.output<typeof CloudInfraMetaSchema>;
