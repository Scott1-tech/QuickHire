"""DocuSign eSignature configuration, read from the environment (JWT Grant)."""
import os
import re


def _read_private_key() -> str:
    inline = os.environ.get("DOCUSIGN_PRIVATE_KEY", "")
    if inline.strip():
        return inline.replace("\\n", "\n") if "\\n" in inline else inline
    key_path = os.environ.get("DOCUSIGN_PRIVATE_KEY_PATH", "")
    if key_path:
        try:
            with open(key_path, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return ""
    return ""


_oauth_base = re.sub(r"/$", "", re.sub(r"^https?://", "", os.environ.get("DOCUSIGN_OAUTH_BASE", "account-d.docusign.com")))

config = {
    "integrationKey": os.environ.get("DOCUSIGN_INTEGRATION_KEY", ""),
    "userId": os.environ.get("DOCUSIGN_USER_ID", ""),
    "accountId": os.environ.get("DOCUSIGN_ACCOUNT_ID", ""),
    "privateKey": _read_private_key(),
    "oauthBase": _oauth_base,
    "apiBase": re.sub(r"/$", "", os.environ.get("DOCUSIGN_API_BASE", "https://demo.docusign.net")),
    "scopes": os.environ.get("DOCUSIGN_SCOPES", "signature impersonation"),
    "brandId": os.environ.get("DOCUSIGN_BRAND_ID", ""),
    "webhookSecret": os.environ.get("DOCUSIGN_WEBHOOK_SECRET", ""),
    "returnUrl": os.environ.get("DOCUSIGN_RETURN_URL", ""),
}


def is_configured() -> bool:
    return bool(config["integrationKey"] and config["userId"] and config["accountId"] and config["privateKey"])


def mode() -> str:
    return "live" if is_configured() else "simulated"


def account_base_path() -> str:
    return f"{config['apiBase']}/restapi/v2.1/accounts/{config['accountId']}"
