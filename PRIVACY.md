# Privacy Policy for Total Bookmarks

Last updated: October 10, 2026

Total Bookmarks is a browser extension developed by Sergei Galushkin. It provides
a two-pane interface for managing browser bookmarks. This policy applies to the
Chrome and Firefox versions and explains the differences in how they handle
website icons.

## Information used by the extension

Total Bookmarks accesses bookmark titles, URLs, folders, and their order to
display and manage your bookmarks. Creating, moving, reordering, and deleting
bookmarks or folders happens in response to your actions. Changes are made to
the browser's bookmark collection.

The extension reads the browser's interface language to choose an initial
language and saves your chosen language in local extension storage. Selected
items, focused rows, and folder navigation state are held in memory while the
manager is open.

The extension does not read your browsing history, passwords, or cookies. It
does not include advertising, analytics, or usage tracking. Bookmark data and
language preferences are not sent to the developer or to a developer-operated
server, sold, or used for advertising.

## Website icons and network requests

### Chrome

The Chrome version displays website icons through Chrome's built-in favicon
service. It passes the bookmark URL to a local extension endpoint provided by
Chrome. The extension does not run its own icon downloader or use an external
favicon lookup service. Chrome's handling of favicons is controlled by the
browser.

### Firefox

When website access is permitted, the Firefox version downloads icons directly
from bookmarked websites. It requests the site's favicon and, if needed, its
home page to find an icon URL. It may follow redirects and download an icon from
a third-party host, such as a CDN, specified by that website. Cached icons may
also be refreshed in the background.

These requests disclose your IP address and ordinary request metadata to the
contacted website or icon host. The initial requests use the bookmark's origin
(scheme, domain, and port), rather than its full path or query string. Icon
requests do not include browser cookies or a Referer header. No external
favicon lookup service is used. The contacted services handle requests under
their own privacy policies.

## Local storage and retention

Bookmarks remain in the browser's bookmark collection until you change or
delete them. Any bookmark synchronization provided by the browser is governed
by your browser account settings and the browser provider's policies; Total
Bookmarks does not provide a separate synchronization service.

The language preference remains in local extension storage until changed or
removed. In Firefox, a local icon cache stores site origins, icon images, and
timestamps needed to refresh icons and remove old entries. Cache maintenance
removes entries that have not been accessed for more than a year. Diagnostic
messages, including site origins and icon download errors, may appear in the
local extension console; the extension does not upload these logs.

You can manage or delete bookmarks through Total Bookmarks or the browser's
bookmark manager. You can remove local extension settings and cached data using
the browser's extension data controls or by uninstalling the extension. Removing
the extension does not delete your bookmarks. Chrome's favicon cache is managed
separately by Chrome.

## Your controls and external services

You can change the interface language, manage the extension's permissions, or
uninstall it through your browser. In Firefox, you can revoke website access to
stop the extension's icon downloads.

Opening a bookmark or following a link opens the corresponding website. Those
websites, browser synchronization services, and GitHub operate under their own
privacy policies.

Total Bookmarks uses data accessed through browser APIs only to provide its
bookmark management features, in accordance with the Chrome Web Store User Data
Policy, including its Limited Use requirements.

## Changes to this policy

This policy will be updated when the extension's data handling changes. The
date at the top identifies the latest revision.

## Contact

Developer: Sergei Galushkin

For privacy questions, contact the developer through the
[Total Bookmarks GitHub issue tracker](https://github.com/cs0ip/total-bookmarks/issues).
GitHub issues are public; do not include private bookmark URLs or other sensitive
information in an issue.
