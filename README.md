# Benchmarker

Benchmarker is a benchmark runner based on Github Issues. Just create a new issue with the test case code blocks and Benchmarker Github Action workflow will execute the benchmark tests and post the results as a comment of the issue.

It supports Javascript and Node.js.

## How it works

1. Open an issue, use the "Benchmark" template
2. Set the name of the benchmark test
3. Copy the test case codes and setup, teardown codes.
4. Save the issue and wait a few seconds. The Github Action will post the result as a comment.
5. If you want to modify the test, just edit the issue and save. The Github Action will rerun the test and update the comment.

## Issue formats

Open #3 to see how the benchmark test looks.

### Name of the benchmark test

Use h1 header for the name of benchmark test

```markdown
# UUID versions
```

### Dependencies

If your test needs NPM libraries, use the dependencies block and list all libraries. You can use just the name of library for latest version (`uuid`) or specify the version (`uuid@11.0.4`).

```markdown
## Dependencies
- uuid@11.0.4
```

### Setup

Use h2 header with `Setup` or `Set up` text and add a code block with the setup code.

```markdown
    ## Setup

    ```js
    const uuid = require("uuid");

    const NS = uuid.v4();
    ```
```


### Test case

Use h2 header with the name of the test case and add a code block with the test case code.

```markdown
    ## Generate UUID v4

    ```js
    return uuid.v4();
    ```
```

### Tear down

Use h2 header with `Teardown` or `Tear down` text and add a code block with the tear down code.

```markdown
    ## Teardown

    ```js
    // Close DB connection
    db.close();
    ```
```

## Test result

The Benchmarker generate a table and a chart from the test results.

![image](https://github.com/user-attachments/assets/078addc7-9066-43d4-8112-9bdfe387e9df)


## License
Benchmarker is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact

Copyright (C) 2025 Icebob

[![@icebob](https://img.shields.io/badge/github-icebob-green.svg)](https://github.com/icebob) [![@icebob](https://img.shields.io/badge/twitter-Icebobcsi-blue.svg)](https://twitter.com/Icebobcsi)
