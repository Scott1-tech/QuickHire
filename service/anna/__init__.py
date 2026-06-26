"""Anna — Python driver-qualification AI backend (port of the Node anna/ module)."""
from .spec import compile_spec, OPS
from .matcher import match_driver, suggest_rematch, evaluate_gates, score_soft, build_fit_summary, STATUS
from .learning import record_outcome, tune_weights, outcome_stats, OUTCOME_KINDS, OUTCOME_SIGNAL
from .carrier import extract_carrier_spec, parse_deterministic
from .integrations import (check_consent, normalize_consent, pull_compliance, integration_status,
                           ConsentError, INTEGRATIONS)
from .portfolio import build_portfolio, select_carrier, write_compliance, merge_records
from .normalize import normalize_driver, DRIVER_SHAPE
from .metrics import compute_metrics
from .chat import chat
from .llm import llm_complete, llm_json, provider_model, PROVIDERS, DEFAULT_MODELS

__all__ = [
    "compile_spec", "OPS", "match_driver", "suggest_rematch", "evaluate_gates", "score_soft",
    "build_fit_summary", "STATUS", "record_outcome", "tune_weights", "outcome_stats", "OUTCOME_KINDS",
    "OUTCOME_SIGNAL", "extract_carrier_spec", "parse_deterministic", "check_consent", "normalize_consent",
    "pull_compliance", "integration_status", "ConsentError", "INTEGRATIONS", "build_portfolio",
    "select_carrier", "write_compliance", "merge_records", "normalize_driver", "DRIVER_SHAPE",
    "compute_metrics", "chat", "llm_complete", "llm_json", "provider_model", "PROVIDERS", "DEFAULT_MODELS",
]
