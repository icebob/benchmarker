const humanize = require("tiny-human-time");
const { Octokit } = require("octokit");
const os = require("os");
const fs = require("fs");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const IS_ACT = !!process.env.ACT;
const evt = JSON.parse(process.env.GITHUB_EVENT);

async function run() {
	if (!fs.existsSync("result.json")) {
		throw new Error("Result file not found.");
	}

	const fc = fs.readFileSync("result.json", "utf8");
	const result = JSON.parse(fc);

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

	// await deleteReaction(reactionID);
	await addReaction("tocket");

}

run().catch(err => {
	console.error(err);
	process.exit(1);
});

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
