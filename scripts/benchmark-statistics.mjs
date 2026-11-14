export function statistics(values, unit = "Ms") {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const quantile = fraction => {
        const index = (sorted.length - 1) * fraction;
        const lower = Math.floor(index);
        return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
    };
    return {
        [`median${unit}`]: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        [`q1${unit}`]: quantile(0.25),
        [`q3${unit}`]: quantile(0.75),
        [`samples${unit}`]: values
    };
}

export const memoryFields = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers", "maxRSS"];

export function summarizeMemory(records) {
    const result = {};
    for (const stage of ["before", "after", "afterGC"]) {
        result[stage] = Object.fromEntries(
            memoryFields.map(field => [
                field,
                statistics(
                    records.map(r => r.snapshots[stage][field]),
                    "Bytes"
                )
            ])
        );
    }
    for (const [stage, name] of [
        ["after", "deltaAfter"],
        ["afterGC", "deltaAfterGC"]
    ]) {
        // Subtract within each process before aggregating. A negative delta is
        // valid; GC can reclaim startup allocations as well as operation data.
        result[name] = Object.fromEntries(
            memoryFields
                .filter(field => field !== "maxRSS")
                .map(field => [
                    field,
                    statistics(
                        records.map(r => r.snapshots[stage][field] - r.snapshots.before[field]),
                        "Bytes"
                    )
                ])
        );
    }
    return result;
}
