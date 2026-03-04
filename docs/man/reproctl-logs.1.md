% REPROCTL-LOGS(1) reproctl | Repro Development Tools
% Repro
% 2026

# NAME

reproctl-logs - show or stream service logs

# SYNOPSIS

**reproctl logs** [*options*] [*service*...]

# DESCRIPTION

Show or stream logs from running services. Without **-f** or explicit service names, displays the last 50 lines across all resources.

When service names are given, output is filtered to only those services. When **-f** / **--follow** is specified, new log lines are streamed in real time.

# OPTIONS

**-f**, **--follow**
: Stream logs in real time instead of displaying a snapshot.

**--level** *warn* | *error*
: Filter log output to the specified severity level or above.

**--source** *all* | *build* | *runtime*
: Select the log source. **all** (default) shows both build and runtime logs. **build** shows only image build output. **runtime** shows only container runtime output.

**--grep** *pattern*
: Filter log lines to those matching *pattern* (a regular expression).

**-C**, **--context** *duration*
: Show *duration* of context around matching lines (implies **--grep**).

**-B** *duration*
: Show *duration* of context before matching lines.

**-A** *duration*
: Show *duration* of context after matching lines.

**--since** *duration* | *timestamp*
: Only show logs newer than *duration* (e.g., **5m**, **1h**) or an absolute *timestamp*.

**--json**
: Output logs in JSON format (one object per line).

**--no-prefix**
: Omit the service-name prefix from each log line.

**-n**, **--tail** *lines*
: Number of recent lines to display (default: **50**).

**--pick**, **-p**
: Interactively select a service to view logs for. Uses **fzf** if installed, otherwise a numbered prompt.

# EXAMPLES

reproctl logs
: Show the last 50 lines from all services.

reproctl logs -f api-server
: Stream api-server logs in real time.

reproctl logs --json --since 5m api-server
: Show structured JSON logs from the last 5 minutes.

reproctl logs --level error
: Show only error-level logs across all services.

reproctl logs --grep "connection refused" -C 10s
: Search for a pattern with 10 seconds of surrounding context.

# SEE ALSO

**reproctl**(1), **reproctl-start**(1)
