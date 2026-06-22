#!/usr/bin/env bash
# ETH Guardian — Node binary packager
# Run from inside: executas/eth-guardian/
# Produces: dist-anna/tool-ilorahdavid126-eth-guardian-pxf3jej7-<platform>.tar.gz
set -euo pipefail
cd "$(dirname "$0")"

EXECUTA_JSON="executa.json"
ENTRY_FILE="plugin.js"
OUT_DIR="dist-anna"
TOOL_ID="tool-ilorahdavid126-eth-guardian-pxf3jej7"
VERSION="1.0.0"

# ── Detect platform ──────────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac
case "$OS-$ARCH" in
  darwin-arm64)   PLATFORM="darwin-arm64";   PKG_TARGET="node18-macos-arm64" ;;
  darwin-x86_64)  PLATFORM="darwin-x86_64";  PKG_TARGET="node18-macos-x64"   ;;
  linux-x86_64)   PLATFORM="linux-x86_64";   PKG_TARGET="node18-linux-x64"   ;;
  *)
    echo "ERROR: unsupported platform $OS-$ARCH" >&2
    exit 1
    ;;
esac

echo "Tool ID:  $TOOL_ID"
echo "Version:  $VERSION"
echo "Platform: $PLATFORM"
echo "Target:   $PKG_TARGET"
echo

# ── Install pkg if needed ────────────────────────────────────────────────────
if ! command -v pkg >/dev/null 2>&1; then
  echo "==> Installing pkg globally..."
  npm install -g pkg
fi

# ── Build binary ─────────────────────────────────────────────────────────────
echo "==> Building binary with pkg..."
rm -rf build "$OUT_DIR/staging-$PLATFORM"
mkdir -p "$OUT_DIR/staging-$PLATFORM/bin"

pkg "$ENTRY_FILE" \
  --target "$PKG_TARGET" \
  --output "$OUT_DIR/staging-$PLATFORM/bin/$TOOL_ID" \
  --compress GZip

chmod 0755 "$OUT_DIR/staging-$PLATFORM/bin/$TOOL_ID"

# ── Write manifest.json ──────────────────────────────────────────────────────
echo "==> Writing manifest.json..."
cat > "$OUT_DIR/staging-$PLATFORM/manifest.json" << MANIFEST
{
  "name": "$TOOL_ID",
  "display_name": "ETH Guardian",
  "version": "$VERSION",
  "description": "Control & Safety Layer for autonomous Ethereum agents.",
  "runtime": {
    "binary": {
      "entrypoint": {
        "default": "bin/$TOOL_ID"
      },
      "permissions": {
        "bin/$TOOL_ID": "0o755"
      }
    }
  }
}
MANIFEST

# ── Create .tar.gz ───────────────────────────────────────────────────────────
ARCHIVE="$OUT_DIR/$TOOL_ID-$PLATFORM.tar.gz"
echo "==> Creating archive: $ARCHIVE"
(cd "$OUT_DIR/staging-$PLATFORM" && tar czf "../$TOOL_ID-$PLATFORM.tar.gz" .)

# ── SHA256 + size ────────────────────────────────────────────────────────────
if command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
else
  SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
fi
SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"

echo ""
echo "✓ Built: $ARCHIVE"
echo "  SHA-256: $SHA256"
echo "  Size:    $SIZE bytes"
echo ""
echo "Archive layout:"
tar tzf "$ARCHIVE"
echo ""
echo "Platform binary config (paste into Anna Tool settings):"
echo ""
cat << JSON
"$PLATFORM": {
  "url": "https://github.com/Chibey-max/eth-guardian-anna-app/releases/download/eth-guardian-v$VERSION/$TOOL_ID-$PLATFORM.tar.gz",
  "sha256": "$SHA256",
  "size": $SIZE,
  "entrypoint": "bin/$TOOL_ID",
  "format": "tar.gz"
}
JSON
