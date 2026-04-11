import { useState, useEffect } from 'react'
import './App.css'

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  repository: {
    full_name: string;
  };
  assignee: {
    login: string;
  } | null;
  labels: {
    name: string;
  }[];
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
  julesUrl?: string;
  prStatus?: PRStatus;
  linkedPRs?: IssueWithJulesStatus[];
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
  const [currentRepo, setCurrentRepo] = useState<string>(localStorage.getItem('current_gh_repo') || 'chatelao/AI-Dashboard');
  const [ghRepos, setGhRepos] = useState<string[]>(JSON.parse(localStorage.getItem('gh_repos') || '["chatelao/AI-Dashboard"]'));
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isCreatingIssue, setIsCreatingIssue] = useState<boolean>(false);

  const fetchJulesStatus = async (issueId: number, token: string): Promise<{ status: string; url?: string } | undefined> => {
    try {
      const response = await fetch(`${JULES_API_BASE_URL}/tasks/${issueId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        console.error(`Jules API error for issue ${issueId}: ${response.status} ${response.statusText}`);
        return undefined;
      }
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && 'status' in data && typeof data.status === 'string') {
        const result: { status: string; url?: string } = { status: data.status };
        if ('url' in data && typeof data.url === 'string') {
          result.url = data.url;
        } else if ('task_url' in data && typeof data.task_url === 'string') {
          result.url = data.task_url;
        }
        return result;
      }
      return undefined;
    } catch (err) {
      console.error(`Failed to fetch Jules status for issue ${issueId}:`, err);
      return undefined;
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('github_token', draftGhToken);
    localStorage.setItem('jules_token', draftJulesToken);
    setGhToken(draftGhToken);
    setJulesToken(draftJulesToken);
    setShowSettings(false);
  };

  const handleClearSettings = () => {
    localStorage.removeItem('github_token');
    localStorage.removeItem('jules_token');
    localStorage.removeItem('current_gh_repo');
    localStorage.removeItem('gh_repos');
    setGhToken('');
    setJulesToken('');
    setDraftGhToken('');
    setDraftJulesToken('');
    setCurrentRepo('chatelao/AI-Dashboard');
    setGhRepos(['chatelao/AI-Dashboard']);
    setShowSettings(false);
  };

  const handleAddRepo = (repo: string) => {
    if (repo === 'ADD_NEW') {
      const newRepo = prompt('Enter repository full name (e.g., owner/repo):');
      if (newRepo) {
        if (!ghRepos.includes(newRepo)) {
          const newRepos = [...ghRepos, newRepo];
          setGhRepos(newRepos);
          localStorage.setItem('gh_repos', JSON.stringify(newRepos));
        }
        setCurrentRepo(newRepo);
        localStorage.setItem('current_gh_repo', newRepo);
      }
      return;
    }
    setCurrentRepo(repo);
    localStorage.setItem('current_gh_repo', repo);
  };

  const createNewIssue = async () => {
    if (!ghToken) {
      alert('Please set a GitHub token in settings to create issues.');
      setShowSettings(true);
      return;
    }

    setIsCreatingIssue(true);
    try {
      const response = await fetch(`https://api.github.com/repos/${currentRepo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `New task for Jules - ${new Date().toLocaleString()}`,
          body: 'Automated task creation for Jules AI.',
          labels: ['Jules']
        })
      });

      if (response.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await response.json();
        alert(`Failed to create issue: ${data.message || response.statusText}`);
      }
    } catch (err) {
      console.error('Error creating issue:', err);
      alert('Error creating issue. See console for details.');
    } finally {
      setIsCreatingIssue(false);
    }
  };

  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true);
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        if (julesToken) {
          console.log(`Using Jules API at ${JULES_API_BASE_URL}`);
        }

        let issuesData: GitHubIssue[] = [];
        // Fetch up to 3 pages (300 items) from specific repo
        for (let page = 1; page <= 3; page++) {
          const url = `https://api.github.com/repos/${currentRepo}/issues?state=all&per_page=100&page=${page}`;
          console.log(`Fetching: ${url}`);
          const response = await fetch(url, { headers });
          if (!response.ok) {
            console.error(`GitHub API error for ${currentRepo} page ${page}: ${response.status} ${response.statusText}`);
            if (page === 1) throw new Error(`Failed to fetch data for ${currentRepo}: ${response.statusText}`);
            break;
          }
          const data: GitHubIssue[] = await response.json();
          if (data.length === 0) break;
          // Manually add repository info if missing
          const withRepo = data.map(item => ({
            ...item,
            repository: item.repository || { full_name: currentRepo }
          }));
          issuesData = [...issuesData, ...withRepo];
          if (data.length < 100) break;
        }

        const processedItems = await Promise.all(issuesData.map(async (item) => {
          const updatedItem: IssueWithJulesStatus = { ...item };

          const isJules = (
            item.assignee?.login?.toLowerCase() === 'jules' ||
            item.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
            item.labels.some(l => l.name.toLowerCase() === 'jules')
          );

          if (isJules && julesToken) {
            const result = await fetchJulesStatus(item.number, julesToken);
            if (result) {
              updatedItem.julesStatus = result.status;
              updatedItem.julesUrl = result.url;
            }
          }

          if (item.pull_request) {
            try {
              // Fetch full PR details to get head.sha
              const prResponse = await fetch(item.pull_request.url, { headers });
              if (prResponse.ok) {
                const prDetail = await prResponse.json();
                const sha = prDetail.head.sha;
                const checkRunsResponse = await fetch(
                  `https://api.github.com/repos/${item.repository.full_name}/commits/${sha}/check-runs`,
                  { headers }
                );
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

                  updatedItem.prStatus = {
                    color,
                    label: 'Create'
                  };
                }
              }
            } catch (err) {
              console.error(`Failed to fetch check runs for PR #${item.number}`, err);
            }
          }

          return updatedItem;
        }));

        const finalIssues: IssueWithJulesStatus[] = [];
        const linkedPrNumbers = new Set<number>();

        // First, separate issues and PRs
        const issuesOnly = processedItems.filter(item => !item.pull_request);
        const prsOnly = processedItems.filter(item => item.pull_request);

        // Map issues by repo#number for easy lookup
        const issuesByNumber = new Map(issuesOnly.map(issue => [`${issue.repository.full_name}#${issue.number}`, issue]));

        // Link PRs to issues (within the same repo)
        prsOnly.forEach(pr => {
          if (pr.body) {
            const regex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
            let match;
            while ((match = regex.exec(pr.body)) !== null) {
              const issueNumber = parseInt(match[1], 10);
              const issueKey = `${pr.repository.full_name}#${issueNumber}`;
              const issue = issuesByNumber.get(issueKey);
              if (issue) {
                if (!issue.linkedPRs) {
                  issue.linkedPRs = [];
                }
                issue.linkedPRs.push(pr);
                linkedPrNumbers.add(pr.id); // Use ID because number might not be unique across repos
              }
            }
          }
        });

        // Combine all issues and unlinked PRs
        issuesOnly.forEach(issue => finalIssues.push(issue));
        prsOnly.forEach(pr => {
          if (!linkedPrNumbers.has(pr.id)) {
            finalIssues.push(pr);
          }
        });

        setIssues(finalIssues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [ghToken, julesToken, currentRepo, refreshTrigger]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>AI Development Dashboard</h1>
            <p>Unified view of GitHub Issues and Google Jules Statuses</p>
          </div>
          <div className="header-actions">
            <div className="repo-selector">
              <select
                value={currentRepo}
                onChange={(e) => handleAddRepo(e.target.value)}
              >
                {ghRepos.map(repo => (
                  <option key={repo} value={repo}>{repo}</option>
                ))}
                <option value="ADD_NEW">+ Add Repository...</option>
              </select>
            </div>
            <button
              className="btn-new-issue"
              onClick={createNewIssue}
              disabled={isCreatingIssue}
            >
              {isCreatingIssue ? 'Creating...' : 'New Issue'}
            </button>
            <button
              className="settings-toggle"
              onClick={() => setShowSettings(!showSettings)}
              aria-label="Settings"
            >
              ⚙️
            </button>
          </div>
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
                      <div className="title-container">
                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                          [{issue.repository.full_name.split('/')[1]}] {issue.title}
                        </a>
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          <div key={pr.id} className="subtitle">
                            <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                              PR #{pr.number}: {pr.title}
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
                      {issue.assignee ? (
                        <span className="assignee-badge">
                          {issue.assignee.login}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="pr-status-group">
                        {issue.prStatus && (
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
                        )}
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          pr.prStatus && (
                            <div key={pr.id} className="pr-status-container subtitle">
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
                          )
                        ))}
                        {!issue.prStatus && (!issue.linkedPRs || issue.linkedPRs.length === 0) && (
                          <span className="text-muted">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="jules-status-group">
                        {issue.julesStatus ? (
                          issue.julesUrl ? (
                            <a href={issue.julesUrl} target="_blank" rel="noopener noreferrer">
                              <span className={`badge jules-status-${issue.julesStatus.toLowerCase()}`}>
                                {issue.julesStatus}
                              </span>
                            </a>
                          ) : (
                            <span className={`badge jules-status-${issue.julesStatus.toLowerCase()}`}>
                              {issue.julesStatus}
                            </span>
                          )
                        ) : (
                          (!issue.linkedPRs || issue.linkedPRs.every(pr => !pr.julesStatus)) && (
                            <span className="text-muted">-</span>
                          )
                        )}
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          pr.julesStatus && (
                            <div key={pr.id} className="subtitle">
                              {pr.julesUrl ? (
                                <a href={pr.julesUrl} target="_blank" rel="noopener noreferrer">
                                  <span className={`badge jules-status-${pr.julesStatus.toLowerCase()}`}>
                                    {pr.julesStatus}
                                  </span>
                                </a>
                              ) : (
                                <span className={`badge jules-status-${pr.julesStatus.toLowerCase()}`}>
                                  {pr.julesStatus}
                                </span>
                              )}
                            </div>
                          )
                        ))}
                      </div>
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
