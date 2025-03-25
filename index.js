const parse = require("@textlint/markdown-to-ast").parse;

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


/*

1. Parse markdown to get h1 and code blocks
    https://github.com/textlint/textlint/tree/master/packages/%40textlint/markdown-to-ast

2. Create eval functions from the code blocks

3. Generate markdown result text with table and image URL

4. Post the result to the issue as comment, or edit the existing result comment

*/
