# `gh` Binding

> Load this **only when the probe in [`github-surface.md`](./github-surface.md) binds `gh`**.
> Every abstract operation the skill names maps to one snippet below. On an MCP or
> built-in binding this file is not needed and should not be read.

`jq` is required only on this path. Probe it before binding `gh`. Do not use `gh api --jq`
together with `--paginate`: `gh` applies `--jq` per page, which breaks a whole-list `sort_by`.
Pipe the paginated array to `jq` instead.

Resolve `OWNER`, `REPO`, and `NUMBER` per **Resolve the target** in [`github-surface.md`](./github-surface.md) and interpolate them
yourself. Do not use `gh`'s `{owner}` / `{repo}` placeholders: they re-derive the repository
from the current directory, which is the ambient context that section exists to override, and
on a PR URL for another repository they query the wrong one without erroring. `{number}` is
not a gh placeholder at all — it is sent literally and fails validation.

```bash
gh pr view "$NUMBER" -R "$OWNER/$REPO" --json title,body,headRefName,baseRefName,state,url

# `outdated` matters: when the diff moves out from under a comment, `line` goes
# null and only `original_line` survives. `review_id` is nullable too.
gh api "repos/$OWNER/$REPO/pulls/$NUMBER/comments" --paginate \
  | jq '[.[] | {id, review_id: .pull_request_review_id, user: .user.login,
                path, line, original_line, outdated: (.line == null),
                body, created_at, in_reply_to_id}]
        | sort_by(.created_at) | reverse'

gh api "repos/$OWNER/$REPO/pulls/$NUMBER/reviews" --paginate \
  | jq '[.[] | {id, user: .user.login, state, body, submitted_at}]
        | sort_by(.submitted_at) | reverse'

# Conversation-tab comments. A PR is backed by an issue, so these live on the
# issue-comments endpoint and appear on neither call above.
gh api "repos/$OWNER/$REPO/issues/$NUMBER/comments" --paginate \
  | jq '[.[] | {id, user: .user.login, body, created_at}]
        | sort_by(.created_at) | reverse'

# `comment_id` must be the thread's TOP-LEVEL comment — the first node of the
# thread's comments connection. Replying to a reply returns 422.
# `-F key=@path` reads the value from the file, so the shell never sees the body.
# `-f` would send the literal string "@path" instead.
gh api "repos/$OWNER/$REPO/pulls/$NUMBER/comments/$TOP_LEVEL_COMMENT_ID/replies" \
  -F body=@"$REPLY_FILE"

# `--slurp` wraps the pages in one array; without it a paginated GraphQL call
# emits N separate JSON documents and a plain `jq` reads only the first.
# `pageInfo` must be selected BEFORE `nodes` at the paginated level: gh scans the
# response for the first `pageInfo` it meets and paginates on that one.
gh api graphql --paginate --slurp \
  -f owner="$OWNER" -f repo="$REPO" -F number="$NUMBER" \
  -f query='query($owner:String!,$repo:String!,$number:Int!,$endCursor:String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { databaseId path url }
          }
        }
      }
    }
  }
}'

# Only when a thread reports comments.pageInfo.hasNextPage. The inline fragment
# is required: `node` returns the Node interface, which has no `comments` field.
gh api graphql --paginate --slurp -f threadId="$THREAD_ID" \
  -f query='query($threadId:ID!,$endCursor:String) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      id
      isResolved
      comments(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId path url }
      }
    }
  }
}'

# Pass the id as a variable rather than splicing it into the query string.
gh api graphql -f threadId="$THREAD_ID" \
  -f query='mutation($threadId:ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}'
```

Write the reply body with the `Write` tool to a scratch path outside the working tree (this skill has `Write`; it needs no heredoc), then pass that path as `$REPLY_FILE`. Remove the file once the reply is posted.

`--paginate` follows one cursor — the first `pageInfo` in the response — so it never walks the nested `comments` connection. When a thread reports `comments.pageInfo.hasNextPage`, re-query that thread by its node id with the second snippet above, passing `after` its `endCursor`, until `hasNextPage` is false. Skipping that loses the `isResolved` join for the tail of a long thread, which is the re-triage bug in a different disguise.
