# Repository Guidelines

## Stack and Architecture

ShopLedger is a Node.js app using Express 4, `body-parser`, and CommonJS modules. The browser UI is plain HTML, CSS, and JavaScript in `public/`; it calls JSON endpoints with `XMLHttpRequest`. `server.js` serves the UI, mounts the four `routes/` routers under `/api`, and serves printable invoices. The routers handle products, orders, customers, and reports. They call business modules in `lib/` for stock, pricing, GST, coupons, khata credit, invoices, and reporting. `config.js` holds the port and shop, tax, coupon, and inventory settings. `lib/store.js` reads and writes the single data file, `data/db.json`. See `docs/architecture.svg` for the order flow.

## Commands That Work

- `npm start` starts the server on port 3000; set `PORT=4000` to use another port.
- `node --check server.js` checks JavaScript syntax without running the app. Run it on each edited `.js` file.
- `node --test` runs the tests in `test/`; `npm test` remains a placeholder.

## Changes and Tests

Keep fixes scoped to the module or modules relevant to the ticket. Follow the existing two-space indentation, semicolons, and CommonJS style; keep router names plural and lowercase.

Before changing existing behavior, write and run characterization tests that capture the current behavior and relevant edge cases. Use Node's built-in `node:test` and `assert` for new tests, so no dependencies are needed. There is no build step, linter, or frontend bundler.

Tests must never modify this checkout's `data/db.json`. `lib/store.js` hardcodes that path, and mutating API requests write to it. Test pure `lib/` functions with in-memory data. If an HTTP test must write data, run it against an isolated temporary copy of the project and data file, never the live checkout.
