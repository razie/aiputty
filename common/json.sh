#!/bin/bash
# json.sh - print a JSON object built from key=value arguments, so a body is never string-pasted.
#
#   json.sh key=value ...        a string value
#   json.sh key:=json ...        a raw JSON value: a number, true, an array, an object
#   json.sh key@=file ...        a string value read from a file ("-" for stdin)
#
#   common/json.sh subState=done note="Fixed; tests pass." 'tests:=["ui:CHAT-3"]' | common/d2.sh POST /api/v2/cmd/Item/P-12/close -
set -eu
command -v python3 >/dev/null 2>&1 || { echo "json.sh: needs python3 on PATH" >&2; exit 2; }
[ $# -ge 1 ] || { echo "usage: json.sh key=value | key:=json | key@=file ..." >&2; exit 2; }
python3 -c '
import json, sys
b = {}
for a in sys.argv[1:]:
    for sep in (":=", "@=", "="):
        k, s, v = a.partition(sep)
        if s and k and "=" not in k and ":" not in k and "@" not in k:
            break
    else:
        sys.stderr.write("json.sh: not key=value: %s\n" % a); sys.exit(2)
    if sep == ":=":
        try: b[k] = json.loads(v)
        except ValueError: sys.stderr.write("json.sh: %s is not JSON\n" % k); sys.exit(2)
    elif sep == "@=":
        b[k] = (sys.stdin if v == "-" else open(v)).read()
    else:
        b[k] = v
print(json.dumps(b))' "$@"
