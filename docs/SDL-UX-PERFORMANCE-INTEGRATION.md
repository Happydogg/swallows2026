# SDL UX performance management integration

The Stats tab and player profiles use the signed-in Supabase session and the existing scoped Coach, Guardian, Club Admin and Team Manager rosters. The performance UI calls only authenticated RPCs. It does not use the Worker submission router or enable the media or submission flags. A failed history or protocol check keeps the entry form unavailable.

## Backend contract for Round 3

| Operation | RPC and expected behavior |
|---|---|
| Protocols | `sdl_004_pilot_workspace()` supplies the active `protocols` catalog. The frontend uses only protocol ID, label and canonical unit. Confirm this RPC returns the catalog for all four roles. |
| Player history | `sdl_004_pilot_performance(p_player,p_status)` returns the selected player's bounded history, current status, revision, evidence, review note and supersession links. The browser checks the response's player ID. |
| Official and pending entry | `sdl_004_pilot_submit_performance` receives player, protocol, canonical value, date, evidence, a request UUID and whether the chosen role is entering an official result. Club Admin, Team Manager and Coach should receive `approved`. Verified Guardian should receive `pending`. The database determines whether the caller can perform that action. |
| Assigned Coach inbox | `sdl_004_pilot_performance(p_team,p_status: pending)` supplies the chosen team's pending results. The UI uses the returned `can_review` and parent source. `sdl_004_pilot_review_performance` receives the decision, review note and expected revision. |
| Official correction | `sdl_v5_correct_official` receives the prior result ID, protocol, new value, date, evidence, request UUID and distinct mandatory reason. The history screen shows supersession links and the events returned by the history RPC. |

The original pilot contract predated official Admin and Manager entry. The v5 function definitions are available on the RBAC branch. Confirm their deployed versions, authenticated EXECUTE grants and intended role checks before Round 3. The v5 correction RPC records its reason in the audit stream. If the current history RPC omits the correction reason, the UI can show the revision and prior value but cannot retrieve that reason. Confirm whether the existing charts also exclude superseded sessions on the deployed read contract.

## Staging acceptance

1. On the authorized UX staging site, open Stats as separately scoped Club Admin, Team Manager and Coach accounts. Select an authorized player and record an official result. Confirm the permitted profile and Stats history refresh. Try a player outside each role's scope and check that access is denied.
2. Submit a measurement as a verified Guardian. Verify the result is pending and the Guardian cannot enter official results or review. With an independently assigned Coach, approve one submission and reject another with a reason. Check the revisions, resulting statuses, and refresh in both views.
3. Correct an official result with a reason. Check supersession, audit attribution, that the earlier value remains in revision history, and that any official projections use the corrected value. Exercise a stale revision and an interrupted save.
4. Repeat scope changes and account sign-out with an in-flight request. At phone width, check the player/team selectors, date, numeric entry, text fields and review actions.
5. Confirm that the media submission feature remains closed and the existing role and roster screens still work.

Local tests use synthetic identities and responses. Staging acceptance requires backend coordination and an approved deployed contract.
