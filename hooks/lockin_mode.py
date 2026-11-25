#!/usr/bin/env python3
"""Keep /lockin sticky in Claude Code: UserPromptSubmit hook.

`/lockin [task]` turns the mode on for this session, `/lockin off` turns it off.
While on, every prompt gets a one-line reminder injected as context (stdout, exit 0).
State is one empty file per session id under ~/.agents/lockin/state/.

Modes:
  --claude    stdin = UserPromptSubmit JSON {"session_id", "prompt", ...}
  --selftest  run the asserts below
"""
import json
import os
import re
import sys

STATE = os.path.expanduser("~/.agents/lockin/state")
SKILL = "~/.claude/skills/lockin/SKILL.md"
REMINDER = (
    f"LOCKIN MODE ACTIVE. Route this message per the lockin skill ({SKILL}): "
    "open with the `lockin · <route> · <step>` status line, keep the todo list in sync, "
    "stop at gates for the user. Turn off with /lockin off."
)
CMD = re.compile(r"^\s*/(?:lockin:)?lockin(?![\w-])(.*)$", re.S)


def decide(prompt: str, active: bool):
    """Return (new_active, inject_text_or_None)."""
    m = CMD.match(prompt or "")
    if m:
        if m.group(1).strip().lower() == "off":
            return False, "Lockin mode is now OFF for this session. Drop the status line and stop routing."
        return True, None  # the skill itself loads on the slash command
    return active, (REMINDER if active else None)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        return selftest()
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0  # fail open
    sid = re.sub(r"[^\w.-]", "_", str(data.get("session_id") or ""))
    if not sid:
        return 0
    flag = os.path.join(STATE, sid)
    active = os.path.exists(flag)
    new_active, text = decide(data.get("prompt", ""), active)
    if new_active != active:
        if new_active:
            os.makedirs(STATE, exist_ok=True)
            open(flag, "w").close()
        else:
            os.remove(flag)
    if text:
        print(text)
    return 0


def selftest():
    assert decide("/lockin build the pricing page", False) == (True, None)
    assert decide("/lockin", False) == (True, None)
    assert decide("/lockin:lockin go", False) == (True, None)
    assert decide("/lockin off", True)[0] is False
    assert decide("  /lockin OFF ", True)[0] is False
    assert decide("fix the login bug", True) == (True, REMINDER)
    assert decide("fix the login bug", False) == (False, None)
    assert decide("what does /lockin do?", False) == (False, None)
    assert decide("/lockin-mode go", False) == (False, None)
    print("selftest ok: 9 cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
