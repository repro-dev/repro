#!/usr/bin/env python3
"""Convert newline-delimited strings from stdin into a JSON array.

Reads lines from stdin, strips whitespace, drops empty lines,
and prints the result as a JSON array.
"""

import json
import sys

print(json.dumps([line.strip() for line in sys.stdin if line.strip()]))
