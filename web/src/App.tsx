import { useState, useEffect } from 'react'
import './App.css'

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
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

interface LinkedPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  head: { sha: string };
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  prStatus?: PRStatus;
  linkedPRs?: LinkedPR[];
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

  const parseLinkedIssues = (text: string | null): number[] => {
    if (!text) return [];
    const pattern = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
    const matches = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push(parseInt(match[1], 10));
    }
    return matches;
  };

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const [issuesResponse, prsResponse] = await Promise.all([
          fetch('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all'),
          fetch('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all')
        ]);

        if (!issuesResponse.ok || !prsResponse.ok) {
          throw new Error('Failed to fetch data from GitHub');
        }

        const issuesData: GitHubIssue[] = await issuesResponse.json();
        const prsData: (LinkedPR & { body: string | null })[] = await prsResponse.json();
        const prMap = new Map(prsData.map((pr) => [pr.number, pr]));
        const issueToPRsMap = new Map<number, LinkedPR[]>();
        const linkedPRNumbers = new Set<number>();

        prsData.forEach(pr => {
          const linkedIssueNumbers = parseLinkedIssues(pr.body);
          linkedIssueNumbers.forEach(issueNum => {
            const currentPRs = issueToPRsMap.get(issueNum) || [];
            currentPRs.push({
              number: pr.number,
              title: pr.title,
              html_url: pr.html_url,
              state: pr.state,
              head: pr.head
            });
            issueToPRsMap.set(issueNum, currentPRs);
            linkedPRNumbers.add(pr.number);
          });
        });

        const filteredIssues = issuesData.filter(issue =>
          !issue.pull_request || !linkedPRNumbers.has(issue.number)
        );

        const processedIssues = await Promise.all(filteredIssues.map(async (issue) => {
          const updatedIssue: IssueWithJulesStatus = {
            ...issue,
            linkedPRs: issueToPRsMap.get(issue.number)
          };

          if (issue.assignee?.login === 'Jules' && issue.state === 'open') {
            updatedIssue.julesStatus = getJulesStatus(issue.id);
          }

          const targetPR = issue.pull_request ? prMap.get(issue.number) : updatedIssue.linkedPRs?.[0];

          if (targetPR) {
            try {
              const checkRunsResponse = await fetch(`https://api.github.com/repos/chatelao/AI-Dashboard/commits/${targetPR.head.sha}/check-runs`);
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
              console.error(`Failed to fetch check runs for PR #${targetPR.number}`, err);
            }
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
  }, []);

  return (
    <div className="dashboard">
      <header>
        <h1>AI-Dashboard: AI Development Dashboard</h1>
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
                  <th>PR</th>
                  <th>Jules Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map(issue => (
                  <tr key={issue.id}>
                    <td>{issue.number}</td>
                    <td>
                      <div>
                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                          [AI-Dashboard] {issue.title}
                        </a>
                      </div>
                      {issue.linkedPRs && issue.linkedPRs.length > 0 && (
                        <div className="subtitle">
                          {issue.linkedPRs.map(pr => (
                            <a
                              key={pr.number}
                              href={pr.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              PR #{pr.number}: {pr.title}
                            </a>
                          ))}
                        </div>
                      )}
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
