# Architecture rules

- Agenda and Tasks read pending items through one shared hook (`usePendingItems`) with the same query keys, so any change refreshes both; agenda server events only add meetings and Google Calendar (`skipPending`). Overdue, all-day and priority rules live in `src/lib/tasks/pending.ts`, and every mutation refreshes through `invalidatePendingQueries`.
- Priority alerts are read by an authenticated server function scoped to the active organization and the caller's responsibility; "CIENTE" acknowledgements are stored per user and item in `task_priority_acks` (RLS: own rows only), with a browser-local fallback until migration 21 is applied. Lead cards open globally through `LeadCardHost`/`openLeadCard`, reusing the pipeline `LeadDrawer`.

- Task date filters use one shared local-calendar-day predicate on the merged task display data so List, Kanban and Calendar apply identical inclusive deadline ranges without changing source records.

- The task center merges general tasks and lead schedules through a source-aware display adapter; lead schedules remain in their existing table, tenant-scoped through their parent lead, and use existing scheduling mutations rather than general-task actions.

- Pipeline floating navigation controls the existing board scroll container and observes its size and scroll position; it never changes lead movement or stage ordering.

- Project detail sections use the shared Tabs controls, keeping the project header and alerts visible outside the panels to preserve context.
- Project evolution reads relational stages through the existing authenticated stage function and shared project-stages query key, so roadmap updates refresh the same progress data without introducing new storage or mutation logic.
- Internal roadmap orientations share existing stage/task queries, mutations and dialogs; browser-local layout preference is separate from the portal to avoid coupling their access models.
- Public signup trials are provisioned atomically by a database auth trigger into existing organization tables; server-generated expiry and restrictive data policies prevent client-side trial extensions and cross-tenant access.
- Workspace access and branding are scoped to the authenticated identity; access queries fail closed instead of turning errors into empty memberships.
- Server-function requests use framework CSRF middleware while preserving bearer authentication to reject cross-site mutations.- Task attachments are written only by server functions after permission checks, kept in a private bucket with soft delete and a SHA-256 trail, and copied best-effort to the organization's connected Google Drive; the project journey is read through one definer function that limits clients to their own or client-visible events.
- Project screens stay live through data-free broadcast events on private `project:<id>` channels emitted by database triggers; subscribers are authorized by realtime message policies and refetch through the existing permission-checked reads, with slow polling only as a fallback.
