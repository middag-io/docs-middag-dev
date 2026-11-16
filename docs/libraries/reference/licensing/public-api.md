---
title: 'middag-php-licensing public API'
---

# Public API

The curated `@api` surface of `middag-php-licensing`, grouped by what a host product does with it. Every type on this page carries `@api`; the namespace root is `Middag\Licensing`. Signatures, docblocks and the remaining `@api` types are in the [repository](https://github.com/middag-io/middag-php-licensing#public-api-surface). Errors are on [Errors](./errors). Related: [middag-php-licensing](./).

## Entry points

| The host wants to                                 | Entry point                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Activate a pair `(install_id, product)`           | `License\Activation\ActivationService`                         |
| Gate an extension on the license                  | `License\Concerns\LicensedExtension`, `License\AbstractLicensedExtension` |
| Check the license state                           | `License\ValidateClient`                                       |
| Pick up key rotation, revocation and new grants   | `License\ResyncClient`, `License\ResyncManifestReconciler`     |
| Fetch and keep the signed licensed manifest       | `Delivery\ProtectedManifestService`, `Delivery\Cron\ManifestRefreshTask` |
| Fetch and keep the default manifest of a release  | `Delivery\DefaultManifestService`, `Delivery\Cron\DefaultManifestRefreshTask` |
| Ask whether a bundle module may load              | `License\Contract\LicenseInterface`, `License\ProtectedLicense` |
| Read feature flags and limits                     | `License\Contract\EntitlementsInterface`, `License\ManifestEntitlements` |
| Serve bundles from its own storage                | `Delivery\BundleMaterializer`                                  |
| Serve the stored manifest to its front end        | `Delivery\ManifestEndpointHandler`, `Delivery\ValueObject\LicensingSharedProps` |
| Report metered usage                              | `License\EventsClient`                                         |
| Ask which build to run on its channel             | `License\UpdateCheckClient`                                    |
| Act for a signed-in person on their own account   | `Api\Account\SelfClient`                                       |

## Identity and signing

- `License\SiteId`: the canonical `site_id` (`host` or `host/path`, lowercase, no scheme, no port, no trailing slash). `fromWwwroot()` derives it from a site root URL and throws `InvalidSiteIdException` when the input cannot be one; `SiteIdPolicy` (`Shape` or `Production`) sets how strict the derivation is. `isCanonical()` tests a value, `encodeSegment()` encodes it as one URL path segment.
- `License\ProductId`: the product identifier format. `isValid()` tests it, `assertValid()` throws `InvalidArgumentException`. A value outside the format is refused, never rewritten.
- `License\InstallSigner`: the Ed25519 install key of a pair. The host generates it (`generate()`), sends only `publicKeyB64url()` at enrollment and keeps the private half sealed (`toPrivateKeyPem()`, `seed()`; restored with `fromPrivateKeyPem()`, `fromPkcs8Der()` or `fromSeed()`). The private half never leaves the site. The key changes only by a new enrollment.
- `Delivery\ManifestRequestSigner`: the signer of the HMAC envelope that the manifest, metering and other envelope calls use, keyed by the ingest secret of the pair. Its constructor refuses an empty install id, an invalid product, a non-canonical site id or an empty secret. Never use the install key and the ingest secret for each other's calls.
- `Delivery\Contract\NonceFactoryInterface` and `Delivery\RandomUuidV4NonceFactory`: a fresh nonce for every signed call.
- `License\CanonicalJson`: the canonical JSON encoding the install-key signature covers.
- `License\WireSchema`: `WireSchema::DATE` is the one wire date of the licensing contract this library speaks. Every server call carries it and every signed manifest is checked against it.

## Activation

`License\Activation\ActivationService` activates one pair with an enrollment token the site receives from outside:

- `activate($installId, $product, $siteId, $enrollmentToken)` returns the complete `InstallMaterial`. It generates and seals the install key before the token is spent, enrolls the public half, then bootstraps the ingest key of the pair.
- `state($installId, $product)` returns an `ActivationState`: `NotActivated`, `Partial` (enrolled, ingest key missing), `Activated` or `ReenrollRequired` (the stored material cannot be opened).
- A retry on `Partial` repeats only the ingest-key step: the token is already spent.
- Every step reads and writes only the slot of the product it activates. A failed enrollment restores what that product held before and never touches another product of the same install id.
- The install id is the one the host provisioned. The service never makes one.

The constructor takes the host `InstallMaterialStoreInterface`, an `EnrollClient`, a closure that builds the `EnrollMeteringClient` for a given `InstallSigner`, and the host scope map, whose declared support scopes go in the enrollment.

`License\Activation\ValueObject\InstallMaterial` holds the install id, the product, the sealed private key, the key id and JWKS URL from enrollment, and the ingest key id and secret. `isEnrolled()`, `isComplete()` and `isFor()` read its state; `signer()` rebuilds the `InstallSigner`. Its debug output redacts the secrets.

`License\EnrollClient` and `License\EnrollMeteringClient` are the two calls the service composes, with `EnrollRequest`/`EnrollResult` and `MeteringEnrollRequest`/`MeteringEnrollResult`. A host calls them directly only when it does not use the service.

## License checks

- `License\ValidateClient::validate(ValidateRequest)` returns a `ValidateResult` or, when `ValidateRequest::$etag` matches the cached answer, a `NotModified`. The request carries the pair and the canonical site id, never a license key, and is signed with the install key. `ValidateResult::$status` is `active`, `grace`, `expired` or `revoked`; `expiresAt` and `graceUntil` are Unix seconds or `null`. The result carries no secret.
- `License\Concerns\LicensedExtension` gates an extension on the license. `isAvailable()` is true only when `licenseState()` returns `LicenseState::Valid`:
  - `Valid`: the instance answers `active` or `grace`, and the result is kept as the last valid license. When the instance cannot be reached, or answers not-modified, the kept license still counts until its own expiry. A kept license without an expiry never counts.
  - `Invalid`: a license refusal, a pair that is not enrolled, a cloned install, or a status other than `active` and `grace`. The kept license is erased at once.
  - `Unreachable`: no usable answer and nothing valid to fall back on. Any other failure lands here and never falls back to the kept license.
  - An error from the instance never creates access. A failure of the host wiring (client, request, clock, last-valid port) is not swallowed.
  - The using class implements `buildValidateClient()`, `licenseValidateRequest()`, `licenseClock()`, `loadLastValidLicense()` and `storeLastValidLicense()`. `License\AbstractLicensedExtension` is a standalone base class that uses the trait.
- `License\ResyncClient::resync(ResyncRequest)` returns a `ResyncResult`. A revoked or expired license is a successful answer with `isActive()` false and no key material; `ResyncStatus` is `Active`, `Grace`, `Revoked` or `Expired`.
- `License\ResyncManifestReconciler` applies a resync answer to the stored manifests and returns a `ResyncOutcome` (`Unchanged`, `Refreshed`, `Dropped`):
  - A revoked or expired license, or a released binding, retires the pair at once: the stored licensed manifests of the pair, of every release, its install material and its kept digest are dropped.
  - A changed entitlements digest fetches, verifies and stores a new manifest for the current release, and only then keeps the digest. A failed fetch keeps no digest, so the next resync tries again.
  - `reconcileRefusal()` retires the pair the same way when the resync itself was refused, then rethrows the refusal. The stored default manifest stays.
  - The host calls it from its own license check, for example a scheduled task.
- `License\UpdateCheckClient::check(UpdateCheckRequest)` returns an `UpdateCheckResult`: the channel of the installation, whether an update is available, and the latest version with its download URL and integrity when there is one.

## Manifests and bundles

A host holds two signed manifests per release:

- the **licensed manifest** of the pair, with the bundle modules it may load and its entitlements block;
- the **default manifest** of the release, the baseline that applies without a valid licensed manifest.

Licensed manifest:

- `Delivery\Config\ProtectedManifestConfig`: the configuration of one pair, read once at host boot: install id, product, canonical site id, ingest secret, base URL of the instance, clock skew, JWKS cache TTL and refresh threshold. The constructor validates every field.
- `Delivery\ProtectedManifestService::requestManifest()` fetches, verifies and stores the manifest of a release and returns the `StoredManifest`. It refuses a manifest for another install, product or release, and a sequence number lower than one already accepted for the pair; in both cases nothing is stored and the last valid manifest stays. A manifest of another wire date drops the stored manifest of the release, so the host reads the default manifest until a manifest of its date is served. A refusal that ends the license or the binding retires the pair before it is rethrown.
- `Delivery\ManifestJwsVerifier` checks the signature and the claims (algorithm, type, key family, wire date, issuer, expiry, entitlements digest). The issuer is always injected by the host. The verifier does not know which pair was asked for: the binding and anti-rollback checks are in the service.
- `Delivery\ProtectedManifestClient` (`ProtectedManifestClientInterface`) is the transport the service uses.
- `Delivery\Cron\ManifestRefreshTask`: an abstract task the host binds to its scheduler. It does nothing until a manifest is stored, and renews it when its expiry is closer than the threshold.

Default manifest:

- `Delivery\DefaultManifestService` fetches, verifies and stores the default manifest of a `(product, release)` pair, with the same binding and anti-rollback rules. When the instance serves no default manifest for the release, the stored copy is dropped; a transport error or a server error keeps it.
- A stored default manifest counts for 7 days after its fetch (`StoredDefaultManifest::isValid()`). It has no expiry claim of its own.
- `Delivery\Cron\DefaultManifestRefreshTask`: run it daily, and on demand after an activation or an upgrade that brings a new release.
- `Delivery\DefaultManifestJwsVerifier` and `Delivery\DefaultManifestClient` are its verifier and transport. A licensed manifest is never accepted as a default one, nor the reverse.

Bundles and the front end:

- `Delivery\Enum\DeliveryMode`: `Cdn`, the browser loads each module from its signed URL (recommended), or `Local`, the host stores the modules and serves them itself.
- `Delivery\BundleMaterializer::materialize(AuthorizedManifest)` downloads each entitled module for `Local` delivery and writes it only when its SHA-384 hash matches the integrity value of the manifest.
- `Delivery\ManifestEndpointHandler::handle()` is a read-through over the stored manifest for the host route that serves it to the browser. It returns a `ManifestEndpointResult` whose `ManifestEndpointStatus` is `Ok`, `NotModified`, `NotFound` or `Gone`. The host route owns authentication, the request and response headers and the mapping of the status to HTTP.
- `Delivery\ValueObject\LicensingSharedProps` is the bootstrap shape the host hands to its front end: built from a `StoredManifest` and the URL of the host route.
- Value objects: `AuthorizedManifest`, `ProtectedModule`, `DefaultManifest`, `StoredManifest`, `StoredDefaultManifest`, `ManifestResponse`.

## Entitlements

Two separate questions, two interfaces:

- `License\Contract\LicenseInterface::granted($key)`: may the host load this bundle module? `License\ProtectedLicense` answers it from the stored licensed manifest of the current pair and release. A missing, expired or foreign manifest, or an unlisted module, answers `false`.
- `License\Contract\EntitlementsInterface`: what do the feature keys allow? Keys are `<product>.<feature>[.<sub>]`: lowercase, at most two dots, at most 128 characters. `License\ManifestEntitlements` is the implementation the host registers in its container.
  - `can($key)`: a `boolean` key reads as its own value; a `static` key reads as true unless its limit is `0`.
  - `limit($key)`: the value of a `static` key, `null` for no limit, and `0` when the key is absent, malformed, of kind `boolean`, or when no manifest is valid.

The source of an answer is chosen, never merged:

1. a valid licensed manifest: only its entitlements block. A key absent from the block is absent; it does not fall back to the default manifest;
2. otherwise a valid default manifest (fetched at most 7 days ago);
3. otherwise nothing is valid and every check fails closed.

The library only verifies and reads. It composes no entitlement and never fails open: an error of the licensing instance never creates access.

- `License\EntitlementResolver` applies these rules to a given licensed and default manifest. `granted()`, `can()`, `limit()`, `entitledModules()` and `effectiveBlock()` read it.
- `License\ValueObject\Entitlement` and `License\ValueObject\EntitlementsBlock` are the parsed entries; `License\Enum\EntitlementKind` is `Boolean` or `Static`.
- The `ProtectedLicenseContextInterface` the host implements supplies the current install id, product and release to both implementations.

## Metering

- `License\EventsClient::send(MeteredEvent)` reports one metered usage event, signed with the HMAC envelope of the pair, and returns an `EventsResult` (ledger entry, balance after, cost, acceptance time, and whether the answer is a replay).
- `License\ValueObject\MeteredEvent` takes a UUIDv7 event id (`MeteredEvent::newEventId()`), a type, a positive quantity and an idempotency key. A retry resends the same idempotency key, so the instance replays the original debit instead of debiting twice.

## Account

`Api\Account\SelfClient` acts for a signed-in person on their own account: who they are, their sessions and the download credentials they issued.

- `me()`, `listSessions()`, `revokeSession()`, `listCredentials()` and `revokeCredential()` carry the service token of the administrative system (`Api\Admin\ValueObject\ServiceTokenCredentials`) and the person's access token from `PersonAccessTokenProviderInterface`.
- `issueCredential($licenseId, $idempotencyKey)` returns an `IssuedCredential`. It is authenticated by a separate access token of the person alone, from `LicenseDerivedAccessTokenProviderInterface`, and sends no service token. The two providers have distinct types and never stand in for each other.
- The host supplies the tokens; the library never signs a person in and never refreshes a token. `PersonAccessToken` and `LicenseDerivedAccessToken` are ready-made providers that wrap one token each, with redacted debug output.
- `issueCredential()` takes an `Api\Admin\ValueObject\IdempotencyKey` the caller creates (`IdempotencyKey::generate()`) and keeps with the pending operation. A retry, after a timeout or a server error too, reuses the same key.
- `Api\Account\ValueObject\InstallChannel` holds the channel of an installation and the channels its license allows.

## SSO and remote support

- `Sso\Contract\JwtVerifierInterface::verify($jwt, $expectedAudience)` verifies an EdDSA SSO token for an expected audience.
- `RemoteSupport\ValueObject\SupportedScopes` is the set of support scopes a host declares at enrollment and resync. An unknown scope is dropped, never sent, and an empty set supports no tier. `requireTier()` throws `TierNotSupportedException` when a tier needs a scope the host did not declare.

## Host contracts

The interfaces the host implements, each backed by its own storage:

| Interface                                                   | Holds                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `License\Activation\Contract\InstallMaterialStoreInterface` | The sealed install material, one slot per product. Writes are atomic, a product never overwrites another, and no method prints or logs a secret |
| `Delivery\Contract\ManifestStorageInterface`                | The stored licensed manifests by `(install_id, product, release)`, and the highest accepted sequence number per pair |
| `Delivery\Contract\DefaultManifestStorageInterface`         | The stored default manifests by `(product, release)`, and their highest accepted sequence number |
| `Delivery\Contract\ResyncDigestStoreInterface`              | The last kept entitlements digest of each pair                                              |
| `Delivery\Contract\LocalBundleStorageInterface`             | The bundle modules for `Local` delivery                                                     |
| `Delivery\Contract\ProtectedLicenseContextInterface`        | The current install id, product and release                                                 |
| `Delivery\Contract\ProtectedJwksProviderInterface`          | The signing keys the manifest verifiers check against, cached as the host prefers; `getJwks(true)` bypasses the cache |
| `Api\Account\Contract\PersonAccessTokenProviderInterface`, `Api\Account\Contract\LicenseDerivedAccessTokenProviderInterface` | The person's access tokens for the account calls |

`InMemoryManifestStorage`, `InMemoryDefaultManifestStorage` and `InMemoryResyncDigestStore` in `Delivery` are in-memory implementations for tests.

## Types outside the surface

Some `@api` signatures name types that carry no `@api` tag. Under the rule they are `@internal`:

- `RemoteSupport\Contract\ScopeMapInterface`, taken by the `ActivationService` constructor and by `SupportedScopes::fromScopeMap()`, and `RemoteSupport\Enum\SessionTier`;
- `Sso\ValueObject\VerifiedClaims` and `Sso\ValueObject\Jwks`, returned by the SSO verifier and the JWKS provider;
- the `Sso\Exception` types the manifest verifiers throw (see [Errors](./errors#manifest-verification));
- the abstract client base classes the `@api` clients extend.

Use them only as far as the `@api` signature that names them requires.
