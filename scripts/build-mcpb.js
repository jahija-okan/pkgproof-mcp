// Stages the server as an MCP Bundle: dist/ beside a production-only dependency
// tree, packed with the manifest Claude Desktop and Smithery both read.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MCPB_CLI = "@anthropic-ai/mcpb@2.1.2";

const path = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const root = path(".");
const build = path("mcpb/build");

const pkg = read("package.json");
const manifest = read("mcpb/manifest.json");

if (manifest.version !== pkg.version) {
	throw new Error(`manifest.json is at ${manifest.version}, package.json at ${pkg.version}`);
}

const bundle = path(`mcpb/pkgproof-${pkg.version}.mcpb`);

run("npm", ["run", "build"]);

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

cpSync(path("dist"), `${build}/server`, { recursive: true });
cpSync(path("mcpb/manifest.json"), `${build}/manifest.json`);
for (const file of ["README.md", "PRIVACY.md", "LICENSE", "NOTICE"]) {
	cpSync(path(file), `${build}/${file}`);
}

// npm ci refuses a package.json its lockfile does not match, so the tree is
// resolved from the repo's own pair and the manifest trimmed to what the bundle
// needs afterwards: `type` is what makes node read dist/ as ESM.
cpSync(path("package.json"), `${build}/package.json`);
cpSync(path("package-lock.json"), `${build}/package-lock.json`);
run("npm", ["ci", "--omit=dev", "--ignore-scripts"], build);

writeFileSync(
	`${build}/package.json`,
	`${JSON.stringify(
		{
			name: pkg.name,
			version: pkg.version,
			private: true,
			type: "module",
			dependencies: pkg.dependencies,
		},
		null,
		"\t"
	)}\n`
);
rmSync(`${build}/package-lock.json`);

rmSync(bundle, { force: true });
run("npx", ["-y", MCPB_CLI, "pack", build, bundle]);

// Strips the dev dependencies npm ci leaves behind in transitive trees.
run("npx", ["-y", MCPB_CLI, "clean", bundle]);

console.log(`bundle written to ${bundle}`);

function read(name) {
	return JSON.parse(readFileSync(path(name), "utf8"));
}

function run(command, args, cwd = root) {
	execFileSync(command, args, { cwd, stdio: "inherit" });
}
