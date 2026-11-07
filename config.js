/*
 * LocalBoost dashboard configuration.
 *
 * Local development uses the API at http://localhost:4100.
 * For a hosted dashboard, change the value to your HTTPS API origin:
 * window.LOCALBOOST_API_BASE = "https://api.example.com";
 *
 * This file is public browser configuration. Never place passwords,
 * OAuth client secrets, JWT signing keys, database URLs, or access tokens here.
 */
window.LOCALBOOST_API_BASE = window.LOCALBOOST_API_BASE || "http://localhost:4100";
