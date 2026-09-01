import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			// An unused parameter named with a leading underscore is a
			// deliberate signature match, not an oversight.
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		files: ["esbuild.config.mjs", "version-bump.mjs", "eslint.config.mjs"],
		languageOptions: {
			globals: { process: "readonly", console: "readonly" },
		},
	},
);
