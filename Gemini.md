# Gemini Project Specification

## Overview
This single-page application (SPA) is designed to provide a unified dashboard for tracking development progress. It aggregates data from GitHub and correlates it with task statuses from Google Jules.

## Hosting
The application is hosted on **GitHub Pages**, providing a serverless and easily accessible deployment environment.

## Data Sources

### GitHub API
The SPA collects real-time data from specified GitHub repositories using the GitHub REST or GraphQL API.
- **Issues:** Fetches all open and recently closed issues.
- **Pull Requests:** Tracks the status of pull requests, including review status and merge state.

### Google Jules
The application integrates with Google Jules to retrieve internal task statuses. This is specifically focused on tracking the progress of tasks that are being actively worked on by AI agents.

## Google Jules Status Matching Logic
For GitHub Issues that are currently **in progress** and **assigned to Jules**, the application performs a matching operation to display the corresponding Google Jules status.

### Logic Details:
1. **Filter:** Identify GitHub Issues where `assignee == "Jules"` and `state == "open"`.
2. **Correlation:** Match the GitHub Issue (via ID or URL) with the corresponding entry in Google Jules.
3. **Status Mapping:**
   - Retrieve the current operational status from Google Jules (e.g., "Researching", "Coding", "Testing", "Completed").
   - Display this Jules-specific status alongside the GitHub Issue in the SPA dashboard.
