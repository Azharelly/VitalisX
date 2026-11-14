// Builds public/data/donki_snapshot.json from the raw DONKI files in public/data/.
// The snapshot keeps ONLY the fields the app reads (issue #17). The raw files keep everything,
// so anything dropped here can be brought back by editing this script and running it again.
import { readFileSync, writeFileSync } from "node:fs";

const dir = "public/data/";
const read = (f) => JSON.parse(readFileSync(dir + f, "utf8"));

const linked = (list) => (list ? list.map(({ activityID }) => ({ activityID })) : null);

const slimFlare = (f) => ({
    flrID: f.flrID,
    classType: f.classType,
    peakTime: f.peakTime,
    activeRegionNum: f.activeRegionNum,
    linkedEvents: linked(f.linkedEvents),
    link: f.link,
});

// Only the analyses NASA marks as most accurate, and only speed and half angle.
const slimCme = (c) => ({
    activityID: c.activityID,
    startTime: c.startTime,
    sourceLocation: c.sourceLocation,
    link: c.link,
    cmeAnalyses: (c.cmeAnalyses ?? [])
        .filter((a) => a.isMostAccurate)
        .map((a) => ({ isMostAccurate: true, speed: a.speed, halfAngle: a.halfAngle })),
});

const slimGst = (g) => ({
    gstID: g.gstID,
    startTime: g.startTime,
    allKpIndex: g.allKpIndex ?? [],
    link: g.link,
});

const slimSep = (s) => ({
    sepID: s.sepID,
    eventTime: s.eventTime,
    instruments: s.instruments,
    linkedEvents: linked(s.linkedEvents),
    link: s.link,
});

const snapshot = {
    source: "NASA CCMC DONKI (ccmc.gsfc.nasa.gov/DONKI-API)",
    generated_at: "2026-11-14",
    ranges: {
        flares: "2026-10-01/2026-11-14",
        cme: "2026-10-01/2026-11-14",
        gst: "2026-10-01/2026-11-14",
        sep: "2026-07-17/2026-09-15",
    },
    flares: read("flares.json").map(slimFlare),
    cme: read("cme.json").map(slimCme),
    gst: read("gst.json").map(slimGst),
    sep: read("sep.json").map(slimSep),
};

const text = JSON.stringify(snapshot);
writeFileSync(dir + "donki_snapshot.json", text);
console.log(
    "OK:",
    Object.fromEntries(["flares", "cme", "gst", "sep"].map((k) => [k, snapshot[k].length])),
    `| ${Math.round(text.length / 1024)} KB`
);