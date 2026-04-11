import { useState, useEffect } from 'react'
import './App.css'

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body?: string | null;
  pull_request?: {
    url: string;
    html_url: string;
  };
  assignee: {
    login: string;
  } | null;
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  linkedPR?: {
    number: number;
    html_url: string;
  };
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
        const rawIssues = data.filter(item => !item.pull_request);
        const rawPRs = data.filter(item => !!item.pull_request);

        const issueToPRMap = new Map<number, { number: number; html_url: string }>();
        rawPRs.forEach(pr => {
          if (pr.body) {
            // Support multiple GitHub keywords: Fixes, Fixed, Fix, Closes, Closed, Close, Resolves, Resolved, Resolve
            const pattern = /(?:Fixes|Fixed|Fix|Closes|Closed|Close|Resolves|Resolved|Resolve)\s+#(\d+)/gi;
            let match;
            while ((match = pattern.exec(pr.body)) !== null) {
              const issueNumber = parseInt(match[1], 10);
              issueToPRMap.set(issueNumber, {
                number: pr.number,
                html_url: pr.html_url
              });
            }
          }
        });

        const processedIssues = rawIssues.map(issue => {
          const updatedIssue: IssueWithJulesStatus = { ...issue };
          if (issue.assignee?.login === 'Jules' && issue.state === 'open') {
            updatedIssue.julesStatus = getJulesStatus(issue.id);
          }
          if (issueToPRMap.has(issue.number)) {
            updatedIssue.linkedPR = issueToPRMap.get(issue.number);
          }
          return updatedIssue;
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
                      {issue.linkedPR && (
                        <a
                          href={issue.linkedPR.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pr-indicator"
                          title={`Linked PR #${issue.linkedPR.number}`}
                        >
                          <span role="img" aria-label="PR">🔗</span>
                          <span className="pr-number">#{issue.linkedPR.number}</span>
                        </a>
                      )}
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
