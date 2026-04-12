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
  isJules?: boolean;
}

const DEFAULT_JULES_API_BASE = 'https://jules.googleapis.com/v1';

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState<string>(localStorage.getItem('github_token') || '');
  const [julesToken, setJulesToken] = useState<string>(localStorage.getItem('jules_token') || '');
  const [julesApiBase, setJulesApiBase] = useState<string>(localStorage.getItem('jules_api_base') || DEFAULT_JULES_API_BASE);
  const [draftGhToken, setDraftGhToken] = useState<string>(ghToken);
  const [draftJulesToken, setDraftJulesToken] = useState<string>(julesToken);
  const [draftJulesApiBase, setDraftJulesApiBase] = useState<string>(julesApiBase);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [currentRepo, setCurrentRepo] = useState<string>(localStorage.getItem('current_gh_repo') || 'chatelao/AI-Dashboard');
  const [repoHistory, setRepoHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('gh_repos');
    return saved ? JSON.parse(saved) : ['chatelao/AI-Dashboard'];
  });
  const [filterState, setFilterState] = useState<'all' | 'open'>(
    (localStorage.getItem('filter_state') as 'all' | 'open') || 'all'
  );
  const [pageSize, setPageSize] = useState<number>(
    parseInt(localStorage.getItem('page_size') || '50', 10)
  );
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const fetchJulesStatus = async (issueId: number, token: string): Promise<{ status: string; url?: string } | undefined> => {
    const url = `${julesApiBase}/tasks/${issueId}/status`;
    console.log(`Fetching Jules status from: ${url}`);
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log(`Jules API response status for issue ${issueId}: ${response.status}`);
      if (!response.ok) {
        return undefined;
      }
      const data: unknown = await response.json();
      console.log(`Jules API response data for issue ${issueId}:`, data);
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
    localStorage.setItem('jules_api_base', draftJulesApiBase);
    setGhToken(draftGhToken);
    setJulesToken(draftJulesToken);
    setJulesApiBase(draftJulesApiBase);
    setShowSettings(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleClearSettings = () => {
    localStorage.removeItem('github_token');
    localStorage.removeItem('jules_token');
    localStorage.removeItem('jules_api_base');
    setGhToken('');
    setJulesToken('');
    setJulesApiBase(DEFAULT_JULES_API_BASE);
    setDraftGhToken('');
    setDraftJulesToken('');
    setDraftJulesApiBase(DEFAULT_JULES_API_BASE);
    setShowSettings(false);
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const fetchIssues = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        let issuesData: GitHubIssue[] = [];
        // Sequential fetch up to 5 pages
        for (let page = 1; page <= 5; page++) {
          const response = await fetch(
            `https://api.github.com/repos/${currentRepo}/issues?state=${filterState}&per_page=100&page=${page}`,
            { headers }
          );
          if (!response.ok) {
            if (page === 1) throw new Error(`Failed to fetch from ${currentRepo}`);
            break;
          }
          const data: unknown = await response.json();
          if (Array.isArray(data)) {
            const pageIssues = data as GitHubIssue[];
            if (pageIssues.length === 0) break;
            // Manually add repository info if missing from API response (e.g. some repo endpoints)
            issuesData = [...issuesData, ...pageIssues.map(item => ({
              ...item,
              repository: item.repository || { full_name: currentRepo }
            }))];
            if (pageIssues.length < 100) break;
          } else {
            break;
          }
        }

        const processedItems = await Promise.all(issuesData.map(async (item) => {
          const updatedItem: IssueWithJulesStatus = { ...item };

          const isJules = (
            item.assignee?.login?.toLowerCase() === 'jules' ||
            item.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
            item.labels.some(l => l.name.toLowerCase() === 'jules')
          );

          if (isJules) {
            updatedItem.isJules = true;
            if (julesToken) {
              const result = await fetchJulesStatus(item.number, julesToken);
              if (result) {
                updatedItem.julesStatus = result.status;
                updatedItem.julesUrl = result.url;
              }
            } else {
              console.log(`Issue #${item.number} is a Jules task but julesToken is missing.`);
            }
          }

          if (item.pull_request) {
            try {
              // Fetch full PR details to get head.sha
              const prResponse = await fetch(item.pull_request.url, { headers });
              if (prResponse.ok) {
                const prDetail: unknown = await prResponse.json();
                if (prDetail && typeof prDetail === 'object' && 'head' in prDetail && prDetail.head && typeof prDetail.head === 'object' && 'sha' in prDetail.head) {
                  const sha = (prDetail.head as { sha: string }).sha;
                  const checkRunsResponse = await fetch(
                    `https://api.github.com/repos/${item.repository.full_name}/commits/${sha}/check-runs`,
                    { headers }
                  );
                  if (checkRunsResponse.ok) {
                    const checkRunsData: unknown = await checkRunsResponse.json();
                    let color: 'black' | 'green' | 'red' | 'yellow' = 'black';

                    if (checkRunsData && typeof checkRunsData === 'object' && 'total_count' in checkRunsData && typeof checkRunsData.total_count === 'number' && checkRunsData.total_count > 0 && 'check_runs' in checkRunsData && Array.isArray(checkRunsData.check_runs)) {
                      const checkRuns = checkRunsData.check_runs as { status: string; conclusion: string }[];
                      const someFailed = checkRuns.some(run =>
                        ['failure', 'cancelled', 'timed_out', 'action_required'].includes(run.conclusion)
                      );
                      const someRunning = checkRuns.some(run => run.status !== 'completed');

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
  }, [ghToken, julesToken, currentRepo, filterState, refreshTrigger]);

  const handleRepoChange = (newRepo: string) => {
    if (!newRepo) return;
    setCurrentRepo(newRepo);
    localStorage.setItem('current_gh_repo', newRepo);
    if (!repoHistory.includes(newRepo)) {
      const newHistory = [newRepo, ...repoHistory].slice(0, 10);
      setRepoHistory(newHistory);
      localStorage.setItem('gh_repos', JSON.stringify(newHistory));
    }
  };

  const handleFilterChange = (state: 'all' | 'open') => {
    setFilterState(state);
    localStorage.setItem('filter_state', state);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    localStorage.setItem('page_size', size.toString());
  };

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>AI Development Dashboard</h1>
          </div>
          <div className="header-actions">
            <div className="repo-selector">
              <input
                type="text"
                list="repo-history"
                value={currentRepo}
                onChange={(e) => setCurrentRepo(e.target.value)}
                onBlur={(e) => handleRepoChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRepoChange((e.target as HTMLInputElement).value)}
                placeholder="owner/repo"
              />
              <datalist id="repo-history">
                {repoHistory.map(repo => <option key={repo} value={repo} />)}
              </datalist>
            </div>
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
          <div className="settings-group">
            <label htmlFor="jules-api-base">Jules API Base URL:</label>
            <input
              id="jules-api-base"
              type="text"
              value={draftJulesApiBase}
              onChange={(e) => setDraftJulesApiBase(e.target.value)}
              placeholder="https://jules.googleapis.com/v1"
            />
            <small className="help-text">Use this to configure a CORS proxy if needed.</small>
          </div>
          <div className="settings-actions">
            <button className="btn-save" onClick={handleSaveSettings}>Save & Reload</button>
            <button className="btn-clear" onClick={handleClearSettings}>Clear All</button>
            <button className="btn-cancel" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </section>
      )}

      <main>
        <div className="filters-bar">
          <div className="filter-group">
            <label>Filter:</label>
            <select value={filterState} onChange={(e) => handleFilterChange(e.target.value as 'all' | 'open')}>
              <option value="all">All Issues</option>
              <option value="open">Open Only</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Show:</label>
            <select value={pageSize} onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
            </select>
          </div>
          <button className="btn-refresh" onClick={() => setRefreshTrigger(prev => prev + 1)}>
            Refresh
          </button>
        </div>

        {loading && <p className="status-message">Loading issues...</p>}
        {error && <p className="status-message error">Error: {error}</p>}

        {!loading && !error && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>State</th>
                  <th>PR</th>
                  <th>Jules</th>
                </tr>
              </thead>
              <tbody>
                {issues.slice(0, pageSize).map(issue => (
                  <tr key={issue.id}>
                    <td data-label="Title">
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
                    <td data-label="State">
                      <span className={`badge state-${issue.state}`}>
                        {issue.state}
                      </span>
                    </td>
                    <td data-label="PR">
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
                    <td data-label="Jules">
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
                          issue.isJules && !julesToken ? (
                            <span className="text-muted">Token Required</span>
                          ) : (
                            (!issue.linkedPRs || issue.linkedPRs.every(pr => !pr.julesStatus)) && (
                              <span className="text-muted">-</span>
                            )
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
