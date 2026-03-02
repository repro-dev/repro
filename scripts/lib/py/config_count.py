#!/usr/bin/env python3
"""Count services in the reproctl JSON config.

Reads JSON from stdin and prints the number of services.
"""

import json
import sys

data = json.load(sys.stdin)
print(len(data.get("services", [])))
