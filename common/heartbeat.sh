#!/bin/bash
# heartbeat.sh - the old name of status.sh, kept so older notes still work. Same arguments.
exec "$(cd "$(dirname "$0")" && pwd)/status.sh" "$@"
