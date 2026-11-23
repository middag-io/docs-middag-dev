---
title: 'wordpress adapter — Mail'
---

# Send email through `wp_mail`

**Goal:** send email from your plugin through WordPress's `wp_mail()`, either as framework `Mail` messages or from PHP templates in your plugin, with the active theme as a fallback.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)).
- A site that can deliver mail. `wp_mail()` uses PHP `mail()` unless an SMTP plugin or a `phpmailer_init` hook configures another transport.

| Class | Use it for |
| --- | --- |
| `Mail\WpMailer` | sending a framework `Mail` through the framework's `MailerInterface` |
| `Mail\EmailSender` | rendering a PHP template from your plugin or the active theme and sending it |
| `Mail\EmailTemplate` | rendering one template file yourself |

## 1. Send framework messages with `WpMailer`

Bind `WpMailer` as the framework mailer in `buildContainer()`:

```php
use Middag\Framework\Mail\Contract\MailerInterface;
use Middag\WordPress\Mail\WpMailer;

$builder->register(MailerInterface::class, WpMailer::class)->setPublic(true);
```

Your services depend on `MailerInterface` only:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Mail;

use Middag\Framework\Mail\Contract\MailerInterface;
use Middag\Framework\Mail\Mail;

final class NoteMailer
{
    public function __construct(
        private readonly MailerInterface $mailer,
    ) {}

    public function sendReminder(string $to, string $title): void
    {
        $this->mailer->send(new Mail(
            to: [$to],
            subject: 'Reminder: ' . $title,
            body: "Your note \"{$title}\" is still open.",
            htmlBody: '<p>Your note <strong>' . esc_html($title) . '</strong> is still open.</p>',
            replyTo: 'Acme Support <support@example.org>',
        ));
    }
}
```

How `WpMailer` maps a `Mail` onto `wp_mail()`:

| `Mail` | `wp_mail()` |
| --- | --- |
| `to` | the recipient list |
| `subject` | the subject |
| `htmlBody` when set, else `body` | the message; an HTML body adds `Content-Type: text/html; charset=UTF-8` |
| `from`, `replyTo`, `cc`, `bcc` | `From:`, `Reply-To:`, `Cc:` and `Bcc:` headers |
| `attachments` | the file paths |

`send()` throws `MiddagInfrastructureException` when `wp_mail()` returns `false`.

## 2. Send templated email with `EmailSender`

Bind `EmailSender` with your component context, so it finds the templates in your plugin:

```php
use Middag\Framework\Kernel\Contract\HostComponentContextInterface;
use Middag\WordPress\Mail\EmailSender;
use Symfony\Component\DependencyInjection\Reference;

$builder->register(EmailSender::class)
    ->setArguments(['$context' => new Reference(HostComponentContextInterface::class)])
    ->setPublic(true);
```

Write the template as `templates/emails/note-digest.php` in your plugin. The template receives the data you pass as `$view`, and nothing else:

```php
<?php
/** @var array{name: string, count: int} $view */
?>
<p>Hello <?php echo esc_html($view['name']); ?>,</p>
<p>You have <?php echo (int) $view['count']; ?> open notes.</p>
```

Send it:

```php
$sent = $sender->send('joe@example.org', 'Your digest', 'note-digest', ['name' => 'Joe', 'count' => 3]);
```

- `send($to, $subject, $templateName, $data = [], $headers = [], $attachments = [])` sends HTML and returns `wp_mail()`'s result. It returns `false`, and logs `Template not found`, when no template matches.
- The template is looked up in `{basePath}/templates/emails/{name}.php` of your `WpComponentContext`, then in `templates/emails/{name}.php` of the active theme, so a theme can only add templates your plugin does not ship.
- `sendRaw($to, $subject, $body, $isHtml = true)` sends a body you built yourself; pass `false` for plain text.
- `sendBulk($recipients, $subject, $templateName, $data)` sends one message per recipient and returns `[email => bool]`.

## What can go wrong

- **`wp_mail() cannot embed "cid:..." parts`.** `WpMailer` throws `MiddagInfrastructureException` for an `Attachment::embedded()` part. Attach the file normally, or use a transport that supports inline parts.
- **`wp_mail() failed to send "..." to ...`.** `wp_mail()` returned `false`. Hook `wp_mail_failed` to read the `WP_Error` with PHPMailer's reason.
- **The plain-text body is missing.** When a `Mail` has an `htmlBody`, `WpMailer` sends only the HTML. `wp_mail()` does not build a multipart message.
- **Every later email has the same sender.** `EmailSender::withFrom($email, $name)` adds `wp_mail_from` and `wp_mail_from_name` filters for the rest of the request, for every plugin. Prefer a `From:` header in `$headers`, or `Mail::$from`.
- **A template variable is undefined.** Templates see only `$view`. Read `$view['name']`, not `$name`.
- **A template error leaves an empty email.** When the template throws, `EmailTemplate` logs the error and renders an empty string, and `send()` still sends it. Test templates with the data you pass.

## Reference

- [Bridges are native first](../../reference/adapters/wordpress/#bridges-are-native-first): `WpMailer` and the template lookup.
- [Configuration & Identity](../../reference/adapters/wordpress/configuration#component-identity): the `basePath()` that `EmailSender` reads.
