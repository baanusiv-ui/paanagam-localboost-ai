import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const sourceRoot = resolve(process.cwd(), "src");
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) files.push(path);
  }
}
collect(sourceRoot);

const routePattern = /\b(?:app|fastify|server)\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
const failures = [];
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(routePattern)) {
    const routePath = match[1];
    if (!routePath.includes(":businessId") && !routePath.includes("{businessId}")) continue;
    checked += 1;
    const registration = source.slice(match.index, match.index + 500);
    if (!registration.includes("preHandler: requireUser")) {
      failures.push(relative(process.cwd(), file) + ": " + routePath + " is missing requireUser preHandler");
    }
  }
}

if (checked === 0) failures.push("No business-scoped route registrations were discovered.");
if (failures.length) {
  for (const failure of failures) console.error("Tenant guard check failed: " + failure);
  process.exit(1);
}
console.log("Tenant route guard check passed: " + checked + " business-scoped routes require authentication.");
