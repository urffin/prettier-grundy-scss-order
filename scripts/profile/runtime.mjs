// Used only by generated profiling snapshots, never by production sources.
export const profile = {
    enabled: false,
    stack: [],
    phases: {},
    counts: {},
    segments: [],
    orderedPairs: new Set(),
    unorderedPairs: new Set(),
    reset() {
        if (this.stack.length) throw new Error("Unclosed profile phase");
        this.phases = {};
        this.counts = {};
        this.segments = [];
        this.orderedPairs = new Set();
        this.unorderedPairs = new Set();
    },
    enter(name) {
        if (!this.enabled) return null;
        const frame = { name, start: performance.now(), children: 0 };
        this.stack.push(frame);
        return frame;
    },
    leave(frame) {
        if (!frame) return;
        const elapsed = performance.now() - frame.start;
        if (this.stack.pop() !== frame) throw new Error("Profile phase nesting differs");
        const result = (this.phases[frame.name] ??= { calls: 0, inclusiveMs: 0, exclusiveMs: 0 });
        result.calls++;
        result.inclusiveMs += elapsed;
        result.exclusiveMs += elapsed - frame.children;
        if (this.stack.length) this.stack.at(-1).children += elapsed;
    },
    measure(name, action) {
        const frame = this.enter(name);
        try {
            return action();
        } finally {
            this.leave(frame);
        }
    },
    async async(name, action) {
        const frame = this.enter(name);
        try {
            return await action();
        } finally {
            this.leave(frame);
        }
    },
    inc(name, value = 1) {
        if (this.enabled) this.counts[name] = (this.counts[name] ?? 0) + value;
    },
    pair(first, second) {
        if (!this.enabled || first === null || second === null) return;
        this.orderedPairs.add(JSON.stringify([first.raw, second.raw]));
        this.unorderedPairs.add(JSON.stringify(first.raw <= second.raw ? [first.raw, second.raw] : [second.raw, first.raw]));
    },
    segment(units, propertyName, extra) {
        if (!this.enabled) return;
        const properties = units.map(u => propertyName(u.node));
        const declarations = properties.filter(p => p !== null).length;
        const row = {
            units: units.length,
            declarations,
            extraEdges: extra.length,
            properties,
            _start: {
                checks: this.counts.predicateChecks ?? 0,
                nullChecks: this.counts.nullPredicateChecks ?? 0,
                edges: this.counts.propertyEdges ?? 0,
                dense: this.counts.denseFallbacks ?? 0
            }
        };
        this.segments.push(row);
        this.inc("segments");
        this.inc("segmentUnits", units.length);
        this.inc("possibleUnitPairs", (units.length * (units.length - 1)) / 2);
        this.inc("possibleDeclarationPairs", (declarations * (declarations - 1)) / 2);
        if (units.length >= 2 && declarations === 0 && extra.length === 0) this.inc("noDeclarationGraphs");
        if (units.length >= 2 && declarations < 2 && extra.length === 0) this.inc("atMostOneDeclarationGraphs");
        return row;
    },
    finishSegment(row) {
        if (!row) return;
        row.predicateChecks = (this.counts.predicateChecks ?? 0) - row._start.checks;
        row.nullChecks = (this.counts.nullPredicateChecks ?? 0) - row._start.nullChecks;
        row.propertyEdges = (this.counts.propertyEdges ?? 0) - row._start.edges;
        row.path =
            row.units < 2 ? "trivial"
            : row.units < 32 ? "direct"
            : (this.counts.denseFallbacks ?? 0) > row._start.dense ? "dense"
            : "index";
        delete row._start;
    },
    result() {
        if (this.stack.length) throw new Error("Unclosed profile phase");
        return {
            phases: this.phases,
            counts: {
                ...this.counts,
                uniqueOrderedPairs: this.orderedPairs.size,
                uniqueUnorderedPairs: this.unorderedPairs.size
            },
            segments: this.segments
        };
    }
};
