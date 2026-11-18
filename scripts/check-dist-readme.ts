const PACKAGE_NAME = "@trajectonomics/money"
const MIN_NODE_MAJOR = 20
const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*["']@trajectonomics\/money["']$/
const EXAMPLE = /^(.*?)\s*\/\/\s*(\S+)/
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export { PACKAGE_NAME }

interface Example {
	readonly expression: string
	readonly expected: string
}

export interface Readme {
	readonly names: readonly string[]
	readonly examples: readonly Example[]
}

function apiFence(readme: string): string[] {
	const lines = readme.split(/\r?\n/)
	const start = lines.findIndex((line) => line.trim() === "## API")
	if (start === -1) throw new Error('README has no "## API" section')
	const open = lines.findIndex((line, index) => index > start && line.trim() === "```ts")
	if (open === -1) throw new Error('README has no "## API" ts fence')
	const close = lines.findIndex((line, index) => index > open && line.trim() === "```")
	if (close === -1) throw new Error('README "## API" fence is not closed')
	return lines.slice(open + 1, close)
}

function addImports(line: string, names: Set<string>): boolean {
	const match = IMPORT.exec(line)
	if (!match) return false
	for (const name of (match[1] ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)) {
		if (!IDENTIFIER.test(name)) throw new Error(`README imports invalid name "${name}"`)
		names.add(name)
	}
	return true
}

function addExample(line: string): Example {
	const match = EXAMPLE.exec(line)
	const expression = (match?.[1] ?? "").trim()
	const expected = match?.[2] ?? ""
	if (expression === "" || !Number.isFinite(Number(expected))) {
		throw new Error(`README API line is not an expression with a numeric // value: ${line}`)
	}
	return { expression, expected }
}

export function parseReadme(readme: string): Readme {
	const names = new Set<string>()
	const examples: Example[] = []
	for (const raw of apiFence(readme)) {
		const line = raw.trim()
		if (line === "" || line.startsWith("//") || addImports(line, names)) continue
		examples.push(addExample(line))
	}
	if (names.size === 0) throw new Error("README has no package import")
	for (const required of ["toMinorUnits", "MoneyValidationError"]) {
		if (!names.has(required)) throw new Error(`README must import ${required}`)
	}
	if (examples.length === 0) throw new Error("README has no example")
	return { names: [...names], examples }
}

export function buildRunner(names: readonly string[], examples: readonly Example[]): string {
	const assertions = examples
		.map(
			(example) =>
				`\t\tassert.strictEqual(String(${example.expression}), ${JSON.stringify(example.expected)}, condition + ${JSON.stringify(`: ${example.expression}`)})`,
		)
		.join("\n")
	return `"use strict"
const assert = require("node:assert")
const PACKAGE_NAME = ${JSON.stringify(PACKAGE_NAME)}
const MIN_NODE_MAJOR = ${MIN_NODE_MAJOR}
const NAMES = ${JSON.stringify(names)}
async function main() {
	const nodeMajor = Number(process.versions.node.split(".")[0])
	if (!Number.isInteger(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) throw new Error("Node " + process.version + " is below the required Node >= " + MIN_NODE_MAJOR)
	const conditions = [["require", require(PACKAGE_NAME)], ["import", await import(PACKAGE_NAME)]]
	for (const [condition, module] of conditions) {
		for (const name of NAMES) if (module[name] === undefined) throw new Error(condition + ": " + PACKAGE_NAME + " does not export " + name)
		const { ${names.join(", ")} } = module
${assertions}
		assert.throws(() => toMinorUnits(-1.14, 2), (error) => error instanceof MoneyValidationError && error.name === "MoneyValidationError", condition + ": toMinorUnits(-1.14, 2) did not throw MoneyValidationError")
	}
	console.log("PASS: Node " + process.version + ", ${examples.length} README examples and the rejection check through require and import")
}
main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
`
}
