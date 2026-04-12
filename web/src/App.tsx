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
  updated_at: string;
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
  enrichingJules?: boolean;
  enrichingPR?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  actionLoading?: boolean;
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

  const [repoHistory, setRepoHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('gh_repos');
    return saved ? JSON.parse(saved) : ['chatelao/AI-Dashboard'];
  });
  const [draftRepoHistory, setDraftRepoHistory] = useState<string>(repoHistory.join(', '));

  useEffect(() => {
    if (showSettings) {
      setDraftGhToken(ghToken);
      setDraftJulesToken(julesToken);
      setDraftJulesApiBase(julesApiBase);
      setDraftRepoHistory(repoHistory.join(', '));
    }
  }, [showSettings, ghToken, julesToken, julesApiBase, repoHistory]);
  const [filterState] = useState<'all' | 'open'>(
    (localStorage.getItem('filter_state') as 'all' | 'open') || 'all'
  );
  const [pageSize] = useState<number>(
    parseInt(localStorage.getItem('page_size') || '50', 10)
  );
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const fetchRawIssues = async (repo: string, filterState: string, headers: HeadersInit): Promise<GitHubIssue[]> => {
    // Check if we are in a test environment (e.g., Playwright)
    const isTest = window.location.search.includes('test=true') || (window as any).isTest;
    const pages = isTest ? [1] : [1, 2, 3];
    const results = await Promise.all(pages.map(async (page) => {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repo}/issues?state=${filterState}&per_page=100&page=${page}`,
          { headers }
        );
        if (!response.ok) {
          if (page === 1) console.error(`Failed to fetch from ${repo}`);
          return [];
        }
        const data: unknown = await response.json();
        if (Array.isArray(data)) {
          return data.map((item: GitHubIssue) => ({
            ...item,
            repository: item.repository || { full_name: repo }
          }));
        }
      } catch (err) {
        console.error(`Error fetching page ${page} from ${repo}:`, err);
      }
      return [];
    }));
    return results.flat();
  };

  const fetchJulesStatus = async (issueId: number, token: string): Promise<{ status: string; url?: string } | undefined> => {
    let url;
    if (julesApiBase.includes('?url=')) {
      const targetUrl = `https://jules.googleapis.com/v1/tasks/${issueId}/status`;
      url = `${julesApiBase}${encodeURIComponent(targetUrl)}`;
    } else {
      url = `${julesApiBase}/tasks/${issueId}/status`;
    }
    console.log(`Fetching Jules status from: ${url}`);
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Authorization': `Bearer ${token}`,
          'X-Goog-Api-Key': token
        }
      });
      console.log(`Jules API response status for issue ${issueId}: ${response.status}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Jules API returned 404 for issue ${issueId}. Check your Jules API Base URL in Settings. It must end with /v1 (e.g., https://jules.googleapis.com/v1) and your proxy must forward the Authorization header.`);
        }
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
    const newRepos = draftRepoHistory.split(',').map(r => r.trim()).filter(r => r.length > 0);
    localStorage.setItem('github_token', draftGhToken);
    localStorage.setItem('jules_token', draftJulesToken);
    localStorage.setItem('jules_api_base', draftJulesApiBase);
    localStorage.setItem('gh_repos', JSON.stringify(newRepos));
    setGhToken(draftGhToken);
    setJulesToken(draftJulesToken);
    setJulesApiBase(draftJulesApiBase);
    setRepoHistory(newRepos);
    setShowSettings(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const updateActionLoading = (prId: number, loading: boolean) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === prId) {
        return { ...issue, actionLoading: loading };
      }
      if (issue.linkedPRs) {
        return {
          ...issue,
          linkedPRs: issue.linkedPRs.map(pr =>
            pr.id === prId ? { ...pr, actionLoading: loading } : pr
          )
        };
      }
      return issue;
    }));
  };

  const handleUpdateBranch = async (repo: string, pullNumber: number, prId: number) => {
    updateActionLoading(prId, true);
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${pullNumber}/update-branch`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (response.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await response.json();
        alert(`Failed to update branch: ${data.message || response.statusText}`);
      }
    } catch (err) {
      alert(`Error updating branch: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      updateActionLoading(prId, false);
    }
  };

  const handleMergePR = async (repo: string, pullNumber: number, prId: number) => {
    if (!confirm(`Are you sure you want to merge PR #${pullNumber} in ${repo}?`)) return;
    updateActionLoading(prId, true);
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${pullNumber}/merge`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (response.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await response.json();
        alert(`Failed to merge PR: ${data.message || response.statusText}`);
      }
    } catch (err) {
      alert(`Error merging PR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      updateActionLoading(prId, false);
    }
  };

  const handleClearSettings = () => {
    localStorage.removeItem('github_token');
    localStorage.removeItem('jules_token');
    localStorage.removeItem('jules_api_base');
    localStorage.removeItem('gh_repos');
    setGhToken('');
    setJulesToken('');
    setJulesApiBase(DEFAULT_JULES_API_BASE);
    setRepoHistory([]);
    setDraftGhToken('');
    setDraftJulesToken('');
    setDraftJulesApiBase(DEFAULT_JULES_API_BASE);
    setDraftRepoHistory('');
    setShowSettings(false);
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    let isCancelled = false;
    const fetchIssues = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        let effectiveRepoList = [...repoHistory];
        if (effectiveRepoList.length === 0 && ghToken) {
          try {
            const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', { headers });
            if (response.ok) {
              const repos: any[] = await response.json();
              effectiveRepoList = repos.map(r => r.full_name);
            }
          } catch (err) {
            console.error('Failed to fetch user repositories', err);
          }
        }

        const allReposResults = await Promise.all(
          effectiveRepoList.map(repo => fetchRawIssues(repo, filterState, headers))
        );

        const filteredReposResults = allReposResults.map(repoIssues => {
          const openIssues = repoIssues.filter(i => i.state === 'open');
          const closedIssues = repoIssues
            .filter(i => i.state === 'closed')
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 4);
          return [...openIssues, ...closedIssues];
        });

        const issuesData = filteredReposResults.flat();

        // Fetch PR metadata in bulk to get SHAs
        const prMetadataMap = new Map<string, string>();
        await Promise.all(effectiveRepoList.map(async (repo) => {
          try {
            const response = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100`, { headers });
            if (response.ok) {
              const prs: any[] = await response.json();
              prs.forEach(pr => {
                if (pr.head?.sha) {
                  prMetadataMap.set(`${repo}#${pr.number}`, pr.head.sha);
                }
              });
            }
          } catch (err) {
            console.error(`Failed to fetch PR metadata for ${repo}`, err);
          }
        }));

        // Consolidation and Sorting
        const finalIssues: IssueWithJulesStatus[] = [];
        const linkedPrNumbers = new Set<number>();

        const issuesOnly = issuesData.filter(item => !item.pull_request) as IssueWithJulesStatus[];
        const prsOnly = issuesData.filter(item => item.pull_request);

        const issuesByNumber = new Map<string, IssueWithJulesStatus>(issuesOnly.map(issue => [`${issue.repository.full_name}#${issue.number}`, issue]));

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
                issue.linkedPRs.push(pr as IssueWithJulesStatus);
                linkedPrNumbers.add(pr.id);
              }
            }
          }
        });

        issuesOnly.forEach(issue => finalIssues.push(issue as IssueWithJulesStatus));

        // Sort by updated_at descending
        finalIssues.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

        // Optimization: Slice BEFORE fetching statuses
        const visibleIssues = finalIssues.slice(0, pageSize).map(item => {
          const isJules = (
            item.assignee?.login?.toLowerCase() === 'jules' ||
            item.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
            item.labels.some(l => l.name.toLowerCase() === 'jules')
          );
          return {
            ...item,
            isJules,
            enrichingJules: isJules && !!julesToken,
            enrichingPR: !!item.pull_request || (item.linkedPRs && item.linkedPRs.length > 0),
            linkedPRs: item.linkedPRs?.map(pr => ({
              ...pr,
              isJules: (
                pr.assignee?.login?.toLowerCase() === 'jules' ||
                pr.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
                pr.labels.some(l => l.name.toLowerCase() === 'jules')
              ),
              enrichingJules: (
                pr.assignee?.login?.toLowerCase() === 'jules' ||
                pr.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
                pr.labels.some(l => l.name.toLowerCase() === 'jules')
              ) && !!julesToken,
              enrichingPR: true
            }))
          };
        });

        setIssues(visibleIssues);
        setLoading(false);

        // Background Enrichment
        const queue = [...visibleIssues];
        const concurrency = 5;
        let activeRequests = 0;

        const processQueue = async () => {
          if (isCancelled || queue.length === 0 || activeRequests >= concurrency) return;

          activeRequests++;
          const item = queue.shift()!;

          try {
            const processItem = async (target: IssueWithJulesStatus) => {
              let updated = false;

              // Ensure enriching flags are initialized for the target
              if (target.isJules && target.enrichingJules === undefined) target.enrichingJules = true;
              if (target.pull_request && target.enrichingPR === undefined) target.enrichingPR = true;

              if (target.isJules && julesToken) {
                const result = await fetchJulesStatus(target.number, julesToken);
                if (result) {
                  target.julesStatus = result.status;
                  target.julesUrl = result.url;
                }
                target.enrichingJules = false;
                updated = true;
              }

              if (target.pull_request) {
                try {
                  const prResponse = await fetch(target.pull_request.url, {
                    headers: {
                      ...headers,
                      'Accept': 'application/vnd.github+json',
                      'X-GitHub-Api-Version': '2022-11-28'
                    }
                  });
                  if (prResponse.ok) {
                    const prDetail: any = await prResponse.json();
                    target.mergeable = prDetail.mergeable;
                    target.mergeable_state = prDetail.mergeable_state;
                    const sha = prDetail?.head?.sha;

                    if (sha) {
                      const checkRunsResponse = await fetch(
                        `https://api.github.com/repos/${target.repository.full_name}/commits/${sha}/check-runs`,
                        { headers }
                      );
                      if (checkRunsResponse.ok) {
                        const checkRunsData: any = await checkRunsResponse.json();
                        let color: 'black' | 'green' | 'red' | 'yellow' = 'black';
                        let label = 'Create';

                        if (checkRunsData?.total_count > 0 && Array.isArray(checkRunsData.check_runs)) {
                          const checkRuns = checkRunsData.check_runs;
                          const someFailed = checkRuns.some((run: any) =>
                            ['failure', 'cancelled', 'timed_out', 'action_required'].includes(run.conclusion)
                          );
                          const someRunning = checkRuns.some((run: any) => run.status !== 'completed');
                          const completedCount = checkRuns.filter((run: any) => run.status === 'completed').length;

                          if (someFailed) color = 'red';
                          else if (someRunning) color = 'yellow';
                          else color = 'green';

                          label = `${completedCount}/${checkRuns.length}`;
                        }

                        target.prStatus = { color, label };
                      }
                    }
                  }
                } catch (err) {
                  console.error(`Failed to enrich PR #${target.number}`, err);
                }
                target.enrichingPR = false;
                updated = true;
              }

              return updated;
            };

            await processItem(item);
            if (item.linkedPRs) {
              await Promise.all(item.linkedPRs.map(pr => processItem(pr)));
            }
            // Ensure the main issue's enrichingPR is cleared if it was set due to linked PRs
            item.enrichingPR = false;

            // Update state incrementally
            setIssues(prev => prev.map(i => i.id === item.id ? { ...item } : i));
          } finally {
            activeRequests--;
            processQueue();
          }
        };

        for (let i = 0; i < concurrency; i++) {
          processQueue();
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchIssues();
    return () => {
      isCancelled = true;
    };
  }, [ghToken, julesToken, filterState, refreshTrigger, pageSize, repoHistory]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>AI-Dashboard</h1>
          </div>
          <div className="header-actions">
            <button className="btn-refresh" onClick={() => setRefreshTrigger(prev => prev + 1)}>
              Refresh
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
          <div className="settings-group">
            <label htmlFor="jules-api-base">Jules API Base URL:</label>
            <input
              id="jules-api-base"
              type="text"
              value={draftJulesApiBase}
              onChange={(e) => setDraftJulesApiBase(e.target.value)}
              placeholder="https://jules.googleapis.com/v1"
            />
            <small className="help-text">
              Use this to configure a CORS proxy if needed. See <a href="https://github.com/chatelao/AI-Dashboard/blob/main/CORS_PROXY.md" target="_blank" rel="noopener noreferrer">CORS_PROXY.md</a> for instructions.
            </small>
          </div>
          <div className="settings-group">
            <label htmlFor="repo-history">Tracked Repositories (comma-separated):</label>
            <input
              id="repo-history"
              type="text"
              value={draftRepoHistory}
              onChange={(e) => setDraftRepoHistory(e.target.value)}
              placeholder="owner/repo, owner2/repo2 (leave empty to track all your repos)"
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
                          <span className="repo-tag">[{issue.repository.full_name.split('/')[1]}]</span> {issue.title}
                        </a>
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          <div key={pr.id} className="subtitle">
                            <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                              <span className="pr-number">PR #{pr.number}:</span> {pr.title}
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
                        {issue.enrichingPR && (
                          <div className="pr-status-container">
                            <span className="loading-dots">...</span>
                          </div>
                        )}
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
                            {ghToken && issue.mergeable_state === 'behind' && (
                              <button
                                className="btn-action btn-update"
                                onClick={() => handleUpdateBranch(issue.repository.full_name, issue.number, issue.id)}
                                disabled={issue.actionLoading}
                              >
                                {issue.actionLoading ? '...' : 'Update'}
                              </button>
                            )}
                            {ghToken && (issue.mergeable_state === 'clean' || issue.mergeable_state === 'unstable') && (
                              <button
                                className="btn-action btn-merge"
                                onClick={() => handleMergePR(issue.repository.full_name, issue.number, issue.id)}
                                disabled={issue.actionLoading}
                              >
                                {issue.actionLoading ? '...' : 'Merge'}
                              </button>
                            )}
                          </div>
                        )}
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          pr.enrichingPR ? (
                            <div key={pr.id} className="pr-status-container subtitle">
                              <span className="loading-dots">...</span>
                            </div>
                          ) : pr.prStatus && (
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
                              {ghToken && pr.mergeable_state === 'behind' && (
                                <button
                                  className="btn-action btn-update"
                                  onClick={() => handleUpdateBranch(pr.repository.full_name, pr.number, pr.id)}
                                  disabled={pr.actionLoading}
                                >
                                  {pr.actionLoading ? '...' : 'Update'}
                                </button>
                              )}
                              {ghToken && (pr.mergeable_state === 'clean' || pr.mergeable_state === 'unstable') && (
                                <button
                                  className="btn-action btn-merge"
                                  onClick={() => handleMergePR(pr.repository.full_name, pr.number, pr.id)}
                                  disabled={pr.actionLoading}
                                >
                                  {pr.actionLoading ? '...' : 'Merge'}
                                </button>
                              )}
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
                        {issue.enrichingJules && (
                          <span className="loading-dots">...</span>
                        )}
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
                          pr.enrichingJules ? (
                            <div key={pr.id} className="subtitle">
                              <span className="loading-dots">...</span>
                            </div>
                          ) : pr.julesStatus && (
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
