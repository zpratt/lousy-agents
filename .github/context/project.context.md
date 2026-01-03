# Project Context

"Lousy Agents" is a simple scaffolding tool designed to help software engineers improve their workflow when leveraging AI agents as part of their overall team. It provides a library of patterns, instructions, and feedback loops that guide AI coding assistants like GitHub Copilot to produce more accurate and reliable code. Specifically, it provides features for "vibe coding scaffolding" targeting software engineers learning vibe coding who want simple tooling that allows them to leverage two-way door decision making (also known as "High-Velocity Decision Making" as [defined by Jeff Bezos](https://s2.q4cdn.com/299287126/files/doc_financials/annual/2016-Letter-to-Shareholders.pdf)) and experiments.

## Characteristics

* Runnable using npx commands
* Configurable
* Supports sharable configurations across teams and projects using [c12](https://github.com/unjs/c12) as the configuration engine

## Features

* Bootstrap new projects with pre-configured instructions, tests, and linters defined in a simple configuration file
* Composable: fits the tech stack of your project by:
  * Integrating with existing tools and workflows
* Supports emergent decision making
  * You don't have to know everything up front—add new agentic "components" as your needs evolve
* Provides clear instructions and specifications for AI coding assistants so you can build production-ready software with confidence

## Getting Started

1. `node dist/index.js init` to create a new project with lousy agents scaffolding