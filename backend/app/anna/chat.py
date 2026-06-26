"""Anna as a conversational in-app assistant (tool-use + heuristic fallback)."""
import json
import re

from .claude import anna_configured
from .llm import llm_complete, provider_model

PAGES = ["dashboard", "carriers", "drivers", "trucks", "hiring", "tasks", "inbox", "notifications", "settings", "anna"]
ENTITY_TYPES = ["driver", "carrier", "candidate", "truck"]

TOOLS = [
    {
        "name": "create_task",
        "description": "Create and assign a task in the workdeck. Use when the user asks to create, add, assign, schedule, or remind about a task or follow-up.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "assignee": {"type": "string", "description": "Recruiter/employee name, if stated."},
                "priority": {"type": "string", "enum": ["Urgent", "High", "Normal", "Low"]},
                "due": {"type": "string", "description": "YYYY-MM-DD if stated."},
                "description": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "open_profile",
        "description": "Open a specific record's profile page by name when the user wants to go to / view / pull up a driver, carrier, candidate, or truck.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entityType": {"type": "string", "enum": ENTITY_TYPES},
                "name": {"type": "string", "description": "Name (or truck unit #) to look up."},
            },
            "required": ["entityType", "name"],
        },
    },
    {
        "name": "navigate",
        "description": "Open a top-level page/section of the app when the user asks to go there.",
        "input_schema": {"type": "object", "properties": {"page": {"type": "string", "enum": PAGES}}, "required": ["page"]},
    },
]


def _system_prompt(context: dict | None = None) -> str:
    context = context or {}
    parts = [
        'You are Anna, the AI assistant inside QuickHire/Fleetmule — a driver-staffing platform for the trucking industry (the app is also branded "FleetView").',
        "The app has these sections: Dashboard, Hiring (candidate pipeline), Drivers, Trucks, Carriers, Tasks, Inbox, Notifications, Settings, and the Anna workspace (driver qualification & carrier assessment).",
        "You can: (1) answer questions about how the app works and about driver qualification / FMCSA compliance (MVR, PSP, Clearinghouse) / carrier requirements; (2) SUMMARIZE a driver, carrier, or record the user is viewing; (3) open specific records or pages when asked; (4) help create tasks.",
        "When the user asks to go to / open / pull up a specific record, call open_profile. When they ask to go to a section, call navigate. When they ask to summarize or \"tell me about\" a record, use the context data provided to give a quick summary.",
        "Use ONLY the data in the context below; if a record is not present, say you could not find it.",
    ]
    if context.get("focus"):
        parts.append(f"The user is currently viewing: {json.dumps(context['focus'])}.")
    if context.get("directory"):
        parts.append(f"Known records (for lookup/summary): {json.dumps(context['directory'])[:6000]}.")
    if context.get("counts"):
        parts.append(f"Counts: {json.dumps(context['counts'])}.")
    return " ".join(p for p in parts if p)


async def chat(*, messages: list | None = None, context: dict | None = None, opts: dict | None = None) -> dict:
    messages = messages or []
    context = context or {}
    opts = opts or {}
    if not anna_configured(opts.get("apiKey")):
        return heuristic_chat(messages, context)

    provider = opts.get("provider") or "anthropic"
    out = await llm_complete(
        provider=provider,
        api_key=opts.get("apiKey"),
        model=opts.get("model") or provider_model(provider, "fast"),
        max_tokens=900,
        system=_system_prompt(context),
        tools=TOOLS,
        messages=[{"role": "assistant" if m.get("role") == "assistant" else "user", "content": str(m.get("content") or "")} for m in messages],
    )
    reply = out["text"] or ""
    actions = []
    for call in out["toolCalls"]:
        name, inp = call.get("name"), call.get("input") or {}
        if name == "create_task":
            actions.append({"type": "create_task", "task": _sanitize_task(inp)})
        elif name == "open_profile":
            actions.append({"type": "open_profile", "entityType": inp.get("entityType"), "name": str(inp.get("name") or "")})
        elif name == "navigate":
            actions.append({"type": "navigate", "page": inp.get("page")})
    if not reply.strip() and actions:
        reply = _confirm_action(actions[0])
    return {"reply": reply.strip() or "I'm not sure how to help with that yet.", "actions": actions, "engine": "ai"}


def _sanitize_task(inp: dict | None = None) -> dict:
    inp = inp or {}
    pri = ["Urgent", "High", "Normal", "Low"]
    return {
        "title": str(inp.get("title") or "New task")[:200],
        "assignee": str(inp["assignee"]) if inp.get("assignee") else None,
        "priority": inp["priority"] if inp.get("priority") in pri else None,
        "due": str(inp["due"]) if inp.get("due") else None,
        "description": str(inp["description"]) if inp.get("description") else None,
    }


def _confirm_action(a: dict) -> str:
    if a["type"] == "create_task":
        return f"Created the task \"{a['task']['title']}\"{(' and assigned it to ' + a['task']['assignee']) if a['task'].get('assignee') else ''}."
    if a["type"] == "open_profile":
        return f"Opening {a['name']}'s profile…"
    if a["type"] == "navigate":
        return f"Opening the {a['page']} page…"
    return "Done."


def heuristic_chat(messages: list, context: dict | None = None) -> dict:
    context = context or {}
    last = next((m for m in reversed(messages) if m.get("role") == "user"), None)
    text = str((last or {}).get("content") or "").strip()

    task = _parse_task_intent(text)
    if task:
        return {"reply": _confirm_action({"type": "create_task", "task": task}), "actions": [{"type": "create_task", "task": task}], "engine": "heuristic"}

    if re.search(r"\b(summar|tell me about|overview of|brief on)", text, re.I):
        if context.get("focus"):
            return {"reply": _summarize(context["focus"]), "actions": [], "engine": "heuristic"}
        return {"reply": "Open the record (or tell me to open it) and I'll summarize it. Connect an Anthropic API key for richer, free-form answers.", "actions": [], "engine": "heuristic"}

    nav = _parse_nav_intent(text)
    if nav:
        return {"reply": _confirm_action(nav), "actions": [nav], "engine": "heuristic"}

    return {
        "reply": "I can open records (\"open driver John Doe\"), summarize what you're viewing, assign tasks (\"assign a task to Jenna…\"), and navigate the app. Connect an Anthropic API key for smarter, conversational help.",
        "actions": [],
        "engine": "heuristic",
    }


def _summarize(focus: dict | None = None) -> str:
    f = focus or {}
    skip = {"id", "carrierId", "name", "entityType"}
    bits = [f"{k}: {json.dumps(v) if isinstance(v, (dict, list)) else v}" for k, v in f.items() if k not in skip and v is not None and v != ""]
    title = f.get("name") or (f"Unit {f['unit']}" if f.get("unit") else (f.get("entityType") or "Record"))
    kind = f"{f['entityType']} " if f.get("entityType") else ""
    return f"{kind}{title} — {' · '.join(bits[:10]) or 'no details available'}."


def _parse_nav_intent(text: str):
    if not re.search(r"\b(open|go to|show|view|pull up|take me to|navigate)\b", text, re.I):
        return None
    lower = text.lower()
    for page in PAGES:
        if re.search(rf"\b{page}\b", lower):
            return {"type": "navigate", "page": page}
    if re.search(r"\bdashboard|home\b", lower):
        return {"type": "navigate", "page": "dashboard"}
    m = re.search(r"\b(driver|carrier|candidate|truck)\s+(.+)$", text, re.I)
    if m:
        return {"type": "open_profile", "entityType": m.group(1).lower(), "name": re.sub(r"['\"?.]", "", m.group(2)).strip()}
    return None


def _parse_task_intent(text: str):
    if not text:
        return None
    if not re.search(r"\b(task|assign|remind|to-?do|follow[\s-]?up|schedule)\b", text, re.I):
        return None
    if re.search(r"\b(open|go to|navigate|summar)\b", text, re.I):
        return None
    assignee = None
    m = re.search(r"\b(?:assign(?:ed)?\s+to|to|for)\s+([A-Z][a-zA-Z]+)\b", text)
    if m:
        assignee = m.group(1)
    title = re.sub(r"\b(?:assign(?:ed)?\s+to|to|for)\s+[A-Z][a-zA-Z]+\b", "",
                   re.sub(r"^\s*(please\s+)?(can you\s+)?(create|add|make|set\s*up|schedule|assign|remind\s+\w+\s+to)\s+(a\s+|an\s+)?(task|reminder|follow[\s-]?up)?\s*(to\s+[A-Z][a-zA-Z]+)?\s*:\s*", "", text, flags=re.I))
    if not title:
        title = text.strip()
    due_m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    due = due_m.group(1) if due_m else None
    priority = "Urgent" if re.search(r"\burgent\b", text, re.I) else ("High" if re.search(r"\bhigh priority\b", text, re.I) else None)
    return {"title": title[:200], "assignee": assignee, "due": due, "priority": priority}
