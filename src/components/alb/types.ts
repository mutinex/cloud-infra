import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/**
 * Load balancing scheme types supported by the ALB component.
 * - EXTERNAL_MANAGED: External (internet-facing) load balancer (default)
 * - INTERNAL_MANAGED: Internal (VPC-internal) load balancer
 */
export type LoadBalancingScheme = 'EXTERNAL_MANAGED' | 'INTERNAL_MANAGED';

/**
 * Base configuration for internal load balancer settings.
 * These fields are only relevant when loadBalancingScheme is INTERNAL_MANAGED.
 */
export interface InternalLoadBalancerConfig {
  /**
   * The load balancing scheme for the ALB.
   * Defaults to 'EXTERNAL_MANAGED' for backward compatibility.
   * Set to 'INTERNAL_MANAGED' to create an internal load balancer.
   */
  loadBalancingScheme?: LoadBalancingScheme;

  /**
   * The network for internal load balancers.
   * Required when loadBalancingScheme is 'INTERNAL_MANAGED'.
   * Format: 'projects/{project}/global/networks/{network}'
   */
  network?: pulumi.Input<string>;

  /**
   * The subnetwork for internal load balancers.
   * Required when loadBalancingScheme is 'INTERNAL_MANAGED'.
   * Format: 'projects/{project}/regions/{region}/subnetworks/{subnetwork}'
   */
  subnetwork?: pulumi.Input<string>;
}

/**
 * Common SSL certificate configuration used by both global and regional ALBs.
 * Can be either:
 * - An array of certificate references (for existing certificates)
 * - Configuration arguments to create a new SSL certificate
 */
export type SslCertificateConfig =
  | pulumi.Input<pulumi.Input<string>[]>
  | gcp.compute.SSLCertificateArgs;

/**
 * Common IP address configuration pattern.
 * Can be either:
 * - A string reference to an existing address
 * - Configuration arguments to create a new address
 */
export type IpAddressConfig<T> = pulumi.Input<string> | T;

/**
 * URL map configuration for global ALBs.
 * Can be either:
 * - A string reference to an existing URL map
 * - Configuration arguments to create a new global URL map
 */
export type GlobalUrlMapConfig = pulumi.Input<string> | gcp.compute.URLMapArgs;

/**
 * URL map configuration for regional ALBs.
 * Can be either:
 * - A string reference to an existing regional URL map
 * - Configuration arguments to create a new regional URL map
 */
export type RegionalUrlMapConfig =
  | pulumi.Input<string>
  | gcp.compute.RegionUrlMapArgs;

/**
 * Base configuration for target proxy with SSL certificates and URL map.
 * This is the common structure shared between global and regional proxies.
 * Uses index signature to allow flexible property spreading.
 */
export interface BaseTargetProxyConfig {
  /**
   * Configuration for classic SSL certificate(s).
   * If any certificate option is provided, creates an HTTPS proxy. Otherwise, creates an HTTP proxy.
   */
  sslCertificates?: SslCertificateConfig;

  /**
   * Certificate Manager managed certificates.
   * Available for both global and regional load balancers.
   * If any certificate option is provided, creates an HTTPS proxy. Otherwise, creates an HTTP proxy.
   */
  certificateManagerCertificates?: pulumi.Input<pulumi.Input<string>[]>;

  /**
   * Certificate Manager certificate map.
   * Only available for global external load balancers.
   * Can be provided as either:
   * - The certificate map ID (e.g., from certificateMap.id)
   * - The full resource path with service prefix
   * The component will automatically format it with the required //certificatemanager.googleapis.com/ prefix.
   * If any certificate option is provided, creates an HTTPS proxy. Otherwise, creates an HTTP proxy.
   */
  certificateMap?: pulumi.Input<string>;

  /**
   * Allow additional properties for pass-through configuration
   */
  [key: string]: unknown;
}

/**
 * Helper type for global HTTPS proxy args without conflicting fields.
 * Omits urlMap and sslCertificates which are handled separately.
 */
type GlobalHttpsProxyArgsWithoutOverrides = Omit<
  gcp.compute.TargetHttpsProxyArgs,
  'urlMap' | 'sslCertificates'
>;

/**
 * Helper type for global HTTP proxy args without conflicting fields.
 * Only omits urlMap since HTTP proxies don't have sslCertificates.
 */
type GlobalHttpProxyArgsWithoutOverrides = Omit<
  gcp.compute.TargetHttpProxyArgs,
  'urlMap'
>;

/**
 * Helper type for regional HTTPS proxy args without conflicting fields.
 * Omits urlMap and sslCertificates which are handled separately.
 */
type RegionalHttpsProxyArgsWithoutOverrides = Omit<
  gcp.compute.RegionTargetHttpsProxyArgs,
  'urlMap' | 'sslCertificates'
>;

/**
 * Helper type for regional HTTP proxy args without conflicting fields.
 * Only omits urlMap since HTTP proxies don't have sslCertificates.
 */
type RegionalHttpProxyArgsWithoutOverrides = Omit<
  gcp.compute.RegionTargetHttpProxyArgs,
  'urlMap'
>;

/**
 * Configuration for a global target proxy.
 * Extends the base configuration with global-specific URL map.
 * Combines both HTTPS and HTTP proxy arguments.
 */
export type GlobalTargetProxyConfig = BaseTargetProxyConfig & {
  /**
   * Configuration for the URL map. Can be a string (reference to existing URL map)
   * or the arguments to create a new global URL map.
   */
  urlMap: GlobalUrlMapConfig;
} & GlobalHttpsProxyArgsWithoutOverrides &
  GlobalHttpProxyArgsWithoutOverrides;

/**
 * Configuration for a regional target proxy.
 * Extends the base configuration with regional-specific URL map.
 * Combines both HTTPS and HTTP proxy arguments.
 */
export type RegionalTargetProxyConfig = BaseTargetProxyConfig & {
  /**
   * Configuration for the regional URL map. Can be a string (reference to existing URL map)
   * or the arguments to create a new regional URL map.
   */
  urlMap: RegionalUrlMapConfig;
} & RegionalHttpsProxyArgsWithoutOverrides &
  RegionalHttpProxyArgsWithoutOverrides;

/**
 * Configuration for a Global ALB.
 * The entire config IS the global forwarding rule configuration,
 * with target as a nested dependency.
 * Used internally when isGlobal is true.
 *
 * Supports both external (EXTERNAL_MANAGED) and internal (INTERNAL_MANAGED) load balancing schemes.
 * Internal global ALBs are called "Cross-region internal Application Load Balancers" in GCP.
 */
export interface GlobalAlbConfig
  extends Omit<
      gcp.compute.GlobalForwardingRuleArgs,
      'ipAddress' | 'target' | 'loadBalancingScheme' | 'network' | 'subnetwork'
    >,
    InternalLoadBalancerConfig {
  /**
   * Configuration for the IP address. Can be a string (name of existing address)
   * or the arguments to create a new global address.
   * This overrides the ipAddress field from GlobalForwardingRuleArgs.
   */
  ipAddress?: IpAddressConfig<gcp.compute.GlobalAddressArgs>;

  /**
   * Configuration for the global target proxy including certificates and URL map.
   * Can be a string (reference to existing proxy) or a configuration object.
   * This is a nested dependency of the forwarding rule.
   */
  target: pulumi.Input<string> | GlobalTargetProxyConfig;
}

/**
 * Configuration for a Regional ALB.
 * The entire config IS the regional forwarding rule configuration,
 * with target as a nested dependency.
 * Used internally when isGlobal is false.
 *
 * Regional ALBs support both external and internal load balancing schemes.
 */
export interface RegionAlbConfig
  extends Omit<
      gcp.compute.ForwardingRuleArgs,
      'ipAddress' | 'target' | 'loadBalancingScheme' | 'network' | 'subnetwork'
    >,
    InternalLoadBalancerConfig {
  /**
   * Configuration for the IP address. Can be a string (name of existing address)
   * or the arguments to create a new regional address.
   * This overrides the ipAddress field from ForwardingRuleArgs.
   */
  ipAddress?: IpAddressConfig<gcp.compute.AddressArgs>;

  /**
   * Configuration for the regional target proxy including certificates and URL map.
   * Can be a string (reference to existing proxy) or a configuration object.
   * This is a nested dependency of the forwarding rule.
   */
  target: pulumi.Input<string> | RegionalTargetProxyConfig;
}

/**
 * Top-level configuration for the CloudInfraAlb component.
 * Type (global vs regional) is determined by meta.getDomain().
 */
export type AlbConfig = GlobalAlbConfig | RegionAlbConfig;
