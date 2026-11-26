# SDL-004 RBAC v5 backend candidate

The feature branch contains fourteen additive SQL migrations, Worker authorization changes and local integration tests. Draft PR 7 targets `sdl-staging`. The highest verification stage reached is **Locally Tested**. Independent review and staging approval are pending.

- [Owner-selected policy](../../../docs/SDL-004_Account_Roles_and_Permission_Specification_v5.0.md)
- [Decision coverage and remaining gates](DECISIONS.md)
- [Baseline, implementation checkpoints and test evidence](CHECKPOINT.md)
- [Frontend and Worker API contract](API.md)
- [Migration order, staging acceptance and rollback](RELEASE.md)

Run the existing locked installs from repository root, then `npm run check:worker` and `npm test`. The full suite exercises the frontend, Worker package, historical database contracts and v5 fixtures. For independent engine verification, run the optional native suite described in the release guide. The SQL foundation originally in this proposal package now lives in the versioned migrations directory.

- [P1 amendment implementation, caller inventory and release gates](P1.md)
