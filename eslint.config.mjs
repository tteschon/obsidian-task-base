import js from "@eslint/js";
import tseslint from "typescript-eslint";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**"] },
	js.configs.recommended,

	// Type-aware rules, not just the syntactic ones. The community directory's
	// review runs these, and the plain `recommended` set does not — which is
	// how two unsafe-any findings reached the reviewer having passed CI here.
	...tseslint.configs.recommendedTypeChecked,

	// A bare eslint-disable says a rule was silenced but not why, and the
	// community directory's review rejects them. Requiring the `-- reason`
	// suffix means the next suppression has to justify itself here first.
	comments.recommended,
	{
		rules: { "@eslint-community/eslint-comments/require-description": "error" },
	},

	// The community directory's own rule set. Running it here is the point:
	// every round of review feedback so far has been a rule this repo was not
	// checking, found by a reviewer instead of by CI.
	...obsidianmd.configs.recommended,

	// Those rules describe what runs inside Obsidian. The build scripts and the
	// test suite are plain Node and are supposed to import fs and node:test, so
	// the mobile-safety and config-path rules are noise there — the kind that
	// trains you to stop reading lint output.
	{
		files: ["**/*.mjs", "test/**/*.ts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/hardcoded-config-path": "off",
		},
	},
	{
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			// An unused parameter named with a leading underscore is a
			// deliberate signature match, not an oversight.
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},

	// node:test's `test()` returns a promise the runner itself awaits; treating
	// each call as a floating promise would mean prefixing every test with
	// `void` for no benefit.
	{
		files: ["test/**/*.ts"],
		rules: { "@typescript-eslint/no-floating-promises": "off" },
	},

	// The build and config scripts are plain Node and are not in tsconfig, so
	// the type-aware rules have no program to check them against.
	{
		files: ["**/*.mjs"],
		...tseslint.configs.disableTypeChecked,
		languageOptions: {
			// Spread first: defining languageOptions wholesale would drop the
			// parser reset that disableTypeChecked sets, and the type-aware
			// parser would then fail on files with no program.
			...tseslint.configs.disableTypeChecked.languageOptions,
			globals: { process: "readonly", console: "readonly" },
		},
	},
);
