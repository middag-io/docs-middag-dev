---
title: 'middag-php-licensing errors'
---

# Errors

The `@api` exceptions and typed refusal enums of `middag-php-licensing` at `v1.16.0`, when each one is thrown and what the host does with it. The namespace root is `Middag\Licensing`. Related: [Public API](./public-api).

## Rules for every error

- A refusal message is for the admin log. Show the end user one generic refusal of your own, and keep the typed value (`refusal`, `rejection`, `conflict`, `reason`) for the log.
- A refusal is read from its typed field, never from the human error text.
- A value the library does not know maps to the `Unknown` case of its enum, whatever the other fields of the answer say.
- An error never grants access. Every check fails closed.

## Answers of the licensing instance

`License\Exception\ApiHttpException` (a `RuntimeException`) is the base of every non-success answer of the license, metering, account and operator calls. It keeps the HTTP `status` and the raw `errorBody` for diagnostics. Catching it catches every exception of the table below.

| Exception                                   | When                                                                                   | Host action                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `License\Exception\LicenseForbiddenException` | The license is refused (validate, resync, update check, metering, ingest-key bootstrap, licensed manifest). `$refusal` is a `License\Enum\Refusal` | Treat the license as not valid. On a metering call, stop reporting usage |
| `License\Exception\NotEnrolledException`    | The pair holds no install key                                                          | Enroll first                                                                                 |
| `License\Exception\ClockSkewException`      | The site clock is too far from the instance clock. `$serverTime` carries the instance time in Unix seconds, when given | Correct the drift, then sign again with a fresh nonce; the library does not retry           |
| `License\Exception\InstallSiteMismatchException` | The install id is bound to another site: a cloned install                         | Generate a new install id                                                                    |
| `License\Exception\RateLimitedException`    | Too many calls. `$retryAfter` carries the wait in seconds, when given                  | Back off, honouring `$retryAfter`. A metering retry reuses the same idempotency key |
| `License\Exception\ApiUnavailableException` | The instance answered with a server error                                              | A license kept from an earlier valid answer still counts until its own expiry |
| `License\Exception\ApiTransportException`   | The PSR-18 transport failed                                                            | A license kept from an earlier valid answer still counts until its own expiry |
| `License\Exception\EnrollTokenRejectedException` | Enrollment refused: the token binds nothing. `$refusal` is a `Refusal`, `$rejection` an `EnrollTokenRejection` (`TokenUnknown`, `TokenExpired`, `SiteMismatch`, `TokenReused`, `Unknown`) | Show a generic refusal; log `$rejection` |
| `License\Exception\EnrollConflictException` | Enrollment conflict. `$conflict` is an `EnrollConflict` (`MaxInstallsReached`, `BindingDeactivated`, `InstallAlreadyEnrolled`, `ProductMismatch`, `Unknown`) | Show a generic refusal; log `$conflict`. It is never a cue to resync. On `BindingDeactivated`, `activate()` clears the material of the pair |
| `License\Exception\AlreadyEnrolledException` | The ingest key of the pair was already issued                                          | `ActivationService` turns it into `IngestKeyAlreadyIssuedException`                         |
| `Api\Account\Exception\AccountRefusedException` | An account call, or a channel call of `InstallChannelAdminClient`, was refused. `$reason` is an `AccountRefusalReason`; `$licenseIds` lists the candidate licenses when a credential request matches several | With `$licenseIds`, repeat the call with one of them; otherwise show a generic refusal       |

| `Api\Admin\Exception\ServiceAuthNotConfiguredException` | An operator or account call: the access gateway in front of the instance did not accept the service token and answered with its interactive sign-in instead | Fix the gateway configuration for the service token; not a code change |
| `Api\Admin\Exception\TokenAlreadyIssuedException` | `EnrollmentTokenClient::issue()`: a current token already exists. `$expiresAt` carries its expiry. The raw token cannot be recovered from this answer | Reuse the token kept when it was first issued, or issue again with `forceReissue` |
| `Api\Admin\Exception\AdminConflictException` | An operator call conflicts: a revoked or expired license on token issue, no free install, a deactivated binding, no active metering key to rotate, or a rotation race | Log it. A rotation race may be retried |
| `Api\Admin\Exception\AdminNotFoundException` | An operator call names what does not exist: an unknown license or pair, a pair without a binding, an unknown key id, or no wallet for the pair | Check the identifiers |
| `Api\Admin\Exception\DomainNotGrantedException` | A wallet or metering-key call: the caller has no grant on the site of the binding of the pair. A service token is trusted on every site | Check which credentials reached the instance |

Any other non-success answer is a plain `ApiHttpException`. Account and operator calls also throw `RateLimitedException`, `ApiUnavailableException` and `ApiTransportException`; the request value objects and `SelfClient::issueCredential()` throw `InvalidArgumentException` for a malformed field.

## Typed refusals

A typed refusal is read from a field of the error body into an enum. Its `value` is the wire code, compared byte for byte.

| Enum                                    | Cases and wire values                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `License\Enum\Refusal`                  | `Expired` (`expired`), `Revoked` (`revoked`), `Unbound` (`unbound`), `KidRevoked` (`kid_revoked`), `AudMismatch` (`aud_mismatch`), `BindingDeactivated` (`binding_deactivated`), `RateLimited` (`rate_limited`), `InstallSiteMismatch` (`install_site_mismatch`), `ClockSkew` (`clock_skew`), `InstallNotEnrolled` (`install_not_enrolled`), `Unknown` (`unknown`) |
| `License\Enum\EnrollTokenRejection`     | `TokenUnknown` (`token_unknown`), `TokenExpired` (`token_expired`), `SiteMismatch` (`site_mismatch`), `TokenReused` (`token_reused`), `Unknown` (`unknown`)                                                                                                                       |
| `License\Enum\EnrollConflict`           | `MaxInstallsReached` (`max_installs reached`), `BindingDeactivated` (`binding_deactivated`), `InstallAlreadyEnrolled` (`install_already_enrolled`), `ProductMismatch` (`product_mismatch`), `Unknown` (`unknown`)                                                                 |
| `Api\Account\Enum\AccountRefusalReason` | `PersonRequired` (`person_required`), `ValidationFailed` (`validation_failed`), `IdempotencyKeyRequired` (`idempotency_key_required`), `IdempotencyConflict` (`idempotency_conflict`), `IdempotencyInProgress` (`idempotency_in_progress`), `ProductMismatch` (`product_mismatch`), `ChannelNotAllowed` (`channel_not_allowed`), `Unknown` (`unknown`) |
| `License\Enum\EntitlementRefusal`       | `BlockedNoManifest` (`entitlement_blocked_no_manifest`), `BlockedLicense` (`entitlement_blocked_license`), `LimitReached` (`entitlement_limit_reached`). Decided on the host, never sent by the instance                                                                        |
| `License\Enum\SiteIdReason`             | `Scheme`, `Port`, `Ip`, `Localhost`, `Host`, `Path`. Decided by the library                                                                                                                                                                                       |

`Refusal`, `EnrollTokenRejection`, `EnrollConflict` and `AccountRefusalReason` read the body themselves (`fromBody()`, `fromWire()`); `EntitlementRefusal::fromCode()` reads a code back. `Expired`, `Revoked` and `BindingDeactivated` retire the pair on a licensed-manifest call, before the exception reaches the host, and on a resync when the host passes the exception to `ResyncManifestReconciler::reconcileRefusal()`: its stored licensed manifests and its install material are dropped.

### Host action per refusal

Only the manifest and resync calls retire a pair by themselves. On a `Refusal` of the validate, update-check, metering or enrollment calls, the host acts as follows:

| Refusal                                           | Host action                                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Revoked`, `Expired`, `Unbound`, `Unknown`        | Stop serving and keep the install material. Serve again when validate answers `active`. A manifest or resync refusal may still retire the pair in the meantime        |
| `BindingDeactivated`                              | Clear the product from the store (`clear($product)`), then use a new install id before the next activation. The library clears the slot by itself only on the enrollment conflict inside `activate()` |
| `InstallSiteMismatch`                             | Use a new install id and activate again. No `clear()` is needed: with the new id, `state()` answers `NotActivated` for the old material                             |
| `InstallNotEnrolled`                              | Activate                                                                                                                                                             |
| `ClockSkew`, `RateLimited`                        | Retry, as the exceptions above say                                                                                                                                   |
| `KidRevoked`, `AudMismatch`                       | No specific action: treat as `Unknown`                                                                                                                               |

Do not assume one install id per site or per product. One site may hold several install ids, and one install id may serve several products. A product that gets a new install id needs a new activation, and so does every other product the host moves to the new id.

## Activation

| Exception                                                         | When                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AntiTamper\Exception\SealKeyUnavailableException`                | The store cannot write, read or combine its seal key. `activate()` throws it before calling the instance |
| `License\Activation\Exception\InstallMaterialUnreadableException` | The store holds material for the product that cannot be opened. `state()` reports it as `ReenrollRequired` |
| `License\Activation\Exception\IngestKeyAlreadyIssuedException`    | The instance already issued the ingest key of the pair and returns it only once. Only the operator can release it; the retry then repeats the ingest-key step. The state stays `Partial` |

`activate()` also throws the answers of the instance above: `EnrollTokenRejectedException`, `EnrollConflictException`, `InstallSiteMismatchException`, `LicenseForbiddenException`, `ClockSkewException`, `RateLimitedException`, `ApiUnavailableException` and `ApiHttpException`. A failure after enrollment leaves the state `Partial`. `activate()` and `state()` throw `InvalidArgumentException` for a product outside the identifier format, before the store is read.

## Manifests and bundles

| Exception                                                | When                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Delivery\Exception\ManifestRequestException`            | The manifest call failed in transport or returned a non-success status. `$httpStatus` and `$responseBody` keep the answer. A failed fetch during a resync keeps no digest |
| `Delivery\Exception\SchemaUnsupportedException`          | The manifest is for another wire date. `$minSchema` and `$receivedSchema` carry the dates when known. For a licensed manifest, the stored manifest of the release is dropped and the host reads the default manifest |
| `Delivery\Exception\ManifestBindingException`            | The manifest is for another install, product or release than the one asked for. Nothing is stored       |
| `Delivery\Exception\ManifestRollbackException`           | The manifest is older than one already accepted. `$receivedSeq` and `$highestSeq` carry the sequence numbers. Nothing is stored and the last valid manifest stays |
| `Delivery\Exception\BundleMaterializationException`      | A bundle module failed to download or its hash does not match the manifest. `$moduleName` names it. Nothing is written |

The licensed-manifest calls also throw `LicenseForbiddenException`, `NotEnrolledException`, `ClockSkewException` and `InstallSiteMismatchException`, as above.

### Signature and key verification

A signed document whose signature or claims fail verification raises an exception of `Sso\Exception`. These types are `@api`, and `Sso\Exception\SsoException` is their base: catch it to handle any of them.

| Exception                             | When                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Sso\Exception\InvalidJwtException`   | The token or manifest is malformed, or its algorithm, type, key family, issuer, audience, time claims or digest are refused |
| `Sso\Exception\UnknownKidException`   | Its signing key is not in the JWKS, even after one forced refresh                                                          |
| `Sso\Exception\JwksFetchException`    | The JWKS could not be fetched                                                                                               |

The manifest verifiers and `Sso\JwtVerifier` throw them. For a manifest, nothing is stored and the last valid manifest stays. `SsoException` extends `RuntimeException`, like the exceptions of the table above: catch the specific ones first, because a catch of `RuntimeException` alone would also take the rollback, binding and refusal cases.

## Entitlements

`License\Exception\EntitlementRefusedException` is for the host to throw when a feature key is refused. The library reads entitlements and never throws it.

- `EntitlementRefusedException::notGranted($key)`, `noManifest($key)` and `limitReached($key, $limit)` build it.
- `$refusal` is a `License\Enum\EntitlementRefusal`: `BlockedLicense`, `BlockedNoManifest` or `LimitReached`. `$key` is the feature key; `$limit` is the ceiling of a `static` key on `LimitReached`, otherwise `null`.
- An `EntitlementRefusal` is decided on the host and never comes from the instance. Put its `value` in the refusal field of the host's own error body, next to the human text, so a client reads a code instead of a translated string.

## Input

- `License\Exception\InvalidSiteIdException` (an `InvalidArgumentException`): `SiteId::fromWwwroot()` cannot derive a canonical site id. `$reason` is a `License\Enum\SiteIdReason` (`Scheme`, `Port`, `Ip`, `Localhost`, `Host`, `Path`); `$input` is the value given.
- The request value objects, `ProductId::assertValid()` and the configuration objects throw `InvalidArgumentException` for an empty, malformed or out-of-format field. These are programming errors of the host wiring.

## Remote support

| Exception                                                | When                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `RemoteSupport\Exception\InvalidSessionTokenException`   | `MagicLinkVerifier::verify()` refuses the support token: malformed, wrong algorithm, type, key family, issuer, audience or role, or a key that cannot be resolved. A key failure is wrapped, with the `Sso\Exception` as previous |
| `RemoteSupport\Exception\TierNotSupportedException`      | A support tier needs a scope the host did not declare. The host refuses before the instance would. `$tier` picks the host's own message; the exception message is for logs only |
| `RemoteSupport\Exception\ConsentRequiredException`       | `SessionManager::preflightRedeem()`: the tier needs the tenant consent and the tenant has not given it                                       |
| `RemoteSupport\Exception\SessionExpiredException`        | The token has expired at preflight, or the instance answers that the session is gone on a heartbeat                                          |
| `RemoteSupport\Exception\SessionRevokedException`        | The instance answers that the session is gone on a revoke                                                                                     |
| `RemoteSupport\Exception\CapabilityDeniedException`      | `CapabilityGuard::require()`: the action needs a scope the session does not grant, or the host map does not allow. `$required` and `$sessionId` name them |

The heartbeat and revoke exceptions come from `HttpApiClient`, so the host sees them through the default `AuditReporter`; a host reporter of its own decides what it throws. `SessionManager::activate()` throws `InvalidArgumentException` for a product outside the identifier format.

## Anti-tamper

| Exception                                                 | When                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AntiTamper\Exception\IntegrityManifestInvalidException`  | The integrity manifest is malformed, its signature does not verify, or its key cannot be resolved. `IntegrityReportService` reports it as `sig_invalid`, and `VerifiedIntegrityManifestProvider` answers `null` |
| `AntiTamper\Exception\IntegrityCheckFailedException`      | `FileIntegrityChecker::check()` cannot read a file of the scope                                                                               |
| `AntiTamper\Exception\SealedConfigTamperedException`      | `SealedConfigService::get()` cannot open a stored value: a short or malformed blob, a key of the wrong length, or an authentication failure. Treat the value as tampered |
| `AntiTamper\Exception\SealKeyUnavailableException`        | `CompositeSealKey::derive()` gets a missing or malformed part, or the host store cannot build or keep its seal key. See [Activation](#activation) |

All four extend `RuntimeException`.
