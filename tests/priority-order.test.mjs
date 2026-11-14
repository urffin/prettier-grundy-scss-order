import { test } from "uvu";
import * as assert from "uvu/assert";
import { sortWithPropertyConstraints } from "../src/property-conflicts.mjs";

// Independent linear-scan reference: priority order with original-position ties.
function reference(units, compare, edges) {
    const incoming = units.map(() => 0),
        next = units.map(() => []);
    for (const [a, b] of edges) {
        incoming[b]++;
        next[a].push(b);
    }
    const result = [];
    while (result.length < units.length) {
        let best = -1;
        for (let i = 0; i < units.length; i++) {
            if (incoming[i] === 0 && (best === -1 || compare(units[i].node, units[best].node) < 0)) best = i;
        }
        result.push(best);
        incoming[best] = -1;
        for (const i of next[best]) incoming[i]--;
    }
    return result;
}
const units = ranks => ranks.map((rank, id) => ({ node: { rank, id } }));
const rank = (a, b) => a.rank - b.rank;
const order = (nodes, compare, edges = []) =>
    sortWithPropertyConstraints(nodes, compare, () => null, edges).map(u => u.node.id);

test("Original position breaks ties when earlier nodes become available later", () => {
    assert.equal(order(units([0, 0, 0, 0]), rank, [[0, 1]]), [0, 1, 2, 3]);
    assert.equal(order(units([2, 0, 1, 0]), rank, [[0, 1]]), [3, 2, 0, 1]);
    assert.equal(order([], rank), []);
    assert.equal(order(units([0]), rank), [0]);
    const padding = Array(28).fill(9);
    const tail = padding.map((_, i) => i + 4);
    assert.equal(order(units([0, 0, 0, 0].concat(padding)), rank, [[0, 1]]), [0, 1, 2, 3].concat(tail));
    assert.equal(order(units([2, 0, 1, 0].concat(padding)), rank, [[0, 1]]), [3, 2, 0, 1].concat(tail));
    for (const n of [15, 16, 17]) {
        const nodes = units(Array.from({ length: n }, (_, i) => i % 3));
        const edges = [
            [0, 10],
            [2, 14]
        ];
        assert.equal(order(nodes, rank, edges), reference(nodes, rank, edges));
    }
});

test("Priority queue matches a linear reference on deterministic random forward graphs", () => {
    let seed = 94017;
    const random = n => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % n;
    };
    for (let round = 0; round < 300; round++) {
        const nodes = units(Array.from({ length: random(100) }, () => random(7))),
            edges = [];
        const density = [0, 3, 30, 100][round % 4];
        for (let i = 0; i < nodes.length; i++)
            for (let j = i + 1; j < nodes.length; j++)
                if (random(100) < density) {
                    edges.push([i, j]);
                    if (random(10) === 0) edges.push([i, j]);
                }
        for (const compare of [rank, () => 0, (a, b) => b.id - a.id])
            assert.equal(order(nodes, compare, edges), reference(nodes, compare, edges));
    }
});

test("Dense dependencies and duplicate edges release each node exactly once", () => {
    const nodes = units(Array.from({ length: 100 }, (_, i) => 100 - i)),
        edges = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) edges.push([i, j], [i, j]);
    assert.equal(
        order(nodes, rank, edges),
        nodes.map(u => u.node.id)
    );
});

test("Large independent segments avoid quadratic priority comparisons", () => {
    const nodes = units(Array.from({ length: 1000 }, (_, i) => 1000 - i));
    let comparisons = 0;
    const result = order(nodes, (a, b) => {
        comparisons++;
        return rank(a, b);
    });
    assert.equal(result, nodes.map(u => u.node.id).reverse());
    assert.ok(comparisons < 50_000, `Unexpected comparison count: ${comparisons}`);
});
test.run();
