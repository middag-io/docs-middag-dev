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

## The libraries

Each OSS library has one entry page with what it is, its requirements and install, where its public surface is listed, its changelog and its status:

- **[framework](./explanation/overview)** — `middag-io/framework`, the host-agnostic kernel.
- **[ui](./explanation/ui/overview)** — `middag-io/ui`, the page contract builders.
- **[Moodle adapter](./reference/adapters/moodle/)** — `middag-io/moodle`.
- **[WordPress adapter](./reference/adapters/wordpress/)** — `middag-io/wordpress`.
- **[Demo application](./reference/demo-standalone/)** — `middag-io/demo-standalone`, the standalone example application.

All five are open source under Apache-2.0. The versioning, platform and guard policy of the whole library family is in [PHP Libraries](/libraries/).
