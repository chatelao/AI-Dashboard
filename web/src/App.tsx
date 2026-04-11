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
  pull_request?: {
    url: string;
    html_url: string;
  };
  body?: string;
  linkedIssueNumber?: number;
}

interface PRStatus {
  color: 'black' | 'green' | 'red' | 'yellow';
  label: string;
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  prStatus?: PRStatus;
  linkedPrs?: any[];
}

const JULES_API_BASE_URL = 'https://jules.googleapis.com/v1';

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState<string>(localStorage.getItem('github_token') || '');
  const [julesToken, setJulesToken] = useState<string>(localStorage.getItem('jules_token') || '');
  const [draftGhToken, setDraftGhToken] = useState<string>(ghToken);
  const [draftJulesToken, setDraftJulesToken] = useState<string>(julesToken);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open'>('all');

  const fetchJulesStatus = async (issueId: number, token: string): Promise<string | undefined> => {
    try {
      const response = await fetch(`${JULES_API_BASE_URL}/tasks/${issueId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        return undefined;
      }
      const data = await response.json();
      return data.status;
    } catch (err) {
      console.error(`Failed to fetch Jules status for issue ${issueId}:`, err);
      return undefined;
    }
  };

  const getJulesStatus = (issueId: number) => {
    const statuses = ["Researching", "Coding", "Testing", "Completed"];
    // Deterministic mock status based on issue ID
    return statuses[issueId % statuses.length];
  };

  const handleSaveSettings = () => {
    localStorage.setItem('github_token', draftGhToken);
    localStorage.setItem('jules_token', draftJulesToken);
    setGhToken(draftGhToken);
    setJulesToken(draftJulesToken);
    setShowSettings(false);
    window.location.reload();
  };

  const handleClearSettings = () => {
    localStorage.removeItem('github_token');
    localStorage.removeItem('jules_token');
    setGhToken('');
    setJulesToken('');
    setDraftGhToken('');
    setDraftJulesToken('');
    setShowSettings(false);
    window.location.reload();
  };

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        if (julesToken) {
          console.log(`Using Jules API at ${JULES_API_BASE_URL}`);
        }

        const fetchGitHubData = async (type: 'issues' | 'pulls', pages = 3) => {
          let allData: any[] = [];
          for (let page = 1; page <= pages; page++) {
            const response = await fetch(
              `https://api.github.com/repos/chatelao/AI-Dashboard/${type}?state=all&per_page=100&page=${page}`,
              { headers }
            );
            if (!response.ok) break;
            const data = await response.json();
            if (data.length === 0) break;
            allData = [...allData, ...data];
          }
          return allData;
        };

        const [issuesRaw, prsRaw] = await Promise.all([
          fetchGitHubData('issues'),
          fetchGitHubData('pulls')
        ]);

        const issuesData: GitHubIssue[] = issuesRaw.filter(i => !i.pull_request);
        const prsData: any[] = prsRaw;
        const prMap = new Map(prsData.map((pr) => [pr.number, pr]));
        const linkedPrsMap = new Map<number, any[]>();

        prsData.forEach(pr => {
          const body = pr.body || '';
          const regex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
          let match;
          while ((match = regex.exec(body)) !== null) {
            const issueNum = parseInt(match[1]);
            if (!linkedPrsMap.has(issueNum)) {
              linkedPrsMap.set(issueNum, []);
            }
            linkedPrsMap.get(issueNum)?.push(pr);
          }
        });

        const processedIssues = await Promise.all(issuesData.map(async (issue) => {
          const updatedIssue: IssueWithJulesStatus = { ...issue };

          if (issue.assignee?.login === 'Jules' && issue.state === 'open') {
            if (julesToken) {
              const status = await fetchJulesStatus(issue.number, julesToken);
              updatedIssue.julesStatus = status || getJulesStatus(issue.id);
            } else {
              updatedIssue.julesStatus = getJulesStatus(issue.id);
            }
          }

          const linkedPrs = linkedPrsMap.get(issue.number) || [];
          if (linkedPrs.length > 0) {
            updatedIssue.linkedPrs = await Promise.all(linkedPrs.map(async (pr) => {
              let color: 'black' | 'green' | 'red' | 'yellow' = 'black';
              try {
                const checkRunsResponse = await fetch(
                  `https://api.github.com/repos/chatelao/AI-Dashboard/commits/${pr.head.sha}/check-runs`,
                  { headers }
                );
                if (checkRunsResponse.ok) {
                  const checkRunsData = await checkRunsResponse.json();
                  if (checkRunsData.total_count > 0) {
                    const checkRuns = checkRunsData.check_runs;
                    const someFailed = checkRuns.some((run: { conclusion: string }) =>
                      ['failure', 'cancelled', 'timed_out', 'action_required'].includes(run.conclusion)
                    );
                    const someRunning = checkRuns.some((run: { status: string }) => run.status !== 'completed');
                    if (someFailed) color = 'red';
                    else if (someRunning) color = 'yellow';
                    else color = 'green';
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch check runs for PR #${pr.number}`, err);
              }
              return { ...pr, prStatus: { color, label: 'PR' } };
            }));
          }

          return updatedIssue;
        }));

        const filteredIssues = statusFilter === 'open'
          ? processedIssues.filter(i => i.state === 'open')
          : processedIssues;

        setIssues(filteredIssues.slice(0, pageSize));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [ghToken, julesToken, pageSize, statusFilter]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>AI-Dashboard: AI Development Dashboard</h1>
            <p>Unified view of GitHub Issues and Google Jules Statuses</p>
          </div>
          <button
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-panel">
          <h2>Settings</h2>
          <div className="settings-group">
            <label htmlFor="gh-token">GitHub Personal Access Token:</label>
            <input
              id="gh-token"
              type="password"
              value={draftGhToken}
              onChange={(e) => setDraftGhToken(e.target.value)}
              placeholder="ghp_..."
            />
          </div>
          <div className="settings-group">
            <label htmlFor="jules-token">Jules API Token:</label>
            <input
              id="jules-token"
              type="password"
              value={draftJulesToken}
              onChange={(e) => setDraftJulesToken(e.target.value)}
              placeholder="Enter Jules token"
            />
          </div>
          <div className="settings-actions">
            <button className="btn-save" onClick={handleSaveSettings}>Save & Reload</button>
            <button className="btn-clear" onClick={handleClearSettings}>Clear All</button>
            <button className="btn-cancel" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </section>
      )}

      <main>
        <div className="controls-container">
          <div className="control-group">
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
          <div className="control-group">
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
                      <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                        [AI-Dashboard] {issue.title}
                      </a>
                      {issue.linkedPrs?.map(pr => (
                        <div key={pr.id} className="subtitle">
                          <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                            PR #{pr.number}: {pr.title}
                          </a>
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`badge state-${issue.state}`}>
                        {issue.state}
                      </span>
                    </td>
                    <td>
                      {issue.linkedPrs && issue.linkedPrs.length > 0 ? (
                        issue.linkedPrs.map(pr => (
                          <div key={pr.id} className="pr-status-container">
                            <svg
                              className={`pr-icon pr-icon-${pr.prStatus.color}`}
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
                            <span className={`pr-label pr-label-${pr.prStatus.color}`}>
                              {pr.prStatus.label}
                            </span>
                          </div>
                        ))
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
