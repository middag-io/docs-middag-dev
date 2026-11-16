---
title: 'MIDDAG Framework'
---

# MIDDAG Framework

A platform-agnostic PHP framework for building business domains that do not depend on their host. Write controllers, forms, queries and services against contracts, then run the same code standalone, inside a Moodle plugin, or inside a WordPress plugin, by swapping a thin adapter.

> Your domain should not know, or care, where it runs.

- **[Tutorials](./tutorials/)** — learn by doing: install and run the framework standalone.
- **[Reference](./reference/)** — API and contract detail, organized by concern.
- **[Explanation](./explanation/)** — architecture, boot lifecycle, the OSS × proprietary boundary.
- **[How-to](./how-to/)** — task-oriented guides.

Open source under Apache-2.0 — `middag-io/framework`, plus the Moodle and WordPress adapters, `middag-io/ui` and `middag-io/demo-standalone`. The versioning, platform and guard policy of the whole library family is in [PHP Libraries](/libraries/).
