#!/usr/bin/env python3
"""Static lint helper for feature specifications.

This script performs deterministic markdown checks that are useful before an
LLM adversarial audit. It intentionally avoids external dependencies.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List


@dataclass
class Finding:
    id: str
    severity: str
    category: str
    line: int | None
    title: str
    evidence: str
    recommendation: str


REQUIRED_SECTIONS = [
    "Problem Statement",
    "Personas",
    "Value Assessment",
    "User Stories",
    "Design",
    "Tasks",
    "Out of Scope",
    "Future Considerations",
]

AMBIGUOUS_TERMS = [
    "appropriate",
    "as needed",
    "better",
    "easy",
    "efficient",
    "fast",
    "handle",
    "improve",
    "intuitive",
    "optimize",
    "robust",
    "seamless",
    "simple",
    "support",
    "user-friendly",
]

EARS_STARTS = (
    "the ",
    "when ",
    "while ",
    "where ",
    "if ",
)


def read_lines(path: Path) -> List[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()


def headings(lines: List[str]) -> List[tuple[int, int, str]]:
    found: List[tuple[int, int, str]] = []
    for idx, line in enumerate(lines, start=1):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if match:
            found.append((idx, len(match.group(1)), match.group(2).strip().rstrip(":").strip()))
    return found


def section_text(lines: List[str], section_name: str) -> tuple[int | None, List[str]]:
    hs = headings(lines)
    for pos, (line_no, level, title) in enumerate(hs):
        if title.lower() == section_name.lower():
            start = line_no
            end = len(lines) + 1
            for next_line, next_level, _ in hs[pos + 1 :]:
                if next_level <= level:
                    end = next_line
                    break
            return start, lines[start:end - 1]
    return None, []


def add(findings: List[Finding], severity: str, category: str, line: int | None, title: str, evidence: str, recommendation: str) -> None:
    findings.append(
        Finding(
            id=f"SL-{len(findings) + 1:03d}",
            severity=severity,
            category=category,
            line=line,
            title=title,
            evidence=evidence,
            recommendation=recommendation,
        )
    )


def lint_required_sections(lines: List[str], findings: List[Finding]) -> None:
    titles = {title.lower() for _, _, title in headings(lines)}
    for section in REQUIRED_SECTIONS:
        if section.lower() not in titles:
            add(
                findings,
                "High",
                "Structure",
                None,
                f"Missing required section: {section}",
                "section not found",
                f"Add a `## {section}` section or map the repository's equivalent heading explicitly.",
            )


def lint_todo_markers(lines: List[str], findings: List[Finding]) -> None:
    pattern = re.compile(r"\b(TODO|TBD|FIXME|XXX|\?\?\?)\b", re.IGNORECASE)
    for idx, line in enumerate(lines, start=1):
        if pattern.search(line):
            add(
                findings,
                "Medium",
                "Completeness",
                idx,
                "Unresolved placeholder marker",
                line.strip(),
                "Convert the placeholder into a bounded Open Question or resolve it before implementation.",
            )


def lint_ambiguous_terms(lines: List[str], findings: List[Finding]) -> None:
    term_pattern = re.compile(r"\b(" + "|".join(re.escape(t) for t in AMBIGUOUS_TERMS) + r")\b", re.IGNORECASE)
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("|"):
            continue
        match = term_pattern.search(stripped)
        if match:
            add(
                findings,
                "Low",
                "Ambiguity",
                idx,
                f"Potentially ambiguous term: {match.group(1)}",
                stripped,
                "Replace subjective language with an observable behavior, threshold, or verification condition.",
            )


def lint_acceptance_criteria(lines: List[str], findings: List[Finding]) -> None:
    in_ac = False
    ac_start = None
    bullets = []
    all_ac_bullets = 0
    ears_like = 0

    for idx, line in enumerate(lines, start=1):
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if heading:
            title = heading.group(2).strip().rstrip(":").strip().lower()
            if title == "acceptance criteria":
                in_ac = True
                ac_start = idx
                bullets = []
                continue
            if in_ac:
                if not bullets:
                    add(
                        findings,
                        "High",
                        "Acceptance Criteria",
                        ac_start,
                        "Empty acceptance criteria section",
                        "no bullet criteria found",
                        "Add EARS-style criteria with trigger/condition and observable system response.",
                    )
                in_ac = False
        if in_ac and re.match(r"^\s*[-*]\s+", line):
            all_ac_bullets += 1
            bullets.append((idx, line.strip()))
            text = re.sub(r"^\s*[-*]\s+(\[.\]\s+)?", "", line).strip().lower()
            if text.startswith(EARS_STARTS) and re.search(r"\bshall\b", text):
                ears_like += 1
            else:
                add(
                    findings,
                    "Medium",
                    "Acceptance Criteria",
                    idx,
                    "Acceptance criterion may not be EARS-like",
                    line.strip(),
                    "Rewrite as `When/While/Where/If/The <system> shall <observable response>`.",
                )

    if in_ac and not bullets:
        add(
            findings,
            "High",
            "Acceptance Criteria",
            ac_start,
            "Empty acceptance criteria section",
            "no bullet criteria found",
            "Add EARS-style criteria with trigger/condition and observable system response.",
        )

    if all_ac_bullets == 0:
        add(
            findings,
            "High",
            "Acceptance Criteria",
            None,
            "No acceptance criteria bullets found",
            "no `Acceptance Criteria` bullets detected",
            "Add acceptance criteria for each user story using EARS-style syntax.",
        )
    elif ears_like / max(all_ac_bullets, 1) < 0.5:
        add(
            findings,
            "Medium",
            "Acceptance Criteria",
            None,
            "Most acceptance criteria are not EARS-like",
            f"{ears_like}/{all_ac_bullets} bullets look EARS-like",
            "Rewrite weak criteria so each includes a condition or trigger and a shall statement.",
        )


def lint_checkboxes(lines: List[str], findings: List[Finding]) -> None:
    for idx, line in enumerate(lines, start=1):
        if re.search(r"\[[xX]\]", line):
            add(
                findings,
                "Low",
                "Task Hygiene",
                idx,
                "Completed checkbox in draft spec",
                line.strip(),
                "Use unchecked `[ ]` boxes in draft specs; implementers should mark completion.",
            )


def lint_tasks(lines: List[str], findings: List[Finding]) -> None:
    task_start, task_lines = section_text(lines, "Tasks")
    if task_start is None:
        return
    task_headings = []
    for offset, line in enumerate(task_lines, start=task_start + 1):
        if re.match(r"^#{3,6}\s+Task\s+\d+", line, re.IGNORECASE):
            task_headings.append((offset, line))
    if not task_headings:
        add(
            findings,
            "High",
            "Tasks",
            task_start,
            "No numbered task headings found",
            "Tasks section exists but no `### Task N` headings detected",
            "Split implementation into numbered, ordered tasks sized for one coding-agent session.",
        )
        return

    required_labels = ["Objective", "Affected files", "Requirements", "Verification", "Done when"]
    for pos, (line_no, title) in enumerate(task_headings):
        next_start = task_headings[pos + 1][0] if pos + 1 < len(task_headings) else task_start + len(task_lines) + 1
        block = "\n".join(lines[line_no - 1 : next_start - 1])
        for label in required_labels:
            if not re.search(rf"\*\*{re.escape(label)}\*\*\s*:", block, re.IGNORECASE):
                add(
                    findings,
                    "Medium",
                    "Tasks",
                    line_no,
                    f"Task missing `{label}` field",
                    title.strip(),
                    f"Add a `**{label}**:` field so agents know scope and completion criteria.",
                )


def lint_mermaid(lines: List[str], findings: List[Finding]) -> None:
    content = "\n".join(lines)
    mermaid_count = len(re.findall(r"```mermaid\s*\n", content, flags=re.IGNORECASE))
    if mermaid_count == 0:
        add(
            findings,
            "Low",
            "Design",
            None,
            "No Mermaid diagrams found",
            "no mermaid code fences detected",
            "Add diagrams when data flow, sequence, state, or architecture would reduce agent ambiguity.",
        )


def run_lint(path: Path) -> List[Finding]:
    lines = read_lines(path)
    findings: List[Finding] = []
    lint_required_sections(lines, findings)
    lint_todo_markers(lines, findings)
    lint_acceptance_criteria(lines, findings)
    lint_checkboxes(lines, findings)
    lint_tasks(lines, findings)
    lint_mermaid(lines, findings)
    lint_ambiguous_terms(lines, findings)
    return findings


def render_markdown(path: Path, findings: Iterable[Finding]) -> str:
    findings = list(findings)
    lines = [f"# Static Spec Audit Lint: {path}", ""]
    if not findings:
        lines.append("No deterministic lint findings. Continue with adversarial semantic audit.")
        return "\n".join(lines)
    for finding in findings:
        location = f"line {finding.line}" if finding.line else "global"
        lines.extend(
            [
                f"## {finding.id} — {finding.title}",
                "",
                f"- **Severity**: {finding.severity}",
                f"- **Category**: {finding.category}",
                f"- **Location**: {location}",
                f"- **Evidence**: {finding.evidence}",
                f"- **Recommendation**: {finding.recommendation}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run deterministic lint checks against a feature spec markdown file.")
    parser.add_argument("spec", type=Path, help="Path to the spec markdown file")
    parser.add_argument("--format", choices=["json", "markdown"], default="json", help="Output format")
    args = parser.parse_args()

    if not args.spec.exists():
        parser.error(f"spec file not found: {args.spec}")

    findings = run_lint(args.spec)
    if args.format == "json":
        payload = {
            "artifact_audited": str(args.spec),
            "finding_count": len(findings),
            "findings": [asdict(f) for f in findings],
        }
        print(json.dumps(payload, indent=2))
    else:
        print(render_markdown(args.spec, findings))
    return 1 if any(f.severity == "High" for f in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
