# Lousy Agents 🤖

**Turn "lousy" AI outputs into production-grade code.**

Ever asked an AI to write code and gotten a mess? You're not alone. This repository is a reference library of **patterns, instructions, and feedback loops** designed to make GitHub Copilot and other coding agents highly effective.

## 📖 Table of Contents

- [👋 Who This Is For](#who-this-is-for)
- [🚀 Why This Exists](#why-this-exists)
- [⚡ Features](#features)
- [☁️ Try It in Codespaces](#try-it-in-codespaces)
- [🧪 Example: copilot-with-react](ui/copilot-with-react) — A Next.js + TypeScript project demonstrating spec-driven TDD with Copilot instructions, pre-configured testing (Vitest), linting (Biome), and a full dev container setup.

## 👋 Who This Is For

-   **Software Engineers**: Frustrated by inconsistent AI output and looking for proven patterns to improve results.
-   **Curious Beginners**: Interested in AI-assisted coding but unsure how to set things up for success.
-   **Team Leads**: Exploring how to standardize AI tooling across a team or project.

No prior experience with coding agents is required—just curiosity and a willingness to experiment.

## 🚀 Why This Exists

AI coding assistants work best when given clear constraints. Without structure, they guess—and often guess wrong. This project provides the scaffolding they need to succeed:

-   **📋 Instructions & Specs**: Templates that clearly communicate your intent, so agents produce code that matches your vision.
-   **🔄 Feedback Loops**: Pre-configured testing ([Vitest](https://vitest.dev/)) and linting ([Biome](https://biomejs.dev/)) that let agents catch and fix their own mistakes immediately.
-   **⚙️ Copilot Configuration**: Settings and workflows that ground AI assistants in your specific engineering standards.

## ⚡ Features

-   **Spec-Driven Development**: A methodology where you write clear specifications *first*, giving agents precise requirements to implement—rather than vague prompts.
-   **Validation-First Setup**: Example projects pre-wired with tests and linters, so agents get instant feedback on their work.
-   **Dev Container Ready**: Includes a full [Dev Container](https://containers.dev/) configuration (in `ui/copilot-with-react`) for one-click setup.

## ☁️ Try It in Codespaces

Don't just read about it—experience it. The examples in this repo (starting with `ui/copilot-with-react`) are **"batteries included"**.

Launch a GitHub Codespace to instantly spin up a fully configured environment. Each example project is designed to be runnable immediately with:
-   **Dev Containers**: Zero local setup required.
-   **Tooling**: Linters, test runners, and build tools ready to go.
-   **Agent Context**: Instructions and specs pre-loaded for Copilot.

It's the perfect sandbox to experiment with these patterns and see how a well-structured environment can significantly improve AI performance.
