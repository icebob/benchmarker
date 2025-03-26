const Benchmarkify = require("benchmarkify");
const parse = require("@textlint/markdown-to-ast").parse;
const humanize = require("tiny-human-time");
const {Octokit, App} = require("octokit");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const evt = JSON.parse(process.env.GITHUB_EVENT);
console.log("Github event: ", evt);

const body = evt.issue?.body;

if (!body) {
    console.log("No body found");
    return;
}

console.log(`Issue #${evt.issue.number} - ${evt.issue.title}: ${body}`);

const ast = parse(body);

console.log("AST: ", ast);

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

(async () => {
       await octokit.rest.reactions.createForIssue({
        owner: evt.repository.owner.login,
        repo: evt.repository.name,
        issue_number: evt.issue.number,
        content: "rocket"
    });


    const result = await benchmark.run(suites);

    console.log("Benchmark result: ", result);

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

    // Post the result to the issue as comment
    await octokit.rest.issues.createComment({
        owner: evt.repository.owner.login,
        repo: evt.repository.name,
        issue_number: evt.issue.number,
        body: resultText
    });

})();



/*

1. Parse markdown to get h1 and code blocks
    https://github.com/textlint/textlint/tree/master/packages/%40textlint/markdown-to-ast

2. Create eval functions from the code blocks

3. Generate markdown result text with table and image URL

4. Post the result to the issue as comment, or edit the existing result comment

*/
