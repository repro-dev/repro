% REPROCTL-COMPLETION(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-completion - generate shell completion scripts

# SYNOPSIS

**reproctl completion** *shell*

# DESCRIPTION

Generate shell completion scripts for reproctl. The completion script is
written to stdout so it can be redirected to a file or evaluated directly.

When run without a shell argument, installation instructions are printed to
stderr.

## Supported shells

**bash**
: Bash completion using the bash-completion framework.

**zsh**
: Zsh completion using the compdef/compsys framework.

**fish**
: Fish completion using the **complete** builtin.

# INSTALLATION

## Bash

Write to the bash-completion directory:

    reproctl completion bash > ~/.local/share/bash-completion/completions/reproctl

Or eval in **~/.bashrc**:

    eval "$(reproctl completion bash)"

## Zsh

Write to a directory in **fpath**:

    reproctl completion zsh > "${fpath[1]}/_reproctl" && compinit

Or eval in **~/.zshrc**:

    eval "$(reproctl completion zsh)"

## Fish

Write to the fish completions directory:

    reproctl completion fish > ~/.config/fish/completions/reproctl.fish

Or eval directly:

    reproctl completion fish | source

# EXAMPLES

reproctl completion bash
: Print the Bash completion script to stdout.

reproctl completion zsh > /usr/local/share/zsh/site-functions/_reproctl
: Install Zsh completions system-wide.

reproctl completion fish | source
: Load Fish completions in the current session.

# SEE ALSO

**reproctl**(1)
