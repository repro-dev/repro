#!/usr/bin/env python3
"""Check if a service name exists in services.json.

Exits 0 if the service exists, 1 otherwise.

Usage:
  is_known_service.py <service-name> <services-json-path>
"""

import json
import sys

svc = sys.argv[1]
with open(sys.argv[2]) as f:
    services = json.load(f)
sys.exit(0 if svc in services else 1)
