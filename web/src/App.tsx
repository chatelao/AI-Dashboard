import { useState, useEffect, useCallback } from 'react'
import './App.css'

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1';

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  assignee: {
    login: string;
  } | null;
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
}

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [julesToken, setJulesToken] = useState<string | null>(localStorage.getItem('jules_token'));
  const [tempToken, setTempToken] = useState<string>('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempToken.trim()) {
      localStorage.setItem('jules_token', tempToken);
      setJulesToken(tempToken);
      setTempToken('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jules_token');
    setJulesToken(null);
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
          throw new Error('Jules session expired');
        }
        return undefined;
      }
      const data = await response.json();
      return data.status;
    } catch (err) {
      console.error(`Failed to fetch Jules status for issue ${issueId}:`, err);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all');
        if (!response.ok) {
          throw new Error('Failed to fetch issues from GitHub');
        }
        const githubIssues: GitHubIssue[] = await response.json();

        const processedIssues = await Promise.all(githubIssues.map(async (issue) => {
          if (issue.assignee?.login === 'Jules' && issue.state === 'open' && julesToken) {
            const status = await fetchJulesStatus(issue.id, julesToken);
            return {
              ...issue,
              julesStatus: status
            };
          }
          return issue;
        }));

        setIssues(processedIssues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [julesToken, fetchJulesStatus]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>AI Development Dashboard</h1>
            <p>Unified view of GitHub Issues and Google Jules Statuses</p>
          </div>
          <div className="auth-section">
            {julesToken ? (
              <div className="user-info">
                <span>Authenticated with Jules</span>
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
                    <td>{issue.assignee?.login || 'Unassigned'}</td>
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
