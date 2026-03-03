#!/bin/bash
#
# scripts/lib/checkhealth.sh — runtime health checks
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/cluster.sh to be loaded first.

CHECKHEALTH_JSON=false

_diag_ok() {
  if [ "$CHECKHEALTH_JSON" = true ]; then return; fi
  printf '  %s%-24s%s %sok%s  %s\n' "$CLR_BOLD" "$1" "$CLR_RESET" "$CLR_GREEN" "$CLR_RESET" "$2"
}

_diag_warn() {
  if [ "$CHECKHEALTH_JSON" = true ]; then return; fi
  printf '  %s%-24s%s %swarn%s  %s\n' "$CLR_BOLD" "$1" "$CLR_RESET" "$CLR_YELLOW" "$CLR_RESET" "$2"
}

_diag_err() {
  if [ "$CHECKHEALTH_JSON" = true ]; then return; fi
  printf '  %s%-24s%s %serror%s  %s\n' "$CLR_BOLD" "$1" "$CLR_RESET" "$CLR_RED" "$CLR_RESET" "$2"
}

_diag_skip() {
  if [ "$CHECKHEALTH_JSON" = true ]; then return; fi
  printf '  %s%-24s%s %sskip%s  %s\n' "$CLR_BOLD" "$1" "$CLR_RESET" "$CLR_DIM" "$CLR_RESET" "$2"
}

cmd_checkhealth() {
  local has_errors=false
  local has_warnings=false
  local issues=()
  local json_checks=()

  _add_check() {
    local name="$1" status="$2" detail="$3"
    json_checks+=("{\"name\":$(printf '%s' "$name" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"status\":\"$status\",\"detail\":$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
  }

  _add_issue() {
    local severity="$1" msg="$2"
    issues+=("{\"severity\":\"$severity\",\"message\":$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
  }

  if [ "$CHECKHEALTH_JSON" != true ]; then
    echo ""
    echo "${CLR_BOLD}Runtime health check${CLR_RESET}"
    echo ""
    echo "${CLR_BOLD}Infrastructure:${CLR_RESET}"
  fi

  if tilt_is_running; then
    _diag_ok "Tilt daemon" "running (http://localhost:$TILT_PORT)"
    _add_check "tilt" "ok" "running (http://localhost:$TILT_PORT)"
  else
    _diag_err "Tilt daemon" "not running"
    _add_check "tilt" "error" "not running"
    _add_issue "error" "Tilt is not running — start services with: reproctl start <service>"
    has_errors=true
  fi

  if command -v kubectl > /dev/null 2>&1 && kubectl cluster-info > /dev/null 2>&1; then
    local node_count
    node_count="$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')"
    _diag_ok "Kubernetes cluster" "$CLUSTER_NAME ($node_count node(s))"
    _add_check "kubernetes" "ok" "$CLUSTER_NAME ($node_count node(s))"
  else
    _diag_err "Kubernetes cluster" "not accessible"
    _add_check "kubernetes" "error" "not accessible"
    _add_issue "error" "Kubernetes cluster not accessible — run: reproctl cluster up"
    has_errors=true
  fi

  if registry_exists; then
    local reg_port
    reg_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
    if curl -sf "http://localhost:${reg_port}/v2/" > /dev/null 2>&1; then
      _diag_ok "Container registry" "$REGISTRY_NAME (port $reg_port, API reachable)"
      _add_check "registry" "ok" "$REGISTRY_NAME (port $reg_port)"
    else
      _diag_warn "Container registry" "$REGISTRY_NAME running but API not reachable on port $reg_port"
      _add_check "registry" "warn" "running but API not reachable"
      _add_issue "warning" "Container registry running but API not reachable on port $reg_port"
      has_warnings=true
    fi
  else
    _diag_err "Container registry" "$REGISTRY_NAME not running"
    _add_check "registry" "error" "$REGISTRY_NAME not running"
    _add_issue "error" "Container registry not running — run: reproctl cluster up"
    has_errors=true
  fi

  local ports=(80 443 15432)
  local port_names=("HTTP/ingress" "HTTPS/ingress" "PostgreSQL")
  for i in "${!ports[@]}"; do
    local port="${ports[$i]}"
    local pname="${port_names[$i]}"
    local listener
    listener="$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | tail -1 | awk '{print $1}' || true)"
    if [ -n "$listener" ]; then
      _diag_ok "Port $port" "bound ($pname, $listener)"
      _add_check "port_$port" "ok" "bound ($pname, $listener)"
    else
      _diag_warn "Port $port" "not bound ($pname)"
      _add_check "port_$port" "warn" "not bound ($pname)"
      _add_issue "warning" "Port $port ($pname) is not bound — service may not be started"
      has_warnings=true
    fi
  done

  if [ "$CHECKHEALTH_JSON" != true ]; then
    echo ""
    echo "${CLR_BOLD}Services:${CLR_RESET}"
  fi

  if tilt_is_running; then
    local tilt_json
    tilt_json="$(tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null || echo '{}')"

    local svc_results
    svc_results="$(printf '%s' "$tilt_json" | \
      SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
      python3 "$SCRIPTS_DIR/lib/py/format_checkhealth.py" 2>/dev/null || echo '{"services":[],"issues":[]}')"

    if [ "$CHECKHEALTH_JSON" != true ]; then
      printf '%s' "$svc_results" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for s in data.get("services", []):
    name = s["name"]
    status = s["status"]
    detail = s.get("detail", "")
    if status == "ok":
        color = "\033[32m"
    elif status == "error":
        color = "\033[31m"
    elif status == "warn":
        color = "\033[33m"
    else:
        color = "\033[2m"
    reset = "\033[0m"
    print(f"  \033[1m{name:<24}\033[0m {color}{status}{reset}  {detail}")
'
    fi

    local svc_check_items
    svc_check_items="$(printf '%s' "$svc_results" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for s in data.get("services", []):
    print(json.dumps({"name": "svc_" + s["name"], "status": s["status"], "detail": s.get("detail", "")}))
')"
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      json_checks+=("$line")
    done <<< "$svc_check_items"

    local svc_issues
    svc_issues="$(printf '%s' "$svc_results" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for issue in data.get("issues", []):
    print(json.dumps(issue))
')"
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      issues+=("$line")
      local sev
      sev="$(printf '%s' "$line" | python3 -c 'import json,sys; print(json.load(sys.stdin)["severity"])')"
      if [ "$sev" = "error" ]; then
        has_errors=true
      elif [ "$sev" = "warning" ]; then
        has_warnings=true
      fi
    done <<< "$svc_issues"
  else
    _diag_skip "Services" "Tilt not running — cannot check service health"
    _add_check "services" "skip" "Tilt not running"
  fi

  if [ "$CHECKHEALTH_JSON" != true ]; then
    echo ""
    echo "${CLR_BOLD}Worktree resources:${CLR_RESET}"
  fi

  if command -v helm > /dev/null 2>&1 && command -v kubectl > /dev/null 2>&1 && kubectl cluster-info > /dev/null 2>&1; then
    local helm_releases
    helm_releases="$(helm list --all-namespaces --output json 2>/dev/null || echo '[]')"

    local wt_releases
    wt_releases="$(printf '%s' "$helm_releases" | python3 -c '
import json, sys
releases = json.load(sys.stdin)
wt = [r for r in releases if "-wt-" in r.get("name", "")]
for r in wt:
    print(r["name"])
' 2>/dev/null || true)"

    local wt_slugs=()
    local wt_path="" wt_branch="" wt_bare=false
    while IFS= read -r line; do
      case "$line" in
        worktree\ *) wt_path="${line#worktree }" ;;
        branch\ *)   wt_branch="${line#branch refs/heads/}" ;;
        bare)        wt_bare=true ;;
        "")
          if [ "$wt_bare" != true ] && [ -n "$wt_path" ]; then
            local basename
            basename="$(basename "$wt_path")"
            if [[ "$basename" == repro-wt-* ]]; then
              wt_slugs+=("${basename#repro-wt-}")
            fi
          fi
          wt_path="" wt_branch="" wt_bare=false
          ;;
      esac
    done < <(git worktree list --porcelain)
    if [ "$wt_bare" != true ] && [ -n "$wt_path" ]; then
      local basename
      basename="$(basename "$wt_path")"
      if [[ "$basename" == repro-wt-* ]]; then
        wt_slugs+=("${basename#repro-wt-}")
      fi
    fi

    local orphaned_releases=()
    while IFS= read -r release; do
      [ -z "$release" ] && continue
      local release_slug
      release_slug="$(printf '%s' "$release" | sed 's/.*-wt-//')"

      local found=false
      for slug in "${wt_slugs[@]}"; do
        if [ "$release_slug" = "$slug" ]; then
          found=true
          break
        fi
      done

      if [ "$found" = false ]; then
        orphaned_releases+=("$release")
      fi
    done <<< "$wt_releases"

    if [ ${#wt_slugs[@]} -gt 0 ]; then
      for slug in "${wt_slugs[@]}"; do
        local release_count=0
        while IFS= read -r release; do
          [ -z "$release" ] && continue
          if [[ "$release" == *"-wt-$slug" ]]; then
            release_count=$((release_count + 1))
          fi
        done <<< "$wt_releases"

        if [ "$release_count" -gt 0 ]; then
          _diag_ok "wt-$slug" "$release_count Helm release(s)"
          _add_check "wt_$slug" "ok" "$release_count Helm release(s)"
        else
          _diag_ok "wt-$slug" "no Helm releases (services may not be started)"
          _add_check "wt_$slug" "ok" "no Helm releases"
        fi
      done
    else
      if [ "$CHECKHEALTH_JSON" != true ]; then
        echo "  ${CLR_DIM}(no worktrees)${CLR_RESET}"
      fi
    fi

    if [ ${#orphaned_releases[@]} -gt 0 ]; then
      for release in "${orphaned_releases[@]}"; do
        _diag_warn "orphan: $release" "no matching worktree"
        _add_check "orphan_$release" "warn" "orphaned Helm release — no matching worktree"
        _add_issue "warning" "Orphaned Helm release '$release' — no matching worktree. Clean up with: helm uninstall $release"
        has_warnings=true
      done
    fi
  else
    _diag_skip "Worktree resources" "helm/kubectl not available"
    _add_check "worktree_resources" "skip" "helm/kubectl not available"
  fi

  if [ "$CHECKHEALTH_JSON" = true ]; then
    local checks_json
    checks_json="$(printf '%s\n' "${json_checks[@]}" | python3 -c '
import json, sys
items = []
for line in sys.stdin:
    line = line.strip()
    if line:
        items.append(json.loads(line))
print(json.dumps(items))
')"

    local issues_json
    issues_json="$(printf '%s\n' "${issues[@]}" | python3 -c '
import json, sys
items = []
for line in sys.stdin:
    line = line.strip()
    if line:
        items.append(json.loads(line))
print(json.dumps(items))
')"

    local healthy=true
    if [ "$has_errors" = true ]; then
      healthy=false
    fi

    printf '{"healthy":%s,"checks":%s,"issues":%s}\n' "$healthy" "$checks_json" "$issues_json"
    if [ "$has_errors" = true ]; then
      return 1
    fi
    return 0
  fi

  if [ ${#issues[@]} -gt 0 ]; then
    echo ""
    echo "${CLR_BOLD}Issues found:${CLR_RESET}"
    for issue_json in "${issues[@]}"; do
      local sev msg
      sev="$(printf '%s' "$issue_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["severity"])')"
      msg="$(printf '%s' "$issue_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["message"])')"
      if [ "$sev" = "error" ]; then
        printf '  %s✗ %s%s\n' "$CLR_RED" "$msg" "$CLR_RESET"
      else
        printf '  %s⚠ %s%s\n' "$CLR_YELLOW" "$msg" "$CLR_RESET"
      fi
    done
  fi

  echo ""

  if [ "$has_errors" = true ]; then
    echo "Runtime health check: ${CLR_RED}issues found${CLR_RESET}"
    return 1
  elif [ "$has_warnings" = true ]; then
    echo "Runtime health check: ${CLR_BOLD}warnings${CLR_RESET} (non-critical)"
    return 0
  else
    echo "${CLR_GREEN}Runtime health check: all healthy${CLR_RESET}"
    return 0
  fi
}
