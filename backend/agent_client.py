"""Shared helper for authenticated requests to the station agents.

Set the same AGENT_API_KEY on the backend and on every agent
(`python agent.py --api-key <key>` or env AGENT_API_KEY).
If unset, requests are sent without the header (legacy/dev mode).
"""
import os

AGENT_API_KEY = os.getenv("AGENT_API_KEY", "")


def agent_headers() -> dict[str, str]:
    if AGENT_API_KEY:
        return {"X-Agent-Key": AGENT_API_KEY}
    return {}
