#!/bin/bash

# Exit on any error
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGETS=(api webapp worker)

# Pick the target off argv if it's already given (non-interactive use),
# leaving the rest of argv to forward to the underlying build script.
choice=""
for t in "${TARGETS[@]}" all; do
  if [ "$1" = "$t" ]; then
    choice="$1"
    shift
    break
  fi
done

if [ -z "$choice" ]; then
  echo "Which app do you want to build?"
  select opt in "${TARGETS[@]}" all quit; do
    case "$opt" in
      quit) exit 0 ;;
      api|webapp|worker|all) choice="$opt"; break ;;
      *) echo "Invalid choice, try again." ;;
    esac
  done
fi

run_target() {
  echo ""
  echo "==> Building $1"
  "$SCRIPT_DIR/build-$1.sh" "${@:2}"
}

if [ "$choice" = "all" ]; then
  for t in "${TARGETS[@]}"; do
    run_target "$t" "$@"
  done
else
  run_target "$choice" "$@"
fi

echo ""
echo "Done."
