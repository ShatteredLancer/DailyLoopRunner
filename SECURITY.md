# Security Policy

## Supported Versions

Security fixes are applied to the latest published GitHub Release. Older
userscript and FSU Local assets are retained for rollback but are not actively
maintained.

## Reporting

Do not publish account identifiers, authentication headers, ntfy tokens, or
complete private inventory exports in a public issue. Report a vulnerability
through GitHub private vulnerability reporting when available. Otherwise open
a minimal issue asking for a private contact channel without including the
sensitive details.

For ordinary runtime failures, use the bug report form and attach the Runner
log after reviewing it for personal data. FSU diagnostic JSON can include Club
counts, entity identifiers, extension information, and request diagnostics;
review it before uploading.

## Scope

Relevant issues include unsafe item submission, protection bypasses, secret
exposure, unauthorized network requests, update-chain compromise, and cases
where unverified cached entities can reach a live SBC submission.

EA account enforcement, bans caused by automation, third-party service
availability, and upstream FSU/Enhancer defects are operational risks rather
than project security guarantees.
