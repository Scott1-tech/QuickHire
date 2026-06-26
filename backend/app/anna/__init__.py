"""Anna — Driver Qualification AI Agent (Python port of the anna/ module).

Public surface mirrors the JS module: matching (spec/matcher), intake
(normalize/carrier), portfolio + compliance, integrations, queue, chat, and the
high-level processLead orchestrator.
"""
from .carrier import extract_carrier_spec
from .chat import chat
from .claude import (
    DEFAULT_MODELS,
    MODELS,
    PROVIDERS,
    anna_configured,
    call_claude,
    call_claude_json,
    llm_complete,
    llm_json,
    provider_model,
)
from .integrations import (
    INTEGRATIONS,
    ConsentError,
    check_consent,
    integration_status,
    normalize_consent,
    pull_compliance,
)
from .learning import (
    OUTCOME_KINDS,
    OUTCOME_SIGNAL,
    outcome_stats,
    record_outcome,
    tune_weights,
)
from .llm import PROVIDERS, llm_complete, llm_json, provider_model
from .matcher import STATUS, evaluate_gates, match_driver, score_soft, suggest_rematch
from .normalize import DRIVER_SHAPE, extract_from_document, low_confidence_fields, normalize_driver
from .portfolio import build_portfolio, merge_records, select_carrier, write_compliance
from .queue import create_queue
from .spec import OPS, compile_spec
from .metrics import compute_metrics, compute_nudges
from .truth import check_consistency

__all__ = [
    "extract_carrier_spec", "chat", "MODELS", "anna_configured", "call_claude", "call_claude_json",
    "INTEGRATIONS", "ConsentError", "check_consent", "integration_status", "normalize_consent",
    "pull_compliance", "STATUS", "evaluate_gates", "match_driver", "score_soft", "suggest_rematch",
    "DRIVER_SHAPE", "extract_from_document", "low_confidence_fields", "normalize_driver",
    "build_portfolio", "merge_records", "select_carrier", "write_compliance", "create_queue",
    "OPS", "compile_spec", "process_lead",
    "OUTCOME_KINDS", "OUTCOME_SIGNAL", "outcome_stats", "record_outcome", "tune_weights",
    "DEFAULT_MODELS", "PROVIDERS", "llm_complete", "llm_json", "provider_model",
    "compute_metrics", "compute_nudges", "check_consistency",
]


async def process_lead(lead: dict, carriers: list, opts: dict | None = None) -> dict:
    """End-to-end Stage 1 → Stage 3 for a single lead."""
    opts = opts or {}
    norm = await normalize_driver(lead, opts)
    profile = norm["profile"]
    match = match_driver(profile, carriers, {"minScore": opts.get("minScore")})
    portfolio = build_portfolio(driver=profile, match=match, recruiter_pool=opts.get("recruiterPool") or [])
    return {"profile": profile, "confidence": norm.get("confidence"), "match": match, "portfolio": portfolio, "source": norm.get("source")}
