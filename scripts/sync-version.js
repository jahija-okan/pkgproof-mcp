// Carries the version npm just wrote in package.json into the other files that
// declare it. Run by the `version` lifecycle script, after the bump and
// before the commit; npm stages package.json itself but nothing else.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));

const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;

const files = ["server.json", "src/meta.ts", ".claude-plugin/plugin.json", "mcpb/manifest.json"];

const prettierConfig = await resolveConfig(path("package.json"));

await rewriteServerJson(version);
rewriteServerVersion(version);
await rewritePluginJson(version);
await rewriteMcpbManifest(version);

execFileSync("git", ["add", ...files], { stdio: "inherit" });

console.log(`version ${version} written to ${files.join(", ")}`);

async function rewriteServerJson(version) {
	const file = path("server.json");
	const server = JSON.parse(readFileSync(file, "utf8"));

	server.version = version;
	for (const pkg of server.packages ?? []) {
		pkg.version = version;
	}

	await writeJson(file, server);
}

async function rewritePluginJson(version) {
	const file = path(".claude-plugin/plugin.json");
	const plugin = JSON.parse(readFileSync(file, "utf8"));

	plugin.version = version;
	// The plugin runs the published package, pinned: an unpinned npx would hand
	// users a version this repo never tested against this manifest.
	plugin.mcpServers.pkgproof.args = ["-y", `@pkgproof/mcp@${version}`];

	await writeJson(file, plugin);
}

async function rewriteMcpbManifest(version) {
	const file = path("mcpb/manifest.json");
	const manifest = JSON.parse(readFileSync(file, "utf8"));

	manifest.version = version;
	await writeJson(file, manifest);
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

// Formatted by prettier rather than by hand: JSON.stringify expands short
// arrays that `prettier --check` wants on one line, so a bump written its way
// fails the lint step of the release it is bumping for. It is fed the indented
// form because prettier keeps an object expanded only when its input already
// broke the line after `{`; minified input collapses every object that fits.
async function writeJson(file, value) {
	const json = JSON.stringify(value, null, "\t");

	writeFileSync(file, await format(json, { ...prettierConfig, filepath: file }));
}
