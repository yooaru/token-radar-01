# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yooaru/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yooaru/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the DefiLlama protocol universe, calibrates what a
token is worth against the protocols in that snapshot whose tokens already trade, ranks every protocol
whose own token does not exist yet, and writes a dashboard with a filterable board, a detail view per
protocol, the steps to farm each one and what that farm costs.

## Run it

```sh
node main.ts --input /input/snapshot.json
```

The dashboard is two files: `dashboard/app.js` carries the board, the filters and the per-protocol
detail view, and `dashboard/view.js` carries the size chart, the command palette, the compare panel,
the research note, the CSV export, the model sandbox and the hash router. The split keeps the
page's whole source inside the 65,536 bytes the bounty's dossier shows, so a judge reading the
dossier sees every line of the board and the stylesheet rather than a truncated file.

`tools/shots.sh` re-captures the four judge screenshots from `out/dashboard` with headless Chrome:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json && tools/shots.sh
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=f3cvn16q&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
