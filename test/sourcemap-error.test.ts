import { runKarma } from "./test-utils";
import path from "path";
import { assertEventually } from "pentf/assert_utils";
import { strict as assert } from "assert";
import { parseStackTrace } from "errorstacks";

export const description = "Resolve source maps relative to an absolute root";
export async function run(config: any) {
	const { output } = await runKarma(config, "sourcemap-error");

	await assertEventually(() => {
		return output.stdout.find(line => /FAILED TESTS/.test(line));
	});

	const idx = output.stdout.findIndex(line => /Error: fail/.test(line));
	const errLine = output.stdout.slice(idx)[0];
	const err = errLine
		.slice(errLine.indexOf("Error: fail"))
		.split("\n")
		.filter(Boolean)
		.slice(1)
		.join("\n");

	const stack = parseStackTrace(err);
	assert.deepStrictEqual(
		stack.map(x => {
			const location = path.relative(__dirname, x.fileName);
			return `${location}:${x.line}:${x.column}`;
		}),
		[
			"fixtures/sourcemap-error/files/sub/dep1.js:2:8",
			"fixtures/sourcemap-error/files/main-a.js:5:10",
		],
	);
}
