// Carries the version npm just wrote in package.json into the other files that
// declare it. Run by the `version` lifecycle script, after the bump and
// before the commit; npm stages package.json itself but nothing else.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));

const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;

const files = ["server.json", "src/meta.ts", ".claude-plugin/plugin.json", "mcpb/manifest.json"];

rewriteServerJson(version);
rewriteServerVersion(version);
rewritePluginJson(version);
rewriteMcpbManifest(version);

execFileSync("git", ["add", ...files], { stdio: "inherit" });

console.log(`version ${version} written to ${files.join(", ")}`);

function rewriteServerJson(version) {
	const file = path("server.json");
	const server = JSON.parse(readFileSync(file, "utf8"));

	server.version = version;
	for (const pkg of server.packages ?? []) {
		pkg.version = version;
	}

	writeJson(file, server);
}

function rewritePluginJson(version) {
	const file = path(".claude-plugin/plugin.json");
	const plugin = JSON.parse(readFileSync(file, "utf8"));

	plugin.version = version;
	// The plugin runs the published package, pinned: an unpinned npx would hand
	// users a version this repo never tested against this manifest.
	plugin.mcpServers.pkgproof.args = ["-y", `@pkgproof/mcp@${version}`];

	writeJson(file, plugin);
}

function rewriteMcpbManifest(version) {
	const file = path("mcpb/manifest.json");
	const manifest = JSON.parse(readFileSync(file, "utf8"));

	manifest.version = version;
	writeJson(file, manifest);
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

// Tabs and a trailing newline, to match prettier.
function writeJson(file, value) {
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}
