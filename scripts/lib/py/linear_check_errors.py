#!/usr/bin/env python3
"""Check a Linear GraphQL response for errors.

Reads a JSON response from stdin. If the response contains a non-empty
``errors`` field, prints the errors to stdout and exits with code 1.
Otherwise exits with code 0 and produces no output.
"""

import json
import sys

data = json.load(sys.stdin)
errors = data.get("errors")

if isinstance(errors, list) and errors:
    print(json.dumps(errors))
    sys.exit(1)
elif errors and not isinstance(errors, list):
    print(json.dumps(errors))
    sys.exit(1)
