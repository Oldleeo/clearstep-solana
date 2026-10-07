# Clearstep

Evidence-first receipts for Solana. A public transaction signature becomes an understandable report: recorded instructions, exact account balance changes, historical token permissions, execution outcome, and explicit decoder gaps.

Built by Oldlee with AI-assisted design and development during Crypto World's Fair, starting October 7, 2026. This is a new MVP, with no claimed customers, revenue, partnerships, or security audit. No earlier private project code is reused.

## Run

Requires Node.js 22 or newer. No packages, API keys, wallet, funds, or installation of dependencies are required.

```sh
node server.mjs
# Open http://127.0.0.1:4177
node --test
```

The `public` folder can also be served as a static website. Static mainnet hosting queries PublicNode's Solana endpoint directly (the Solana Foundation endpoint rejected browser requests with HTTP 403 in testing); devnet uses the Solana public endpoint. The localhost server provides a same-origin proxy to Solana public endpoints. The source provider is named in live receipts. Public RPC can throttle or reject traffic, so local JSON import and clearly labeled synthetic examples are available.

## What works

- Finalized transaction lookup using `getTransaction`, `jsonParsed`, and `maxSupportedTransactionVersion: 0`.
- Public address history: ten recent finalized signatures using `getSignaturesForAddress`.
- Program-ID-gated System SOL transfers and SPL Token / Token-2022 transfer, transferChecked, approve, approveChecked, revoke, and setAuthority explanations.
- Every outer and recorded inner instruction has an evidence path. Unknown programs remain unexplained even if some of their inner transfers are decoded.
- Balance deltas at the account level, not an invented wallet profit figure. Historical token owners remain separate.
- Lossless large integer ingestion and BigInt amount calculations.
- Failed transactions label instructions as attempted and rolled back; fees are reported separately.
- Exported receipt + original parsed evidence + SHA-256 artifact hash. The hash proves export integrity, not chain authenticity.
- Responsive accessible UI, local JSON import, no third-party scripts or analytics.

## Verified

14 automated tests cover outcome handling, fees, precision, instruction provenance, metadata gaps, owner changes, v0 account resolution, and the local server's origin/input/path controls. A finalized mainnet transaction was fetched and displayed in the actual browser; this does not establish broad decoder coverage. Synthetic examples are explicitly labeled and have no real signatures.

## Boundaries

This is a historical transaction reader. It does not sign, simulate before signing, certify safety, query current allowances, or decode every program/Token-2022 extension. JSON imports have unverified provenance. RPC responses are trusted as observations from the selected provider; no validator quorum is used. Native and wrapped SOL changes can describe overlapping balances and must not be summed blindly. Token changes without owner metadata stay unattributed. Fees, rent and closing accounts affect native deltas. Tokens are identified by mint, without fabricated names or prices.

The localhost server is bound to loopback, serves an explicit file allowlist, limits request size/concurrency, permits only two fixed RPC endpoints and two read-only methods, and validates decoded input lengths. Do not expose that development server publicly without production rate limits and operational hardening.

## Layout

`public/parser.mjs`: portable deterministic decoder.

`public/app.mjs`: DOM renderer and evidence export; untrusted strings are rendered with textContent.

`public/fixtures.mjs`: labeled synthetic demonstrations.

`server.mjs`: built-in Node HTTP server and read-only RPC proxy.

`test/receipt.test.mjs`: meaningful parser and HTTP tests.

## Product direction

Start with Solana creators and support teams who need to explain a payment or allowance without asking users to connect wallets. Validate through five opt-in support workflows, measure correct comprehension and time-to-resolution, then consider a hosted team inbox and embeddable receipt SDK. No such validation has happened yet. A future paid team workspace would preserve a free open-source decoder. Current pricing and market demand are unvalidated hypotheses.

Sources: [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction), [getSignaturesForAddress](https://solana.com/docs/rpc/http/getsignaturesforaddress), [Crypto World's Fair](https://colosseum.com/worldsfair).

MIT license. AI assistance is disclosed; reviewers should inspect and test the code.
