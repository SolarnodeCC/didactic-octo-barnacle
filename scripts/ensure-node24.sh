# Source this file (do not execute it): it puts Node 24 first on PATH when the
# active node is not v24 and nvm is unavailable (ADR 0008). Idempotent.
_node_major() { node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo none; }
if [ "$(_node_major)" != "24" ]; then
  _dir="${ROI_NODE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/roi-node24}"
  if [ ! -x "$_dir/bin/node" ]; then
    case "$(uname -m)" in
      x86_64) _arch=x64 ;;
      aarch64 | arm64) _arch=arm64 ;;
      *) echo "Unsupported architecture $(uname -m) for Node 24 download" >&2; return 1 ;;
    esac
    _base="https://nodejs.org/dist/latest-v24.x"
    _tmp="$(mktemp -d)"
    curl -sSfL -o "$_tmp/SHASUMS256.txt" "$_base/SHASUMS256.txt"
    _file="$(grep -o "node-v24[0-9.]*-linux-$_arch.tar.xz" "$_tmp/SHASUMS256.txt" | head -1)"
    curl -sSfL -o "$_tmp/$_file" "$_base/$_file"
    (cd "$_tmp" && grep " $_file\$" SHASUMS256.txt | sha256sum -c - >/dev/null)
    mkdir -p "$_dir"
    tar -xf "$_tmp/$_file" -C "$_dir" --strip-components=1
    rm -rf "$_tmp"
  fi
  export PATH="$_dir/bin:$PATH"
fi
unset -f _node_major
