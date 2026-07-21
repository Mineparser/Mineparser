# Contributing to Mineparser

Thank you for taking the time to help improve Mineparser.

## What We Welcome

We actively welcome GitHub Issues for:

- Bug reports and reliable reproduction steps
- UX and accessibility feedback
- Feature requests and use-case proposals
- Documentation improvements
- Performance problems and benchmark results

Please open an Issue before proposing a significant change. This helps us understand the problem and decide whether it fits the project's direction.

## Pull Requests

Mineparser does not currently accept Pull Requests for ordinary application changes, including feature implementation, behavior changes, visual redesigns, or general refactoring.

The only current exception is a focused performance improvement. A performance-related Pull Request may be considered when it:

- Changes only what is necessary
- Identifies the changed file and relevant lines
- Explains in one clear sentence what problem the change solves and why the approach improves it
- Includes before-and-after measurements
- Passes the existing test suite and benchmark where applicable

Please do not fork the project and submit a Pull Request for changes outside this exception. Open an Issue instead. Pull Requests that do not follow this policy may be closed without further action.

## Bug Reports

When reporting a bug, please include:

- Operating system and version
- Mineparser version
- Steps to reproduce the problem
- Expected behavior
- Actual behavior
- Screenshots, logs, or benchmark results when useful

Clear reproduction steps are more valuable than a proposed code fix.

## Development Checks

Before submitting a performance-related Pull Request, run:

```bash
npm test
npm run benchmark
```

Please include any relevant results in the Pull Request description.
