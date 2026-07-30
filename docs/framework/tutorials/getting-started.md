---
title: 'framework — Getting Started'
---

# Getting Started with framework

Requires PHP `^8.2`. Install via Composer:

```bash
composer require middag-io/framework
```

A controller that loads your domain and renders an Inertia page — attribute routing, a domain service injected by the container, no host API in sight:

```php
use Middag\Framework\Http\Controller\AbstractController;
use Middag\Framework\Http\Inertia\InertiaAdapter;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class CourseController extends AbstractController
{
    #[Route('/courses', name: 'courses')]
    public function index(CourseCatalog $catalog): Response
    {
        // CourseCatalog is your own domain service, injected by the container.
        return InertiaAdapter::render('Courses/Index', [
            'courses' => $catalog->published(),
        ]);
    }
}
```

The same controller runs standalone, inside Moodle, or inside WordPress, by swapping the adapter.

## Where it runs

| Target | How |
|--------|-----|
| **Standalone** | Implement `BootstrapInterface`, build the container with `ContainerFactory::build()`, and serve through `StandaloneKernel`. |
| **Moodle** | The OSS `middag-io/moodle` adapter (`MoodleBootstrap` plus the bridge contracts). |
| **WordPress** | The OSS `middag-io/wordpress` adapter (in build-out). |

## Next

- [Overview](../explanation/overview) — the OSS × MIDDAG boundary and licensing model.
- [Architecture](../explanation/architecture) — the four pillars, concern-first layout, and bridge contracts.
- [Bootstrap](../explanation/bootstrap) — boot phases and the concrete boot flow.
