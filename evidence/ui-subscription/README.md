# UI spacing, authentication & official news subscription evidence

| File | Contents |
| --- | --- |
| `before-homepage-header.png` | Baseline desktop homepage showing header overlap and congested hero shortcuts |
| `homepage.html` | Live `/en` HTML after repair (markers: `home-flow`, `official-stories`, `news-subscribe`) |
| `official.html` | Live `/en/news/official` HTML (filters + subscribe band) |
| `npm-test.txt` | Full suite — 58/58 pass |
| `typecheck.txt` | `tsc --noEmit` — pass |
| `npm-build.txt` | Production `next build` — pass |

Interactive browser screenshots of logged-in dashboards and after-state hero were not captured here (no GUI browser automation in this session). Live HTTP checks on `localhost:3010` confirmed the public markers above.
