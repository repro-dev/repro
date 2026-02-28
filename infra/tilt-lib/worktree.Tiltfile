# Worktree detection helpers
#
# These functions detect git worktree context and resolve paths.
# Service registration logic has moved to services.Tiltfile.


def is_worktree(repo_root):
  """Detect whether repo_root is a git worktree (not the main checkout).

  In a worktree, .git is a file containing 'gitdir: <path>' rather than
  a directory. Since Tilt Starlark has no os.path.isdir, we shell out to
  `test -f .git`.
  """
  result = str(local(
    'test -f .git && echo worktree || echo main',
    quiet=True,
    dir=repo_root,
  ))
  return result.strip() == 'worktree'


def detect_main_checkout(repo_root):
  """Resolve the main checkout path from a worktree.

  Parses `git worktree list` output to find the first entry (which is
  always the main checkout).
  """
  result = str(local(
    'git worktree list --porcelain',
    quiet=True,
    dir=repo_root,
  ))

  for line in result.splitlines():
    if line.startswith('worktree '):
      return line.removeprefix('worktree ')

  fail('Could not detect main checkout from git worktree list')


def worktree_slug(repo_root):
  """Derive a short slug from the worktree directory name.

  Given a path like /home/user/repro-wt-feat-new-api, returns 'feat-new-api'.
  Falls back to the full directory basename if it does not match the
  repro-wt-* convention.
  """
  basename = os.path.basename(repo_root)

  if basename.startswith('repro-wt-'):
    return basename.removeprefix('repro-wt-')

  return basename
