## 🚀 Deploy

Guide deployment to QA, staging, or production using Git tag-based releases.

Architecture {
  - Static game deployed to GCS via `wolfgames/infrastructure` repo dispatch
  - Game identity: `src/game/config/identity.ts` (single source of truth)
  - CI workflow: `.github/workflows/deploy-infra-gcs.yml`
}

Prerequisites {
  - Game must be registered in `wolfgames/infrastructure` before first deploy
  - Without this, the dispatch event is sent but infrastructure ignores it
  - This is a one-time setup step per new game (outside this repo)
}

Constraints {
  - Main-branch-only strategy — all releases come from `main`
  - Semantic versioning (MAJOR.MINOR.PATCH)
  - Never force-push tags
  - Coordinate shared service releases before game releases
  - Confirm environment target with user before tagging
}

Environments {
  QA         → auto-deploy on merge to `main` (no manual action needed)
  Staging    → `git tag staging-v{version}` + push tag
  Production → `git tag v{version}` + push tag
  Manual     → workflow_dispatch with environment picker (dev/qa/staging/production)
}

fn deploy($target) {
  1. Check — confirm current branch is `main`, working tree is clean
  2. Identify — show latest tags and recent commits since last release
     - `git tag -l 'staging-v*' --sort=-v:refname | head -5`
     - `git tag -l 'v*' --sort=-v:refname | head -5`
  3. Version — determine next version bump (major/minor/patch) with user
  4. Tag — create and push the appropriate tag:
     - staging: `git tag staging-v{version} && git push origin staging-v{version}`
     - production: `git tag v{version} && git push origin v{version}`
  5. Verify — confirm tag was pushed, link to infrastructure repo Actions
     - https://github.com/wolfgames/infrastructure/actions
}

fn rollback($target) {
  1. Identify — find last known good tag/revision
  2. Strategy — choose approach:
     - Redeploy previous tag via workflow_dispatch (simplest)
     - Create rollback tag: `git tag v{version}-rollback {previous-sha}`
  3. Execute — perform rollback with user confirmation
  4. Verify — confirm rollback deployment succeeded
}

Semver Guide {
  MAJOR → incompatible API changes
  MINOR → new functionality, backward compatible
  PATCH → backward compatible bug fixes
}

Coordinated Release Order {
  1. Shared services (auth-server, common-game-api) → promote first
  2. Wait for shared service deployment + validation
  3. Independent games → promote after shared services are live
}

Output {
  ## Deploy to $target

  **Current state**
  - Branch: `main`
  - Latest $target tag: `{tag}`
  - Commits since last release: {count}

  **Proposed version**: `{new-version}`
  **Changes included**:
  - {commit summary list}

  Ready to tag and push?
}
