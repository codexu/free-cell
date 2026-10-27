# Bundled Freecell Solver

Upstream: https://github.com/shlomif/fc-solve

The MIT-licensed browser runtime and WebAssembly binary were retrieved from
the project's official browser solver distribution on 2026-10-25:

- https://fc-solve.shlomifish.org/js/libfreecell-solver.min.js
- https://fc-solve.shlomifish.org/js/libfreecell-solver.wasm

The JavaScript file is renamed to `libfreecell-solver.js`, with a copyright
comment and `export default Module` added so a module worker can import it.
The WebAssembly file is unmodified and includes upstream search presets.

Both assets are served locally with the app; solving does not call a server.
The upstream copyright and permission notice are preserved in `LICENSE`.
