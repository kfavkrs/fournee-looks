#!/bin/zsh
# Double-click this file to get the latest Fournée, rebuild every look, and check them.
# Safe to run any time: if Fournée hasn't changed, it just rebuilds and checks.
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
LOOKS_DIR="$PWD"
FOURNEE="$LOOKS_DIR/../fournee"

finish() { echo ""; echo "Press Return to close this window."; read; exit ${1:-0}; }

echo "=== 1. Getting the latest Fournée ==="
if [[ ! -d "$FOURNEE/.git" ]]; then
  echo "Can't find Fournée at $FOURNEE. Stopping."; finish 1
fi
cd "$FOURNEE"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Fournée has local edits (it should be read-only). Stopping so nothing is lost."
  git status --short --untracked-files=no
  finish 1
fi
if ! git fetch --quiet; then
  echo "Couldn't reach GitHub (offline?). Rebuilding with the Fournée you already have."
fi
OLD=$(git rev-parse --short HEAD)
NEW=$(git rev-parse --short origin/main 2>/dev/null || echo "$OLD")
if [[ "$OLD" == "$NEW" ]]; then
  echo "Already up to date (version $(node -p "require('./package.json').version"))."
else
  echo "New changes in Fournée:"
  git log --oneline "$OLD..$NEW" 2>/dev/null || echo "(Fournée's history was rewritten, so the list of changes isn't available)"
  git reset --hard --quiet origin/main
  echo "Updated $OLD -> $NEW (version $(node -p "require('./package.json').version"))."
fi
cd "$LOOKS_DIR"

echo ""
echo "=== 2. Rebuilding and checking each look ==="
BUILD_FAILED=0
for dir in looks/*/; do
  slug=$(basename "$dir")
  [[ "$slug" == _* ]] && continue
  [[ -f "$dir/recipe.json" ]] || continue
  echo ""
  echo "--- $slug ---"
  if node tools/build-look.mjs "$slug"; then
    node tools/check.mjs "$slug"
  else
    echo "BUILD FAILED for $slug"; BUILD_FAILED=1
  fi
done
echo ""
echo "Note: HARD lines you've already decided to keep are expected. Anything new is worth a look."

echo ""
echo "=== 3. Saving to GitHub ==="
# Two repos share this folder: the public one (.git, kfavkrs/fournee-looks) and the private one
# (.git-private, kfavkrs/fournee-looks-private) for private looks. Each ignores the other's files.
pub() { git "$@"; }
priv() { git --git-dir="$LOOKS_DIR/.git-private" --work-tree="$LOOKS_DIR" "$@"; }
PUB_CHANGES="$(pub status --porcelain)"
PRIV_CHANGES=""
[[ -d .git-private ]] && PRIV_CHANGES="$(priv status --porcelain)"
if [[ -z "$PUB_CHANGES$PRIV_CHANGES" ]]; then
  echo "Nothing changed in your looks. All done."
  finish $BUILD_FAILED
fi
[[ -n "$PUB_CHANGES" ]] && { echo "Changed (public repo):"; echo "$PUB_CHANGES"; echo ""; }
[[ -n "$PRIV_CHANGES" ]] && { echo "Changed (private repo):"; echo "$PRIV_CHANGES"; echo ""; }
printf "Save these changes to GitHub? (y/n) "
read answer
if [[ "$answer" == [yY]* ]]; then
  MSG="Rebuild looks with Fournée $(cd "$FOURNEE" && git rev-parse --short HEAD)"
  if [[ -n "$PUB_CHANGES" ]]; then
    pub add -A && pub commit --quiet -m "$MSG" && pub push --quiet && echo "Saved to GitHub (public)."
  fi
  if [[ -n "$PRIV_CHANGES" ]]; then
    priv add -A && priv commit --quiet -m "$MSG" && priv push --quiet && echo "Saved to GitHub (private)."
  fi
else
  echo "Not saved. The changes stay on this Mac; run this again to save them later."
fi
finish $BUILD_FAILED
