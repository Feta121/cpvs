# Hierarchical Coordinator Permission System — full changelog

23 files: 8 added, 15 modified. Nothing existing was dropped, renamed, or
had its behavior changed for the current (now-promoted) coordinator — they
keep 100% of their existing access as a Super Coordinator.

## ADDED

- **`supabase/migrations/0012_coordinator_permissions.sql`** — the whole
  system's schema. See inline comments in the file for full reasoning; summary:
  - 17 new columns on `coordinators`: `is_super_coordinator`, `is_active`,
    plus `can_create/edit/delete_students`, `can_create/edit/delete_hospitals`,
    `can_create/edit/delete_rotations`, `can_manage_attendance`,
    `can_review_appeals`, `can_send_announcements`, `can_manage_schedules`,
    `can_view_reports` (reserved), `can_system_settings` (reserved).
  - Your one existing coordinator is promoted to Super Coordinator with
    every flag on — a one-time bootstrap. Every coordinator created *after*
    this migration starts with everything `false` (least privilege) via
    the column defaults.
  - `is_coordinator()` updated to also require `is_active = true` — this
    single change is what makes "deactivate" lock a coordinator out
    everywhere else in the schema automatically, without touching every
    other policy that already calls it.
  - New `is_super_coordinator()` and `has_permission(perm text)` — the
    latter is one generic function (via `to_jsonb(...) ->> perm`) instead
    of 15 near-identical ones.
  - New BEFORE UPDATE trigger `prevent_self_permission_change` — blocks
    anyone from changing their **own** `is_super_coordinator`, `is_active`,
    or any `can_*` column, independent of which code path attempts it.
  - New RPC `update_coordinator_permissions(...)` — the one call a Super
    Coordinator uses to grant/revoke everything at once (18 params: target
    + all 17 flags). Independently re-checks caller is an active Super
    Coordinator, blocks self-targeting, and blocks removing Super
    Coordinator status from the last remaining one.
  - Every relevant RLS policy rewritten from a blanket `is_coordinator()`
    check to the specific permission needed: `students`, `hospitals`,
    `rotations`, `schedules`, `attendance`, `appeals`, `announcements`,
    `practice_exceptions`, `special_practice_days`, `clinical_days_config`,
    and the `force_delete_hospital` function.

- **`supabase/functions/create-coordinator/index.ts`** — mirrors
  `create-student`'s structure. Caller must be an active Super Coordinator
  (checked explicitly — this uses the service-role key, bypassing RLS, so
  this check is the real enforcement). Username is `firstname` + random
  3-digit number (e.g. `kedir482@cpvs.com`), collision-checked. The Super
  Coordinator sets the new account's initial permissions (including,
  optionally, Super Coordinator status itself) in the same request.

- **`supabase/functions/delete-coordinator/index.ts`** — mirrors
  `delete-student`. Adds two checks specific to coordinators: a coordinator
  can never delete their own account, and the last remaining active Super
  Coordinator can never be deleted.

- **`supabase/functions/reset-coordinator-password/index.ts`** — there was
  no password-reset capability for *any* role before this (only
  self-service via ChangePassword). Generates a fresh temp password
  server-side, sets it via the Admin API, flips `must_change_password`
  back to `true`. Self-reset is blocked — that's what Settings → Change
  password is for.

- **`src/hooks/usePermissions.ts`** — client-side mirror of
  `has_permission()`/`is_super_coordinator()`. This drives hiding UI only;
  it is *not* the security boundary — RLS + the SQL functions/trigger are.

- **`src/pages/coordinator/Coordinators.tsx`** — new page. Every
  coordinator (regular or Super) can view it as a read-only directory, per
  spec. A Super Coordinator additionally gets Add, Edit permissions, Reset
  password, and Delete — all hidden for their own row (self-service is via
  Settings instead).

- **`src/components/coordinator/PermissionsFieldset.tsx`** — the grouped
  permission-toggle UI, shared between the Add-coordinator form and the
  Edit-permissions modal so the two can't drift out of sync. Super
  Coordinator toggle is visually separate from the grouped list (it makes
  everything below it moot when on — those toggles show checked-and-disabled
  in that state, rather than looking stale/unchecked).

- **`src/components/coordinator/CoordinatorPermissionsModal.tsx`** — modal
  for editing an *existing* coordinator's permissions; saves via the
  `update_coordinator_permissions` RPC.

## MODIFIED

- **`supabase/functions/create-student/index.ts`** /
  **`delete-student/index.ts`** — now check the caller's specific
  `can_create_students` / `can_delete_students` flag (or Super Coordinator
  status) instead of just `role === 'coordinator'`. Same reasoning as
  above: service-role key bypasses RLS, so this explicit check is the real
  gate for these two actions now that "any coordinator" is no longer good
  enough.

- **`src/types/database.ts`** — `Coordinator` interface extended with all
  17 new fields; new `PermissionKey` type (single source of truth for the
  15 granular keys, used by the hook, nav filtering, and route guarding so
  they can't disagree with each other).

- **`src/components/ProtectedRoute.tsx`** — new optional `requireAny`
  prop: if the signed-in coordinator has none of the listed permissions
  (and isn't a Super Coordinator), they're redirected away — this is what
  stops someone from bypassing a hidden nav item by typing the URL
  directly. Also added a deactivated-account screen (clear message + sign
  out) for coordinators with `is_active = false` — previously this would
  have just resulted in confusing RLS failures on every action.

- **`src/components/layout/AppShell.tsx`** — `NavItem` gained an optional
  `permissions` array; the nav list is filtered before rendering (items
  with no `permissions` — Dashboard, Settings, Notifications, Coordinators
  — are always shown). New "Coordinators" nav item added (always visible).

- **`src/App.tsx`** — new `/coordinator/coordinators` route (no
  `requireAny` — visible to everyone per spec). Every other coordinator
  route gained a matching `requireAny` so direct-URL access is gated the
  same way the nav is.

- **`src/pages/coordinator/Hospitals.tsx`** — Add gated by
  `can_create_hospitals`; Edit/Deactivate gated by `can_edit_hospitals`;
  Delete gated by `can_delete_hospitals`.

- **`src/pages/coordinator/Rotations.tsx`** — Assign gated by
  `can_create_rotations`; Delete gated by `can_delete_rotations`. (The
  reassign-existing-rotation path does an UPDATE before the INSERT, which
  RLS already covers via `can_edit_rotations` independently of the
  frontend gate.)

- **`src/components/coordinator/BatchAttendanceAccordion.tsx`** — new
  optional `canEdit` prop (defaults `true`, so nothing breaks for any other
  caller); the status-correction dropdown is disabled when false. Nothing
  else on this component changed — viewing records/expanding
  months/days stays available regardless, since this system gates writes,
  not reads.

- **`src/pages/coordinator/AttendanceManagement.tsx`** — passes
  `canEdit={has('can_manage_attendance')}` to the accordion above.

- **`src/pages/coordinator/Appeals.tsx`** — Approve/Reject (and the
  comment field) gated by `can_review_appeals`.

- **`src/pages/coordinator/Announcements.tsx`** — New announcement and
  Delete both gated by `can_send_announcements` (single flag, per your
  answer that this one didn't need splitting).

- **`src/pages/coordinator/Exceptions.tsx`** — both sections (Practice
  exceptions and Extra clinical practice days) — Add and Delete in each —
  gated by `can_manage_schedules`.

- **`src/components/dashboard/ClinicalDaysCard.tsx`** — the weekly
  schedule toggle disabled when lacking `can_manage_schedules`.

- **`src/pages/coordinator/CoordinatorDashboard.tsx`** — "Check for missed
  check-ins" and "Backfill" buttons gated by `can_manage_attendance` (both
  ultimately trigger the same absence-marking logic as that permission
  area).

## Permission-to-page mapping (for reference)

| Permission | Gates |
|---|---|
| `can_create/edit/delete_students` | Students page |
| `can_create/edit/delete_hospitals` | Hospitals page |
| `can_create/edit/delete_rotations` | Rotations page |
| `can_manage_attendance` | Attendance page, Dashboard's check/backfill buttons |
| `can_review_appeals` | Appeals page |
| `can_send_announcements` | Announcements page |
| `can_manage_schedules` | Exceptions page (both sections), Dashboard's weekly schedule card |
| `can_view_reports` | reserved, no page yet |
| `can_system_settings` | reserved, no page yet |
| `is_super_coordinator` | Coordinators page's Add/Edit-permissions/Reset-password/Delete actions |

## Deploying this

1. Run the migration: `supabase db push` (or apply
   `0012_coordinator_permissions.sql` however you normally apply
   migrations).
2. Deploy the three new Edge Functions and redeploy the two updated ones:
   ```
   supabase functions deploy create-coordinator
   supabase functions deploy delete-coordinator
   supabase functions deploy reset-coordinator-password
   supabase functions deploy create-student
   supabase functions deploy delete-student
   ```
3. Deploy the frontend as usual (Vercel).
4. Log in as your (now-promoted) Super Coordinator account and check the
   new Coordinators page — you should see yourself listed as Super
   Coordinator, Active, with no action buttons on your own row.
5. Create a second coordinator with no permissions granted, log in as
   them, and confirm the nav only shows Dashboard/Coordinators/Settings —
   everything else should be hidden until you grant something specific.

## Verification queries (run in the SQL editor as a sanity check)

```sql
-- Should show your promoted account: is_super_coordinator = true, is_active = true
select id, is_super_coordinator, is_active from coordinators;

-- As the Super Coordinator: should return true
select has_permission('can_create_students');

-- Create a second coordinator via the UI with nothing granted, then as them:
select has_permission('can_create_students'); -- false
```
