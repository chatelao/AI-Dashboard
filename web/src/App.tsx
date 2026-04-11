import { useState, useEffect } from 'react'
import './App.css'

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

  const getJulesStatus = (issueId: number) => {
    const statuses = ["Researching", "Coding", "Testing", "Completed"];
    // Deterministic mock status based on issue ID
    return statuses[issueId % statuses.length];
  };

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all');
        if (!response.ok) {
          throw new Error('Failed to fetch issues from GitHub');
        }
        const data: GitHubIssue[] = await response.json();

        const processedIssues = data.map(issue => {
          if (issue.assignee?.login === 'Jules' && issue.state === 'open') {
            return {
              ...issue,
              julesStatus: getJulesStatus(issue.id)
            };
          }
          return issue;
        });

        setIssues(processedIssues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, []);

  return (
    <div className="dashboard">
      <header>
        <h1>AI Development Dashboard</h1>
        <p>Unified view of GitHub Issues and Google Jules Statuses</p>
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
