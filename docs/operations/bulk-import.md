# Bulk Importing Files from Reference Branches or Archives

When you need to bring in a large set of files without recreating each one manually, use Git's built-in tooling to sync the changes in one shot. The following workflow keeps the repository history intact and avoids copy/paste drift.

## 1. Add the Source Remote (One-Time)
If the files live in another GitHub repository or branch, add it as a remote once:

```bash
git remote add upstream https://github.com/playtimeusa/playtimeusa-backend.git
```

> Replace the URL with the canonical source of truth if it differs in your fork.

## 2. Fetch the Latest References

```bash
git fetch upstream
```

This gives you access to every branch and tag from the upstream repository.

## 3. Create a Branch That Mirrors the Desired Snapshot

```bash
git checkout -b import-upstream-files upstream/main
```

You now have the full tree from upstream in a local branch. Inspect it, run the test suite, and confirm everything looks good.

## 4. Merge or Cherry-Pick Into Your Working Branch

To merge everything:

```bash
git checkout <your-working-branch>
git merge import-upstream-files
```

If you only need specific commits, cherry-pick them instead:

```bash
git cherry-pick <commit-sha>
```

Resolve conflicts once, then push. Git tracks every file automatically—no manual recreation required.

## Alternative: Apply a Patch Directly
If you only have a diff/patch file, you can stream it straight into Git:

```bash
curl -L https://github.com/playtimeusa/playtimeusa-backend/pull/123.patch | git apply
```

Swap in the actual PR or commit patch URL. Git applies the entire change set, creating all files in one step.

## Alternative: Sync From an Archive
Need a one-off sync from a published tarball or ZIP?

```bash
curl -L https://github.com/playtimeusa/playtimeusa-backend/archive/refs/tags/v1.0.0.tar.gz -o source.tar.gz
tar -xzf source.tar.gz
rsync -av --progress playtimeusa-backend-1.0.0/ ./
```

`rsync` handles additions, updates, and deletions efficiently.

## Automate With npm Scripts
For repeatable automation, drop commands like these into `package.json` scripts:

```json
{
  "scripts": {
    "sync:upstream": "git fetch upstream && git checkout upstream/main",
    "sync:apply-pr": "curl -L $PR_URL | git apply"
  }
}
```

Export `PR_URL` in your shell before invoking `npm run sync:apply-pr`.

---
By leaning on Git's synchronization primitives (fetch, merge, cherry-pick, apply), you can ingest hundreds of files instantly while preserving authorship and history—no manual file creation required.
