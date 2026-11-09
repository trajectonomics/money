import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const MIN_COVERAGE_PERCENT = 100
const lcovPath = resolve(process.cwd(), "coverage/lcov.info")

try {
	const content = readFileSync(lcovPath, "utf-8")
	let linesFound = 0
	let linesHit = 0
	const coveredFiles = new Set<string>()

	let currentFile = ""
	for (const line of content.split("\n")) {
		if (line.startsWith("SF:")) {
			currentFile = line.slice(3).trim()
			coveredFiles.add(currentFile)
		} else if (line.startsWith("LF:")) {
			if (currentFile.startsWith("src/")) {
				linesFound += Number.parseInt(line.slice(3), 10) || 0
			}
		} else if (line.startsWith("LH:")) {
			if (currentFile.startsWith("src/")) {
				linesHit += Number.parseInt(line.slice(3), 10) || 0
			}
		}
	}

	// Verify that every source file containing runtime code is included in coverage
	const sourceFiles = readdirSync("src", { recursive: true })
		.filter(
			(f) =>
				typeof f === "string" &&
				f.endsWith(".ts") &&
				!f.endsWith(".test.ts") &&
				!f.endsWith(".d.ts"),
		)
		.map((f) => `src/${f}`)

	for (const file of sourceFiles) {
		const fileText = readFileSync(file, "utf-8")
		const hasRuntimeCode = /(function|class|const|let|var)\s+\w+/.test(fileText)
		if (hasRuntimeCode && !coveredFiles.has(file)) {
			console.error(`FAIL: Source file ${file} has runtime code but was never imported/tested!`)
			process.exit(1)
		}
	}

	if (linesFound === 0) {
		console.error("No coverage records found in coverage/lcov.info")
		process.exit(1)
	}

	const percentage = (linesHit / linesFound) * 100
	console.log(`\nLine coverage: ${percentage.toFixed(2)}% (${linesHit}/${linesFound} lines)`)

	if (percentage < MIN_COVERAGE_PERCENT) {
		console.error(
			`FAIL: Code coverage ${percentage.toFixed(2)}% is below threshold of ${MIN_COVERAGE_PERCENT}%\n`,
		)
		process.exit(1)
	}

	console.log(`PASS: Code coverage meets required ${MIN_COVERAGE_PERCENT}% threshold\n`)
} catch (error) {
	console.error("Failed to read or parse coverage/lcov.info:", error)
	process.exit(1)
}
