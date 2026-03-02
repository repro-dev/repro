#!/usr/bin/env python3
"""Check whether a service has migrations defined in services.json.

Prints 'yes' if the service has a migrations config, 'no' otherwise.

Environment variables:
  SERVICES_JSON — path to services.json
  SVC_NAME      — service name to check
"""

import json
import os
import sys

with open(os.environ["SERVICES_JSON"]) as f:
    data = json.load(f)
svc = os.environ["SVC_NAME"]
print("yes" if data.get(svc, {}).get("migrations") else "no")
