"""Conversational assistant — Python port of anna/chat.js (tools + heuristic)."""
from __future__ import annotations
import re

PAGES = ["dashboard", "carriers", "drivers", "trucks", "hiring", "tasks", "inbox", "notifications", "settings", "anna"]
ENTITY_TYPES = ["driver", "carrier", "candidate", "truck"]

TOOLS = [
    {"name": "create_task", "description": "Create and assign a task in the workdeck.",
     "input_schema": {"type": "object", "properties": {
         "title": {"type": "string"}, "assignee": {"type": "string"},
         "priority": {"type": "string", "enum": ["Urgent", "High", "Normal", "Low"]},
         "due": {"type": "string"}, "description": {"type": "string"}}, "required": ["title"]}},
    {"name": "open_profile", "description": "Open a record's profile page by name.",
     "input_schema": {"type": "object", "properties": {
         "entityType": {"type": "string", "enum": ENTITY_TYPES}, "name": {"type": "string"}},
         "required": ["entityType", "name"]}},
    {"name": "navigate", "description": "Open a top-level page/section.",
     "input_schema": {"type": "object", "properties": {"page": {"type": "string", "enum": PAGES}}, "required": ["page"]}},
]

APP_GUIDE = """APP GUIDE (FleetView/QuickHire): Dashboard=overview. Carriers=companies you staff for; open one to edit hiring requirements. Hiring=candidate pipeline; open a candidate, use Run AI Screening or the Anna tab for best-fit offers. Drivers=hired drivers. Trucks=fleet. Tasks=to-dos (floating New Task button or ask Anna). DocuSign=e-sign offers/consents. Settings>Anna AI=connect a Claude/OpenAI key. Anna workspace(/anna)=lead -> ranked offers -> recruiter picks carrier -> consent -> MVR/PSP/Clearinghouse -> verdict -> decision -> outcome (tunes matching); export a compliance packet; Metrics for ROI. Qualification: a driver clears a carrier's hard gates (age, experience, violation/DUI caps, endorsements); missing data = needs data, not rejection; Anna recommends, a human picks."""


def system_prompt(context=None):
    context = context or {}
    parts = [
        'You are Anna, the AI assistant inside QuickHire/Fleetmule (also "FleetView"), a trucking driver-staffing platform.',
        "You help on EVERY page: answer how-to questions, troubleshoot, explain driver qualification / FMCSA compliance, "
        "summarize records, navigate, and create tasks.",
        "Use open_profile to open a record, navigate for a section, create_task for tasks. Summarize only from the given "
        "context; never invent fields. Keep answers short and practical.",
        APP_GUIDE,
    ]
    if context.get("focus"):
        parts.append(f"Currently viewing: {context['focus']}.")
    if context.get("directory"):
        parts.append(f"Known records: {str(context['directory'])[:6000]}.")
    if context.get("counts"):
        parts.append(f"Counts: {context['counts']}.")
    return " ".join(parts)


_PRI = ["Urgent", "High", "Normal", "Low"]


def _sanitize_task(inp):
    inp = inp or {}
    return {
        "title": str(inp.get("title") or "New task")[:200],
        "assignee": str(inp["assignee"]) if inp.get("assignee") else None,
        "priority": inp["priority"] if inp.get("priority") in _PRI else None,
        "due": str(inp["due"]) if inp.get("due") else None,
        "description": str(inp["description"]) if inp.get("description") else None,
    }


def _confirm(a):
    if a["type"] == "create_task":
        t = a["task"]
        return f'Created the task "{t["title"]}"' + (f' and assigned it to {t["assignee"]}' if t.get("assignee") else "") + "."
    if a["type"] == "open_profile":
        return f"Opening {a['name']}'s profile…"
    if a["type"] == "navigate":
        return f"Opening the {a['page']} page…"
    return "Done."


async def chat(messages=None, context=None, opts=None):
    messages, context, opts = messages or [], context or {}, opts or {}
    if not opts.get("apiKey"):
        return heuristic_chat(messages, context)
    from .llm import llm_complete
    res = await llm_complete(provider=opts.get("provider"), apiKey=opts.get("apiKey"), model=opts.get("model"),
                             maxTokens=900, system=system_prompt(context), tools=TOOLS,
                             messages=[{"role": ("assistant" if m["role"] == "assistant" else "user"),
                                        "content": str(m.get("content") or "")} for m in messages])
    reply = res.get("text") or ""
    actions = []
    for call in res.get("toolCalls") or []:
        if call["name"] == "create_task":
            actions.append({"type": "create_task", "task": _sanitize_task(call["input"])})
        elif call["name"] == "open_profile":
            actions.append({"type": "open_profile", "entityType": call["input"].get("entityType"),
                            "name": str(call["input"].get("name") or "")})
        elif call["name"] == "navigate":
            actions.append({"type": "navigate", "page": call["input"].get("page")})
    if not reply.strip() and actions:
        reply = _confirm(actions[0])
    return {"reply": reply.strip() or "I'm not sure how to help with that yet.", "actions": actions, "engine": "ai"}


def heuristic_chat(messages, context=None):
    context = context or {}
    last = next((m for m in reversed(messages) if m["role"] == "user"), None)
    text = str((last or {}).get("content") or "").strip()
    task = _parse_task_intent(text)
    if task:
        a = {"type": "create_task", "task": task}
        return {"reply": _confirm(a), "actions": [a], "engine": "heuristic"}
    if re.search(r"\b(summar|tell me about|overview of|brief on)", text, re.I):
        if context.get("focus"):
            return {"reply": _summarize(context["focus"]), "actions": [], "engine": "heuristic"}
        return {"reply": "Open the record (or ask me to open it) and I'll summarize it. Connect an API key for richer answers.",
                "actions": [], "engine": "heuristic"}
    nav = _parse_nav_intent(text)
    if nav:
        return {"reply": _confirm(nav), "actions": [nav], "engine": "heuristic"}
    return {"reply": "I can open records (“open driver John Doe”), summarize what you're viewing, assign tasks, "
                     "and navigate the app. Connect a Claude or OpenAI key in Settings → Anna AI for full Q&A.",
            "actions": [], "engine": "heuristic"}


def _summarize(f):
    skip = {"id", "carrierId", "name", "entityType"}
    bits = [f"{k}: {v}" for k, v in f.items() if k not in skip and v not in (None, "")]
    title = f.get("name") or (f"Unit {f.get('unit')}" if f.get("unit") else (f.get("entityType") or "Record"))
    kind = f"{f.get('entityType')} " if f.get("entityType") else ""
    return f"{kind}{title} — {' · '.join(bits[:10]) or 'no details available'}."


def _parse_nav_intent(text):
    if not re.search(r"\b(open|go to|show|view|pull up|take me to|navigate)\b", text, re.I):
        return None
    low = text.lower()
    for page in PAGES:
        if re.search(rf"\b{page}\b", low):
            return {"type": "navigate", "page": page}
    if re.search(r"\b(dashboard|home)\b", low):
        return {"type": "navigate", "page": "dashboard"}
    m = re.search(r"\b(driver|carrier|candidate|truck)\s+(.+)$", text, re.I)
    if m:
        return {"type": "open_profile", "entityType": m.group(1).lower(),
                "name": re.sub(r"['\"?.]", "", m.group(2)).strip()}
    return None


def _parse_task_intent(text):
    if not text or not re.search(r"\b(task|assign|remind|to-?do|follow[\s-]?up|schedule)\b", text, re.I):
        return None
    if re.search(r"\b(open|go to|navigate|summar)\b", text, re.I):
        return None
    assignee = None
    m = re.search(r"\b(?:assign(?:ed)?\s+to|to|for)\s+([A-Z][a-zA-Z]+)\b", text)
    if m:
        assignee = m.group(1)
    title = re.sub(r"^\s*(please\s+)?(can you\s+)?(create|add|make|set\s*up|schedule|assign|remind\s+\w+\s+to)\s+"
                   r"(a\s+|an\s+)?(task|reminder|follow[\s-]?up)?\s*(to\s+[A-Z][a-zA-Z]+)?\s*[:\-]?\s*", "", text, flags=re.I)
    title = re.sub(r"\b(?:assign(?:ed)?\s+to|to|for)\s+[A-Z][a-zA-Z]+\b", "", title).strip() or text.strip()
    due_m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    priority = "Urgent" if re.search(r"\burgent\b", text, re.I) else ("High" if re.search(r"\bhigh priority\b", text, re.I) else None)
    return {"title": title[:200], "assignee": assignee, "due": due_m.group(1) if due_m else None, "priority": priority}
