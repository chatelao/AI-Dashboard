import { useState, useEffect, useRef } from 'react'
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

interface RoadmapTask {
  completed: boolean;
  title: string;
}

interface IssueWithJulesStatus extends GitHubIssue {
  julesStatus?: string;
  julesUrl?: string;
  julesTitle?: string;
  prStatus?: PRStatus;
  linkedPRs?: IssueWithJulesStatus[];
  isJules?: boolean;
  enrichingJules?: boolean;
  enrichingPR?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  actionLoading?: boolean;
  prFilesCount?: number;
  prFileExtensions?: string[];
  prAdditions?: number;
  prDeletions?: number;
  prFileStats?: Record<string, {
    filenames: string[],
    additions: number,
    deletions: number,
    details: {
      name: string,
      additions: number,
      deletions: number,
      totalLines: number,
      status: string
    }[]
  }>;
}

const DEFAULT_JULES_API_BASE = 'https://jules.googleapis.com/v1alpha';

function App() {
  const [issues, setIssues] = useState<IssueWithJulesStatus[]>([]);
  const [repoRoadmaps, setRepoRoadmaps] = useState<Record<string, RoadmapTask[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState<string>(localStorage.getItem('github_token') || '');
  const [julesToken, setJulesToken] = useState<string>(localStorage.getItem('jules_token') || '');
  const [julesApiBase, setJulesApiBase] = useState<string>(localStorage.getItem('jules_api_base') || DEFAULT_JULES_API_BASE);
  const [draftGhToken, setDraftGhToken] = useState<string>(ghToken);
  const [draftJulesToken, setDraftJulesToken] = useState<string>(julesToken);
  const [draftJulesApiBase, setDraftJulesApiBase] = useState<string>(julesApiBase);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'projects'>(
    (localStorage.getItem('view_mode') as 'list' | 'projects') || 'list'
  );

  useEffect(() => {
    localStorage.setItem('view_mode', viewMode);
  }, [viewMode]);

  const [repoHistory, setRepoHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('gh_repos');
    return saved ? JSON.parse(saved) : ['chatelao/AI-Dashboard'];
  });
  const [draftRepoHistory, setDraftRepoHistory] = useState<string>(repoHistory.join(', '));

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');

  const allConsolidatedIssuesRef = useRef<IssueWithJulesStatus[]>([]);
  const currentEnrichedIssuesRef = useRef<IssueWithJulesStatus[]>([]);
  const fetchingRoadmapsRef = useRef<Set<string>>(new Set());
  const lastFetchKeyRef = useRef<string>('');
  const lastAutoRefreshRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      const isTest = window.location.search.includes('test=true') || (window as any).isTest;
      if (isTest) return;

      const now = Date.now();
      if (now - lastAutoRefreshRef.current > 30000) { // 30 seconds throttle
        lastAutoRefreshRef.current = now;
        setRefreshTrigger(prev => prev + 1);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', handleRefresh);
    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', handleRefresh);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  const formatJulesStatus = (status: string) => {
    return status === 'in-progress' ? 'InProgress' : status.replace(/-/g, ' ');
  };

  const getIssueStatusColor = (issue: IssueWithJulesStatus): 'purple' | 'red' | 'yellow' | 'blue' | 'green' | 'grey' => {
    if (issue.state === 'closed') return 'purple';

    const julesStatus = issue.julesStatus;
    const prStatus = issue.prStatus;

    // Check linked PRs as well
    const linkedPRs = issue.linkedPRs || [];
    const allJulesStatuses = [julesStatus, ...linkedPRs.map(pr => pr.julesStatus)].filter(Boolean) as string[];
    const allPRStatuses = [prStatus, ...linkedPRs.map(pr => pr.prStatus)].filter(Boolean) as PRStatus[];

    if (allJulesStatuses.includes('failed') || allPRStatuses.some(ps => ps?.color === 'red')) {
      return 'red';
    }

    if (
      allJulesStatuses.some(s => ['in-progress', 'coding', 'testing'].includes(s)) ||
      allPRStatuses.some(ps => ps?.color === 'yellow')
    ) {
      return 'yellow';
    }

    if (
      allJulesStatuses.some(s => ['researching', 'planning', 'awaiting-plan-approval', 'awaiting-user-feedback'].includes(s))
    ) {
      return 'blue';
    }

    const hasFinishedPR = allPRStatuses.some(ps => ps?.color === 'green' || ps?.color === 'black');

    if (hasFinishedPR) {
      return 'green';
    }

    return 'grey';
  };

  const getIssueStatusUrl = (issue: IssueWithJulesStatus) => {
    const color = getIssueStatusColor(issue);
    if (color === 'green' || color === 'purple') {
      return issue.pull_request?.html_url || issue.linkedPRs?.[0]?.html_url || issue.julesUrl || issue.html_url;
    }
    return issue.julesUrl || issue.html_url;
  };

  const renderColoredFilename = (name: string, additions: number, deletions: number, totalLines: number, status: string) => {
    const L = name.length;
    if (L === 0) return null;

    let A = additions;
    let D = deletions;
    let U = 0;

    if (status === 'added') {
      U = 0;
      D = 0;
    } else if (status === 'removed') {
      U = 0;
      A = 0;
    } else {
      U = Math.max(0, totalLines - additions);
    }

    const relevantTotal = A + D + U;
    if (relevantTotal === 0) return <span className="text-muted">{name}</span>;

    let cA = Math.floor((A / relevantTotal) * L);
    let cD = Math.floor((D / relevantTotal) * L);
    let cU = Math.floor((U / relevantTotal) * L);

    // Apply minimums: round >0.0 = 1 letter colored, <100 = 1 letter grey
    if (A > 0 && cA === 0) cA = 1;
    if (D > 0 && cD === 0) cD = 1;
    if (U > 0 && cU === 0) cU = 1;

    // Adjust to match L
    let currentSum = cA + cD + cU;

    if (currentSum > L) {
      // Reduce from the largest ones that are above their minimum
      const counts = [
        { key: 'U', val: cU, min: U > 0 ? 1 : 0 },
        { key: 'A', val: cA, min: A > 0 ? 1 : 0 },
        { key: 'D', val: cD, min: D > 0 ? 1 : 0 }
      ];
      while (currentSum > L) {
        counts.sort((a, b) => b.val - a.val);
        let reduced = false;
        for (const count of counts) {
          if (count.val > count.min) {
            count.val--;
            currentSum--;
            reduced = true;
            break;
          }
        }
        if (!reduced) break;
      }
      cU = counts.find(c => c.key === 'U')!.val;
      cA = counts.find(c => c.key === 'A')!.val;
      cD = counts.find(c => c.key === 'D')!.val;
    }

    if (currentSum < L) {
      // Increase the largest ones
      const counts = [
        { key: 'U', val: cU, weight: U },
        { key: 'A', val: cA, weight: A },
        { key: 'D', val: cD, weight: D }
      ];
      while (currentSum < L) {
        counts.sort((a, b) => b.weight - a.weight);
        counts[0].val++;
        currentSum++;
      }
      cU = counts.find(c => c.key === 'U')!.val;
      cA = counts.find(c => c.key === 'A')!.val;
      cD = counts.find(c => c.key === 'D')!.val;
    }

    const parts = [];
    let start = 0;
    if (cA > 0) {
      parts.push(<span key="a" className="additions-text">{name.substring(start, start + cA)}</span>);
      start += cA;
    }
    if (cD > 0) {
      parts.push(<span key="d" className="deletions-text">{name.substring(start, start + cD)}</span>);
      start += cD;
    }
    if (cU > 0) {
      parts.push(<span key="u" className="text-muted">{name.substring(start, start + cU)}</span>);
      start += cU;
    }

    return <>{parts}</>;
  };

  const renderFileInfo = (item: IssueWithJulesStatus) => {
    if (item.prFilesCount === undefined) return null;
    return (
      <span className="pr-files-info">
        {' '}
        (
        <span className="tooltip">
          {item.prFilesCount} {item.prFilesCount === 1 ? 'file' : 'files'}
          {(item.prAdditions !== undefined || item.prDeletions !== undefined) && (
            <span className="tooltip-text">
              Total: <span className="additions-text">+{item.prAdditions || 0}</span>{' '}
              <span className="deletions-text">-{item.prDeletions || 0}</span>
            </span>
          )}
        </span>
        {item.prFileExtensions && item.prFileExtensions.length > 0 && (
          <>
            {', '}
            {item.prFileExtensions.map((ext, idx) => (
              <span key={ext}>
                <span className="tooltip">
                  {ext}
                  {item.prFileStats && item.prFileStats[ext] && (
                    <span className="tooltip-text">
                      <span className="tooltip-stats">
                        <span className="additions-text">+{item.prFileStats[ext].additions}</span>{' '}
                        <span className="deletions-text">-{item.prFileStats[ext].deletions}</span>
                      </span>
                      <div className="tooltip-filenames">
                        {item.prFileStats[ext].details.map((detail, dIdx) => (
                          <div key={dIdx} className="tooltip-filename-row">
                            {renderColoredFilename(detail.name, detail.additions, detail.deletions, detail.totalLines, detail.status)}
                          </div>
                        ))}
                      </div>
                    </span>
                  )}
                </span>
                {idx < (item.prFileExtensions?.length || 0) - 1 ? ', ' : ''}
              </span>
            ))}
          </>
        )}
        )
      </span>
    );
  };

  const renderPRNumberTooltip = (item: IssueWithJulesStatus, includeLabel: boolean = true) => {
    return (
      <span className="tooltip">
        <span className="pr-number">{includeLabel ? 'PR ' : ''}#{item.number}:</span>
        {' '}
        {item.body && (
          <span className="tooltip-text">
            {item.body.length > 500 ? item.body.substring(0, 500) + '...' : item.body}
          </span>
        )}
      </span>
    );
  };

  const fetchRoadmaps = async (repo: string, headers: HeadersInit) => {
    if (fetchingRoadmapsRef.current.has(repo)) return;
    fetchingRoadmapsRef.current.add(repo);

    try {
      const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (!repoResponse.ok) return;
      const repoData = await repoResponse.json();
      const defaultBranch = repoData.default_branch || 'main';

      const treeResponse = await fetch(`https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
      if (!treeResponse.ok) return;
      const treeData = await treeResponse.json();

      const roadmapFiles = (treeData.tree as any[]).filter(file =>
        file.path.toLowerCase().endsWith('roadmap.md') && file.type === 'blob'
      );

      const allTasks: RoadmapTask[] = [];

      await Promise.all(roadmapFiles.map(async (file) => {
        try {
          const contentResponse = await fetch(`https://api.github.com/repos/${repo}/contents/${file.path}?ref=${defaultBranch}`, { headers });
          if (!contentResponse.ok) return;
          const contentData = await contentResponse.json();
          // Decode base64 handling UTF-8 characters correctly
          const binaryString = atob(contentData.content.replace(/\n/g, ''));
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const content = new TextDecoder().decode(bytes);

          const lines = content.split('\n');
          lines.forEach(line => {
            const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
            if (match) {
              allTasks.push({
                completed: match[1].toLowerCase() === 'x',
                title: match[2].trim()
              });
            }
          });
        } catch (err) {
          console.error(`Error fetching/parsing roadmap file ${file.path} for ${repo}:`, err);
        }
      }));

      if (allTasks.length > 0) {
        setRepoRoadmaps(prev => ({ ...prev, [repo]: allTasks }));
      }
    } catch (err) {
      console.error(`Error fetching roadmaps for ${repo}:`, err);
    }
  };

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

  const extractSessionId = (text: string): string | undefined => {
    // Try to find common patterns for session/task IDs in Jules comments
    // 1. Markdown links like [Jules Task](.../sessions/ID) or .../task/ID
    const urlRegex = /jules\.google\.com\/(?:sessions|task)\/([a-zA-Z0-9_-]+)/;
    const urlMatch = text.match(urlRegex);
    if (urlMatch) return urlMatch[1];

    // 2. Explicit task_id or session_id labels
    const labelRegex = /(?:task_id|session_id|sessionId|taskId)[:=]\s*([a-zA-Z0-9_-]+)/i;
    const labelMatch = text.match(labelRegex);
    if (labelMatch) return labelMatch[1];

    // 3. Look for a long numeric ID that looks like a session ID
    const longIdRegex = /\b(\d{15,25})\b/;
    const longIdMatch = text.match(longIdRegex);
    if (longIdMatch) return longIdMatch[1];

    return undefined;
  };

  const fetchSessionIdFromComments = async (repo: string, issueNumber: number, headers: HeadersInit): Promise<string | undefined> => {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100`, { headers });
      if (!response.ok) return undefined;
      const comments: any[] = await response.json();

      // Find the latest "on it" comment from Jules bot
      const julesComments = comments.filter(c =>
        (c.user?.login?.toLowerCase() === 'google-labs-jules[bot]' || c.user?.login?.toLowerCase() === 'jules') &&
        c.body?.toLowerCase().includes('on it')
      ).reverse();

      for (const comment of julesComments) {
        const sessionId = extractSessionId(comment.body);
        if (sessionId) return sessionId;
      }
    } catch (err) {
      console.error(`Error fetching comments for ${repo}#${issueNumber}:`, err);
    }
    return undefined;
  };

  const fetchJulesStatus = async (sessionId: string, token: string): Promise<{ status: string; url?: string; title?: string } | undefined> => {
    let url;
    // Use the exact session endpoint as requested
    if (julesApiBase.includes('?url=')) {
      const targetUrl = `https://jules.googleapis.com/v1alpha/sessions/${sessionId}`;
      url = `${julesApiBase}${encodeURIComponent(targetUrl)}`;
    } else {
      url = `${julesApiBase}/sessions/${sessionId}`;
    }
    console.log(`Fetching Jules status from: ${url}`);
    try {
      const headers: HeadersInit = {
        'Accept': 'application/json',
      };

      // Conditionally set auth headers to avoid conflicts
      if (token.startsWith('AIza') || token.startsWith('AQ.')) {
        headers['X-Goog-Api-Key'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-Authorization'] = `Bearer ${token}`; // Fallback for proxy
      }

      const response = await fetch(url, { headers });
      console.log(`Jules API response status for session ${sessionId}: ${response.status}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Jules API returned 404 for session ${sessionId}. Check your Jules API Base URL in Settings. It must end with /v1alpha (e.g., https://jules.googleapis.com/v1alpha) and ensure you are using the plural /sessions/ endpoint.`);
        }
        return undefined;
      }
      const data: any = await response.json();
      console.log(`Jules API response data for session ${sessionId}:`, data);

      if (data && data.state) {
        return {
          status: data.state.replace('STATE_', '').replace(/_/g, '-').toLowerCase(),
          url: data.url,
          title: data.title
        };
      }
      return undefined;
    } catch (err) {
      console.error(`Failed to fetch Jules status for session ${sessionId}:`, err);
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

  const handleDuplicateIssue = async (issue: IssueWithJulesStatus) => {
    if (!ghToken) {
      alert('GitHub token is required to duplicate issues.');
      return;
    }
    if (!confirm(`Are you sure you want to duplicate issue #${issue.number} in ${issue.repository.full_name}?`)) return;

    updateActionLoading(issue.id, true);
    try {
      const response = await fetch(`https://api.github.com/repos/${issue.repository.full_name}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${ghToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: (() => {
          const labels = issue.labels.map(l => l.name);
          if (issue.isJules && !labels.some(l => l.toLowerCase() === 'jules')) {
            labels.push('Jules');
          }
          return JSON.stringify({
            title: issue.title,
            body: issue.body,
            labels
          });
        })()
      });

      if (response.ok) {
        setRefreshTrigger(prev => prev + 1);
      } else {
        const data = await response.json();
        alert(`Failed to duplicate issue: ${data.message || response.statusText}`);
      }
    } catch (err) {
      alert(`Error duplicating issue: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      updateActionLoading(issue.id, false);
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
      if (issues.length === 0) {
        setLoading(true);
      }
      setError(null);
      try {
        const headers: HeadersInit = {};
        if (ghToken) {
          headers['Authorization'] = `token ${ghToken}`;
        }

        const fetchKey = JSON.stringify([ghToken, repoHistory, filterState, refreshTrigger]);
        let finalIssues: IssueWithJulesStatus[] = [];

        if (fetchKey === lastFetchKeyRef.current && lastFetchKeyRef.current !== '') {
          finalIssues = [...allConsolidatedIssuesRef.current];
        } else {
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
            effectiveRepoList.map(repo => {
              fetchRoadmaps(repo, headers);
              return fetchRawIssues(repo, filterState, headers);
            })
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
          const tempIssues: IssueWithJulesStatus[] = [];

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
                }
              }
            }
          });

          issuesOnly.forEach(issue => tempIssues.push(issue as IssueWithJulesStatus));

          // Sort by updated_at descending
          tempIssues.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

          prsOnly.forEach(pr => {
            if (!pr.body) {
              tempIssues.push(pr as IssueWithJulesStatus);
            } else {
              const regex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
              let match;
              let linked = false;
              while ((match = regex.exec(pr.body)) !== null) {
                const issueNumber = parseInt(match[1], 10);
                const issueKey = `${pr.repository.full_name}#${issueNumber}`;
                const issue = issuesByNumber.get(issueKey);
                if (issue) {
                  linked = true;
                }
              }
              if (!linked) {
                tempIssues.push(pr as IssueWithJulesStatus);
              }
            }
          });

          allConsolidatedIssuesRef.current = tempIssues;
          lastFetchKeyRef.current = fetchKey;
          finalIssues = [...tempIssues];
        }

        // Apply filtering
        const filteredIssues = debouncedSearchTerm.trim() === ''
          ? finalIssues
          : finalIssues.filter(issue => {
              const term = debouncedSearchTerm.toLowerCase();
              const inRepo = issue.repository.full_name.toLowerCase().includes(term);
              const inTitle = issue.title.toLowerCase().includes(term);
              const inPr = issue.linkedPRs?.some(pr =>
                pr.title.toLowerCase().includes(term) ||
                (pr.body && pr.body.toLowerCase().includes(term)) ||
                `#${pr.number}`.includes(term)
              );
              return inRepo || inTitle || inPr;
            });

        // Optimization: Slice BEFORE fetching statuses
        const visibleIssues = filteredIssues.slice(0, pageSize).map(item => {
          const isJules = (
            item.assignee?.login?.toLowerCase() === 'jules' ||
            item.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
            item.labels.some(l => l.name.toLowerCase() === 'jules')
          );

          // Find existing enriched issue to preserve state
          const existing = currentEnrichedIssuesRef.current.find(i => i.id === item.id);
          const enrichedItem: IssueWithJulesStatus = {
            ...item,
            isJules,
          };

          if (existing) {
            // Selectively preserve enrichment state
            if (existing.julesStatus) {
              enrichedItem.julesStatus = existing.julesStatus;
              enrichedItem.julesUrl = existing.julesUrl;
            }
            if (existing.prStatus) enrichedItem.prStatus = existing.prStatus;
            if (existing.mergeable !== undefined) enrichedItem.mergeable = existing.mergeable;
            if (existing.mergeable_state) enrichedItem.mergeable_state = existing.mergeable_state;
            if (existing.prFilesCount !== undefined) enrichedItem.prFilesCount = existing.prFilesCount;
            if (existing.prFileExtensions) enrichedItem.prFileExtensions = existing.prFileExtensions;
            if (existing.actionLoading) enrichedItem.actionLoading = existing.actionLoading;
          }

          // Update linked PRs from existing if they match
          if (item.linkedPRs) {
            enrichedItem.linkedPRs = item.linkedPRs.map(pr => {
              const existingPr = existing?.linkedPRs?.find(epr => epr.id === pr.id);
              const isPrJules = (
                pr.assignee?.login?.toLowerCase() === 'jules' ||
                pr.assignee?.login?.toLowerCase() === 'google-labs-jules[bot]' ||
                pr.labels.some(l => l.name.toLowerCase() === 'jules')
              );
              const enrichedPr: IssueWithJulesStatus = {
                ...pr,
                isJules: isPrJules,
              };

              if (existingPr) {
                if (existingPr.julesStatus) {
                  enrichedPr.julesStatus = existingPr.julesStatus;
                  enrichedPr.julesUrl = existingPr.julesUrl;
                }
                if (existingPr.prStatus) enrichedPr.prStatus = existingPr.prStatus;
                if (existingPr.mergeable !== undefined) enrichedPr.mergeable = existingPr.mergeable;
                if (existingPr.mergeable_state) enrichedPr.mergeable_state = existingPr.mergeable_state;
                if (existingPr.prFilesCount !== undefined) enrichedPr.prFilesCount = existingPr.prFilesCount;
                if (existingPr.prFileExtensions) enrichedPr.prFileExtensions = existingPr.prFileExtensions;
                if (existingPr.actionLoading) enrichedPr.actionLoading = existingPr.actionLoading;
              }

              enrichedPr.enrichingJules = isPrJules && !!julesToken && !enrichedPr.julesStatus;
              enrichedPr.enrichingPR = !enrichedPr.prStatus;
              return enrichedPr;
            });
          }

          // Set enrichment flags
          enrichedItem.enrichingJules = isJules && !!julesToken && !enrichedItem.julesStatus;
          enrichedItem.enrichingPR = (!!item.pull_request && !enrichedItem.prStatus) ||
            (item.linkedPRs && item.linkedPRs.length > 0 && enrichedItem.linkedPRs?.some(pr => !pr.prStatus));

          return enrichedItem;
        });

        setIssues(visibleIssues);
        currentEnrichedIssuesRef.current = visibleIssues;
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
                const sessionId = await fetchSessionIdFromComments(target.repository.full_name, target.number, headers);
                if (sessionId) {
                  const result = await fetchJulesStatus(sessionId, julesToken);
                  if (result) {
                    target.julesStatus = result.status;
                    target.julesUrl = result.url;
                    target.julesTitle = result.title;
                  }
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
                    target.prAdditions = prDetail.additions;
                    target.prDeletions = prDetail.deletions;

                    // Fetch PR files to get count and extensions
                    try {
                      const filesResponse = await fetch(
                        `https://api.github.com/repos/${target.repository.full_name}/pulls/${target.number}/files`,
                        { headers }
                      );
                      if (filesResponse.ok) {
                        const filesData: any[] = await filesResponse.json();
                        target.prFilesCount = filesData.length;
                        const stats: Record<string, {
                          filenames: string[],
                          additions: number,
                          deletions: number,
                          details: {
                            name: string,
                            additions: number,
                            deletions: number,
                            totalLines: number,
                            status: string
                          }[]
                        }> = {};

                        await Promise.all(filesData.map(async (file) => {
                          const parts = file.filename.split('.');
                          const ext = parts.length > 1 ? `.${parts.pop()}` : 'no-ext';
                          if (!stats[ext]) {
                            stats[ext] = { filenames: [], additions: 0, deletions: 0, details: [] };
                          }
                          stats[ext].filenames.push(file.filename);
                          stats[ext].additions += (file.additions || 0);
                          stats[ext].deletions += (file.deletions || 0);

                          let totalLines = 0;
                          if (file.status === 'added') {
                            totalLines = file.additions || 0;
                          } else if (file.status === 'removed') {
                            totalLines = file.deletions || 0;
                          } else if (file.raw_url) {
                            try {
                              const rawResponse = await fetch(file.raw_url, { headers });
                              if (rawResponse.ok) {
                                const content = await rawResponse.text();
                                totalLines = content.split('\n').length;
                              }
                            } catch (e) {
                              console.error(`Failed to fetch raw content for ${file.filename}`, e);
                            }
                          }

                          stats[ext].details.push({
                            name: file.filename,
                            additions: file.additions || 0,
                            deletions: file.deletions || 0,
                            totalLines,
                            status: file.status
                          });
                        }));

                        target.prFileStats = stats;
                        target.prFileExtensions = Object.keys(stats);
                      }
                    } catch (err) {
                      console.error(`Failed to fetch files for PR #${target.number}`, err);
                    }

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
            setIssues(prev => {
              const next = prev.map(i => i.id === item.id ? { ...item } : i);
              currentEnrichedIssuesRef.current = next;
              return next;
            });
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
  }, [ghToken, julesToken, filterState, refreshTrigger, pageSize, repoHistory, debouncedSearchTerm]);

  return (
    <div className="dashboard">
      <header>
        <div className="header-content">
          <div>
            <h1>Dashboard</h1>
          </div>
          <div className="header-filter">
            <input
              ref={searchInputRef}
              type="text"
              className="filter-input"
              placeholder="Filter by repo, title, or PR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="header-actions">
            <div className="view-toggle">
              <button
                className={`btn-toggle ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                className={`btn-toggle ${viewMode === 'projects' ? 'active' : ''}`}
                onClick={() => setViewMode('projects')}
              >
                Projects
              </button>
            </div>
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
            placeholder="https://jules.googleapis.com/v1alpha"
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

        {!loading && !error && viewMode === 'projects' && (
          <div className="project-view">
            {(() => {
              const reposMap = new Map<string, IssueWithJulesStatus[]>();
              issues.forEach(issue => {
                const repoName = issue.repository.full_name;
                if (!reposMap.has(repoName)) {
                  reposMap.set(repoName, []);
                }
                reposMap.get(repoName)!.push(issue);
              });

              return Array.from(reposMap.entries()).map(([repoName, repoIssues]) => {
                const openIssues = repoIssues.filter(i => i.state === 'open');
                const closedIssues = repoIssues
                  .filter(i => i.state === 'closed')
                  .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                  .slice(0, 3);

                const roadmapTasks = repoRoadmaps[repoName] || [];

                return (
                  <div key={repoName} className="project-line">
                    <div className="project-name">
                      <a
                        href={`https://github.com/${repoName}/issues`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {repoName.split('/')[1]}
                      </a>
                    </div>
                    <div className="project-squares">
                      {[...openIssues, ...closedIssues].map(issue => (
                        <span key={issue.id} className="tooltip">
                          <a
                            href={getIssueStatusUrl(issue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`status-square ${getIssueStatusColor(issue)}`}
                          ></a>
                          <span className="tooltip-text">
                            <strong>#{issue.number}: {issue.title}</strong>
                            <div className="tooltip-summary-section">
                              <div className="tooltip-section-header">Summary:</div>
                              {issue.julesTitle || (issue.body ? (issue.body.length > 300 ? issue.body.substring(0, 300) + '...' : issue.body) : 'No summary available.')}
                            </div>
                            {issue.linkedPRs && issue.linkedPRs.length > 0 && (
                              <div className="tooltip-summary-section">
                                <div className="tooltip-section-header">Linked PRs:</div>
                                {issue.linkedPRs.map(pr => (
                                  <div key={pr.id} className="tooltip-linked-pr-row">
                                    <div className="tooltip-linked-pr-title">#{pr.number}: {pr.title}</div>
                                    <div className="tooltip-linked-pr-summary">
                                      {pr.julesTitle || (pr.body ? (pr.body.length > 150 ? pr.body.substring(0, 150) + '...' : pr.body) : 'No summary available.')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </span>
                        </span>
                      ))}
                    </div>
                    {roadmapTasks.length > 0 && (
                      <div className="project-roadmap">
                        {roadmapTasks.map((task, idx) => (
                          <span key={idx} className="tooltip">
                            <span className={`roadmap-circle ${task.completed ? 'completed' : ''}`}></span>
                            <span className="tooltip-text">{task.title}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {!loading && !error && viewMode === 'list' && (
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
                        <div className="issue-title-line">
                          {!issue.pull_request && (
                            <button
                              className="btn-duplicate"
                              onClick={() => handleDuplicateIssue(issue)}
                              disabled={issue.actionLoading}
                              title="Duplicate issue"
                            >
                              {issue.actionLoading ? '...' : (
                                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                                  <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
                                  <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
                                </svg>
                              )}
                            </button>
                          )}
                          <a
                            href={`https://github.com/${issue.repository.full_name}/issues`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span className="repo-tag">[{issue.repository.full_name.split('/')[1]}]</span>
                          </a>{' '}
                          <a href={issue.html_url} target="_blank" rel="noopener noreferrer">
                            {issue.pull_request && renderPRNumberTooltip(issue, false)}
                            {issue.title}
                            {renderFileInfo(issue)}
                          </a>
                        </div>
                        {issue.linkedPRs && issue.linkedPRs.map(pr => (
                          <div key={pr.id} className="subtitle">
                            <a href={pr.html_url} target="_blank" rel="noopener noreferrer">
                              {renderPRNumberTooltip(pr)} {pr.title}
                              {renderFileInfo(pr)}
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
                              <span className={`badge jules-status-${issue.julesStatus}`}>
                                {formatJulesStatus(issue.julesStatus)}
                              </span>
                            </a>
                          ) : (
                            <span className={`badge jules-status-${issue.julesStatus}`}>
                              {formatJulesStatus(issue.julesStatus)}
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
                                  <span className={`badge jules-status-${pr.julesStatus}`}>
                                    {formatJulesStatus(pr.julesStatus)}
                                  </span>
                                </a>
                              ) : (
                                <span className={`badge jules-status-${pr.julesStatus}`}>
                                  {formatJulesStatus(pr.julesStatus)}
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
