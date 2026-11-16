---
title: 'middag-php-licensing errors'
---

# Errors

The `@api` exceptions of `middag-php-licensing`, when each one is thrown and what the host does with it. The namespace root is `Middag\Licensing`. Related: [Public API](./public-api).

## Rules for every error

- A refusal message is for the admin log. Show the end user one generic refusal of your own, and keep the typed value (`refusal`, `rejection`, `conflict`, `reason`) for the log.
- A refusal is read from its typed field, never from the human error text.
- A value the library does not know maps to the `Unknown` case of its enum, whatever the other fields of the answer say.
- An error never grants access. Every check fails closed.

## Answers of the licensing instance

`License\Exception\ApiHttpException` (a `RuntimeException`) is the base of every non-success answer of the license, metering and account calls. It keeps the HTTP `status` and the raw `errorBody` for diagnostics. Catching it catches every exception of the table below.

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
| `License\Exception\EnrollConflictException` | Enrollment conflict. `$conflict` is an `EnrollConflict` (`MaxInstallsReached`, `BindingDeactivated`, `InstallAlreadyEnrolled`, `ProductMismatch`, `Unknown`) | Show a generic refusal; log `$conflict`. It is never a cue to resync |
| `License\Exception\AlreadyEnrolledException` | The ingest key of the pair was already issued                                          | `ActivationService` turns it into `IngestKeyAlreadyIssuedException`                         |
| `Api\Account\Exception\AccountRefusedException` | An account call was refused. `$reason` is an `AccountRefusalReason`; `$licenseIds` lists the candidate licenses when a credential request matches several | With `$licenseIds`, repeat the call with one of them; otherwise show a generic refusal       |

Any other non-success answer is a plain `ApiHttpException`.

The refusal catalog `License\Enum\Refusal` is closed: `Expired`, `Revoked`, `Unbound`, `KidRevoked`, `AudMismatch`, `BindingDeactivated`, `RateLimited`, `InstallSiteMismatch`, `ClockSkew`, `InstallNotEnrolled` and `Unknown`. `Expired`, `Revoked` and `BindingDeactivated` retire the pair: its stored licensed manifests and its install material are dropped. On a licensed-manifest call this happens before the exception reaches the host; on a resync, the host passes the exception to `ResyncManifestReconciler::reconcileRefusal()`.

`AccountRefusalReason` is `PersonRequired`, `ValidationFailed`, `IdempotencyKeyRequired`, `IdempotencyConflict`, `IdempotencyInProgress`, `ProductMismatch`, `ChannelNotAllowed` or `Unknown`. Account calls also throw `RateLimitedException`, `ApiTransportException` and `ApiHttpException`.

## Activation

| Exception                                                         | When                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AntiTamper\Exception\SealKeyUnavailableException`                | The store cannot write, read or combine its seal key. `activate()` throws it before calling the instance |
| `License\Activation\Exception\InstallMaterialUnreadableException` | The store holds material for the product that cannot be opened. `state()` reports it as `ReenrollRequired` |
| `License\Activation\Exception\IngestKeyAlreadyIssuedException`    | The instance already issued the ingest key of the pair and returns it only once. Only the operator can release it; the retry then repeats the ingest-key step. The state stays `Partial` |

`activate()` also throws the answers of the instance above: `EnrollTokenRejectedException`, `EnrollConflictException`, `InstallSiteMismatchException`, `LicenseForbiddenException`, `ClockSkewException`, `RateLimitedException`, `ApiUnavailableException` and `ApiHttpException`. A failure after enrollment leaves the state `Partial`.

## Manifests and bundles

| Exception                                                | When                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Delivery\Exception\ManifestRequestException`            | The manifest call failed in transport or returned a non-success status. `$httpStatus` and `$responseBody` keep the answer. A failed fetch during a resync keeps no digest |
| `Delivery\Exception\SchemaUnsupportedException`          | The manifest is for another wire date. `$minSchema` and `$receivedSchema` carry the dates when known. For a licensed manifest, the stored manifest of the release is dropped and the host reads the default manifest |
| `Delivery\Exception\ManifestBindingException`            | The manifest is for another install, product or release than the one asked for. Nothing is stored       |
| `Delivery\Exception\ManifestRollbackException`           | The manifest is older than one already accepted. `$receivedSeq` and `$highestSeq` carry the sequence numbers. Nothing is stored and the last valid manifest stays |
| `Delivery\Exception\BundleMaterializationException`      | A bundle module failed to download or its hash does not match the manifest. `$moduleName` names it. Nothing is written |

The licensed-manifest calls also throw `LicenseForbiddenException`, `NotEnrolledException`, `ClockSkewException` and `InstallSiteMismatchException`, as above.

### Manifest verification

A manifest whose signature or claims fail verification, or whose signing key is not in the JWKS after one refresh, raises an exception of `Sso\Exception`. Those types are not `@api`; they extend `RuntimeException`. Nothing is stored and the last valid manifest stays. Catch the `@api` exceptions of this section first: they are `RuntimeException` too, so a catch of `RuntimeException` alone would also take the rollback, binding and refusal cases.

## Entitlements

`License\Exception\EntitlementRefusedException` is for the host to throw when a feature key is refused. The library reads entitlements and never throws it.

- `EntitlementRefusedException::notGranted($key)`, `noManifest($key)` and `limitReached($key, $limit)` build it.
- `$refusal` is a `License\Enum\EntitlementRefusal`: `BlockedLicense`, `BlockedNoManifest` or `LimitReached`. `$key` is the feature key; `$limit` is the ceiling of a `static` key on `LimitReached`, otherwise `null`.
- An `EntitlementRefusal` is decided on the host and never comes from the instance. Put its `value` in the refusal field of the host's own error body, next to the human text, so a client reads a code instead of a translated string.

## Input

- `License\Exception\InvalidSiteIdException` (an `InvalidArgumentException`): `SiteId::fromWwwroot()` cannot derive a canonical site id. `$reason` is a `License\Enum\SiteIdReason` (`Scheme`, `Port`, `Ip`, `Localhost`, `Host`, `Path`); `$input` is the value given.
- The request value objects, `ProductId::assertValid()` and the configuration objects throw `InvalidArgumentException` for an empty, malformed or out-of-format field. These are programming errors of the host wiring.

## Remote support

`RemoteSupport\Exception\TierNotSupportedException`: a support tier needs a scope the host did not declare. The host refuses before the instance would. `$tier` picks the host's own message; the exception message is for logs only.
