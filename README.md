# github-mcp

An MCP (Model Context Protocol) server that lets AI coding agents (Claude Code,
Codex CLI, etc.) manage GitHub issues and pull requests, administer
repositories, make local git commits/pushes, and sync content between GitHub
and an Obsidian vault.

> Community project — not affiliated with GitHub.

## Setup

```bash
git clone https://github.com/Mochiduki-0715/github-mcp.git
cd github-mcp
npm install
npm run build
```

Configuration is done through environment variables:

| Variable | Description | Default |
|---|---|---|
| `GITHUB_TOKEN` | Classic PAT with `repo` scope (add `delete_repo`/`admin:org` if needed) | (required) |
| `GITHUB_TOKEN_<OWNER>` | Overrides the token for a specific owner/org, e.g. `GITHUB_TOKEN_MY_WORK_ORG`. Owner is uppercased and non-alphanumeric characters become `_` | falls back to `GITHUB_TOKEN` |
| `OBSIDIAN_VAULT_PATH` | Absolute path to your Obsidian vault | (required only for `sync_*` tools) |
| `GITHUB_MCP_PROTECTED_BRANCHES` | Comma-separated branch names that `commit_changes`/`push_branch` refuse to touch | `main,master,develop,dev` |

Multiple GitHub accounts are supported: every tool that takes an `owner`
parameter automatically picks `GITHUB_TOKEN_<OWNER>` if set, otherwise falls
back to the default `GITHUB_TOKEN`.

## Registering with agents

### Claude Code

```bash
claude mcp add --scope user github-mcp \
  --env GITHUB_TOKEN=ghp_xxx \
  --env GITHUB_TOKEN_MY_WORK_ORG=ghp_yyy \
  --env OBSIDIAN_VAULT_PATH=$HOME/path/to/your/vault \
  -- node /path/to/github-mcp/dist/index.js
```

`GITHUB_TOKEN_<OWNER>` and `OBSIDIAN_VAULT_PATH` are optional — omit either if
you don't need multi-account tokens or vault sync.

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.github-mcp]
command = "node"
args = ["/path/to/github-mcp/dist/index.js"]

[mcp_servers.github-mcp.env]
GITHUB_TOKEN = "ghp_xxx"
OBSIDIAN_VAULT_PATH = "/path/to/your/vault"
```

## Tools

### Issues

| Tool | Description |
|---|---|
| `list_issues` | List issues in a repo (pull requests are excluded) |
| `get_issue` | Get full detail of one issue, optionally including its comment thread |
| `search_issues_and_prs` | Search issues/PRs by keyword, optionally scoped to a repo |
| `create_issue` | Open a new issue |
| `comment_on_issue` | Add a comment to an issue or pull request |
| `close_issue` | Close an issue, optionally with a closing comment |

### Pull Requests

| Tool | Description |
|---|---|
| `list_pull_requests` | List pull requests in a repo |
| `get_pull_request` | Get full detail of one PR, including diff stats and mergeability |
| `create_pull_request` | Open a new pull request |
| `review_pull_request` | Approve, request changes, or comment (body required unless approving) |
| `get_pull_request_checks` | Get CI check run statuses for a PR's latest commit |
| `merge_pull_request` | Merge a PR — irreversible, requires `confirm: true` |
| `close_pull_request` | Close a PR without merging |

### Repository administration

| Tool | Description |
|---|---|
| `create_repository` | Create a repository (personal or org-owned) |
| `list_branches` | List branches, including which are protected |
| `set_branch_protection` | Set branch protection rules — replaces the whole ruleset, requires `confirm: true` |
| `update_repository_settings` | Update visibility/default branch/feature toggles — `confirm: true` required when changing `private` |
| `get_rate_limit` | Check current GitHub API rate limit status |

### Local git

| Tool | Description |
|---|---|
| `git_status` | Show staged/modified/untracked files (read-only) |
| `git_diff` | Show a diff, optionally staged-only or scoped to files (read-only) |
| `create_branch` | Create and switch to a new local branch |
| `commit_changes` | Stage and commit — refuses protected branches, never touches author identity |
| `push_branch` | Push a branch — refuses protected branches, never force-pushes |

### Sync (GitHub ⇄ Obsidian)

| Tool | Description |
|---|---|
| `sync_github_to_vault` | Mirror issues/PRs from one or more repos into vault notes under `GitHub/<owner>/<repo>/Issues\|PRs/<number>.md` |
| `sync_vault_to_github` | Create GitHub issues from vault notes flagged with `github_sync: create_issue` |

## Testing

```bash
npm test
```

Runs the TypeScript build followed by Node's built-in test runner
(`node --test`) against the compiled `dist/*.test.js` files. Tests use fake
Octokit clients and temporary git repositories/vaults — no network access or
real `GITHUB_TOKEN` is required. HTTPS push and live GitHub API calls are not
covered by automated tests; verify those manually against a scratch
repository.

## Safety

- Local git operations require the target directory to actually be a git
  repository (`.git` present) before doing anything
- `commit_changes` never sets `--author` or `GIT_AUTHOR_*`/`GIT_COMMITTER_*`
  env vars, and never appends any trailer — author/committer come entirely
  from the repository's own git config, and commit messages are passed
  through verbatim
- `push_branch` injects the GitHub token via a single-invocation
  `-c http.extraheader`, never writing it into `.git/config` or the remote
  URL; it never force-pushes
- `commit_changes`/`push_branch` refuse to touch protected branches
  (`main`/`master`/`develop`/`dev` by default, configurable via
  `GITHUB_MCP_PROTECTED_BRANCHES`)
- `merge_pull_request` and `set_branch_protection` require an explicit
  `confirm: true`; `update_repository_settings` requires it only when
  changing `private`
- `sync_*` tools resolve every vault path inside `OBSIDIAN_VAULT_PATH`;
  `..` escapes are rejected, and content under a `## My Notes` heading is
  preserved across re-syncs
- `GITHUB_TOKEN`/`GITHUB_TOKEN_<OWNER>` are read from the environment only
  at point of use — never logged, never written to any file

## License

[MIT](LICENSE)
