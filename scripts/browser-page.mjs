import { runtime } from "/bundle.mjs";

const status = document.querySelector("#status");
const detail = document.querySelector("#detail");
try {
    const cases = await (await fetch("/cases.json")).json();
    const rows = [];
    for (const test of cases) {
        rows.push(await runtime.run(test));
        status.textContent = `Running ${rows.length}/${cases.length}`;
    }
    const response = await fetch("/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            environment: {
                userAgent: navigator.userAgent,
                prettier: runtime.prettierVersion,
                document: typeof document,
                window: typeof window,
                nodeProcess: typeof process,
                nodeRequire: typeof require,
                nodeBuffer: typeof Buffer
            },
            rows
        })
    });
    const result = await response.json();
    status.textContent = result.valid ? `Passed ${rows.length}/${rows.length}` : "Failed";
    detail.textContent = JSON.stringify(result, null, 2);
    document.documentElement.dataset.finished = "true";
} catch (error) {
    status.textContent = "Failed";
    detail.textContent = error.stack || String(error);
    await fetch("/failure", { method: "POST", body: detail.textContent }).catch(() => {});
    document.documentElement.dataset.finished = "true";
}
