# scripts/linux

Things only a Linux agent host needs.

- `check.sh` - checks the prerequisites (Node 24 or newer, git, curl, Claude Code on your PATH) and says what is missing. It installs nothing.

Coming here:

- a setup that installs what `check.sh` finds missing, after asking you
- systemd user units (`systemctl --user`) to keep the monitor and the chat launcher running and to start them at boot
