import { useState, useEffect } from 'react'
import './App.css'

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body?: string;
  assignee: {
    login: string;
  } | null;
  pull_request?: {
    url: string;
    html_url: string;
  };
}

interface PRStatus {
  color: 'black' | 'green' | 'red' | 'yellow';
  label: string;
  html_url?: string;
  number?: number;
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  prStatus?: PRStatus;
  linkedPRs?: PRStatus[];
}

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1';

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState<string>(localStorage.getItem('github_token') || '');
  const [julesToken, setJulesToken] = useState<string>(localStorage.getItem('jules_token') || '');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open'>('all');
  const [pageSize, setPageSize] = useState<number>(50);

  const saveSettings = () => {
    localStorage.setItem('github_token', ghToken);
    localStorage.setItem('jules_token', julesToken);
    setShowSettings(false);
    window.location.reload();
  };

  const getJulesStatus = async (issueId: number) => {
    if (!julesToken) return undefined;
    try {
      const response = await fetch(`${JULES_API_BASE_URL}/tasks/${issueId}`, {
        headers: {
          'Authorization': `Bearer ${julesToken}`
        }
      });
      if (response.ok) {
        const data = await response.json() as { status: string };
        return data.status;
      }
    } catch (err) {
      console.error(`Failed to fetch Jules status for issue ${issueId}`, err);
    }
    return undefined;
  };

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        const fetchAllPages = async (url: string) => {
          let allData: unknown[] = [];
          for (let page = 1; page <= 3; page++) {
            const response = await fetch(`${url}&per_page=100&page=${page}`, { headers });
            if (response.status === 403) {
              throw new Error('GitHub API rate limit exceeded or access denied. Please provide a GitHub token in Settings.');
            }
            if (!response.ok) {
              throw new Error(`Failed to fetch data from GitHub: ${response.statusText}`);
            }
            const data = await response.json() as unknown[];
            allData = [...allData, ...data];
            if (data.length < 100) break;
          }
          return allData;
        };

        const [issuesRawData, prsRawData] = await Promise.all([
          fetchAllPages('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all'),
          fetchAllPages('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all')
        ]);

        const issuesData = (issuesRawData as GitHubIssue[]).filter(i => !i.pull_request);
        const prsData = prsRawData as (GitHubIssue & { head: { sha: string } })[];
        const prMap = new Map(prsData.map((pr) => [pr.number, pr]));

        const getPRStatus = async (prNumber: number) => {
          const pr = prMap.get(prNumber);
          if (!pr) return undefined;

          try {
            const checkRunsResponse = await fetch(`https://api.github.com/repos/chatelao/AI-Dashboard/commits/${pr.head.sha}/check-runs`, { headers });
            if (checkRunsResponse.ok) {
              const checkRunsData = await checkRunsResponse.json();
              let color: 'black' | 'green' | 'red' | 'yellow' = 'black';

              if (checkRunsData.total_count > 0) {
                const checkRuns = checkRunsData.check_runs;
                const someFailed = checkRuns.some((run: { conclusion: string }) =>
                  ['failure', 'cancelled', 'timed_out', 'action_required'].includes(run.conclusion)
                );
                const someRunning = checkRuns.some((run: { status: string }) => run.status !== 'completed');

                if (someFailed) {
                  color = 'red';
                } else if (someRunning) {
                  color = 'yellow';
                } else {
                  color = 'green';
                }
              }

              return {
                color,
                label: `PR #${pr.number}`,
                html_url: pr.html_url,
                number: pr.number
              } as PRStatus;
            }
          } catch (err) {
            console.error(`Failed to fetch check runs for PR #${prNumber}`, err);
          }
          return undefined;
        };

        const processedIssues = await Promise.all(issuesData.map(async (issue) => {
          const updatedIssue: IssueWithJulesStatus = { ...issue };

          if (issue.assignee?.login === 'Jules' && issue.state === 'open') {
            updatedIssue.julesStatus = await getJulesStatus(issue.id);
          }

          const linkedPRs: PRStatus[] = [];

          // Check for linked PRs in the issue body (e.g., "Fixes #123")
          // We need to check all PRs to see if they reference this issue
          prsData.forEach(pr => {
            const body = pr.body || '';
            const issueRefRegex = new RegExp(`(?:Fixes|Fixed|Closes|Closed|Resolves|Resolved)\\s+#${issue.number}\\b`, 'i');
            if (issueRefRegex.test(body)) {
              linkedPRs.push({ number: pr.number } as PRStatus);
            }
          });

          if (linkedPRs.length > 0) {
            updatedIssue.linkedPRs = await Promise.all(linkedPRs.map(async (lpr) => {
              const status = await getPRStatus(lpr.number!);
              return status || { color: 'black', label: `PR #${lpr.number}`, html_url: prMap.get(lpr.number!)?.html_url };
            })) as PRStatus[];
          }

          return updatedIssue;
        }));

        setIssues(processedIssues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dashboard">
      <header>
        <h1>AI-Dashboard: AI Development Dashboard</h1>
        <p>Unified view of GitHub Issues and Google Jules Statuses</p>
        <button className="settings-toggle" onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? 'Hide Settings' : 'Show Settings'}
        </button>
      </header>

      <main>
        {showSettings && (
          <div className="settings-panel">
            <h2>Settings</h2>
            <div className="settings-field">
              <label htmlFor="gh-token">GitHub Personal Access Token:</label>
              <input
                id="gh-token"
                type="password"
                value={ghToken}
                onChange={(e) => setGhToken(e.target.value)}
                placeholder="ghp_..."
              />
            </div>
            <div className="settings-field">
              <label htmlFor="jules-token">Jules Token:</label>
              <input
                id="jules-token"
                type="password"
                value={julesToken}
                onChange={(e) => setJulesToken(e.target.value)}
              />
            </div>
            <button onClick={saveSettings}>Save and Reload</button>
          </div>
        )}

        {loading && <p className="status-message">Loading issues...</p>}
        {error && <p className="status-message error">Error: {error}</p>}

        {!loading && !error && (
          <div className="controls-container">
            <div className="filter-group">
              <label htmlFor="status-filter">Status:</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open')}
              >
                <option value="all">All</option>
                <option value="open">Only Open</option>
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="page-size">Show:</label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value="10">10 entries</option>
                <option value="20">20 entries</option>
                <option value="50">50 entries</option>
                <option value="100">100 entries</option>
                <option value="250">250 entries</option>
              </select>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>State</th>
                  <th>Jules Status</th>
                </tr>
              </thead>
              <tbody>
                {issues
                  .filter(issue => statusFilter === 'all' || issue.state === 'open')
                  .slice(0, pageSize)
                  .map(issue => (
                  <tr key={issue.id}>
                    <td>{issue.number}</td>
                    <td>
                      <div className="title-container">
                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                          AI-Dashboard: {issue.title}
                        </a>
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          <div key={pr.number} className="subtitle">
                            <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                              <svg
                                className={`pr-icon pr-icon-${pr.color}`}
                                viewBox="0 0 16 16"
                                version="1.1"
                                width="12"
                                height="12"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M7.177 3.03a.75.75 0 11-1.354-.645 2.75 2.75 0 015.162 1.377 2.25 2.25 0 01-.89 4.113 2.25 2.25 0 011.655 2.175v.25a2.25 2.25 0 11-4.5 0v-.25c0-.97.615-1.798 1.48-2.122a2.75 2.75 0 00-1.553-4.898zM9 10.25a.75.75 0 00-1.5 0v.25a.75.75 0 001.5 0v-.25z"
                                ></path>
                              </svg>
                              AI-Dashboard: {pr.label}
                            </a>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge state-${issue.state}`}>
                        {issue.state}
                      </span>
                    </td>
                    <td>
                      {issue.julesStatus ? (
                        <span className={`badge jules-status-${issue.julesStatus.toLowerCase()}`}>
                          {issue.julesStatus}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
