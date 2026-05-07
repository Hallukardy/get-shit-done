#!/usr/bin/env node
/**
 * Copy GSD hooks to dist for installation.
 * Validates JavaScript syntax before copying to prevent shipping broken hooks.
 * See #1107, #1109, #1125, #1161 — a duplicate const declaration shipped
 * in dist and caused PostToolUse hook errors for all users.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');
const DIST_DIR = path.join(HOOKS_DIR, 'dist');
// Sibling directory used to stage atomic writes. Lives under hooks/ so it
// shares a filesystem with DIST_DIR (POSIX rename(2) is only atomic within
// the same filesystem) but is NOT inside DIST_DIR — so readers that
// readdirSync(DIST_DIR) (e.g. bin/install.js, install-hooks-copy tests)
// never observe a transient ".tmp" sibling file there.
const STAGE_DIR = path.join(HOOKS_DIR, '.dist-staging');

// Hooks to copy (pure Node.js, no bundling needed)
const HOOKS_TO_COPY = [
  'gsd-check-update-worker.js',
  'gsd-check-update.js',
  'gsd-context-monitor.js',
  'gsd-prompt-guard.js',
  'gsd-read-guard.js',
  'gsd-read-injection-scanner.js',
  'gsd-statusline.js',
  'gsd-update-banner.js',
  'gsd-workflow-guard.js',
  // Community hooks (bash, opt-in via .planning/config.json hooks.community)
  'gsd-session-state.sh',
  'gsd-validate-commit.sh',
  'gsd-phase-boundary.sh'
];

/**
 * Validate JavaScript syntax without executing the file.
 * Catches SyntaxError (duplicate const, missing brackets, etc.)
 * before the hook gets shipped to users.
 */
function validateSyntax(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    // Use vm.compileFunction to check syntax without executing
    new vm.Script(content, { filename: path.basename(filePath) });
    return null; // No error
  } catch (e) {
    if (e instanceof SyntaxError) {
      return e.message;
    }
    throw e;
  }
}

function build() {
  // Ensure dist and staging directories exist (staging is a sibling of dist
  // used to make writes atomic — see STAGE_DIR comment above).
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  if (!fs.existsSync(STAGE_DIR)) {
    fs.mkdirSync(STAGE_DIR, { recursive: true });
  }

  let hasErrors = false;

  // Copy hooks to dist with syntax validation
  for (const hook of HOOKS_TO_COPY) {
    const src = path.join(HOOKS_DIR, hook);
    const dest = path.join(DIST_DIR, hook);

    if (!fs.existsSync(src)) {
      console.warn(`Warning: ${hook} not found, skipping`);
      continue;
    }

    // Validate JS syntax before copying (.sh files skip — not Node.js)
    if (hook.endsWith('.js')) {
      const syntaxError = validateSyntax(src);
      if (syntaxError) {
        console.error(`\x1b[31m✗ ${hook}: SyntaxError — ${syntaxError}\x1b[0m`);
        hasErrors = true;
        continue;
      }
    }

    console.log(`\x1b[32m✓\x1b[0m Copying ${hook}...`);
    // Atomic write: copy to a per-process staging file in the sibling
    // STAGE_DIR (same filesystem as DIST_DIR so rename(2) is atomic), then
    // rename into place. Multiple test files invoke this script concurrently
    // from their before() hooks; fs.copyFileSync truncates then writes the
    // destination — readers (install.js subprocesses spawned by parallel
    // install tests) can observe the dest empty or partial mid-write,
    // producing flaky failures such as bug-2136 part 4 where installed .sh
    // hooks lacked their "# gsd-hook-version:" header. POSIX rename(2)
    // makes the swap atomic so readers see either the old file or the new
    // file. The staging file lives outside DIST_DIR so readdirSync(DIST_DIR)
    // (in install.js and tests) never observes a transient ".tmp" sibling.
    const stagedDest = path.join(STAGE_DIR, `${hook}.${process.pid}.${Date.now()}`);
    fs.copyFileSync(src, stagedDest);
    // Preserve executable bit for shell scripts before rename so the
    // installed file is executable from the very first observation.
    if (hook.endsWith('.sh')) {
      try { fs.chmodSync(stagedDest, 0o755); } catch (e) { /* Windows */ }
    }
    fs.renameSync(stagedDest, dest);
  }

  // Best-effort cleanup of the staging dir. If concurrent builders are still
  // running, leftover files belong to them and will be cleaned up on their
  // own renames; rmdir-on-non-empty is a no-op so this is race-safe.
  try {
    const leftovers = fs.readdirSync(STAGE_DIR);
    if (leftovers.length === 0) {
      fs.rmdirSync(STAGE_DIR);
    }
  } catch (e) { /* tolerate races / missing dir */ }

  if (hasErrors) {
    console.error('\n\x1b[31mBuild failed: fix syntax errors above before publishing.\x1b[0m');
    process.exit(1);
  }

  console.log('\nBuild complete.');
}

build();
