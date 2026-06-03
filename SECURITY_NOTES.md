# Security notes

## Pending deployment

### Storage write-scoping — `supabase/storage_scope_writes.sql`
**Status: deferred to post-beta. Production runs the permissive write policy.**

**v1 failed in testing.** The first cut used an inline sub-query
`(select couple_id from profiles where id = auth.uid())` inside the storage
policy — a non-`SECURITY DEFINER` read of `profiles` that trips RLS evaluation in
the storage context and **broke banner uploads** (confirmed). It was reverted to
the permissive policy (`bucket_id in (...)`), which is what beta runs on.

**v2 (current file)** replaces that sub-query with the existing proven
`is_couple_member(uuid)` SECURITY DEFINER helper (bypasses profiles RLS), which
avoids the failure. It is **not yet applied** — apply it only after testing all
three upload types (avatar/banner/vault) on a **Vercel preview** first; the
REVERT block restores the permissive policy.

**Decision:** for a trusted beta the permissive write policy is acceptable — the
abuse vector (an authenticated tester crafting raw storage calls to a known UUID
path) is very low risk, and reads are already private via signed URLs. Treat the
v2 scoping as a post-beta hardening item.


Tightens the storage `INSERT`/`UPDATE`/`DELETE` policies from "any authenticated
user can write any path" to per-owner folders:

| Bucket | Write scope | Path |
|---|---|---|
| `avatars` | the uploading user | `<user_id>/…` (path starts with `auth.uid()`) |
| `banners` | the couple | `<couple_id>/…` (banner is shared) |
| `vault`  | the user, within the couple | `<couple_id>/<user_id>/…` |

- **Avatars** `INSERT` is restricted to paths starting with `auth.uid()`. ✔
- **Vault** is scoped to `vault/<couple_id>/<user_id>/`: `path[1]` = couple,
  `path[2]` = `auth.uid()`. The app upload path was patched to match
  (`vault-client.tsx` → `${coupleId}/${me.id}/${uuid}.${ext}`). ✔
- **Reads are untouched.** This migration only changes WRITE policies; the broad
  `storage_read` policy and signed-URL reads are unchanged, so existing objects
  — including legacy `vault/<couple_id>/<file>` paths uploaded before this change
  — remain readable. ✔

**Deploy checklist**
1. Run `supabase/storage_scope_writes.sql` in the Supabase SQL editor.
2. Immediately test: upload a new **avatar**, **banner**, and **vault photo**.
3. If any upload fails, run the REVERT block at the bottom of the migration and
   investigate (it restores the permissive policies).

> Deferred originally because it touches the upload path; now that the app writes
> vault objects to `<couple_id>/<user_id>/…` it is safe to apply alongside that
> client change.

## Residual / known items (tracked, not yet actioned)
- **Storage reads** are broad-authenticated (privacy relies on unguessable UUID
  paths that only appear behind table RLS). Acceptable; revisit if needed.
- **Realtime broadcast channels** (mood/activity) are keyed on the couple UUID
  and are public-by-topic (not RLS-private). Low practical risk.
- **No audit logging.**
