# API Documentation

This document describes the external APIs integrated into the AI Dashboard.

## GitHub REST API

Used to fetch issues and pull requests from the repository.

- **Endpoint:** `https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all`
- **Purpose:** Retrieve all issues for display on the dashboard.
- **Data used:** `id`, `number`, `title`, `state`, `html_url`, `assignee.login`.

## Google Jules API

Used to retrieve internal task statuses for AI agents.

- **Base URL:** `https://jules.googleapis.com/v1` (Configurable via `JULES_API_BASE_URL` in `App.tsx`)
- **Endpoint:** `/tasks/{issue_id}/status`
- **Method:** `GET`
- **Authentication:** Bearer Token (provided via Login UI)
- **Response Format:**
  ```json
  {
    "status": "Researching" | "Coding" | "Testing" | "Completed"
  }
  ```
- **Correlation:** GitHub Issues are matched to Jules tasks using the GitHub Issue ID.

### Authentication Flow
1. User enters Jules API Token in the dashboard header.
2. Token is saved in `localStorage.jules_token`.
3. Dashboard fetches task statuses using the stored token in the `Authorization` header.
4. If the API returns `401 Unauthorized`, the token is cleared, and the user is logged out.
