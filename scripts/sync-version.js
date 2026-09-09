// Carries the version npm just wrote in package.json into the two other files
// that declare it. Run by the `version` lifecycle script, after the bump and
// before the commit; npm stages package.json itself but nothing else.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));

const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;

rewriteServerJson(version);
rewriteServerVersion(version);

execFileSync("git", ["add", "server.json", "src/meta.ts"], { stdio: "inherit" });

console.log(`version ${version} written to server.json and src/meta.ts`);

function rewriteServerJson(version) {
	const file = path("server.json");
	const server = JSON.parse(readFileSync(file, "utf8"));

	server.version = version;
	for (const pkg of server.packages ?? []) {
		pkg.version = version;
	}

	// Tabs and a trailing newline, to match prettier.
	writeFileSync(file, `${JSON.stringify(server, null, "\t")}\n`);
}

function rewriteServerVersion(version) {
	const file = path("src/meta.ts");
	const source = readFileSync(file, "utf8");
	const declaration = /^export const SERVER_VERSION = ".*";$/m;

	if (!declaration.test(source)) {
		throw new Error(`no SERVER_VERSION declaration found in ${file}`);
	}

	writeFileSync(file, source.replace(declaration, `export const SERVER_VERSION = "${version}";`));
}
