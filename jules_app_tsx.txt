import { useState, useEffect, useCallback } from 'react'
import './App.css'

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1';
const JULES_TOKEN_KEY = 'jules_token';

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
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
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  prStatus?: PRStatus;
}

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [julesToken, setJulesToken] = useState<string | null>(localStorage.getItem(JULES_TOKEN_KEY));
  const [tempToken, setTempToken] = useState<string>('');

  const handleLogout = useCallback(() => {
    setJulesToken(null);
  }, []);

  useEffect(() => {
    // Keep local storage in sync with state
    if (julesToken) {
      localStorage.setItem(JULES_TOKEN_KEY, julesToken);
    } else {
      localStorage.removeItem(JULES_TOKEN_KEY);
    }
  }, [julesToken]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempToken.trim()) {
      setJulesToken(tempToken);
      setTempToken('');
    }
  };

  const fetchJulesStatus = useCallback(async (issueId: number, token: string): Promise<string | undefined> => {
    try {
      const response = await fetch(`${JULES_API_BASE_URL}/tasks/${issueId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
        }
        return undefined;
      }
      const data = await response.json();
      return data.status;
    } catch (err) {
      console.error(`Failed to fetch Jules status for issue ${issueId}:`, err);
      return undefined;
    }
  }, [handleLogout]);

  useEffect(() => {
    let ignore = false;
    const fetchIssues = async () => {
      try {
        setLoading(true);
        const [issuesResponse, prsResponse] = await Promise.all([
          fetch('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all'),
          fetch('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all')
        ]);

        if (!issuesResponse.ok || !prsResponse.ok) {
          throw new Error('Failed to fetch data from GitHub');
        }

        const issuesData: GitHubIssue[] = await issuesResponse.json();
        const prsData: { number: number; head: { sha: string } }[] = await prsResponse.json();
        const prMap = new Map(prsData.map((pr) => [pr.number, pr]));

        const processedIssues = await Promise.all(issuesData.map(async (issue) => {
          const updatedIssue: IssueWithJulesStatus = { ...issue };

          if (issue.assignee?.login === 'Jules' && issue.state === 'open' && julesToken) {
            const status = await fetchJulesStatus(issue.id, julesToken);
            if (ignore) return updatedIssue;
            updatedIssue.julesStatus = status;
          }

          if (issue.pull_request) {
            const pr = prMap.get(issue.number);
            if (pr) {
              try {
                const checkRunsResponse = await fetch(`https://api.github.com/repos/chatelao/AI-Dashboard/commits/${pr.head.sha}/check-runs`);
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

                  updatedIssue.prStatus = {
                    color,
                    label: 'Create'
                  };
                }
              } catch (err) {
                console.error(`Failed to fetch check runs for PR #${issue.number}`, err);
              }
            }
          }

          return updatedIssue;
        }));

        if (!ignore) {
          setIssues(processedIssues);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchIssues();
    return () => {
      ignore = true;
    };
  }, [julesToken, fetchJulesStatus]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div className="header-title">
            <h1>AI Development Dashboard</h1>
            <p>Unified view of GitHub Issues and Google Jules Statuses</p>
          </div>
          <div className="auth-section">
            {julesToken ? (
              <div className="user-info">
                <span className="auth-status">Authenticated with Jules</span>
                <button onClick={handleLogout} className="btn-secondary">Logout</button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="login-form">
                <input
                  type="password"
                  placeholder="Enter Jules API Token"
                  value={tempToken}
                  onChange={(e) => setTempToken(e.target.value)}
                  className="input-token"
                />
                <button type="submit" className="btn-primary">Login</button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main>
        {loading && <p className="status-message">Loading issues...</p>}
        {error && <p className="status-message error">Error: {error}</p>}

        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>State</th>
                  <th>Assignee</th>
                  <th>PR</th>
                  <th>Jules Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map(issue => (
                  <tr key={issue.id}>
                    <td>{issue.number}</td>
                    <td>
                      <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                        {issue.title}
                      </a>
                    </td>
                    <td>
                      <span className={`badge state-${issue.state}`}>
                        {issue.state}
                      </span>
                    </td>
                    <td>
                      {issue.prStatus ? (
                        <div className="pr-status-container">
                          <svg
                            className={`pr-icon pr-icon-${issue.prStatus.color}`}
                            viewBox="0 0 16 16"
                            version="1.1"
                            width="16"
                            height="16"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.177 3.03a.75.75 0 11-1.354-.645 2.75 2.75 0 015.162 1.377 2.25 2.25 0 01-.89 4.113 2.25 2.25 0 011.655 2.175v.25a2.25 2.25 0 11-4.5 0v-.25c0-.97.615-1.798 1.48-2.122a2.75 2.75 0 00-1.553-4.898zM9 10.25a.75.75 0 00-1.5 0v.25a.75.75 0 001.5 0v-.25z"
                            ></path>
                          </svg>
                          <span className={`pr-label pr-label-${issue.prStatus.color}`}>
                            {issue.prStatus.label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
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
