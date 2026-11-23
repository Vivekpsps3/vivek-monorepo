# Settings

The [registry](settings.registry.ts) owns mounted sections. Link existing app-owned
editors and security/export controls rather than copying their forms. Keep the
grouped index at `/settings` and its deep links in the document manifest.
Flight schedules mount the Travel-owned settings editor used by transport.

[Calendar subscriptions](calendar-section.component.ts) manage the identity-owned
`/api/account/calendar-feeds` lifecycle. Raw URLs are one-time disclosures: keep
them out of the permanent feed list, storage, route parameters and logs. Clear
revealed URLs on session clearing, identity change and route destruction; obsolete
requests and scheduled focus must not publish into a new owner. Preserve selection
on a failed operation and use the existing confirmation and button controls.

Town season and sound on Appearance are the owner-keyed device preference in
[scene appearance](../platform/scene-appearance.ts). Automatic, Default, Spring,
Summer, Autumn, and Winter preview until Save. Automatic uses March through May,
June through August, September through November, and December through February.
Sound stays off and does not autoplay. A failed save keeps the same-session
preview. Nothing here writes Town XP or a server record.

The server composes saved Travel/Media calendars. Settings must not fetch providers,
copy event data or include Finance/Health. Supported feed URLs require a configured
HTTPS origin. Browser fixtures use synthetic capabilities only.
