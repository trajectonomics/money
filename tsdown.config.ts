import { defineConfig } from "tsdown"

// Two configurations in one build, so the two published conditions expose one implementation:
// the `require` condition keeps the class, and the `import` condition is a facade over it, which is
// why `instanceof` holds across a mixed ESM/CJS graph. Only the first cleans, and the output
// directory is cleaned once before either bundle is written.
export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: "cjs",
		dts: true,
		clean: true,
		sourcemap: true,
	},
	{
		entry: { index: "shim/index.esm.ts" },
		format: "esm",
		dts: true,
		sourcemap: true,
		// `./index.cjs` exists only in `dist/`, so it is never resolved against `shim/`.
		deps: { neverBundle: ["./index.cjs"] },
	},
])
