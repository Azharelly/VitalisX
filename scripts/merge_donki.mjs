import { readFileSync, writeFileSync } from "node:fs";

const dir = "public/data/";
const read = (f) => JSON.parse(readFileSync(dir + f, "utf8"));

const snapshot = {
    source: "NASA CCMC DONKI (ccmc.gsfc.nasa.gov/DONKI-API)",
    generated_at: "2026-11-14",
    ranges: {
        flares: "2026-10-01/2026-11-14",
        cme: "2026-10-01/2026-11-14",
        gst: "2026-10-01/2026-11-14",
        sep: "2026-07-17/2026-09-15",
    },
    flares: read("flares.json"),
    cme: read("cme.json"),
    gst: read("gst.json"),
    sep: read("sep.json"),
};

writeFileSync(dir + "donki_snapshot.json", JSON.stringify(snapshot, null, 2));
console.log(
    "OK:",
    Object.fromEntries(
        ["flares", "cme", "gst", "sep"].map((k) => [k, snapshot[k].length])
    )
);