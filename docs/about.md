---
title: About docs.middag.dev
---

# About docs.middag.dev

MIDDAG builds developer tooling for people who write PHP business logic on top of a host platform — Moodle, WordPress, or nothing at all — without marrying that logic to the host's API.

Ten years of Moodle plugin development taught the same lesson every time: code written directly against `$DB`, `$CFG`, `mform`, or `$wpdb` doesn't test without booting a full host, doesn't reuse across platforms, and doesn't survive the next platform upgrade. MIDDAG's answer is to separate the "what" — your domain: your rules, your data, your workflows — from the "where" it runs. Write it once against contracts, then run it in Moodle, WordPress, or standalone by swapping a thin adapter.

**`docs.middag.dev` is where that toolkit is documented.**

## What's here today

- **[MIDDAG Framework](/framework/)** — the platform-agnostic PHP framework: dependency injection, PSR-15 HTTP, a query builder, a form engine, a command bus, and an Inertia-based frontend bridge. Open source, Apache-2.0.
- **[middag-react](/middag-react/latest/)** — the React component library for the frontend side of a MIDDAG-based app.

More lands here as the ecosystem grows — adapters for new host platforms, and eventually docs for the MIDDAG products built on top of this foundation.
