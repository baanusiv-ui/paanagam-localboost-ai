/*
 * LocalBoost dashboard configuration.
 *
 * Local development uses the API at http://localhost:4100.
 * The Render Blueprint writes the production API origin into the
 * generated public-dist/config.js during its static-site build.
 *
 * This file is public browser configuration. Never place passwords,
 * OAuth client secrets, JWT signing keys, database URLs, or access tokens here.
 */
window.LOCALBOOST_API_BASE = window.LOCALBOOST_API_BASE || "http://localhost:4100";
