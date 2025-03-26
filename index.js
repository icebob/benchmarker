const Benchmarkify = require("benchmarkify");
const parse = require("@textlint/markdown-to-ast").parse;
const humanize = require("tiny-human-time");
const { Octokit } = require("octokit");
const { inspect } = require("util");
const os = require("os");
var shell = require('shelljs');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const IS_ACT = !!process.env.ACT;
const evt = JSON.parse(process.env.GITHUB_EVENT);
// console.log("Github event: ", inspect(evt, { depth: 10, colors: false }));

async function run() {
	const body = evt.issue?.body;

	if (!body) {
		throw new Error("Issue body not found.");
	}

	const ast = parse(body);

	console.log("AST: ", inspect(ast, { depth: 10, colors: false }));

	const benchmark = new Benchmarkify(`${evt.issue.number} - ${evt.issue.title}`, {
		description: "",
		spinner: false,
		chartImage: true
	}).printHeader();

	const suites = [];
	const setUps = [];
	const tearDowns = [];
	const requires = [];

	const context = Object.create(null);

	let suite;
	let testName;
	let isSetup, isTearDown;
	for (const node of ast.children) {

		// H1 as Suite
		if (node.type === "Header" && node.depth === 1) {
			// Create a test suite
			suite = benchmark.createSuite(node.children[0].value, {
				time: 1000,
				description: ""
			});
			suites.push(suite);
		}

		// H2 as test case ( or setup or teardown )
		if (node.type === "Header" && node.depth === 2) {
			isSetup = false;
			isTearDown = false;
			testName = null;

			const name = node.children[0].value.trim();
			if (name.toLowerCase().startsWith("setup") || name.toLowerCase().startsWith("set up")) {
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
			const fn = new Function(node.value).bind(context);
			if (isSetup) {
				requires.push(...collectRequires(node.value));
				setUps.push(fn);
			} else if (isTearDown) {
				tearDowns.push(fn);
			} else if (testName) {
				suite.add(testName, fn);
			} else {
				console.warn("Unknown code block: ", node);
			}
		}
	}

	for (const req of requires) {
		console.log(`Installing '${req}'...`);
		const res = shell.exec(`npm install ${req}`);
		console.log(`Installed '${req}':`, res.stdout);
	}

	suite.setup(setUps);
	suite.tearDown(tearDowns);

	const reactionID = await addReaction("rocket");

	const result = await benchmark.run(suites);

	console.log("Benchmark result: ", inspect(result, { depth: 10, colors: false }));

	const rows = [];

	for (const suite of result.suites) {
		rows.push(`# ${suite.name}\n`);

		rows.push("| Name | Time | Diff | Ops/sec |");

		rows.push("| --- | ---:| ---:| ---:|");

		for (const test of suite.tests) {
			let name = test.name;
			if (test.error) name += " ❌ Error: " + test.error;
			let cells = [
				`${name.replace(/\|/g, "\\|")}`,
				test.stat.avg != null ? humanize.short(test.stat.avg * 1000) : "-",
				test.stat.percent != null ? numToStr(test.stat.percent) + "%" : "-",
				test.stat.rps != null ? numToStr(test.stat.rps, 0) : "-"
			];

			if (test.fastest) {
				cells = cells.map(cell => `**${cell}**`);
			}

			rows.push("| " + cells.join(" | ") + " |");
		}

		rows.push(`\n\n![${suite.name}](${suite.chartImage})`);

		rows.push(`\n\n`);

		// Runner info

		rows.push(`-----`);
		rows.push(`### Runner Info`);
		rows.push(`- **Node.js**: ${process.versions.node}`);
		rows.push(`- **V8**: ${process.versions.v8}`);
		rows.push(`- **Platform**: ${os.type()} ${os.release()} ${os.arch()}`);
		rows.push(`- **CPU**: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
		rows.push(`- **Date**: ${new Date().toISOString()}`);
		rows.push(`- **Benchmarkify**: ${require("benchmarkify/package.json").version}`);
	}

	const resultText = rows.join("\n");

	await saveComment(resultText);

	await deleteReaction(reactionID);
	await addReaction("+1");
}

function numToStr(num, digits = 2) {
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: digits
	}).format(num);
}

async function addReaction(content) {
	if (IS_ACT) return null;

	const res = await octokit.rest.reactions.createForIssue({
		owner: evt.repository.owner.login,
		repo: evt.repository.name,
		issue_number: evt.issue.number,
		content
	});

	return res.data.id;
}

async function deleteReaction(reaction_id) {
	if (IS_ACT) return null;

	await octokit.request(
		"DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}",
		{
			owner: evt.repository.owner.login,
			repo: evt.repository.name,
			issue_number: evt.issue.number,
			reaction_id
		}
	);
}

async function saveComment(content) {
	if (IS_ACT) {
		console.log("Saving comment skipped:");
		console.log(content);
		return;
	}

	const res = await octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}/comments", {
		owner: evt.repository.owner.login,
		repo: evt.repository.name,
		issue_number: evt.issue.number
	});

	// console.log("Comments:", inspect(res, { depth: 10, colors: false }));

	const lastCommentID = res.data.find(
		comment => comment.user?.login == "github-actions[bot]"
	)?.id;

	if (lastCommentID) {
		await await octokit.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", {
			owner: evt.repository.owner.login,
			repo: evt.repository.name,
			// issue_number: evt.issue.number,
			comment_id: lastCommentID,
			body: content
		});
	} else {
		await await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
			owner: evt.repository.owner.login,
			repo: evt.repository.name,
			issue_number: evt.issue.number,
			body: content
		});
	}
}

function collectRequires(content) {
	console.log("Collecting requires from content: ", content);
	const re = /require\(['"](.+?)['"]\)/g;
	const res = [];
	let match;
	while ((match = re.exec(content))) {
		res.push(match[1]);
	}
	console.log("Requires: ", res);
	return res;
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});

/*

1. Parse markdown to get h1 and code blocks
    https://github.com/textlint/textlint/tree/master/packages/%40textlint/markdown-to-ast

2. Create eval functions from the code blocks

3. Generate markdown result text with table and image URL

4. Post the result to the issue as comment, or edit the existing result comment

*/
