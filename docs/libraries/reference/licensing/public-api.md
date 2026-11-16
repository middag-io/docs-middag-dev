---
title: 'middag-php-licensing public API'
---

# Public API

The `@api` surface of `middag-php-licensing` at `v1.15.2`, grouped by what a host product does with it. Every type on this page carries `@api`, and every `@api` type is on this page; the [type index](#type-index) lists them by namespace. The namespace root is `Middag\Licensing`. The stability rules are in [API-STABILITY.md](https://github.com/middag-io/middag-php-licensing/blob/v1.15.2/API-STABILITY.md). Errors are on [Errors](./errors). Related: [middag-php-licensing](./).

## Entry points

| The host wants to                                       | Entry point                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Activate a pair `(install_id, product)`                 | `License\Activation\ActivationService`                                                        |
| Gate an extension on the license                        | `License\Concerns\LicensedExtension`, `License\AbstractLicensedExtension`                     |
| Check the license state                                 | `License\ValidateClient`                                                                      |
| Pick up key rotation, revocation and new grants         | `License\ResyncClient`, `License\ResyncManifestReconciler`                                    |
| Fetch and keep the signed licensed manifest             | `Delivery\ProtectedManifestService`, `Delivery\Cron\ManifestRefreshTask`                      |
| Fetch and keep the default manifest of a release        | `Delivery\DefaultManifestService`, `Delivery\Cron\DefaultManifestRefreshTask`                 |
| Ask whether a bundle module may load                    | `License\Contract\LicenseInterface`, `License\ProtectedLicense`                               |
| Read feature flags and limits                           | `License\Contract\EntitlementsInterface`, `License\ManifestEntitlements`                      |
| Serve bundles from its own storage                      | `Delivery\BundleMaterializer`                                                                 |
| Serve the stored manifest to its front end              | `Delivery\ManifestEndpointHandler`, `Delivery\ValueObject\LicensingSharedProps`               |
| Report metered usage                                    | `License\EventsClient`                                                                        |
| Ask which build to run on its channel                   | `License\UpdateCheckClient`                                                                   |
| Act for a signed-in person on their own account         | `Api\Account\SelfClient`                                                                      |
| Operate the licensing instance (MIDDAG operations)      | `Api\Admin\EnrollmentTokenClient`, `Api\Admin\MeteringKeyClient`, `Api\Admin\WalletClient`, `Api\Admin\InstallChannelAdminClient` |
| Verify an SSO token                                     | `Sso\JwtVerifier`                                                                             |
| Run a remote support session                            | `RemoteSupport\SessionManager`                                                                |
| Check file integrity and attest the backend             | `AntiTamper\IntegrityReportService`, `AntiTamper\BackendAttestationService`                   |
| Keep a value sealed at rest                             | `AntiTamper\SealedConfigService`, `AntiTamper\CompositeSealKey`                               |

## Clients and transport

Every client of the licensing instance is a PSR-18 client. Its constructor takes the host `ClientInterface`, the PSR-17 request and stream factories and the base URL of the instance; a signed client also takes its signer, and an install-key client a PSR-20 clock and a nonce factory.

- `Api\Contract\ApiClientInterface`: the marker of a client of the licensing instance. `baseUri()` returns the base URL the host gave it.
- `Api\AbstractApiClient`: the base of every client. Every server call carries the wire date header of `License\WireSchema`; only the public calls a browser could make with a plain GET go without it.
- `License\AbstractLicenseEndpointClient`: the base of the license and metering clients. It sends JSON, wraps a transport failure in `ApiTransportException`, signs a body with the install key and maps every non-success answer to the exceptions on [Errors](./errors#answers-of-the-licensing-instance).
- `Api\Admin\AbstractAdminClient`: the base of the operator clients. Every request carries the service token of `Api\Admin\ValueObject\ServiceTokenCredentials`, and every answer is checked for the case where the access gateway did not accept the service token (`ServiceAuthNotConfiguredException`).
- `Api\Account\AbstractAccountClient`: the base of the account client. It adds the person's access token to the service token.

A host normally uses the concrete clients below. It extends a base class only to write a client of its own for the same instance.

## Identity and signing

- `License\SiteId`: the canonical `site_id` (`host` or `host/path`, lowercase, no scheme, no port, no trailing slash). `fromWwwroot()` derives it from a site root URL and throws `InvalidSiteIdException` when the input cannot be one; `License\Enum\SiteIdPolicy` (`Shape` or `Production`) sets how strict the derivation is. `isCanonical()` tests a value, `encodeSegment()` encodes it as one URL path segment.
- `License\ProductId`: the product identifier format: lowercase letters and digits in groups, starting with a letter, joined by single `-` or `_`, 2 to 64 characters. `isValid()` tests it, `assertValid()` throws `InvalidArgumentException`. A value outside the format is refused, never rewritten.
- `License\InstallSigner`: the Ed25519 install key of a pair. The host generates it (`generate()`), sends only `publicKeyB64url()` at enrollment and keeps the private half sealed (`toPrivateKeyPem()`, `seed()`; restored with `fromPrivateKeyPem()`, `fromPkcs8Der()` or `fromSeed()`). `sign()` signs a message. The private half never leaves the site. The key changes only by a new enrollment.
- `Delivery\ManifestRequestSigner`: the signer of the HMAC envelope that the manifest, metering, integrity report and remote support calls use, keyed by the ingest secret of the pair. Its constructor refuses an empty install id, an invalid product, a non-canonical site id or an empty secret. `signRequest()` adds the envelope headers to a PSR-7 request; `headers()`, `sign()` and `signingString()` expose the parts. Never use the install key and the ingest secret for each other's calls.
- `Delivery\Contract\NonceFactoryInterface` and `Delivery\RandomUuidV4NonceFactory`: a fresh, random, lowercase UUID nonce for every signed call.
- `License\CanonicalJson`: the canonical JSON encoding the install-key signature covers (`encode()` for a body, `encodeValue()` for any value).
- `License\WireSchema`: `WireSchema::DATE` is the one wire date of the licensing contract this library speaks, and `WireSchema::HEADER` the header that carries it. Every server call carries it and every signed manifest is checked against it.

## Activation

`License\Activation\ActivationService` activates one pair with an enrollment token the site receives from outside:

- `activate($installId, $product, $siteId, $enrollmentToken)` returns the complete `InstallMaterial`. It generates and seals the install key before the token is spent, enrolls the public half, then bootstraps the ingest key of the pair.
- `state($installId, $product)` returns a `License\Activation\Enum\ActivationState`: `NotActivated`, `Partial` (enrolled, ingest key missing), `Activated` or `ReenrollRequired` (the stored material cannot be opened).
- Both methods check the product first and throw `InvalidArgumentException` for a product outside the identifier format, before the store is read.
- A retry on `Partial` repeats only the ingest-key step: the token is already spent.
- Every step reads and writes only the slot of the product it activates, and never touches another product of the same install id. A failed enrollment restores what that product held before, with one exception: when the instance answers that the binding of this very pair is deactivated, the material of the pair is cleared, because that pair is closed for good.
- The install id is the one the host provisioned. The service never makes one.

The constructor takes the host `License\Activation\Contract\InstallMaterialStoreInterface`, a `License\EnrollClient`, a closure that builds the `License\EnrollMeteringClient` for a given `InstallSigner`, and the host `RemoteSupport\Contract\ScopeMapInterface`, whose declared support scopes go in the enrollment.

`License\Activation\ValueObject\InstallMaterial` holds the install id, the product, the private install key (the host store keeps it sealed), the key id and JWKS URL from enrollment, and the ingest key id and secret. `pending()`, `withEnrollment()` and `withIngestKey()` build it step by step; `isEnrolled()`, `isComplete()` and `isFor()` read its state; `signer()` rebuilds the `InstallSigner`. Its debug output leaves out the private key and the ingest secret.

`License\EnrollClient` and `License\EnrollMeteringClient` are the two calls the service composes, with `License\ValueObject\EnrollRequest`/`License\ValueObject\EnrollResult` and `License\ValueObject\MeteringEnrollRequest`/`License\ValueObject\MeteringEnrollResult`. A host calls them directly only when it does not use the service. `EnrollRequest::TOKEN_PATTERN` is the token format: 64 lowercase hex characters. `MeteringEnrollResult` carries the ingest secret, returned once.

## License checks

- `License\ValidateClient::validate(ValidateRequest)` returns a `License\ValueObject\ValidateResult` or, when `ValidateRequest::$etag` matches the cached answer, a `License\ValueObject\NotModified`. The `License\ValueObject\ValidateRequest` carries the pair and the canonical site id, never a license key, and is signed with the install key. `ValidateResult::$status` is `active`, `grace`, `expired` or `revoked`; `expiresAt` and `graceUntil` are Unix seconds or `null`. The result carries no secret.
- `License\Concerns\LicensedExtension` gates an extension on the license. `isAvailable()` is true only when `licenseState()` returns `License\Enum\LicenseState::Valid`:
  - `Valid`: the instance answers `active` or `grace`, and the result is kept as the last valid license. When the instance cannot be reached, or answers not-modified, the kept license still counts until its own expiry. A kept license without an expiry never counts.
  - `Invalid`: a license refusal, a pair that is not enrolled, a cloned install, or a status other than `active` and `grace`. The kept license is erased at once.
  - `Unreachable`: no usable answer and nothing valid to fall back on. Any other failure lands here and never falls back to the kept license.
  - An error from the instance never creates access. A failure of the host wiring (client, request, clock, last-valid port) is not swallowed.
  - The using class implements `buildValidateClient()`, `licenseValidateRequest()`, `licenseClock()`, `loadLastValidLicense()` and `storeLastValidLicense()`. `License\AbstractLicensedExtension` is a standalone base class that uses the trait.
- `License\ResyncClient::resync(ResyncRequest)` returns a `License\ValueObject\ResyncResult`. The `License\ValueObject\ResyncRequest` carries the pair, the site id, the SSO key id the host holds and its declared support scopes. A revoked or expired license is a successful answer with `isActive()` false and no key material; `License\Enum\ResyncStatus` is `Active`, `Grace`, `Revoked` or `Expired`.
- `License\ResyncManifestReconciler` applies a resync answer to the stored manifests and returns a `License\Enum\ResyncOutcome` (`Unchanged`, `Refreshed`, `Dropped`):
  - A revoked or expired license, or a released binding, retires the pair at once: the stored licensed manifests of the pair, of every release, its install material and its kept digest are dropped.
  - A changed entitlements digest fetches, verifies and stores a new manifest for the current release, and only then keeps the digest. A failed fetch keeps no digest, so the next resync tries again.
  - `reconcileRefusal()` takes a resync refused with `LicenseForbiddenException`. When the refusal is `binding_deactivated`, `revoked` or `expired`, it retires the pair the same way. It always rethrows the refusal. The stored default manifest stays.
  - The host calls it from its own license check, for example a scheduled task.
- `License\UpdateCheckClient::check(UpdateCheckRequest)` returns a `License\ValueObject\UpdateCheckResult`: the channel of the installation, whether an update is available, and the latest version with its download URL, integrity and host build identifier when there is one. `License\ValueObject\UpdateCheckRequest` takes the installed version as SemVer; `isSemver()` tests it, and any other value is refused before the call.

Only the manifest and resync calls retire a pair by themselves. On a refusal of the validate, update-check, metering or enrollment calls, the host acts as the table [Host action per refusal](./errors#host-action-per-refusal) says.

## Manifests and bundles

A host holds two signed manifests per release:

- the **licensed manifest** of the pair, with the bundle modules it may load and its entitlements block;
- the **default manifest** of the release, the baseline that applies without a valid licensed manifest.

Licensed manifest:

- `Delivery\Config\ProtectedManifestConfig`: the configuration of one pair, read once at host boot: install id, product, canonical site id, ingest secret, base URL of the instance, clock skew, JWKS cache TTL and refresh threshold. The constructor validates every field.
- `Delivery\ProtectedManifestService::requestManifest()` fetches, verifies and stores the manifest of a release and returns the `Delivery\ValueObject\StoredManifest`; `getStoredManifest()` reads it back. It refuses a manifest for another install, product or release, and a sequence number lower than one already accepted for the pair; in both cases nothing is stored and the last valid manifest stays. A manifest of another wire date drops the stored manifest of the release, so the host reads the default manifest until a manifest of its date is served. A refusal that ends the license or the binding retires the pair before it is rethrown.
- `Delivery\ManifestJwsVerifier` checks the signature and the claims (algorithm, type, key family, wire date, issuer, expiry, entitlements digest) and returns the `Delivery\ValueObject\AuthorizedManifest`. The issuer is always injected by the host. The verifier does not know which pair was asked for: the binding and anti-rollback checks are in the service.
- `Delivery\ProtectedManifestClient` (`Delivery\Contract\ProtectedManifestClientInterface`) is the transport the service uses. It returns the unverified `Delivery\ValueObject\ManifestResponse`; trust only what the verifier returns.
- `Delivery\Cron\ManifestRefreshTask`: an abstract task the host binds to its scheduler. It does nothing until a manifest is stored, and renews it when its expiry is closer than the threshold.

Default manifest:

- `Delivery\DefaultManifestService::refresh()` fetches, verifies and stores the default manifest of a `(product, release)` pair, with the same binding and anti-rollback rules; `getStored()` reads it back. When the instance serves no default manifest for the release, the stored copy is dropped; a transport error or a server error keeps it.
- A stored default manifest counts for 7 days after its fetch (`Delivery\ValueObject\StoredDefaultManifest::isValid()`, `MAX_AGE_SECONDS`). It has no expiry claim of its own.
- `Delivery\Cron\DefaultManifestRefreshTask`: run it daily, and on demand after an activation or an upgrade that brings a new release.
- `Delivery\DefaultManifestJwsVerifier` and `Delivery\DefaultManifestClient` (`Delivery\Contract\DefaultManifestClientInterface`) are its verifier and transport. The verifier returns a `Delivery\ValueObject\DefaultManifest`. A licensed manifest is never accepted as a default one, nor the reverse.

Signing keys:

- `Delivery\Contract\ProtectedJwksProviderInterface::getJwks()` returns the one JWKS of the licensing instance that signs the licensed manifest, the default manifest, the integrity manifest and the support token, as an `Sso\ValueObject\Jwks`. Each verifier accepts only the key family of its own document. `getJwks(true)` bypasses the cache.
- `Delivery\HttpProtectedJwksProvider` is the library implementation: a PSR-18 fetch with a PSR-16 cache, 60 seconds by default. When a key is missing from the cached set, a verifier asks for one forced refresh before it refuses the document.

Bundles and the front end:

- `Delivery\Enum\DeliveryMode`: `Cdn`, the browser loads each module from its signed URL (recommended), or `Local`, the host stores the modules and serves them itself. `fromConfig()` reads a host setting.
- `Delivery\BundleMaterializer::materialize(AuthorizedManifest)` downloads each entitled module for `Local` delivery and writes it to the host `Delivery\Contract\LocalBundleStorageInterface` only when its SHA-384 hash matches the integrity value of the manifest.
- `Delivery\ManifestEndpointHandler::handle()` is a read-through over the stored manifest for the host route that serves it to the browser. It returns a `Delivery\ValueObject\ManifestEndpointResult` whose `Delivery\Enum\ManifestEndpointStatus` is `Ok`, `NotModified`, `NotFound` or `Gone`. The host route owns authentication, the request and response headers and the mapping of the status to HTTP.
- `Delivery\ValueObject\LicensingSharedProps` is the bootstrap shape the host hands to its front end: built from a `StoredManifest` and the URL of the host route.
- `Delivery\ValueObject\ProtectedModule` is one entitled module of an `AuthorizedManifest`: its name, signed URL and integrity value.

## Entitlements

Two separate questions, two interfaces:

- `License\Contract\LicenseInterface::granted($key)`: may the host load this bundle module? `License\ProtectedLicense` answers it from the stored licensed manifest of the current pair and release. A missing, expired or foreign manifest, or an unlisted module, answers `false`.
- `License\Contract\EntitlementsInterface`: what do the feature keys allow? Keys are `<product>.<feature>[.<sub>]`: lowercase, at most two dots, at most 128 characters. `License\ManifestEntitlements` is the implementation the host registers in its container; `resolver()` returns the `EntitlementResolver` of the current call.
  - `can($key)`: a `boolean` key reads as its own value; a `static` key reads as true unless its limit is `0`.
  - `limit($key)`: the value of a `static` key, `null` for no limit, and `0` when the key is absent, malformed, of kind `boolean`, or when no manifest is valid.

The source of an answer is chosen, never merged:

1. a valid licensed manifest: only its entitlements block. A key absent from the block is absent; it does not fall back to the default manifest;
2. otherwise a valid default manifest (fetched at most 7 days ago);
3. otherwise nothing is valid and every check fails closed.

The library only verifies and reads. It composes no entitlement and never fails open: an error of the licensing instance never creates access.

- `License\EntitlementResolver` applies these rules to a given licensed and default manifest. `granted()`, `can()`, `limit()`, `entitledModules()`, `getModule()` and `effectiveBlock()` read it.
- `License\ValueObject\Entitlement` and `License\ValueObject\EntitlementsBlock` are the parsed entries; `License\Enum\EntitlementKind` is `Boolean` or `Static`. `Entitlement::isValidKey()` tests a key.
- The `Delivery\Contract\ProtectedLicenseContextInterface` the host implements supplies the current install id, product and release to both implementations.

## Metering

- `License\EventsClient::send(MeteredEvent)` reports one metered usage event, signed with the HMAC envelope of the pair, and returns a `License\ValueObject\EventsResult` (ledger entry, balance after, cost, acceptance time, and whether the answer is a replay).
- `License\ValueObject\MeteredEvent` takes a UUIDv7 event id (`MeteredEvent::newEventId()`), a type, a positive quantity and an idempotency key. A retry resends the same idempotency key, so the instance replays the original debit instead of debiting twice.

## Account

`Api\Account\SelfClient` acts for a signed-in person on their own account: who they are, their sessions and the download credentials they issued.

- `me()`, `listSessions()`, `revokeSession()`, `listCredentials()` and `revokeCredential()` carry the service token of the administrative system (`Api\Admin\ValueObject\ServiceTokenCredentials`) and the person's access token from `Api\Account\Contract\PersonAccessTokenProviderInterface`.
- `issueCredential($licenseId, $idempotencyKey)` returns an `Api\Account\ValueObject\IssuedCredential`. It is authenticated by a separate access token of the person alone, from `Api\Account\Contract\LicenseDerivedAccessTokenProviderInterface`, and sends no service token. The two providers have distinct types and never stand in for each other. The token of an `IssuedCredential` is in that answer only.
- The host supplies the tokens; the library never signs a person in and never refreshes a token. `Api\Account\ValueObject\PersonAccessToken` and `Api\Account\ValueObject\LicenseDerivedAccessToken` are ready-made providers that wrap one token each, with redacted debug output. A long-lived process implements the interfaces instead, so the token is renewed.
- `issueCredential()` takes an `Api\Admin\ValueObject\IdempotencyKey` the caller creates (`IdempotencyKey::generate()`) and keeps with the pending operation. A retry, after a timeout or a server error too, reuses the same key.
- `Api\Account\ValueObject\InstallChannel` holds the channel of an installation and the channels its license allows.

## Operator administration

The `Api\Admin` clients serve MIDDAG operations, not a host product: they issue enrollment tokens, manage metering keys, read wallets and set the channel of an installation. Every call carries the service token of `Api\Admin\ValueObject\ServiceTokenCredentials` (client id and secret, sent on every request). A call whose service token is not accepted by the access gateway in front of the instance raises `ServiceAuthNotConfiguredException`, which is fixed in the gateway configuration, not in code.

- `Api\Admin\EnrollmentTokenClient::issue(TokenIssueRequest, IdempotencyKey)` returns an `Api\Admin\ValueObject\TokenIssueResult`. The `Api\Admin\ValueObject\TokenIssueRequest` names the license by its id (never its key), the product and the site id; with an install id it re-enrolls that existing pair, and `forceReissue` replaces a current token. The raw token is in the result only once: keep it until it is delivered. A second issue while a token is current raises `TokenAlreadyIssuedException`.
- `Api\Admin\MeteringKeyClient::rotate(MeteringKeyRequest)` returns an `Api\Admin\ValueObject\MeteringKeyRotateResult` with the new ingest secret, returned once; the old key keeps working during an overlap window. `revoke(MeteringKeyRequest)` revokes the active key, or the one `Api\Admin\ValueObject\MeteringKeyRequest::$keyId` names, and returns its id. The pair must have a binding.
- `Api\Admin\WalletClient::get($installId, $product, $limit)` returns an `Api\Admin\ValueObject\WalletDetail`: the `Api\Admin\ValueObject\WalletView` of the pair (balance, wallet and license status, billing model) and its most recent `Api\Admin\ValueObject\LedgerEntry` rows, newest first. The client has no top-up.
- `Api\Admin\InstallChannelAdminClient::get($installId, $product)` and `put($installId, $product, $channel)` read and set the channel of an installation and return an `InstallChannel`. The channel must be one the license allows. A channel change takes no idempotency key.
- `Api\Admin\ValueObject\IdempotencyKey` is the idempotency key of a single-writer write, 8 to 128 characters. The clients never create one: the caller generates one per logical operation and reuses it on every retry. The same key with another body is refused.

## SSO

- `Sso\Contract\JwtVerifierInterface::verify($jwt, $expectedAudience)` verifies an EdDSA SSO token for an expected audience and returns `Sso\ValueObject\VerifiedClaims` (issuer, audience, subject, times, token id, key id, and the other claims through `get()` and `has()`).
- `Sso\JwtVerifier` is the library implementation, bound to one pair `(install_id, product)`. It refuses an algorithm other than EdDSA and a missing key id, looks the key up in the cached JWKS of the pair and fetches it again once on a miss, then checks the issuer, the audience and the time claims.
- `Sso\Config\SsoVerificationConfig` holds the expected issuer, the leeway and the JWKS cache TTL. The library ships no issuer default: the host injects it from the configuration of its licensing instance.
- `Sso\Contract\JwksFetcherInterface` fetches the JWKS of a pair; `Sso\HttpJwksFetcher` is its PSR-18 implementation. `Sso\Contract\JwksCacheInterface` caches it; `Sso\Psr16JwksCache` is its PSR-16 implementation.
- `Sso\ValueObject\Jwks` is a key set (`findByKid()`); `Sso\ValueObject\Jwk` is one Ed25519 key (`rawPublicKey()`).

## Remote support

A support session lets a MIDDAG operator act on a site with a support token. The host verifies the token, maps each neutral support scope to what the host can do, and audits every action.

- `RemoteSupport\Enum\SessionScope` is the neutral scope of an action (`StatusRead`, `DiagnosticsRead`, `CachePurge`, `TaskRerun`, `LogRead`, `ConfigProductWrite`, `AdminSite`); `tier()` says which tier it belongs to.
- `RemoteSupport\Enum\SessionTier` is the tier of a session, `One` to `Four`; each tier adds to the one below it. `scopes()` and `includes()` read its scopes, `requiresConsent()` is true for tiers 1 and 2, and `ttlSeconds()` gives its session length.
- `RemoteSupport\Contract\ScopeMapInterface` is the host map from a scope to what the host can do. A scope the map does not cover is denied. `supportedScopes()` and `isAllowed()` must agree.
- `RemoteSupport\ValueObject\SupportedScopes` is the set of support scopes a host declares at enrollment and resync, built with `fromScopes()` or `fromScopeMap()`. An unknown scope is dropped, never sent, and an empty set supports no tier. `requireTier()` throws `TierNotSupportedException` when a tier needs a scope the host did not declare.
- `RemoteSupport\MagicLinkVerifier::verify($jws, $expectedInstallId, $nowSec)` verifies the support token against the support key family of the JWKS and returns a `RemoteSupport\ValueObject\SessionToken`. `RemoteSupport\Config\RemoteSupportConfig` carries the base URL of the instance, the expected issuer, the heartbeat interval and the clock skew; it carries no key.
- `RemoteSupport\CapabilityGuard` checks every action: `require()` throws `CapabilityDeniedException` unless the token grants the scope and the host map declares and allows it; `allows()` answers the same question. `supportsTier()` and `requireTier()` check a tier against the map.
- `RemoteSupport\SessionManager` runs the session: `preflightRedeem()` verifies the token, the tier, the tenant consent and the expiry; `activate($token, $product)` stores the session and begins impersonation; `heartbeat()`, `end()` and `revoke()` follow the lifecycle and report it. `RemoteSupport\Enum\SessionStatus` is `Pending`, `Active`, `Ended`, `Revoked` or `Expired` (`isTerminal()`); `RemoteSupport\Enum\RevokeReason` is `StartFailed` or `TenantAdmin`.
- `RemoteSupport\Contract\SessionStoreInterface` keeps the active session per pair `(install_id, product)`; `RemoteSupport\InMemorySessionStore` is a process-local implementation for tests. Two products of one install never see each other's session.
- `RemoteSupport\Contract\ImpersonationInterface` is the host impersonation: a shadow support user, the capabilities of the token for the session lifetime, and audit rows attributed to both the operator and the shadow user.
- `RemoteSupport\Contract\AuditReporterInterface` reports actions and lifecycle events. `RemoteSupport\AuditReporter` is the default, synchronous implementation over `RemoteSupport\HttpApiClient`, the client of the support calls, signed with the HMAC envelope of the pair. `RemoteSupport\ValueObject\SessionAction` is one audited action; it carries the SHA-256 of its payload, never the payload (`withPayload()` hashes it).
- `RemoteSupport\Config\SupportNoticeOptions` holds the host options of the support notice: whether it is on, its recipients, the tiers that notify (3 and 4 by default), whether a failed notice refuses the session, whether the operator e-mail is shown and whether the audit log is sent at the end. The library decides; the host sends the mail.

## Anti-tamper

The anti-tamper module checks the files of a release against a signed integrity manifest, attests the backend to the browser and keeps values sealed at rest. It reports; it does not block.

- `AntiTamper\Config\AntiTamperConfig` holds the base URL of the instance, the release tag, the file scopes (`critical`, `important`, `skip` paths) and the `AntiTamper\Enum\ReactionMode` (`LogOnly` by default, `Degrade`, `HardFail`). It carries no key. `AntiTamper\Enum\FileScope` is `Critical` or `Important`. The library carries the reaction mode in its reports; what the product does with it is the product's policy.
- `AntiTamper\HttpIntegrityManifestClient` fetches the integrity manifest of a release (`fetch()`, `null` when there is none) and posts integrity reports signed with the HMAC envelope of the pair (`report()`). It implements `AntiTamper\Contract\IntegrityReporterInterface`.
- `AntiTamper\IntegrityManifestVerifier::verify($payload)` checks the Ed25519 signature of the manifest against the integrity key family of the JWKS and returns an `AntiTamper\ValueObject\IntegrityManifest`. No key is embedded in the host. It fails closed: a JWKS that cannot be fetched, a key missing after one forced refresh or a key of another family throws `IntegrityManifestInvalidException`. `canonicalJson()` is the encoding the signature covers.
- `AntiTamper\VerifiedIntegrityManifestProvider` implements `AntiTamper\Contract\IntegrityManifestProviderInterface`: `current()` returns the verified manifest of the release, or `null` when it is missing or does not verify. The raw payload may be cached (PSR-16, one hour by default); the signature is checked again on every read.
- `AntiTamper\FileIntegrityChecker` implements `AntiTamper\Contract\IntegrityCheckerInterface`: `check($manifest, $scope)` hashes the files of a scope with the salt of the manifest and returns the `added`, `modified` and `removed` paths; `hashManifestFiles()` hashes every file the manifest lists, `null` for a file it cannot read.
- `AntiTamper\IntegrityReportService::runScope($scope)` runs one check: fetch, verify, scan and report. It returns the `AntiTamper\ValueObject\IntegrityReport` it sent, whose status is `ok`, `drift`, `missing_manifest` or `sig_invalid` (`isOk()`, `isDrift()`). The host binds it to its scheduler.
- `AntiTamper\BackendAttestationService::attest($siteId)` returns an `AntiTamper\ValueObject\BackendAttestation`, or `null` without a verified manifest: the hash of every file the manifest lists, the effective entitlements, and a proof signed with the install key. The signature is made in PHP; the browser only carries it. `filesMismatch()` lists the files whose hash differs from the manifest or that cannot be read.
- `AntiTamper\SealedConfigService` seals named values at rest with an authenticated cipher over the host `AntiTamper\Contract\SealedStorageInterface`, under a 32-byte key the caller derives. `get()` throws `SealedConfigTamperedException` when a stored value does not open.
- `AntiTamper\CompositeSealKey` builds a seal key from two parts the host keeps in different places, one in its database and one in a file outside it, so a database dump alone cannot open the sealed install material. `generatePart()` makes a part, `isWellFormedPart()` tests one, and `derive()` throws `SealKeyUnavailableException` when a part is missing or malformed.

## Host contracts

The interfaces the host implements or supplies an implementation for:

| Interface                                                   | Holds                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `License\Activation\Contract\InstallMaterialStoreInterface` | The sealed install material, one slot per product. Writes are atomic, a product never overwrites another, and no method prints or logs a secret |
| `Delivery\Contract\ManifestStorageInterface`                | The stored licensed manifests by `(install_id, product, release)`, and the highest accepted sequence number per pair |
| `Delivery\Contract\DefaultManifestStorageInterface`         | The stored default manifests by `(product, release)`, and their highest accepted sequence number |
| `Delivery\Contract\ResyncDigestStoreInterface`              | The last kept entitlements digest of each pair                                              |
| `Delivery\Contract\LocalBundleStorageInterface`             | The bundle modules for `Local` delivery                                                     |
| `Delivery\Contract\ProtectedLicenseContextInterface`        | The current install id, product and release                                                 |
| `Delivery\Contract\ProtectedJwksProviderInterface`          | The signing keys the manifest, integrity and support verifiers check against                |
| `Api\Account\Contract\PersonAccessTokenProviderInterface`, `Api\Account\Contract\LicenseDerivedAccessTokenProviderInterface` | The person's access tokens for the account calls |
| `RemoteSupport\Contract\ScopeMapInterface`                  | The map from a support scope to what the host can do                                        |
| `RemoteSupport\Contract\SessionStoreInterface`              | The active support session of each pair                                                     |
| `RemoteSupport\Contract\ImpersonationInterface`             | The shadow support user and its capabilities                                                |
| `AntiTamper\Contract\SealedStorageInterface`                | The sealed blobs, in the host persistence                                                   |

`Delivery\InMemoryManifestStorage`, `Delivery\InMemoryDefaultManifestStorage`, `Delivery\InMemoryResyncDigestStore` and `RemoteSupport\InMemorySessionStore` are process-local implementations for tests and bare deployments; a product adapter replaces them with its own storage.

## Type index

Every `@api` type of `v1.15.2`, by namespace, relative to `Middag\Licensing`. Exceptions are on [Errors](./errors).

### `License` (64)

- `License`: `License\AbstractLicenseEndpointClient`, `License\AbstractLicensedExtension`, `License\CanonicalJson`, `License\EnrollClient`, `License\EnrollMeteringClient`, `License\EntitlementResolver`, `License\EventsClient`, `License\InstallSigner`, `License\ManifestEntitlements`, `License\ProductId`, `License\ProtectedLicense`, `License\ResyncClient`, `License\ResyncManifestReconciler`, `License\SiteId`, `License\UpdateCheckClient`, `License\ValidateClient`, `License\WireSchema`.
- `License\Activation`: `License\Activation\ActivationService`.
- `License\Activation\Contract`: `License\Activation\Contract\InstallMaterialStoreInterface`.
- `License\Activation\Enum`: `License\Activation\Enum\ActivationState`.
- `License\Activation\Exception`: `License\Activation\Exception\IngestKeyAlreadyIssuedException`, `License\Activation\Exception\InstallMaterialUnreadableException`.
- `License\Activation\ValueObject`: `License\Activation\ValueObject\InstallMaterial`.
- `License\Concerns`: `License\Concerns\LicensedExtension`.
- `License\Contract`: `License\Contract\EntitlementsInterface`, `License\Contract\LicenseInterface`.
- `License\Enum`: `License\Enum\EnrollConflict`, `License\Enum\EnrollTokenRejection`, `License\Enum\EntitlementKind`, `License\Enum\EntitlementRefusal`, `License\Enum\LicenseState`, `License\Enum\Refusal`, `License\Enum\ResyncOutcome`, `License\Enum\ResyncStatus`, `License\Enum\SiteIdPolicy`, `License\Enum\SiteIdReason`.
- `License\Exception`: `License\Exception\AlreadyEnrolledException`, `License\Exception\ApiHttpException`, `License\Exception\ApiTransportException`, `License\Exception\ApiUnavailableException`, `License\Exception\ClockSkewException`, `License\Exception\EnrollConflictException`, `License\Exception\EnrollTokenRejectedException`, `License\Exception\EntitlementRefusedException`, `License\Exception\InstallSiteMismatchException`, `License\Exception\InvalidSiteIdException`, `License\Exception\LicenseForbiddenException`, `License\Exception\NotEnrolledException`, `License\Exception\RateLimitedException`.
- `License\ValueObject`: `License\ValueObject\EnrollRequest`, `License\ValueObject\EnrollResult`, `License\ValueObject\Entitlement`, `License\ValueObject\EntitlementsBlock`, `License\ValueObject\EventsResult`, `License\ValueObject\MeteredEvent`, `License\ValueObject\MeteringEnrollRequest`, `License\ValueObject\MeteringEnrollResult`, `License\ValueObject\NotModified`, `License\ValueObject\ResyncRequest`, `License\ValueObject\ResyncResult`, `License\ValueObject\UpdateCheckRequest`, `License\ValueObject\UpdateCheckResult`, `License\ValueObject\ValidateRequest`, `License\ValueObject\ValidateResult`.

### `Delivery` (41)

- `Delivery`: `Delivery\BundleMaterializer`, `Delivery\DefaultManifestClient`, `Delivery\DefaultManifestJwsVerifier`, `Delivery\DefaultManifestService`, `Delivery\HttpProtectedJwksProvider`, `Delivery\InMemoryDefaultManifestStorage`, `Delivery\InMemoryManifestStorage`, `Delivery\InMemoryResyncDigestStore`, `Delivery\ManifestEndpointHandler`, `Delivery\ManifestJwsVerifier`, `Delivery\ManifestRequestSigner`, `Delivery\ProtectedManifestClient`, `Delivery\ProtectedManifestService`, `Delivery\RandomUuidV4NonceFactory`.
- `Delivery\Config`: `Delivery\Config\ProtectedManifestConfig`.
- `Delivery\Contract`: `Delivery\Contract\DefaultManifestClientInterface`, `Delivery\Contract\DefaultManifestStorageInterface`, `Delivery\Contract\LocalBundleStorageInterface`, `Delivery\Contract\ManifestStorageInterface`, `Delivery\Contract\NonceFactoryInterface`, `Delivery\Contract\ProtectedJwksProviderInterface`, `Delivery\Contract\ProtectedLicenseContextInterface`, `Delivery\Contract\ProtectedManifestClientInterface`, `Delivery\Contract\ResyncDigestStoreInterface`.
- `Delivery\Cron`: `Delivery\Cron\DefaultManifestRefreshTask`, `Delivery\Cron\ManifestRefreshTask`.
- `Delivery\Enum`: `Delivery\Enum\DeliveryMode`, `Delivery\Enum\ManifestEndpointStatus`.
- `Delivery\Exception`: `Delivery\Exception\BundleMaterializationException`, `Delivery\Exception\ManifestBindingException`, `Delivery\Exception\ManifestRequestException`, `Delivery\Exception\ManifestRollbackException`, `Delivery\Exception\SchemaUnsupportedException`.
- `Delivery\ValueObject`: `Delivery\ValueObject\AuthorizedManifest`, `Delivery\ValueObject\DefaultManifest`, `Delivery\ValueObject\LicensingSharedProps`, `Delivery\ValueObject\ManifestEndpointResult`, `Delivery\ValueObject\ManifestResponse`, `Delivery\ValueObject\ProtectedModule`, `Delivery\ValueObject\StoredDefaultManifest`, `Delivery\ValueObject\StoredManifest`.

### `Api` (2)

- `Api`: `Api\AbstractApiClient`.
- `Api\Contract`: `Api\Contract\ApiClientInterface`.

### `Api\Account` (10)

- `Api\Account`: `Api\Account\AbstractAccountClient`, `Api\Account\SelfClient`.
- `Api\Account\Contract`: `Api\Account\Contract\LicenseDerivedAccessTokenProviderInterface`, `Api\Account\Contract\PersonAccessTokenProviderInterface`.
- `Api\Account\Enum`: `Api\Account\Enum\AccountRefusalReason`.
- `Api\Account\Exception`: `Api\Account\Exception\AccountRefusedException`.
- `Api\Account\ValueObject`: `Api\Account\ValueObject\InstallChannel`, `Api\Account\ValueObject\IssuedCredential`, `Api\Account\ValueObject\LicenseDerivedAccessToken`, `Api\Account\ValueObject\PersonAccessToken`.

### `Api\Admin` (19)

- `Api\Admin`: `Api\Admin\AbstractAdminClient`, `Api\Admin\EnrollmentTokenClient`, `Api\Admin\InstallChannelAdminClient`, `Api\Admin\MeteringKeyClient`, `Api\Admin\WalletClient`.
- `Api\Admin\Exception`: `Api\Admin\Exception\AdminConflictException`, `Api\Admin\Exception\AdminNotFoundException`, `Api\Admin\Exception\DomainNotGrantedException`, `Api\Admin\Exception\ServiceAuthNotConfiguredException`, `Api\Admin\Exception\TokenAlreadyIssuedException`.
- `Api\Admin\ValueObject`: `Api\Admin\ValueObject\IdempotencyKey`, `Api\Admin\ValueObject\LedgerEntry`, `Api\Admin\ValueObject\MeteringKeyRequest`, `Api\Admin\ValueObject\MeteringKeyRotateResult`, `Api\Admin\ValueObject\ServiceTokenCredentials`, `Api\Admin\ValueObject\TokenIssueRequest`, `Api\Admin\ValueObject\TokenIssueResult`, `Api\Admin\ValueObject\WalletDetail`, `Api\Admin\ValueObject\WalletView`.

### `Sso` (14)

- `Sso`: `Sso\HttpJwksFetcher`, `Sso\JwtVerifier`, `Sso\Psr16JwksCache`.
- `Sso\Config`: `Sso\Config\SsoVerificationConfig`.
- `Sso\Contract`: `Sso\Contract\JwksCacheInterface`, `Sso\Contract\JwksFetcherInterface`, `Sso\Contract\JwtVerifierInterface`.
- `Sso\Exception`: `Sso\Exception\InvalidJwtException`, `Sso\Exception\JwksFetchException`, `Sso\Exception\SsoException`, `Sso\Exception\UnknownKidException`.
- `Sso\ValueObject`: `Sso\ValueObject\Jwk`, `Sso\ValueObject\Jwks`, `Sso\ValueObject\VerifiedClaims`.

### `RemoteSupport` (25)

- `RemoteSupport`: `RemoteSupport\AuditReporter`, `RemoteSupport\CapabilityGuard`, `RemoteSupport\HttpApiClient`, `RemoteSupport\InMemorySessionStore`, `RemoteSupport\MagicLinkVerifier`, `RemoteSupport\SessionManager`.
- `RemoteSupport\Config`: `RemoteSupport\Config\RemoteSupportConfig`, `RemoteSupport\Config\SupportNoticeOptions`.
- `RemoteSupport\Contract`: `RemoteSupport\Contract\AuditReporterInterface`, `RemoteSupport\Contract\ImpersonationInterface`, `RemoteSupport\Contract\ScopeMapInterface`, `RemoteSupport\Contract\SessionStoreInterface`.
- `RemoteSupport\Enum`: `RemoteSupport\Enum\RevokeReason`, `RemoteSupport\Enum\SessionScope`, `RemoteSupport\Enum\SessionStatus`, `RemoteSupport\Enum\SessionTier`.
- `RemoteSupport\Exception`: `RemoteSupport\Exception\CapabilityDeniedException`, `RemoteSupport\Exception\ConsentRequiredException`, `RemoteSupport\Exception\InvalidSessionTokenException`, `RemoteSupport\Exception\SessionExpiredException`, `RemoteSupport\Exception\SessionRevokedException`, `RemoteSupport\Exception\TierNotSupportedException`.
- `RemoteSupport\ValueObject`: `RemoteSupport\ValueObject\SessionAction`, `RemoteSupport\ValueObject\SessionToken`, `RemoteSupport\ValueObject\SupportedScopes`.

### `AntiTamper` (22)

- `AntiTamper`: `AntiTamper\BackendAttestationService`, `AntiTamper\CompositeSealKey`, `AntiTamper\FileIntegrityChecker`, `AntiTamper\HttpIntegrityManifestClient`, `AntiTamper\IntegrityManifestVerifier`, `AntiTamper\IntegrityReportService`, `AntiTamper\SealedConfigService`, `AntiTamper\VerifiedIntegrityManifestProvider`.
- `AntiTamper\Config`: `AntiTamper\Config\AntiTamperConfig`.
- `AntiTamper\Contract`: `AntiTamper\Contract\IntegrityCheckerInterface`, `AntiTamper\Contract\IntegrityManifestProviderInterface`, `AntiTamper\Contract\IntegrityReporterInterface`, `AntiTamper\Contract\SealedStorageInterface`.
- `AntiTamper\Enum`: `AntiTamper\Enum\FileScope`, `AntiTamper\Enum\ReactionMode`.
- `AntiTamper\Exception`: `AntiTamper\Exception\IntegrityCheckFailedException`, `AntiTamper\Exception\IntegrityManifestInvalidException`, `AntiTamper\Exception\SealKeyUnavailableException`, `AntiTamper\Exception\SealedConfigTamperedException`.
- `AntiTamper\ValueObject`: `AntiTamper\ValueObject\BackendAttestation`, `AntiTamper\ValueObject\IntegrityManifest`, `AntiTamper\ValueObject\IntegrityReport`.
