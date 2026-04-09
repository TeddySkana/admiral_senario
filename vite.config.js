import { defineConfig } from 'vite';

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function resolveBasePath() {
  if (process.env.VITE_BASE_PATH) {
    return ensureTrailingSlash(process.env.VITE_BASE_PATH);
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const runningInGithubActions = process.env.GITHUB_ACTIONS === 'true';

  if (runningInGithubActions && repositoryName && !repositoryName.endsWith('.github.io')) {
    return `/${repositoryName}/`;
  }

  return '/';
}

export default defineConfig({
  base: resolveBasePath(),
});
