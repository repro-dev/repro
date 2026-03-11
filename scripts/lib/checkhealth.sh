#!/bin/bash
#
# scripts/lib/checkhealth.sh — runtime health checks
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/cluster.sh to be loaded first.

CHECKHEALTH_JSON=false

_diag_rows=()

_diag_row() {
  local name="$1" status="$2" detail="$3"
  _diag_rows+=("${name}"$'\t'"${status}"$'\t'"${detail}")
}

_diag_flush() {
  if [ "$CHECKHEALTH_JSON" = true ]; then
    _diag_rows=()
    return
  fi

  if [ ${#_diag_rows[@]} -eq 0 ]; then
    return
  fi

  local max_name=0 max_status=0
  for entry in "${_diag_rows[@]}"; do
    local name status
    IFS=$'\t' read -r name status _ <<< "$entry"
    [ ${#name} -gt $max_name ] && max_name=${#name}
    [ ${#status} -gt $max_status ] && max_status=${#status}
  done

  for entry in "${_diag_rows[@]}"; do
    local name status detail
    IFS=$'\t' read -r name status detail <<< "$entry"

    local color
    case "$status" in
      ok)      color="$CLR_GREEN" ;;
      warn)    color="$CLR_YELLOW" ;;
      error)   color="$CLR_RED" ;;
      *)       color="$CLR_DIM" ;;
    esac

    printf '  %s%-*s%s  %s%-*s%s  %s\n' \
      "$CLR_BOLD" "$max_name" "$name" "$CLR_RESET" \
      "$color" "$max_status" "$status" "$CLR_RESET" \
      "$detail"
  done

  _diag_rows=()
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
    _diag_row "Tilt daemon" "ok" "running (http://localhost:$TILT_PORT)"
    _add_check "tilt" "ok" "running (http://localhost:$TILT_PORT)"
  else
    _diag_row "Tilt daemon" "error" "not running"
    _add_check "tilt" "error" "not running"
    _add_issue "error" "Tilt is not running — start services with: reproctl start <service>"
    has_errors=true
  fi

  if command -v kubectl > /dev/null 2>&1 && kubectl cluster-info > /dev/null 2>&1; then
    local node_count
    node_count="$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')"
    _diag_row "Kubernetes cluster" "ok" "$CLUSTER_NAME ($node_count node(s))"
    _add_check "kubernetes" "ok" "$CLUSTER_NAME ($node_count node(s))"
  else
    _diag_row "Kubernetes cluster" "error" "not accessible"
    _add_check "kubernetes" "error" "not accessible"
    _add_issue "error" "Kubernetes cluster not accessible — run: reproctl cluster up"
    has_errors=true
  fi

  if ! command -v docker > /dev/null 2>&1 || ! docker info > /dev/null 2>&1; then
    _diag_row "Container registry" "skip" "Docker not available"
    _add_check "registry" "skip" "Docker not available"
  elif registry_exists; then
    local reg_port
    reg_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
    if curl -sf "http://localhost:${reg_port}/v2/" > /dev/null 2>&1; then
      _diag_row "Container registry" "ok" "$REGISTRY_NAME (port $reg_port, API reachable)"
      _add_check "registry" "ok" "$REGISTRY_NAME (port $reg_port)"
    else
      _diag_row "Container registry" "warn" "$REGISTRY_NAME running but API not reachable on port $reg_port"
      _add_check "registry" "warn" "running but API not reachable"
      _add_issue "warning" "Container registry running but API not reachable on port $reg_port"
      has_warnings=true
    fi
  else
    _diag_row "Container registry" "error" "$REGISTRY_NAME not running"
    _add_check "registry" "error" "$REGISTRY_NAME not running"
    _add_issue "error" "Container registry not running — run: reproctl cluster up"
    has_errors=true
  fi

  local ports=(80 443 15432)
  local port_names=("HTTP/ingress" "HTTPS/ingress" "PostgreSQL")
  if command -v lsof > /dev/null 2>&1; then
    for i in "${!ports[@]}"; do
      local port="${ports[$i]}"
      local pname="${port_names[$i]}"
      local listener
      listener="$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | tail -1 | awk '{print $1}' || true)"
      if [ -n "$listener" ]; then
        _diag_row "Port $port" "ok" "bound ($pname, $listener)"
        _add_check "port_$port" "ok" "bound ($pname, $listener)"
      else
        _diag_row "Port $port" "warn" "not bound ($pname)"
        _add_check "port_$port" "warn" "not bound ($pname)"
        _add_issue "warning" "Port $port ($pname) is not bound — service may not be started"
        has_warnings=true
      fi
    done
  else
    for i in "${!ports[@]}"; do
      local port="${ports[$i]}"
      local pname="${port_names[$i]}"
      _diag_row "Port $port" "skip" "cannot check ($pname, lsof not available)"
      _add_check "port_$port" "skip" "cannot check ($pname, lsof not available)"
    done
  fi

  _diag_flush

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
      local svc_line
      while IFS= read -r svc_line; do
        [ -z "$svc_line" ] && continue
        local svc_name svc_status svc_detail
        svc_name="$(printf '%s' "$svc_line" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
        svc_status="$(printf '%s' "$svc_line" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"
        svc_detail="$(printf '%s' "$svc_line" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("detail",""))')"
        _diag_row "$svc_name" "$svc_status" "$svc_detail"
      done < <(printf '%s' "$svc_results" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for s in data.get("services", []):
    print(json.dumps(s))
')
    fi

    _diag_flush

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
    _diag_row "Services" "skip" "Tilt not running — cannot check service health"
    _add_check "services" "skip" "Tilt not running"
    _diag_flush
  fi

  if [ "$CHECKHEALTH_JSON" != true ]; then
    echo ""
    echo "${CLR_BOLD}Worktree resources:${CLR_RESET}"
  fi

  local wt_slugs=()
  local wt_path="" wt_bare=false
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   ;;
      bare)        wt_bare=true ;;
      "")
        if [ "$wt_bare" != true ] && [ -n "$wt_path" ]; then
          local basename
          basename="$(basename "$wt_path")"
          if [[ "$basename" == repro-wt-* ]]; then
            wt_slugs+=("${basename#repro-wt-}")
          fi
        fi
        wt_path="" wt_bare=false
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

  local tilt_wt_resources=""
  if tilt_is_running; then
    tilt_wt_resources="$(tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null | python3 -c '
import json, sys
data = json.load(sys.stdin)
for item in data.get("items", []):
    name = item.get("metadata", {}).get("name", "")
    if "-wt-" in name:
        print(name)
' 2>/dev/null || true)"
  fi

  if [ ${#wt_slugs[@]} -gt 0 ]; then
    local active_slugs=()
    local idle_slugs=()

    for slug in "${wt_slugs[@]}"; do
      local resource_count=0
      if [ -n "$tilt_wt_resources" ]; then
        while IFS= read -r res_name; do
          [ -z "$res_name" ] && continue
          if [[ "$res_name" == *-wt-"$slug" ]]; then
            resource_count=$((resource_count + 1))
          fi
        done <<< "$tilt_wt_resources"
      fi

      if [ "$resource_count" -gt 0 ]; then
        active_slugs+=("$slug"$'\t'"$resource_count")
      else
        idle_slugs+=("$slug")
        _add_check "wt_$slug" "ok" "idle"
      fi
    done

    if [ ${#active_slugs[@]} -gt 0 ]; then
      for entry in "${active_slugs[@]}"; do
        local slug resource_count
        IFS=$'\t' read -r slug resource_count <<< "$entry"

        local display_slug="$slug"
        if [ ${#display_slug} -gt 40 ]; then
          display_slug="${display_slug:0:37}..."
        fi

        _diag_row "wt-$display_slug" "ok" "$resource_count Tilt resource(s)"
        _add_check "wt_$slug" "ok" "$resource_count Tilt resource(s)"

        local dns_label="wt-${slug}"
        if [ ${#dns_label} -gt 63 ]; then
          _diag_row "wt-$display_slug DNS" "warn" "hostname label exceeds 63-byte DNS limit"
          _add_check "wt_${slug}_dns" "warn" "DNS label too long"
          _add_issue "warning" "Worktree slug '$slug' produces a DNS label longer than 63 bytes — .localhost resolution will fail. Consider a shorter branch name or see REP-361."
          has_warnings=true
        else
          local dns_hostname="app.wt-${slug}.repro.localhost"
          if python3 -c "import socket; socket.getaddrinfo('$dns_hostname', 80)" >/dev/null 2>&1; then
            _diag_row "wt-$display_slug DNS" "ok" "$dns_hostname resolves"
            _add_check "wt_${slug}_dns" "ok" "$dns_hostname resolves"
          else
            _diag_row "wt-$display_slug DNS" "warn" "$dns_hostname does not resolve"
            _add_check "wt_${slug}_dns" "warn" "$dns_hostname does not resolve"
            _add_issue "warning" "DNS for $dns_hostname does not resolve — browser DNS-over-HTTPS (DoH) may bypass OS resolver. Disable DoH or add entries to /etc/hosts."
            has_warnings=true
          fi
        fi
      done
    fi

    if [ ${#idle_slugs[@]} -gt 0 ]; then
      local idle_list=""
      for slug in "${idle_slugs[@]}"; do
        if [ -n "$idle_list" ]; then
          idle_list="$idle_list, "
        fi
        idle_list="${idle_list}${slug}"
      done
      _diag_row "${#idle_slugs[@]} idle worktree(s)" "ok" "$idle_list"
    fi
  else
    if [ "$CHECKHEALTH_JSON" != true ]; then
      echo "  ${CLR_DIM}(no worktrees)${CLR_RESET}"
    fi
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
    print(r["name"] + "\t" + r.get("namespace", "default"))
' 2>/dev/null || true)"

    local orphaned_releases=()
    if [ -n "$wt_releases" ]; then
      while IFS=$'\t' read -r release_name release_ns; do
        [ -z "$release_name" ] && continue

        local found=false
        if [ ${#wt_slugs[@]} -gt 0 ]; then
          for slug in "${wt_slugs[@]}"; do
            local expected
            for svc_base in $(_list_service_names) gateway; do
              expected="$(python3 "$SCRIPTS_DIR/lib/py/wt_name.py" "$svc_base" "$slug")"
              if [ "$release_name" = "$expected" ]; then
                found=true
                break
              fi
            done
            [ "$found" = true ] && break
          done
        fi

        if [ "$found" = false ]; then
          orphaned_releases+=("$release_name"$'\t'"${release_ns:-default}")
        fi
      done <<< "$wt_releases"
    fi

    if [ ${#orphaned_releases[@]} -gt 0 ]; then
      for entry in "${orphaned_releases[@]}"; do
        local release_name release_ns
        IFS=$'\t' read -r release_name release_ns <<< "$entry"
        _diag_row "orphan: $release_name" "warn" "no matching worktree"
        _add_check "orphan_$release_name" "warn" "orphaned Helm release — no matching worktree"
        _add_issue "warning" "Orphaned Helm release '$release_name' — no matching worktree. Clean up with: helm uninstall $release_name --namespace $release_ns"
        has_warnings=true
      done
    fi
  fi

  _diag_flush

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
