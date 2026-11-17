# Settings

The [registry](settings.registry.ts) owns mounted sections. Link existing app-owned
editors and security/export controls rather than copying their forms.

[Calendar subscriptions](calendar-section.component.ts) manage the identity-owned
`/api/account/calendar-feeds` lifecycle. Raw URLs are one-time disclosures: keep
them out of the permanent feed list, storage, route parameters and logs. Clear
revealed URLs on session clearing, identity change and route destruction; obsolete
requests and scheduled focus must not publish into a new owner. Preserve selection
on a failed operation and use the existing confirmation and button controls.

The server composes saved Travel/Media calendars. Settings must not fetch providers,
copy event data or include Finance/Health. Supported feed URLs require a configured
HTTPS origin. Browser fixtures use synthetic capabilities only.
