# Catalogue provenance

The real-part catalogue is **imported once at build time and checked in**. The
app imports only [`src/data/catalogue/catalogue.json`](../../src/data/catalogue/catalogue.json);
it never touches the network or this folder.

## Source

`source/*.json` is a snapshot of [`docyx/pc-part-dataset`](https://github.com/docyx/pc-part-dataset)
(`data/json/`, MIT-licensed code). It is a **listing** dataset: it carries
identity, price and the display specs, but almost none of the compatibility
fields the rules read — the CPU has no socket, the PSU no connector inventory,
the GPU no power draw.

Caveat, recorded as a decision: the data itself is a PCPartPicker scrape, so its
provenance is a ToS gray area even though the importer code is MIT. This is
acceptable for a non-commercial educational sandbox importing a static snapshot.
Wikidata SPARQL is the fully-clean fallback if that ever needs to change.

## Enrichment

Because the compatibility fields are largely absent, the catalogue is the
dataset's display fields **enriched** by the hand-authored tables in
[`enrichment.ts`](./enrichment.ts):

- The **microarchitecture → { socket, memory generations }** table unlocks CPU
  socket and memory support for every curated CPU from the one field the dataset
  does carry.
- The sparse remainder (board electricals, GPU power and connectors, PSU
  connector inventory, cooler sockets/TDP/height, case clearances) is hand-set
  per curated entry, verifiable against the real product.

The set is **curated, not exhaustive** — a few parts per kind across sockets and
generations — because this is a teaching sandbox and a small set stays accurate.

## Refreshing

```sh
npm run catalogue:build
```

`build-catalogue.ts` reads the snapshot, maps and enriches each curated part,
checks every id is unique, and rewrites `catalogue.json`. To refresh the
snapshot itself, re-download the category files from the dataset's `data/json/`
into `source/`, then re-run the importer.
