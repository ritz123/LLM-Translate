# Translator

Desktop translation editor built with **Electron**, **React 19**, **TypeScript**, and **Vite**. Edit a structured source document, manage multiple target locales, and work with machine translation (MT) backends alongside your own edits.

## Requirements

- **Node.js** 22 (recommended; CI uses 22)
- **npm** 10+

## Quick start

From the repository root:

```bash
./scripts/setup.sh          # install dependencies
./run.sh dev                # Electron + Vite hot reload
```

With no command, `./run.sh` runs a **production build** and opens the desktop app (`desktop`).

```bash
./run.sh                    # build + run packaged desktop app
```

## Commands (`./run.sh`)

| Command   | Description |
|-----------|-------------|
| `dev`     | Development: main process watch, Vite, Electron with reload |
| `desktop` | Production build, then launch the app |
| `build`   | Typecheck, Vite build, bundle Electron main |
| `dist`    | Installers for **this** OS into `./release/` (Linux: AppImage + tar.gz; Windows: NSIS + portable) |
| `release` | Bump `package.json` version, commit, tag `v*`, push branch + tag to `origin` (see [Releases](#releases)) |
| `setup`   | `npm ci` / install only (`--force` to reinstall) |
| `help`    | Print full usage |

Equivalent **npm** scripts: `npm run dev`, `npm run desktop`, `npm run build`, `npm run dist`, etc.

## Installers

- **Local:** `./run.sh dist` — artifacts under `release/`.
- **Linux + Windows matrix:** push an annotated tag `v*` (e.g. after `./run.sh release`). GitHub Actions (`.github/workflows/release.yml`) builds both platforms and publishes a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) with attached binaries.

Override the Git remote for `release` with `RELEASE_REMOTE` if needed.

## Documentation

- **[docs/high-level-design.md](docs/high-level-design.md)** — document model, blocks, locales, translation metadata, and assumptions.

## License

This project is licensed under the **GNU General Public License v3.0 only** — see [LICENSE](LICENSE). The About dialog, footer, and startup splash show a short notice derived from `package.json` (`license` field).

## Repository

Upstream metadata in `package.json` points to  
[https://github.com/ritz123/LLM-Translate](https://github.com/ritz123/LLM-Translate)  
(adjust remotes and `repository` / `homepage` fields if you fork or rename the project).
