import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';

export const PulumiInputStringSchema = z.union([
  z.string(),
  z.custom<pulumi.Output<string>>(
    (val: unknown): val is pulumi.Output<string> =>
      typeof val === 'string' || pulumi.Output.isInstance(val),
    { message: 'Expected a string or a Pulumi Output<string>' }
  ),
]);

// Schema for an object that provides a service account's email and a static name for Pulumi resource naming.
// This is what CloudInfraAccount.asIamMemberIdentity() will return.
export const ServiceAccountRefSchema = z.object({
  urnName: z.string().optional(),
  email: PulumiInputStringSchema, // The service account email (string or Output<string>)
});

// A service account member can be a direct email (string/Output) or the ServiceAccountRefSchema object
export const ServiceAccountMemberSchema = z.union([
  PulumiInputStringSchema, // For direct email string or Output<string>
  ServiceAccountRefSchema, // For object from sa.asIamMemberIdentity()
]);

// helper to keep property optional in TS but default to [] at runtime
const arrayWithDefault = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(val => (val === undefined ? [] : val), schema);

// Schema for grouping IAM members by type (user, service account, group, principal)
export const IAMMembersByTypeSchema = z.object({
  user: arrayWithDefault(z.array(PulumiInputStringSchema)).optional(),
  serviceAccount: arrayWithDefault(
    z.array(ServiceAccountMemberSchema)
  ).optional(),
  group: arrayWithDefault(z.array(PulumiInputStringSchema)).optional(),
  principal: arrayWithDefault(z.array(PulumiInputStringSchema)).optional(),
});

export type IAMMembersByType = z.infer<typeof IAMMembersByTypeSchema>;

export const UnifiedIamMembersEntrySchema = z.object({
  role: PulumiInputStringSchema,
  urnName: z.string().optional(),
  members: IAMMembersByTypeSchema,
});

export type UnifiedIamMembersEntry = z.infer<
  typeof UnifiedIamMembersEntrySchema
>;

/**
 * For literal roles without an explicit `urnName`, member lists are merged
 * by role key (replicating the legacy behaviour). Every other entry is
 * simply concatenated.
 */
export function mergeUnifiedIamMembers(
  base: UnifiedIamMembersEntry[],
  override: UnifiedIamMembersEntry[]
): UnifiedIamMembersEntry[] {
  const result: UnifiedIamMembersEntry[] = [];

  // Index for quick lookup of literal-role entries in the result
  const literalMap: Record<string, UnifiedIamMembersEntry> = {};

  const pushEntry = (entry: UnifiedIamMembersEntry) => {
    const isLiteral =
      typeof entry.role === 'string' && entry.urnName === undefined;
    if (!isLiteral) {
      result.push(entry);
      return;
    }

    const key = entry.role as string;
    if (!literalMap[key]) {
      const copy: UnifiedIamMembersEntry = {
        role: entry.role,
        members: { ...entry.members },
      };
      result.push(copy);
      literalMap[key] = copy;
    } else {
      const target = literalMap[key].members;
      const src = entry.members;
      (target.user ??= []).push(...(src.user ?? []));
      (target.group ??= []).push(...(src.group ?? []));
      (target.principal ??= []).push(...(src.principal ?? []));
      (target.serviceAccount ??= []).push(...(src.serviceAccount ?? []));
    }
  };

  base.forEach(pushEntry);
  override.forEach(pushEntry);

  return result;
}

export interface IAMMembersEntry {
  resourceName: string;
  role: pulumi.Input<string>;
  member: pulumi.Input<string>;
}

export function buildIamMembersEntries(
  baseResourceName: string,
  iamEntriesUnified: UnifiedIamMembersEntry[]
): IAMMembersEntry[] {
  const result: IAMMembersEntry[] = [];

  // Shape unified entries into triple form [role, members, explicitUrn]
  const entries: Array<
    [pulumi.Input<string>, IAMMembersByType, string | undefined]
  > = iamEntriesUnified.map(e => [e.role, e.members, e.urnName]);

  entries.forEach(([role, membersByType, explicitUrn], idx) => {
    const shortRole =
      typeof role === 'string'
        ? role.replace(/^.*roles\//, '')
        : (explicitUrn ?? `dynamicRole-${idx}`);

    // Internal helper used to push a binding entry whilst handling name length caps
    const pushEntry = (memberInput: pulumi.Input<string>, namePart: string) => {
      let resourceName = `${baseResourceName}:${shortRole}:${namePart}`;
      resourceName = resourceName.substring(0, 100);
      result.push({ resourceName, role, member: memberInput });
    };

    const processMemberList = (
      memberInputs: pulumi.Input<string>[] | undefined,
      typePrefix: 'user:' | 'group:',
      memberKind: 'user' | 'group'
    ) => {
      if (!memberInputs?.length) return;
      memberInputs.forEach((memberInput, index) => {
        const identifier =
          typeof memberInput === 'string'
            ? memberInput
            : `${memberKind}-${index}`;
        const gcpMemberString = pulumi
          .output(memberInput)
          .apply(v => (v.includes(':') ? v : `${typePrefix}${v}`));
        pushEntry(gcpMemberString, identifier);
      });
    };

    processMemberList(membersByType.user, 'user:', 'user');
    processMemberList(membersByType.group, 'group:', 'group');

    if (membersByType.serviceAccount?.length) {
      membersByType.serviceAccount.forEach((saInput, index) => {
        let emailInput: pulumi.Input<string>;
        let identifier: string;

        if (
          typeof saInput === 'object' &&
          saInput !== null &&
          'email' in saInput
        ) {
          const ref = saInput as {
            urnName?: string;
            email: pulumi.Input<string>;
          };
          emailInput = ref.email;
          if (ref.urnName) identifier = ref.urnName;
          else if (typeof ref.email === 'string') identifier = ref.email;
          else identifier = `sa-${index}`;
        } else if (typeof saInput === 'string') {
          emailInput = saInput;
          identifier = saInput;
        } else {
          emailInput = saInput as pulumi.Input<string>;
          identifier = `sa-${index}`;
        }

        const gcpMemberString = pulumi
          .output(emailInput)
          .apply(email =>
            email.includes(':') ? email : `serviceAccount:${email}`
          );
        pushEntry(gcpMemberString, identifier);
      });
    }

    if (membersByType.principal?.length) {
      membersByType.principal.forEach((memberInput, index) => {
        let identifier: string;
        if (typeof memberInput === 'string') {
          const parts = memberInput.split(':', 2);
          identifier = parts.length > 1 ? parts[1] : parts[0];
        } else {
          identifier = `principal-${index}`;
        }

        const memberOutput = pulumi.Output.isInstance(memberInput)
          ? (memberInput as pulumi.Output<string>)
          : pulumi.output(memberInput);

        pushEntry(memberOutput, identifier);
      });
    }
  });

  return result;
}
