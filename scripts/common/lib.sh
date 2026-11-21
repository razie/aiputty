# Shared helpers for the d2 scripts. Sourced, not run.
# shellcheck shell=bash

# d2_base: the d2 site to talk to.
#   D2_URL wins (e.g. https://aiputty.com); else D2_PROJECT -> https://$D2_PROJECT.aiputty.com;
#   else https://aiputty.com.
d2_base() {
  if [ -n "${D2_URL:-}" ]; then
    printf '%s' "${D2_URL%/}"
  elif [ -n "${D2_PROJECT:-}" ]; then
    printf 'https://%s.aiputty.com' "$D2_PROJECT"
  else
    printf 'https://aiputty.com'
  fi
}

# d2_home: where minted tokens live.
d2_home() {
  printf '%s' "${D2_HOME:-$HOME/.d2}"
}

# d2_mode FILE: print the file's permission bits (e.g. 600), on macOS or Linux.
d2_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null
}

# d2_private FILE: succeed only if FILE exists and nobody but its owner can read it.
d2_private() {
  local m
  [ -f "$1" ] || { echo "d2: $1 is not a file" >&2; return 1; }
  m=$(d2_mode "$1") || { echo "d2: cannot read the mode of $1" >&2; return 1; }
  case "$m" in
    *00) return 0 ;;
    *) echo "d2: $1 is readable by others (mode $m); run: chmod 600 $1" >&2; return 1 ;;
  esac
}

# d2_read_var FILE NAME: print NAME's value from a KEY=value file (optional "export ", optional quotes).
# If FILE has no KEY= lines at all, the first non-comment line is taken as the value (a bare token file).
d2_read_var() {
  local file=$1 name=$2 line val found=""
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#export }
    case "$line" in
      "$name="*)
        val=${line#"$name"=}
        val=${val#\"}; val=${val%\"}; val=${val#\'}; val=${val%\'}
        printf '%s' "$val"
        return 0 ;;
      *=*) found=1 ;;
    esac
  done < "$file"
  if [ -z "$found" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in ''|'#'*) continue ;; esac
      printf '%s' "$line"
      return 0
    done < "$file"
  fi
  return 1
}

# d2_curl_cfg FILE TOKEN AGENT: write a private curl config holding the headers,
# so the token never shows on a command line (ps) or in output.
d2_curl_cfg() {
  local cfg=$1 token=$2 agent=${3:-}
  ( umask 077
    {
      printf 'header = "Authorization: Bearer %s"\n' "$token"
      [ -n "$agent" ] && printf 'header = "D2-Agent: %s"\n' "$agent"
      printf 'header = "Content-Type: application/json"\n'
      printf 'header = "Accept: application/json"\n'
    } > "$cfg" )
}
