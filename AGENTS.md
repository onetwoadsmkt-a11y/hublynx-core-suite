# Architecture rules

- Pipeline floating navigation controls the existing board scroll container and observes its size and scroll position; it never changes lead movement or stage ordering.

- Project detail sections use the shared Tabs controls, keeping the project header and alerts visible outside the panels to preserve context.
- Project evolution reads relational stages through the existing authenticated stage function and shared project-stages query key, so roadmap updates refresh the same progress data without introducing new storage or mutation logic.
- Internal roadmap orientations share existing stage/task queries, mutations and dialogs; browser-local layout preference is separate from the portal to avoid coupling their access models.
- Public signup trials are provisioned atomically by a database auth trigger into existing organization tables; server-generated expiry and restrictive data policies prevent client-side trial extensions and cross-tenant access.
- Workspace access and branding are scoped to the authenticated identity; access queries fail closed instead of turning errors into empty memberships.
- Server-function requests use framework CSRF middleware while preserving bearer authentication to reject cross-site mutations.- Task attachments are written only by server functions after permission checks, kept in a private bucket with soft delete and a SHA-256 trail, and copied best-effort to the organization's connected Google Drive; the project journey is read through one definer function that limits clients to their own or client-visible events.
- Project screens stay live through data-free broadcast events on private `project:<id>` channels emitted by database triggers; subscribers are authorized by realtime message policies and refetch through the existing permission-checked reads, with slow polling only as a fallback.
