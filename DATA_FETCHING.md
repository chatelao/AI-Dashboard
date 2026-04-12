# Data Fetching Documentation

This document describes how the AI-Dashboard collects and processes data from various sources.

## Data Sources

### 1. GitHub API
The dashboard uses the GitHub REST API to fetch issues and pull requests for the selected repository.

- **Endpoint:** `https://api.github.com/repos/${currentRepo}/issues`
- **Fetching Logic:**
    - The application performs a sequential fetch of up to 5 pages.
    - Each request fetches 100 items per page (`per_page=100`).
    - The `state` parameter is controlled by the dashboard filter (e.g., `open` or `all`).
    - Fetching stops early if a page returns fewer than 100 items or an empty list.
- **Authentication:** Uses a Personal Access Token (PAT) stored in `localStorage` as `github_token`. It is sent in the `Authorization` header using the `token <TOKEN>` format.

### 2. Jules API
For issues and pull requests identified as Jules tasks, the dashboard fetches their status from the Jules API.

- **Identification:** An item is considered a Jules task if:
    - The assignee is `jules` or `google-labs-jules[bot]`.
    - It has a label named `Jules` (case-insensitive).
- **Endpoint:** `https://jules.googleapis.com/v1/tasks/${issueNumber}/status`
- **Authentication:** Uses a Jules API Token stored in `localStorage` as `jules_token`. It is sent in the `Authorization` header using the `Bearer <TOKEN>` format.

## Data Processing

### Pull Request Status
For every item that is a pull request, the dashboard determines its CI/CD status:

1.  **Fetch PR Details:** The application fetches the full PR object from the URL provided in the initial issues fetch.
2.  **Get Head SHA:** It extracts the `head.sha` from the PR details.
3.  **Query Check Runs:** It calls the GitHub check-runs API: `https://api.github.com/repos/${repo}/commits/${sha}/check-runs`.
4.  **Determine Color:**
    - **Red:** If any check run has a conclusion of `failure`, `cancelled`, `timed_out`, or `action_required`.
    - **Yellow:** If any check run is not yet `completed`.
    - **Green:** If all check runs are completed and none have failed.

### Issue-PR Consolidation
To provide a clean view, pull requests are linked to their corresponding issues if they are in the same repository.

- **Mechanism:** The application parses the body of each pull request using the following regular expression:
  `/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi`
- **Linking:** If a match is found (e.g., "fixes #123"), the PR is added to the `linkedPRs` array of the issue with that number.
- **Display:** Linked PRs are displayed as subtitles under their parent issue, and the PR's status (CI/CD and Jules status) is aggregated in the issue's row.

## State Management and Re-fetching
Data fetching is managed within a React `useEffect` hook, triggered by changes to:
- GitHub Token
- Jules Token
- Selected Repository
- Filter State (Open/All)
- Manual Refresh Trigger
- Updating tokens in the settings panel
