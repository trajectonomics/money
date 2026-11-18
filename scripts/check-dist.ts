import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildRunner, PACKAGE_NAME, parseReadme } from "./check-dist-readme"

class CheckDistError extends Error {
	constructor(phase: string, message: string) {
		super(`FAIL: ${phase}: ${message}`)
	}
}

function step<T>(phase: string, action: () => T): T {
	try {
		return action()
	} catch (error) {
		if (error instanceof CheckDistError) throw error
		throw new CheckDistError(phase, error instanceof Error ? error.message : String(error))
	}
}

function run(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" })
	if (result.error || result.status !== 0) {
		const reason = result.error?.message ?? `exited with ${result.status ?? result.signal}`
		throw new Error(
			`could not run \`${command} ${args.join(" ")}\` (${reason})\nstdout:\n${(result.stdout ?? "").trim()}\nstderr:\n${(result.stderr ?? "").trim()}`,
		)
	}
	return result.stdout ?? ""
}

function main(): void {
	const temp = fs.mkdtempSync(join(tmpdir(), "money-check-dist-"))
	try {
		const cjs = join(process.cwd(), "dist", "index.cjs")
		const esm = join(process.cwd(), "dist", "index.mjs")
		step("dist", () => {
			if (!fs.existsSync(cjs) || !fs.existsSync(esm)) {
				throw new Error(`${cjs} or ${esm} is missing - run \`bun run build\` first`)
			}
		})
		step("pack", () => run("bun", ["pm", "pack", "--destination", temp], process.cwd()))
		const tarballs = fs.readdirSync(temp).filter((entry) => entry.endsWith(".tgz"))
		const [tarball, ...extra] = tarballs
		if (tarball === undefined || extra.length > 0) {
			throw new CheckDistError("pack", `expected one .tgz, found ${tarballs.length}`)
		}
		const packageDir = join(temp, "node_modules", PACKAGE_NAME)
		step("extract", () => {
			fs.mkdirSync(packageDir, { recursive: true })
			run("tar", ["-xzf", join(temp, tarball), "-C", packageDir, "--strip-components=1"], temp)
		})
		const readmePath = join(packageDir, "README.md")
		const readme = step("readme", () => {
			if (!fs.existsSync(readmePath)) throw new Error(`${readmePath} is missing from the tarball`)
			return parseReadme(fs.readFileSync(readmePath, "utf8"))
		})
		const runnerPath = join(temp, "check-dist.cjs")
		const output = step("node", () => {
			fs.writeFileSync(runnerPath, buildRunner(readme))
			return run("node", [runnerPath], temp)
		})
		process.stdout.write(output)
	} finally {
		fs.rmSync(temp, { recursive: true, force: true })
	}
}

try {
	main()
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
}
