const parse = require("@textlint/markdown-to-ast").parse;
const { inspect } = require("util");
const fs = require("fs");
const shell = require("shelljs");

const evt = JSON.parse(process.env.GITHUB_EVENT);
// console.log("Github event: ", inspect(evt, { depth: 10, colors: false }));

async function run() {
	const testFile = [];

	const body = evt.issue?.body;

	if (!body) {
		throw new Error("Issue body not found.");
	}

	// const reactionID = await addReaction("rocket");

	// --- Parse markdown to AST

	const ast = parse(body);
	console.log("AST: ", inspect(ast, { depth: 10, colors: false }));

	// --- Build test file

	testFile.push(`const Benchmarkify = require("benchmarkify");`);
	testFile.push(`const { inspect } = require("util");`);
	testFile.push(`const fs = require("fs");`);

	testFile.push(``);
	testFile.push(`async function start() {`);
	testFile.push(`const benchmark = new Benchmarkify("${evt.issue.number} - ${evt.issue.title}", {
			description: "",
			spinner: false,
			chartImage: true
		}).printHeader();
	`);

	// --- Parse AST to create test suites

	const requires = [];
	let suiteIndex = 0;
	let testName;
	let isSetup, isTearDown, isDependencies;
	for (const node of ast.children) {
		// H1 as Suite
		if (node.type === "Header" && node.depth === 1) {
			// Create a test suite
			testFile.push(`
				const suite_${++suiteIndex} = benchmark.createSuite("${node.children[0].value}", {
					time: 1000,
					description: ""
				});
			`);
		}

		// H2 as test case ( or setup or teardown )
		if (node.type === "Header" && node.depth === 2) {
			isDependencies = false;
			isSetup = false;
			isTearDown = false;
			testName = null;

			const name = node.children[0].value.trim();
			if (name.toLowerCase().startsWith("dependenc")) {
				isDependencies = true;
			} else if (name.toLowerCase().startsWith("setup") || name.toLowerCase().startsWith("set up")) {
				isSetup = true;
			} else if (
				name.toLowerCase().startsWith("teardown") ||
				name.toLowerCase().startsWith("tear down")
			) {
				isTearDown = true;
			} else {
				testName = node.children[0].value;
			}
		}

		// Code block is the test case
		if (node.type === "CodeBlock") {
			if (isSetup) {
				testFile.push("// Setup");
				testFile.push(node.value);
			} else if (isTearDown) {
				testFile.push("// Teardown");
				testFile.push(node.value);
			} else if (testName) {
				testFile.push(`// Test case: ${testName}
					suite_${suiteIndex}.add("${testName}", () => {
						${node.value}
					});
				`);
			} else {
				console.warn("Unknown code block: ", node);
			}
		}

		if (node.type === "List") {
			if (isDependencies) {
				for (const item of node.children) {
					if (item.type === "ListItem") {
						const r = item.children?.[0]?.raw?.trim();
						if (r) {
							requires.push(item.children[0].raw);
						}
					}
				}
			}
		}
	}

	testFile.push(`
			const result = await benchmark.run();
			console.log("Benchmark result: ", inspect(result, { depth: 10, colors: false }));
			fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
		}

		start().catch(err => {
			console.error(err);
			process.exit(1);
		});
	`);

	console.log("===================================");
	console.log(" TEST FILE CONTENT ");
	console.log(testFile.join("\n"));
	console.log("===================================");

	fs.writeFileSync("test.js", testFile.join("\n"));
	console.log("Test file written to test.js");

	if (requires.length > 0) {
		console.log("Installing dependencies:", requires);
		shell.exec(`npm install ${requires.join(" ")} --no-save`);
	}
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});
