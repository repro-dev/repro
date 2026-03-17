set -l commands setup doctor checkhealth cluster db start stop restart status logs ui launch context worktree wt completion help

function __reproctl_no_subcommand
    set -l cmd (commandline -opc)
    test (count $cmd) -eq 1
end

function __reproctl_using_command
    set -l cmd (commandline -opc)
    test (count $cmd) -gt 1; and test "$cmd[2]" = "$argv[1]"
end

function __reproctl_using_subcommand
    set -l cmd (commandline -opc)
    test (count $cmd) -gt 2; and test "$cmd[2]" = "$argv[1]"; and test "$cmd[3]" = "$argv[2]"
end

function __reproctl_repo_root
    set -l root (git rev-parse --show-toplevel 2>/dev/null)
    if test -n "$root"
        echo $root
        return
    end

    set -l dir (status dirname)
    echo (string replace /scripts/completions '' $dir)
end

function __reproctl_services
    set -l repo (__reproctl_repo_root)
    set -l json "$repo/infra/services.json"
    if test -f "$json"
        python3 -c "import json,sys; print('\n'.join(json.load(open(sys.argv[1])).keys()))" "$json" 2>/dev/null
    end
end

function __reproctl_launchable_services
    set -l repo (__reproctl_repo_root)
    set -l json "$repo/infra/services.json"
    echo workspace
    echo api-server
    echo admin
    if test -f "$json"
        python3 "$repo/scripts/lib/py/launchable_local_services.py" "$json" 2>/dev/null
    end
end

function __reproctl_worktree_branches
    git worktree list --porcelain 2>/dev/null | string replace -rf '^branch refs/heads/(.+)' '$1'
end

complete -c reproctl -e

complete -c reproctl -n __reproctl_no_subcommand -f -a setup -d 'Bootstrap the development environment'
complete -c reproctl -n __reproctl_no_subcommand -f -a doctor -d 'Check development prerequisites'
complete -c reproctl -n __reproctl_no_subcommand -f -a checkhealth -d 'Runtime health checks'
complete -c reproctl -n __reproctl_no_subcommand -f -a cluster -d 'Manage local k8s cluster and registry'
complete -c reproctl -n __reproctl_no_subcommand -f -a db -d 'Database operations'
complete -c reproctl -n __reproctl_no_subcommand -f -a start -d 'Start services'
complete -c reproctl -n __reproctl_no_subcommand -f -a stop -d 'Stop services or tear down Tilt'
complete -c reproctl -n __reproctl_no_subcommand -f -a restart -d 'Rebuild and redeploy services'
complete -c reproctl -n __reproctl_no_subcommand -f -a status -d 'Show running services'
complete -c reproctl -n __reproctl_no_subcommand -f -a logs -d 'Show or stream service logs'
complete -c reproctl -n __reproctl_no_subcommand -f -a ui -d 'Open Tilt dashboard in browser'
complete -c reproctl -n __reproctl_no_subcommand -f -a launch -d 'Open a service URL in the browser'
complete -c reproctl -n __reproctl_no_subcommand -f -a context -d 'Show current development context'
complete -c reproctl -n __reproctl_no_subcommand -f -a worktree -d 'Manage git worktrees'
complete -c reproctl -n __reproctl_no_subcommand -f -a wt -d 'Manage git worktrees (alias)'
complete -c reproctl -n __reproctl_no_subcommand -f -a completion -d 'Generate shell completions'
complete -c reproctl -n __reproctl_no_subcommand -f -a help -d 'Show help for a command'

complete -c reproctl -n '__reproctl_using_command setup' -f -l skip-cluster -d 'Skip kind cluster creation'

complete -c reproctl -n '__reproctl_using_command checkhealth' -f -l json -d 'Output machine-readable JSON'

complete -c reproctl -n '__reproctl_using_command cluster' -f -a up -d 'Create local registry and kind cluster'
complete -c reproctl -n '__reproctl_using_command cluster' -f -a down -d 'Tear down cluster and registry'
complete -c reproctl -n '__reproctl_using_command cluster' -f -a status -d 'Show cluster and registry state'
complete -c reproctl -n '__reproctl_using_command cluster' -f -a reset -d 'Destroy and recreate the cluster'
complete -c reproctl -n '__reproctl_using_subcommand cluster down' -f -l force -d 'Force even if services are running'
complete -c reproctl -n '__reproctl_using_subcommand cluster reset' -f -l force -d 'Force even if services are running'

complete -c reproctl -n '__reproctl_using_command db' -f -a reset -d 'Drop and recreate the database'
complete -c reproctl -n '__reproctl_using_command db' -f -a migrate -d 'Run pending migrations'
complete -c reproctl -n '__reproctl_using_command db' -f -a shell -d 'Open a psql session'
complete -c reproctl -n '__reproctl_using_command db' -f -a status -d 'Show connection info and migration status'
complete -c reproctl -n '__reproctl_using_subcommand db reset' -f -s y -l yes -d 'Skip confirmation'

complete -c reproctl -n '__reproctl_using_command start' -f -a '(__reproctl_services)' -d 'Service'
complete -c reproctl -n '__reproctl_using_command start' -f -s p -l pick -d 'Interactively select a service'
complete -c reproctl -n '__reproctl_using_command start' -f -s w -l wait -d 'Block until all services are healthy'
complete -c reproctl -n '__reproctl_using_command start' -f -s t -l timeout -d 'Timeout for --wait (no default)'

complete -c reproctl -n '__reproctl_using_command stop' -f -a '(__reproctl_services)' -d 'Service'
complete -c reproctl -n '__reproctl_using_command stop' -f -l all -d 'Tear down Tilt entirely'
complete -c reproctl -n '__reproctl_using_command stop' -f -s w -l worktree -d 'Target a specific worktree' -ra '(__reproctl_worktree_branches)'
complete -c reproctl -n '__reproctl_using_command stop' -f -s p -l pick -d 'Interactively select a service'

complete -c reproctl -n '__reproctl_using_command restart' -f -a '(__reproctl_services)' -d 'Service'
complete -c reproctl -n '__reproctl_using_command restart' -f -l all -d 'Restart entire Tilt daemon'
complete -c reproctl -n '__reproctl_using_command restart' -f -s w -l worktree -d 'Target a specific worktree' -ra '(__reproctl_worktree_branches)'
complete -c reproctl -n '__reproctl_using_command restart' -f -s p -l pick -d 'Interactively select a service'

complete -c reproctl -n '__reproctl_using_command logs' -f -a '(__reproctl_services)' -d 'Service'
complete -c reproctl -n '__reproctl_using_command logs' -f -s f -l follow -d 'Stream logs continuously'
complete -c reproctl -n '__reproctl_using_command logs' -f -l level -d 'Filter by level' -ra 'warn error'
complete -c reproctl -n '__reproctl_using_command logs' -f -l source -d 'Filter by source' -ra 'all build runtime'
complete -c reproctl -n '__reproctl_using_command logs' -f -l grep -d 'Filter lines matching pattern'
complete -c reproctl -n '__reproctl_using_command logs' -f -s C -l context -d 'Time window around matches'
complete -c reproctl -n '__reproctl_using_command logs' -f -l since -d 'Show logs newer than'
complete -c reproctl -n '__reproctl_using_command logs' -f -l json -d 'Output structured JSON'
complete -c reproctl -n '__reproctl_using_command logs' -f -l no-prefix -d 'Omit resource name prefix'
complete -c reproctl -n '__reproctl_using_command logs' -f -s n -l tail -d 'Show last N lines'
complete -c reproctl -n '__reproctl_using_command logs' -f -s p -l pick -d 'Interactively select a service'

complete -c reproctl -n '__reproctl_using_command launch' -f -a '(__reproctl_launchable_services)' -d 'Service'
complete -c reproctl -n '__reproctl_using_command launch' -f -s w -l worktree -d 'Target a specific worktree' -ra '(__reproctl_worktree_branches)'

complete -c reproctl -n '__reproctl_using_command worktree' -f -a create -d 'Create a new worktree'
complete -c reproctl -n '__reproctl_using_command worktree' -f -a remove -d 'Remove a worktree'
complete -c reproctl -n '__reproctl_using_command worktree' -f -a list -d 'List active worktrees'
complete -c reproctl -n '__reproctl_using_command worktree' -f -a attach -d 'Drop into a worktree subshell'
complete -c reproctl -n '__reproctl_using_command worktree' -f -a prune -d 'Remove worktrees with merged branches'
complete -c reproctl -n '__reproctl_using_command wt' -f -a create -d 'Create a new worktree'
complete -c reproctl -n '__reproctl_using_command wt' -f -a remove -d 'Remove a worktree'
complete -c reproctl -n '__reproctl_using_command wt' -f -a list -d 'List active worktrees'
complete -c reproctl -n '__reproctl_using_command wt' -f -a attach -d 'Drop into a worktree subshell'
complete -c reproctl -n '__reproctl_using_command wt' -f -a prune -d 'Remove worktrees with merged branches'
complete -c reproctl -n '__reproctl_using_subcommand worktree create' -f -s i -l from-issue -d 'Fetch branch from Linear issue'
complete -c reproctl -n '__reproctl_using_subcommand worktree create' -f -l no-status-update -d 'Skip setting issue to In Progress'
complete -c reproctl -n '__reproctl_using_subcommand worktree create' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand worktree remove' -f -a '(__reproctl_worktree_branches)' -d 'Branch'
complete -c reproctl -n '__reproctl_using_subcommand worktree remove' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand worktree attach' -f -a '(__reproctl_worktree_branches)' -d 'Branch'
complete -c reproctl -n '__reproctl_using_subcommand worktree prune' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand worktree prune' -f -s y -l yes -d 'Skip confirmation'
complete -c reproctl -n '__reproctl_using_subcommand wt create' -f -s i -l from-issue -d 'Fetch branch from Linear issue'
complete -c reproctl -n '__reproctl_using_subcommand wt create' -f -l no-status-update -d 'Skip setting issue to In Progress'
complete -c reproctl -n '__reproctl_using_subcommand wt create' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand wt remove' -f -a '(__reproctl_worktree_branches)' -d 'Branch'
complete -c reproctl -n '__reproctl_using_subcommand wt remove' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand wt attach' -f -a '(__reproctl_worktree_branches)' -d 'Branch'
complete -c reproctl -n '__reproctl_using_subcommand wt prune' -f -l dry-run -d 'Preview without making changes'
complete -c reproctl -n '__reproctl_using_subcommand wt prune' -f -s y -l yes -d 'Skip confirmation'

complete -c reproctl -n '__reproctl_using_command completion' -f -a 'bash zsh fish' -d 'Shell'

complete -c reproctl -n '__reproctl_using_command help' -f -a 'setup doctor checkhealth cluster db start stop restart status logs ui launch context worktree wt completion environment exit-codes json'
