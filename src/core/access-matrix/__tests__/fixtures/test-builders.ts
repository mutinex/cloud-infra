import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import {
  MatrixUseCase,
  MatrixPolicyRule,
  AllPrincipalTypes,
} from '../../types/matrix-types';
import { AccessMatrixCases } from '../../types/matrix-types';
import {
  createMockBucket,
  createMockServiceAccount,
  createMockProject,
  createMockFolder,
  createMockCloudRunService,
  createMockSecret,
  createMockBucketComponent,
  createMockServiceAccountComponent,
  createMockBulkAccount,
  createMockOutput,
  createMockMatrixPrincipal,
} from './mock-resources';

/**
 * Builder for creating test access matrix configurations
 */
export class TestMatrixBuilder {
  private cases: AccessMatrixCases = {};

  /**
   * Add a test case with rules
   */
  addCase(caseName: string): TestCaseBuilder {
    const caseBuilder = new TestCaseBuilder(caseName);
    caseBuilder.onBuild = useCase => {
      this.cases[caseName] = useCase;
    };
    caseBuilder.parent = this;
    return caseBuilder;
  }

  /**
   * Build the final access matrix cases
   */
  build(): AccessMatrixCases {
    return { ...this.cases };
  }
}

/**
 * Builder for creating test use cases
 */
export class TestCaseBuilder {
  private useCase: MatrixUseCase = { rules: [] };
  public onBuild?: (useCase: MatrixUseCase) => void;

  constructor(private caseName: string) {}

  /**
   * Add case-level principals
   */
  withPrincipals(principals: AllPrincipalTypes[]): this {
    this.useCase.principals = principals;
    return this;
  }

  /**
   * Add a policy rule
   */
  addRule(): TestRuleBuilder {
    const ruleBuilder = new TestRuleBuilder();
    ruleBuilder.onBuild = rule => {
      this.useCase.rules.push(rule);
    };
    ruleBuilder.parent = this;
    return ruleBuilder;
  }

  /**
   * Build the use case
   */
  build(): TestMatrixBuilder {
    if (this.onBuild) {
      this.onBuild(this.useCase);
    }
    return this.parent!;
  }

  public parent?: TestMatrixBuilder;
}

/**
 * Builder for creating test policy rules
 */
export class TestRuleBuilder {
  private rule: Partial<MatrixPolicyRule> = {};
  public onBuild?: (rule: MatrixPolicyRule) => void;
  public parent?: TestCaseBuilder;

  /**
   * Set the resource for this rule
   */
  withResource(resource: unknown): this {
    this.rule.resource = resource;
    return this;
  }

  /**
   * Set the role for this rule
   */
  withRole(role: string): this {
    this.rule.role = role;
    return this;
  }

  /**
   * Set principals for this rule
   */
  withPrincipals(principals: AllPrincipalTypes | AllPrincipalTypes[]): this {
    this.rule.principals = principals;
    return this;
  }

  /**
   * Set label for this rule
   */
  withLabel(label: string): this {
    this.rule.label = label;
    return this;
  }

  /**
   * Build the rule
   */
  build(): TestCaseBuilder {
    if (this.onBuild && this.rule.resource && this.rule.role) {
      this.onBuild(this.rule as MatrixPolicyRule);
    }
    return this.parent!;
  }
}

/**
 * Factory for common test resources
 */
export class TestResourceFactory {
  static bucket(name: string = 'test-bucket'): gcp.storage.Bucket {
    return createMockBucket({ name });
  }

  static bucketComponent(name: string = 'test-bucket'): unknown {
    const bucket = TestResourceFactory.bucket(name);
    return createMockBucketComponent(bucket);
  }

  static serviceAccount(
    name: string = 'test-sa',
    email?: string
  ): gcp.serviceaccount.Account {
    return createMockServiceAccount({
      name,
      email: email || `${name}@test-project.iam.gserviceaccount.com`,
    });
  }

  static serviceAccountComponent(
    name: string = 'test-sa',
    email?: string
  ): unknown {
    const sa = TestResourceFactory.serviceAccount(name, email);
    return createMockServiceAccountComponent(sa);
  }

  static project(id: string = 'test-project'): gcp.organizations.Project {
    return createMockProject({ id, projectId: id });
  }

  static folder(id: string = 'test-folder'): gcp.organizations.Folder {
    return createMockFolder({ id });
  }

  static cloudRunService(
    name: string = 'test-service',
    location: string = 'us-central1'
  ): gcp.cloudrunv2.Service {
    return createMockCloudRunService({ name, location });
  }

  static secret(
    id: string = 'test-secret',
    location?: string
  ): gcp.secretmanager.Secret | gcp.secretmanager.RegionalSecret {
    return createMockSecret({ id, location });
  }

  static bulkAccounts(
    accounts: Record<string, string> = { dev: 'dev-sa', prod: 'prod-sa' }
  ): unknown {
    const accountResources: Record<string, gcp.serviceaccount.Account> = {};
    for (const [key, name] of Object.entries(accounts)) {
      accountResources[key] = TestResourceFactory.serviceAccount(name);
    }
    return createMockBulkAccount(accountResources);
  }
}

/**
 * Factory for common test principals
 */
export class TestPrincipalFactory {
  static string(email: string): string {
    return `serviceAccount:${email}`;
  }

  static user(email: string): string {
    return `user:${email}`;
  }

  static output(value: string, hint?: string): pulumi.Output<string> {
    return createMockOutput(value, hint);
  }

  static matrixObject(stack: string, name: string, domain?: string): unknown {
    return createMockMatrixPrincipal({ stack, name, domain });
  }

  static serviceAccountResource(
    name: string = 'test-sa',
    email?: string
  ): gcp.serviceaccount.Account {
    return TestResourceFactory.serviceAccount(name, email);
  }
}

/**
 * Pre-built test scenarios
 */
export class TestScenarios {
  /**
   * Simple scenario: single bucket, single role, single principal
   */
  static simple(): AccessMatrixCases {
    return new TestMatrixBuilder()
      .addCase('simple')
      .addRule()
      .withResource(TestResourceFactory.bucket('my-bucket'))
      .withRole('roles/storage.objectViewer')
      .withPrincipals(['serviceAccount:viewer@project.iam.gserviceaccount.com'])
      .build()
      .build()
      .build();
  }

  /**
   * Complex scenario: multiple resources, roles, and principal types
   */
  static complex(): AccessMatrixCases {
    const bucket = TestResourceFactory.bucket('data-bucket');
    const project = TestResourceFactory.project('my-project');
    const sa = TestResourceFactory.serviceAccount('admin-sa');
    const output = TestPrincipalFactory.output(
      'serviceAccount:output-sa@project.iam',
      'output-sa'
    );

    const builder = new TestMatrixBuilder();
    const caseBuilder = builder
      .addCase('complex')
      .withPrincipals([TestPrincipalFactory.user('admin@company.com')]);

    caseBuilder
      .addRule()
      .withResource(bucket)
      .withRole('roles/storage.admin')
      .withPrincipals([
        TestPrincipalFactory.string('bucket-admin@project.iam'),
        sa,
      ])
      .build();

    caseBuilder
      .addRule()
      .withResource(project)
      .withRole('roles/viewer')
      .withPrincipals([output as AllPrincipalTypes])
      .build();

    return caseBuilder.build().build();
  }

  /**
   * Bulk resources scenario
   */
  static bulk(): AccessMatrixCases {
    const bulkAccounts = TestResourceFactory.bulkAccounts({
      dev: 'dev-service',
      staging: 'staging-service',
      prod: 'prod-service',
    });

    return new TestMatrixBuilder()
      .addCase('bulk')
      .addRule()
      .withResource(bulkAccounts)
      .withRole('roles/iam.serviceAccountUser')
      .withPrincipals([TestPrincipalFactory.user('deployer@company.com')])
      .build()
      .build()
      .build();
  }

  /**
   * Component resources scenario
   */
  static components(): AccessMatrixCases {
    const bucketComponent =
      TestResourceFactory.bucketComponent('wrapped-bucket');
    const saComponent =
      TestResourceFactory.serviceAccountComponent('wrapped-sa');
    // Extract the actual service account from the component for use as principal
    const serviceAccount = (
      saComponent as { getServiceAccount(): unknown }
    ).getServiceAccount();

    return new TestMatrixBuilder()
      .addCase('components')
      .addRule()
      .withResource(bucketComponent)
      .withRole('roles/storage.objectViewer')
      .withPrincipals([serviceAccount as AllPrincipalTypes])
      .build()
      .build()
      .build();
  }

  /**
   * Mixed resource types scenario
   */
  static mixed(): AccessMatrixCases {
    const builder = new TestMatrixBuilder();
    const caseBuilder = builder
      .addCase('mixed')
      .withPrincipals([
        TestPrincipalFactory.user('shared-user@company.com'),
        TestPrincipalFactory.serviceAccountResource('shared-sa'),
      ]);

    caseBuilder
      .addRule()
      .withResource(TestResourceFactory.bucket('shared-bucket'))
      .withRole('roles/storage.objectViewer')
      .build();

    caseBuilder
      .addRule()
      .withResource(TestResourceFactory.project('shared-project'))
      .withRole('roles/viewer')
      .build();

    caseBuilder
      .addRule()
      .withResource(TestResourceFactory.secret('shared-secret'))
      .withRole('roles/secretmanager.secretAccessor')
      .build();

    return caseBuilder.build().build();
  }
}
