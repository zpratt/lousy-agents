# Go adapter and catalogue

Load this file only when `metadata.language` is `go`. This is the authoritative Go adapter and Go-only mutation list. Apply these in addition to the shared catalogue in `SKILL.md`.

## Adapter

- **Package root:** directory containing the controlling `go.mod`.
- **Baseline/test command:** `go test ./...` from the package root. Add `-count=1` only when the agent observes test caching affecting classification. If the repo pins Go via mise/asdf/etc., run through that toolchain (see SKILL.md Workspace roots and toolchains).
- **Discovery (default, no `--target`):** all production `*.go` files except tests, fixtures, and common non-product trees:

  ```bash
  find . -name "*.go" ! -name "*_test.go" \
    ! -path "./vendor/*" ! -path "*/vendor/*" \
    ! -path "./third_party/*" ! -path "*/third_party/*" \
    ! -path "./.git/*" \
    ! -path "*/testdata/*" ! -path "*/fixtures/*" \
    ! -name "zz_generated*.go" ! -name "*_gen.go" ! -name "*.pb.go" \
    ! -name "mock_*.go" ! -name "*_mock.go" ! -name "mocks.go" \
    | sort
  ```

- **When `--target` is set:** expand the glob, then apply the same exclusions (still drop `*_test.go`, `testdata/`, `fixtures/`, vendor, generated, mocks).
- **Priority paths, when present:** `internal/`, `pkg/`, `domain/`, `service/`, and `usecase/`. Prefer those packages over `cmd/`; skip `cmd/main.go` when higher-value packages exist.
- **Exclusions:** `*_test.go`; `vendor/`; `third_party/`; `testdata/`; `fixtures/`; generated files (`zz_generated*.go`, `*_gen.go`, `*.pb.go`); mocks (`mock_*.go`, `*_mock.go`, `mocks.go`); other non-executable or generated sources. Do **not** exclude real packages merely because their name contains "fake" (e.g. an intentional `fakegithub` service package is fair game if it is production code under test).
- **Default `--target`:** all non-test `*.go` under the module subject to the exclusions above.
- **Empty discovery:** abort; do not fall back to mutating tests or fixtures.
- **Compile errors:** `go build` or `go test` compile failures count as killed.
- **Return-value zero values:** `nil`, `0`, `""`, `false`, and nil slices or maps compatible with the function's result.

## Go-only mutations

| Original | Mutated |
|:---|:---|
| `err != nil` | `err == nil` |
| `err == nil` | `err != nil` |
| `==` | `!=` |
| `!=` | `==` |
| `true` | `false` |
| `false` | `true` |
| `break` | `continue` |
| `continue` | `break` |

An error-guard mutation must remain a single semantic change. For example, mutate `if err != nil { return result, err }` to the opposite guard, or remove that early return only when the resulting code remains a meaningful candidate. Do not combine guard inversion with a second edit in the same trial.
