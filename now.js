// Riga "now" line: the current Riga time plus a status line for the time slot Riga is in.
// The status lines live in lines.js.
(() => {
    // Special slots that also draw from a broader pool, which is also their fallback when empty.
    const MERGED = {
        mondayMorning: "weekdayMorning",
        fridayAfternoon: "weekdayAfternoon",
        sundayEvening: "weekend",
    };

    const LAT = 56.9496;
    const LON = 24.1052;
    const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const RAD = Math.PI / 180;

    const timeEl = document.getElementById("now_time");
    const statusEl = document.getElementById("now_status");
    let format;
    try {
        // hourCycle h23 rather than hour12: false, which renders midnight as "24" in some browsers.
        format = new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Riga",
            year: "numeric", month: "numeric", day: "numeric", weekday: "short",
            hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        });
        format.formatToParts(new Date());
    } catch (e) {
        return;
    }
    // Without lines.js, leave the HTML fallback in place.
    if (!timeEl || !statusEl || typeof LINES !== "object" || !LINES) return;

    function rigaTime(date) {
        const p = {};
        for (const part of format.formatToParts(date)) p[part.type] = part.value;
        return {
            year: +p.year, month: +p.month, day: +p.day, weekday: WEEKDAYS[p.weekday],
            hour: +p.hour % 24, minute: +p.minute,
        };
    }

    // Riga sunset for a calendar date as a UTC timestamp (NOAA solar calculation), or null.
    function sunset(year, month, day) {
        const t = (Date.UTC(year, month - 1, day, 12) / 86400000 + 2440587.5 - 2451545) / 36525;
        const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
        const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
        const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
        const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
            + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t)
            + Math.sin(3 * m * RAD) * 0.000289;
        const omega = 125.04 - 1934.136 * t;
        const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
        const eps = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
            + 0.00256 * Math.cos(omega * RAD);
        const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
        const y = Math.tan(eps * RAD / 2) ** 2;
        const eqTime = 4 / RAD * (y * Math.sin(2 * l0 * RAD)
            - 2 * e * Math.sin(m * RAD)
            + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
            - 0.5 * y * y * Math.sin(4 * l0 * RAD)
            - 1.25 * e * e * Math.sin(2 * m * RAD));
        const cosHa = Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl))
            - Math.tan(LAT * RAD) * Math.tan(decl);
        if (!(cosHa >= -1 && cosHa <= 1)) return null;
        const minutes = 720 - 4 * LON - eqTime + 4 * Math.acos(cosHa) / RAD;
        return Date.UTC(year, month - 1, day) + minutes * 60000;
    }

    // First match wins.
    function slotFor(r, now) {
        const h = r.hour;
        const wd = r.weekday;
        if ((r.month === 6 || r.month === 7) && (h >= 22 || h < 4)) return "midsummer";
        const set = sunset(r.year, r.month, r.day);
        if (set !== null && now >= set - 3600000 && now < set) return "goldenHour";
        if (h >= 2 && h < 6) return "deepNight";
        if (h >= 22 || h < 2) return "night";
        if (wd === 1 && h >= 8 && h < 12) return "mondayMorning";
        if (wd === 5 && h >= 13 && h < 18) return "fridayAfternoon";
        if (wd === 0 && h >= 18) return "sundayEvening";
        if (wd === 0 || wd === 6) return "weekend";
        if (h < 8) return "weekdayEarly";
        if (h < 12) return "weekdayMorning";
        if (h < 13) return "lunch";
        if (h < 18) return "weekdayAfternoon";
        return "evening";
    }

    const linesFor = (key) => (Array.isArray(LINES[key]) ? LINES[key] : []).filter((l) => typeof l === "string");

    // A slot's own lines plus its broader pool, then the fallback pool. Empty means time only.
    function poolFor(s) {
        const pool = linesFor(s).concat(MERGED[s] ? linesFor(MERGED[s]) : []);
        return pool.length ? pool : linesFor("fallback");
    }

    const pad = (n) => String(n).padStart(2, "0");
    // Only the digits change each minute, so the colon's animation keeps running undisturbed.
    const hours = document.createTextNode("");
    const minutes = document.createTextNode("");
    const colon = document.createElement("span");
    colon.id = "now_colon";
    colon.textContent = ":";
    // The status line is a button: clicking it picks a new line, as a page refresh would.
    const line = document.createElement("button");
    line.type = "button";
    line.title = "Show another";
    let slot;

    function pickLine() {
        const pool = poolFor(slot);
        // Skip the line already showing, so a click always changes something.
        const others = pool.filter((l) => l !== line.textContent);
        const choices = others.length ? others : pool;
        line.textContent = choices.length ? choices[Math.floor(Math.random() * choices.length)] : "";
    }

    function render(repick = false) {
        const now = new Date();
        const r = rigaTime(now);
        const s = slotFor(r, now.getTime());
        // Only re-pick on a slot change or a click, so the line stays put while someone reads it.
        if (s !== slot || repick) {
            slot = s;
            pickLine();
        }
        hours.data = pad(r.hour);
        minutes.data = pad(r.minute);
    }

    render();
    timeEl.replaceChildren("Riga, ", hours, colon, minutes);
    statusEl.replaceChildren(line);
    line.addEventListener("click", () => render(true));
    setTimeout(() => {
        render();
        setInterval(() => render(), 60000);
    }, 60000 - Date.now() % 60000);
    // Background tabs throttle timers, so catch up when the page is shown again.
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) render();
    });
})();
