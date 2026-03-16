import sys


def levenshtein(a, b):
    m, n = len(a), len(b)
    if m == 0:
        return n
    if n == 0:
        return m

    prev = list(range(n + 1))
    curr = [0] * (n + 1)

    for i in range(1, m + 1):
        curr[0] = i
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev, curr = curr, prev

    return prev[n]


def suggest(unknown, known_commands, max_distance=2):
    suggestions = set()

    for cmd in known_commands:
        if cmd.startswith(unknown) or (
            unknown.startswith(cmd) and len(unknown) < len(cmd) + 2
        ):
            suggestions.add(cmd)
        elif (
            abs(len(unknown) - len(cmd)) <= max_distance
            and min(len(unknown), len(cmd)) > max_distance
            and levenshtein(unknown, cmd) <= max_distance
        ):
            suggestions.add(cmd)

    return sorted(suggestions)


def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    unknown = sys.argv[1]
    known = sys.argv[2:]

    if not known:
        sys.exit(1)

    results = suggest(unknown, known)

    if results:
        for s in results:
            print(s)
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
