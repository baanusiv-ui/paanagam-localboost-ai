import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const specPath = resolve(process.cwd(), "../docs/openapi.json");
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const fail = (message) => {
  console.error("OpenAPI validation failed: " + message);
  process.exitCode = 1;
};

if (spec.openapi !== "3.1.0") fail("expected OpenAPI 3.1.0");
if (!spec.info?.title || !spec.info?.version) fail("info.title and info.version are required");
if (!spec.paths || typeof spec.paths !== "object") fail("paths must be an object");

const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);
let operationCount = 0;

for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    operationCount += 1;
    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      fail(method.toUpperCase() + " " + path + " has no responses");
    }
    const declaredPathParams = new Set(
      (operation.parameters ?? [])
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name)
    );
    for (const parameter of pathItem.parameters ?? []) {
      if (parameter.in === "path") declaredPathParams.add(parameter.name);
    }
    for (const name of placeholders) {
      if (!declaredPathParams.has(name)) {
        fail(method.toUpperCase() + " " + path + " is missing path parameter " + name);
      }
    }
  }
}

if (operationCount !== 58) fail("expected 58 documented operations, found " + operationCount);

const visitRefs = (value, location = "root") => {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string") {
    if (!value.$ref.startsWith("#/")) {
      fail(location + " contains an external reference that this repository validator does not resolve");
    } else {
      const target = value.$ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
      let current = spec;
      for (const part of target) current = current?.[part];
      if (current === undefined) fail(location + " has unresolved reference " + value.$ref);
    }
  }
  for (const [key, child] of Object.entries(value)) visitRefs(child, location + "." + key);
};
visitRefs(spec);

if (process.exitCode) process.exit(process.exitCode);
console.log("OpenAPI structure valid: " + operationCount + " operations; all local references resolve.");
