---
title: 'Identifiers & Visual Ids'
---

# Identifiers & Visual Ids

Which identifier a MIDDAG product stores, and which one it is allowed to show a human. Three
things are often confused: the **key** the database indexes, the **visual id** support reads back
over the phone, and the **business number** a person quotes in a ticket. They have different
owners and different guarantees, and swapping one for another is how a product ends up with a
short code nobody can look up.

## The three, and who owns each

| What | Where it comes from | What it promises |
|---|---|---|
| **Key** | `Middag\Framework\Shared\ValueObject\Uuid` — `v4()` or `v7()` | Unique. Never shown in full; 36 characters is unreadable and unspeakable. |
| **Visual id** | `Uuid::visualId()` / `Uuid::tryVisualId()` (framework `1.19.0`+) | Short, searchable, derived. **Not** unique — see the collision table. |
| **Business number** | A per-type counter in the product (`middag-php-core#96`, written to `idnumber`) | Sequential, unique per type, stable, meant to be quoted. |

## The rule

- A record **a person cites back to you** — an order, a ticket, a certificate, an invoice — gets
  the **business number**. It is the name of the thing in a conversation with a customer, so it
  must be unique, sequential and never change.
- A record referenced for **technical reasons** — support looking up a row, a log line, an audit
  entry, a licensing install — gets the **visual id**. It needs no counter, no new column and no
  coordination: it is derived from the key the row already has.

When both apply, show both: the number for the person, the visual id for whoever has to find the
row.

## Why the tail, and why 12

`visualId()` returns the **last** 12 hex characters of the canonical value, not the first.

A v7 UUID is prefixed with a 48-bit millisecond timestamp, so two ids minted in the same
millisecond share everything up to the random part — a head slice would print the same string for
different rows. The last 12 characters are the whole final group: 48 random bits in v4 and in v7
alike, so the helper reads the same whichever version a column stores, and the page showing it
does not have to know.

Twelve is also the ceiling. Past it the slice would swallow the `-` separator and stop being a
literal substring of the value, which is the property the whole thing rests on:

```php
$uuid->visualId();        // "5337d64b0460"
(string) $uuid;           // "9fe30b4e-7058-4eba-bff9-5337d64b0460"
```

Support takes what the screen shows and finds the row with `LIKE '%-5337d64b0460'`, or greps a log
for it. No reverse mapping, no second column to keep in sync, no migration.

## Collisions are expected, not prevented

48 bits of entropy is plenty to read aloud and far too little to be a key:

| Rows | Probability of at least one collision |
|---|---|
| 10<sup>4</sup> | ~1.8 × 10<sup>-7</sup> |
| 10<sup>5</sup> | ~1.8 × 10<sup>-5</sup> |
| 10<sup>6</sup> | ~0.18 % |

So a screen that **searches** by visual id must be able to show more than one hit — treat the
result as a filter, never as "the row". Past roughly 10<sup>5</sup> rows, add an indexed tail
column instead of scanning with a leading-wildcard `LIKE`, which no index can serve.

## Columns that are not always a UUID

Some `guid` columns carry a hash, a third-party key, or nothing at all. `tryVisualId()` is for
those: it lower-cases and slices a canonical UUID exactly as `visualId()` does, takes the last
characters of anything else as they are, and returns `null` for a null or blank value, so a
template can print it without a guard. It never refuses the value.

The UUID promise does not carry over to an arbitrary string, though: the tail of a sequential or
structured id can repeat across rows. Treat that result as a label, and keep the
`LIKE '%-<visual id>'` lookup for columns that really do hold UUIDs.

## What not to do

- Do not store a visual id. It is derived; storing it creates a second source of truth that drifts.
- Do not use it as a foreign key, a slug, or an idempotency key.
- Do not put it where a business number belongs. "Your order 5337d64b0460" is not an order number.
- Do not invent a per-table short-code scheme. That is the problem this helper exists to end.

## See also

- [FW-011](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-011-framework-composer-portability.md) — why the framework owns generic value objects like this one.
- The `Uuid` value object's own docblock explains why v7 is the right choice for a stored key and
  v4 only for one that must leak nothing about creation time.
