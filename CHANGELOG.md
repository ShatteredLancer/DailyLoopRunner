# Changelog

All notable user-facing changes are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.7.0] - Unreleased

### Added

- Production Tampermonkey identity and GitHub Release update endpoints.
- Lightweight `.meta.js` update assets for DailyLoopRunner and FSU Local.
- Immutable tag-driven Releases with SHA256 checksums.
- FSU Local `26.09.1`, maintained from the immutable FSU `26.09` baseline.
- MIT licensing, third-party notices, security guidance, and issue templates.

### Changed

- Simplified the root README and moved detailed usage, troubleshooting, and
  development guidance into `docs/`.
- Restricted remote ntfy notifications to the metadata-authorized ntfy.sh
  service.
- Removed localhost network permissions from the production Runner; the
  dedicated Hot Reload userscript retains local development access.

### Migration

- The production script has a new Tampermonkey name and namespace. Treat it as
  a new installation and disable or remove the old Validation script.
