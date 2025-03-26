const Benchmarkify = require("benchmarkify");
const parse = require("@textlint/markdown-to-ast").parse;
const humanize = require("tiny-human-time");
const {Octokit, App} = require("octokit");
const { inspect } = require("util");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const evt = JSON.parse(process.env.GITHUB_EVENT);
// console.log("Github event: ", inspect(evt, { depth: 10, colors: false }));

const body = evt.issue?.body;

if (!body) {
    console.log("Body not found");
    process.exit(1);
    return;
}

console.log(`Issue #${evt.issue.number} - ${evt.issue.title}: ${body}`);

const ast = parse(body);

console.log("AST: ", inspect(ast, { depth: 10, colors: false }));

const benchmark = new Benchmarkify(`${evt.issue.number} - ${evt.issue.title}`, { description: "This is a common benchmark", chartImage: true }).printHeader();

const suites = [];

let suite;
let testName;
for (const node of ast.children) {
    if (node.type === "Header" && node.depth === 1) {
        // Create a test suite
        suite = benchmark.createSuite(node.children[0].value, { time: 1000, description: "" });
        suites.push(suite);
    }

    if (node.type === "Header" && node.depth === 2) {
        testName = node.children[0].value;
    }

    if (node.type === "CodeBlock" && testName) {
        suite.add(testName, () => {
            eval(node.value);
        });
    }
}

function numToStr(num, digits = 2) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(num);
}

async function addReaction(content) {
    const res = await octokit.rest.reactions.createForIssue({
        owner: evt.repository.owner.login,
        repo: evt.repository.name,
        issue_number: evt.issue.number,
        content
    });

    return res.data.id;
}

async function deleteReaction(reaction_id) {
    await octokit.request("DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}", {
        owner: evt.repository.owner.login,
        repo: evt.repository.name,
        issue_number: evt.issue.number,
        reaction_id
    });
}

async function saveComment(content) {
    const res = await octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner: evt.repository.owner.login,
        repo: evt.repository.name,
        issue_number: evt.issue.number
    });

    console.log("Comments:", inspect(res, { depth: 10, colors: false }));

    const lastCommentID = res.data.find(comment => comment.user?.login == "github-actions[bot]")?.id;

    if (lastCommentID) {
        await await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}/comments/{comment_id}", {
            owner: evt.repository.owner.login,
            repo: evt.repository.name,
            issue_number: evt.issue.number,
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

(async () => {
       
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
            let cells = [
                name,
                humanize.short(test.stat.avg * 1000),
                numToStr(test.stat.percent) + "%",
                numToStr(test.stat.rps, 0)
            ];

            if (test.fastest) {
                cells = cells.map((cell) => `**${cell}**`);
            }

            rows.push("| " + cells.join(" | ") + " |");
        }      

        rows.push(`\n\n![${suite.name}](${suite.chartImage})`);

        rows.push(`\n\n`);

    }

    const resultText = rows.join("\n");

    console.log("Result text: ", resultText);

    await saveComment(resultText);

    await deleteReaction(reactionID);
    await addReaction("+1");

})();



/*

1. Parse markdown to get h1 and code blocks
    https://github.com/textlint/textlint/tree/master/packages/%40textlint/markdown-to-ast

2. Create eval functions from the code blocks

3. Generate markdown result text with table and image URL

4. Post the result to the issue as comment, or edit the existing result comment

*/
