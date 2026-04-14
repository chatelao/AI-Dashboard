# How to Enable Private Repositories

To see issues and pull requests from private repositories in the Dashboard, you need to provide a GitHub Personal Access Token (PAT) with the appropriate permissions.

## 1. Create a GitHub Personal Access Token

You can use either a **Fine-grained token** (recommended) or a **Classic token**.

### Option A: Fine-grained personal access token (Recommended)
1. Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta).
2. Click **Generate new token**.
3. Give it a name and expiration date.
4. **Repository access:** Select "All repositories" or "Only select repositories" (and pick the private ones you want).
5. **Permissions:**
   - **Repository permissions:**
     - `Issues`: Read-only (or Read & write if you want to use Jules features)
     - `Pull requests`: Read-only (or Read & write if you want to use Merge/Update features)
     - `Metadata`: Read-only (mandatory)
     - `Commit statuses`: Read-only (for CI/CD status)
6. Click **Generate token** and copy it.

### Option B: Tokens (classic)
1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens).
2. Click **Generate new token > Generate new token (classic)**.
3. Select the `repo` scope (this grants full control of private repositories).
4. Click **Generate token** and copy it.

## 2. Configure the Dashboard

1. Open the Dashboard.
2. Click the **Settings (⚙️)** icon in the top right.
3. Paste your token into the **GitHub Personal Access Token** field.
4. In the **Tracked Repositories** field, ensure your private repositories are listed (e.g., `your-org/private-repo, your-user/another-private-repo`).
   - If you leave this field empty, the dashboard will try to automatically fetch all repositories you have access to.
5. Click **Save & Reload**.

## 3. Troubleshooting

### SAML / SSO
If your private repository belongs to an organization that uses SAML Single Sign-On (SSO), you must authorize your PAT:
1. In your GitHub [Personal Access Tokens list](https://github.com/settings/tokens), find the token you created.
2. Click **Configure SSO** next to the token.
3. Click **Authorize** for the relevant organization.

### Token Format
The Dashboard uses the `Bearer` authentication scheme. If you are using a proxy, ensure it forwards the `Authorization` header correctly.
