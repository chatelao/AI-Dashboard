import json
from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Mock GitHub API for issues
    def handle_issues(route):
        json_data = [
            {
                "id": 1,
                "number": 43,
                "title": "Test Issue",
                "state": "open",
                "html_url": "https://github.com/chatelao/AI-Dashboard/issues/43",
                "repository_url": "https://api.github.com/repos/chatelao/AI-Dashboard",
                "assignee": None,
            },
            {
                "id": 2,
                "number": 1,
                "title": "Another Repo Issue",
                "state": "open",
                "html_url": "https://github.com/other-user/other-repo/issues/1",
                "repository_url": "https://api.github.com/repos/other-user/other-repo",
                "assignee": None,
            }
        ]
        route.fulfill(json=json_data)

    def handle_prs(route):
        route.fulfill(json=[])

    page.route("https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all", handle_issues)
    page.route("https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all", handle_prs)

    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    # Take screenshot
    screenshot_path = os.path.abspath("verification/screenshots/verification.png")
    page.screenshot(path=screenshot_path)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        video_path = os.path.abspath("verification/videos")
        context = browser.new_context(
            record_video_dir=video_path
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
