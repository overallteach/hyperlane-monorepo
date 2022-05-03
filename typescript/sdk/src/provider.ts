import { StaticCeloJsonRpcProvider } from 'celo-ethers-provider';
import { ethers } from 'ethers';

import { ChainName, Domain, NameOrDomain } from './types';

type Provider = ethers.providers.Provider;

/**
 * The MultiProvider manages a collection of [Domains]{@link Domain} and allows
 * developers to enroll ethers Providers and Signers for each domain. It is
 * intended to enable faster multi-chain development by grouping all chain
 * connections under a single roof.
 *
 * @example
 * import {mainnet} from '@abacus-network/sdk';
 * mainnet.registerRpcProvider('celo', 'https://forno.celo.org');
 * mainnet.registerRpcProvider('polygon', '...');
 * mainnet.registerRpcProvider('ethereum', '...');
 * mainnet.registerSigner('celo', celoProvider);
 * mainnet.registerSigner('polygon', polygonProvider);
 * mainnet.registerSigner('ethereum', ethereumProvider);
 */
export class MultiProvider {
  protected domains: Map<number, Domain>;
  protected providers: Map<number, Provider>;
  protected signers: Map<number, ethers.Signer>;
  protected overrides: Map<number, ethers.Overrides>;
  protected confirmations: Map<number, number>;

  constructor() {
    this.domains = new Map();
    this.providers = new Map();
    this.signers = new Map();
    this.overrides = new Map();
    this.confirmations = new Map();
  }

  protected setMap<T>(
    nameOrDomain: NameOrDomain,
    value: T,
    map: Map<number, T>,
  ) {
    map.set(this.resolveDomain(nameOrDomain), value);
  }

  protected getFromMap<T>(
    nameOrDomain: NameOrDomain,
    map: Map<number, T>,
  ): T | undefined {
    return map.get(this.resolveDomain(nameOrDomain));
  }

  protected mustGetFromMap<T>(
    nameOrDomain: NameOrDomain,
    map: Map<number, T>,
    tname: string,
  ): T {
    const item = this.getFromMap<T>(nameOrDomain, map);
    if (!item) {
      throw new Error(`${tname} not found: ${nameOrDomain}`);
    }
    return item;
  }

  /**
   * Resgister a domain with the MultiProvider. This allows the multiprovider
   * to resolves tha domain info, and reference it by name or number.
   *
   * @param domain The Domain object to register.
   */
  registerDomain(domain: Domain): void {
    this.domains.set(domain.id, domain);
  }

  get domainNumbers(): number[] {
    return Array.from(this.domains.keys());
  }

  remoteDomainNumbers(domain: number): number[] {
    return this.domainNumbers.filter((d) => d !== domain);
  }

  get domainNames(): ChainName[] {
    return Array.from(this.domains.values()).map((domain) => domain.name);
  }

  get missingProviders(): number[] {
    const numbers = this.domainNumbers;
    return numbers.filter((number) => this.providers.has(number));
  }

  /**
   * Resolve a domain name (or number) to the canonical number.
   *
   * This function is used extensively to disambiguate domains, and allows
   * devs to reference domains using their preferred nomenclature.
   *
   * @param nameOrDomain A domain name or number.
   * @returns The canonical domain number.
   */
  resolveDomain(nameOrDomain: NameOrDomain): number {
    if (typeof nameOrDomain === 'string') {
      const domains = Array.from(this.domains.values()).filter(
        (domain) => domain.name.toLowerCase() === nameOrDomain.toLowerCase(),
      );
      if (domains.length === 0) {
        throw new Error(`Domain not found: ${nameOrDomain}`);
      }
      return domains[0].id;
    } else {
      return nameOrDomain;
    }
  }

  /**
   * Check whether the {@link MultiProvider} is aware of a domain.
   *
   * @param nameOrDomain A domain name or number.
   * @returns true if the {@link Domain} has been registered, else false.
   */
  knownDomain(nameOrDomain: NameOrDomain): boolean {
    try {
      this.resolveDomain(nameOrDomain);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the registered {@link Domain} object (if any)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A {@link Domain} (if the domain has been registered)
   */
  getDomain(nameOrDomain: NameOrDomain): Domain | undefined {
    return this.getFromMap(nameOrDomain, this.domains);
  }

  /**
   * Get the registered {@link Domain} object (or error)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A {@link Domain}
   * @throws if the domain has not been registered
   */
  mustGetDomain(nameOrDomain: NameOrDomain): Domain {
    return this.mustGetFromMap(nameOrDomain, this.domains, 'Domain');
  }

  /**
   * Resolve the name of a registered {@link Domain}, from its name or number.
   *
   * Similar to `resolveDomain`.
   *
   * @param nameOrDomain A domain name or number.
   * @returns The name (or undefined)
   */
  resolveDomainName(nameOrDomain: NameOrDomain): ChainName | undefined {
    return this.getDomain(nameOrDomain)?.name;
  }

  mustResolveDomainName(nameOrDomain: NameOrDomain): ChainName {
    return this.mustGetDomain(nameOrDomain).name;
  }

  /**
   * Register an ethers Provider for a specified domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param provider An ethers Provider to be used by requests to that domain.
   */
  registerProvider(nameOrDomain: NameOrDomain, provider: Provider): void {
    const domain = this.mustGetDomain(nameOrDomain).id;
    try {
      const signer = this.signers.get(domain);
      if (signer) {
        this.signers.set(domain, signer.connect(provider));
      }
    } catch (e) {
      this.unregisterSigner(domain);
    }
    this.providers.set(domain, provider);
  }

  /**
   * Shortcut to register a provider by its HTTP RPC URL.
   *
   * @param nameOrDomain A domain name or number.
   * @param rpc The HTTP RPC Url
   */
  registerRpcProvider(nameOrDomain: NameOrDomain, rpc: string): void {
    const domain = this.resolveDomain(nameOrDomain);
    const celoNames = ['alfajores', 'celo'];
    for (const name of celoNames) {
      if (nameOrDomain === name) {
        const provider = new StaticCeloJsonRpcProvider(rpc);
        this.registerProvider(domain, provider);
        return;
      }
    }
    const provider = new ethers.providers.StaticJsonRpcProvider(rpc);
    this.registerProvider(domain, provider);
  }

  /**
   * Get the Provider associated with a doman (if any)
   *
   * @param nameOrDomain A domain name or number.
   * @returns The currently registered Provider (or none)
   */
  getProvider(nameOrDomain: NameOrDomain): Provider | undefined {
    return this.getFromMap(nameOrDomain, this.providers);
  }

  /**
   * Get the Provider associated with a doman (or error)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Provider
   * @throws If no provider has been registered for the specified domain
   */
  mustGetProvider(nameOrDomain: NameOrDomain): Provider {
    return this.mustGetFromMap(nameOrDomain, this.providers, 'Provider');
  }

  /**
   * Register an ethers Signer for a specified domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param signer An ethers Signer to be used by requests to that domain.
   */
  registerSigner(nameOrDomain: NameOrDomain, signer: ethers.Signer): void {
    const domain = this.resolveDomain(nameOrDomain);

    const provider = this.providers.get(domain);
    if (!provider && !signer.provider) {
      throw new Error('Must have a provider before registering signer');
    }

    if (provider) {
      try {
        signer = signer.connect(provider);
        this.signers.set(domain, signer.connect(provider));
        return;
      } catch (_) {
        // do nothing
      }
    }
    if (!signer.provider) {
      throw new Error('Signer does not permit reconnect and has no provider');
    }
    // else and fallback
    this.registerProvider(domain, signer.provider);
    this.signers.set(domain, signer);
  }

  /**
   * Remove the registered ethers Signer from a domain. This function will
   * attempt to preserve any Provider that was previously connected to this
   * domain.
   *
   * @param nameOrDomain A domain name or number.
   */
  unregisterSigner(nameOrDomain: NameOrDomain): void {
    const domain = this.resolveDomain(nameOrDomain);
    if (!this.signers.has(domain)) {
      return;
    }

    const signer = this.signers.get(domain);
    if (signer == null || signer.provider == null) {
      throw new Error('signer was missing provider. How?');
    }

    this.signers.delete(domain);
    if (!this.getProvider(nameOrDomain)) {
      this.providers.set(domain, signer.provider);
    }
  }

  /**
   * Clear all signers from all registered domains.
   */
  clearSigners(): void {
    this.domainNumbers.forEach((domain) => this.unregisterSigner(domain));
  }

  /**
   * A shortcut for registering a basic local privkey signer on a domain.
   *
   * @param nameOrDomain A domain name or number.
   * @param privkey A private key string passed to `ethers.Wallet`
   */
  registerWalletSigner(nameOrDomain: NameOrDomain, privkey: string): void {
    const domain = this.resolveDomain(nameOrDomain);

    const wallet = new ethers.Wallet(privkey);
    this.registerSigner(domain, wallet);
  }

  /**
   * Return the signer registered to a domain (if any).
   *
   * @param nameOrDomain A domain name or number.
   * @returns The registered signer (or undefined)
   */
  getSigner(nameOrDomain: NameOrDomain): ethers.Signer | undefined {
    return this.getFromMap(nameOrDomain, this.signers);
  }

  mustGetSigner(nameOrDomain: NameOrDomain): ethers.Signer {
    return this.mustGetFromMap(nameOrDomain, this.signers, 'Signer');
  }

  /**
   * Returns the most priveleged connection registered to a domain. E.g.
   * this function will attempt to return a Signer, then attempt to return the
   * Provider (if no Signer is registered). If neither Signer nor Provider is
   * registered for a domain, it will return undefined
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Signer (if any), otherwise a Provider (if any), otherwise
   *          undefined
   */
  getConnection(
    nameOrDomain: NameOrDomain,
  ): ethers.Signer | ethers.providers.Provider | undefined {
    return this.getSigner(nameOrDomain) ?? this.getProvider(nameOrDomain);
  }

  mustGetConnection(
    nameOrDomain: NameOrDomain,
  ): ethers.Signer | ethers.providers.Provider {
    const connection = this.getConnection(nameOrDomain);
    if (!connection) {
      throw new Error(`Connection not found: ${nameOrDomain}`);
    }

    return connection;
  }

  /**
   * Resolves the address of a Signer on a domain (or undefined, if no Signer)
   *
   * @param nameOrDomain A domain name or number.
   * @returns A Promise for the address of the registered signer (if any)
   */
  async getAddress(nameOrDomain: NameOrDomain): Promise<string | undefined> {
    const signer = this.getSigner(nameOrDomain);
    return await signer?.getAddress();
  }

  registerOverrides(nameOrDomain: NameOrDomain, overrides: ethers.Overrides) {
    this.setMap(nameOrDomain, overrides, this.overrides);
  }

  getOverrides(nameOrDomain: NameOrDomain): ethers.Overrides {
    return this.getFromMap(nameOrDomain, this.overrides) || {};
  }

  registerConfirmations(nameOrDomain: NameOrDomain, confirmations: number) {
    this.setMap(nameOrDomain, confirmations, this.confirmations);
  }

  getConfirmations(nameOrDomain: NameOrDomain): number {
    return this.getFromMap(nameOrDomain, this.confirmations) || 0;
  }
}
