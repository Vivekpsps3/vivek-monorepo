let meta = #{
    name: "suite-remediation",
    description: "Implement the suite experience plan. A task stays open until a verifier re-runs its tests.",
    when_to_use: "Implement planning/suite-experience-remediation with parallel slices and a verified checklist.",
    phases: [
        #{ title: "Foundation", detail: "Characterize, compose the backend, migrate, one shell" },
        #{ title: "Domains", detail: "Parallel Travel, Media, and Hub slices" },
        #{ title: "Release", detail: "Retry gaps, delete replaced paths, gates, one pull request" },
    ],
};

fn passed_of(r) {
    if r == () {
        false
    } else if !r.success {
        false
    } else if r.output == () {
        false
    } else if type_of(r.output) != "map" {
        false
    } else if r.output.passed != true {
        false
    } else if r.output.tests_exit_code != 0 {
        false
    } else if r.output.evidence == () {
        false
    } else if r.output.evidence == "" {
        false
    } else {
        true
    }
}

fn evidence_of(r) {
    if r == () || !r.success || r.output == () || r.output.evidence == () || r.output.evidence == "" {
        "no verifier evidence"
    } else {
        r.output.evidence
    }
}

fn rules() {
    let p = "Repo /home/vivek/Deployments/vivek-monorepo. Stay on branch suite-experience-remediation. ";
    p += "Never commit or push main. Never deploy. Never touch a production database. ";
    p += "Read the matching section under planning/suite-experience-remediation with read_file before editing. ";
    p += "Net simplification is mandatory. Delete the path you replace in the same change. ";
    p += "Do not add a framework, generic engine, plugin layer, microfrontend, or a helper with one caller. ";
    p += "Keep Finance Angular, the FastAPI server, and each app folder. Do not leave the old stack and a new stack both supported. ";
    p += "You may delete a redundant or useless test. Do not delete a test that locks behavior you keep. Do not lower a coverage floor or skip a suite. ";
    p += "Finance vault plaintext stays in the browser. If dependencies are missing, install the documented dev dependencies and rerun. ";
    p += "Do not commit node_modules, .venv, or database files. Do not edit STATUS.md or 10-execution-board.md. ";
    p
}

fn verify(id, acceptance, tests) {
    let p = "Independent verifier for ";
    p += id;
    p += " in /home/vivek/Deployments/vivek-monorepo. Use read_file, grep, git diff, and the shell. Do not edit any file. Do not trust an implementer report. ";
    p += "ACCEPTANCE: ";
    p += acceptance;
    p += ". TEST COMMAND: ";
    p += tests;
    p += ". Re-run that command yourself. passed is true only if the command exits 0, you saw the acceptance behavior in the current source, and the replaced path is gone when this task replaces one. ";
    p += "A parallel old-plus-new stack means passed is false. tests_exit_code is the integer you observed, or 1 if you did not run the command. ";
    p += "evidence is one line, under 400 characters, with no pipe character, naming the command, the exit code, and the files you inspected.";
    let verdict_schema = #{
        "type": "object",
        "required": ["passed", "tests_exit_code", "evidence"],
        "properties": #{
            "passed": #{ "type": "boolean" },
            "tests_exit_code": #{ "type": "integer" },
            "evidence": #{ "type": "string" },
        },
    };
    agent(p, #{ label: "verify-" + id, capability_mode: "all", output_schema: verdict_schema })
}

fn record(id, ok, ev) {
    let status = "open";
    if ok {
        status = "done";
    }
    let p = "Edit only the ";
    p += id;
    p += " row in planning/suite-experience-remediation/STATUS.md and the checkbox for that same id in planning/suite-experience-remediation/10-execution-board.md. ";
    p += "Set the STATUS cell to ";
    p += status;
    p += ". Replace pipes in the evidence with slashes and keep it on one line. Evidence: ";
    p += ev;
    p += ". Do not change any other row. Check the board box only when status is done. Commit only those checklist files on branch suite-experience-remediation. Never touch main.";
    agent(p, #{ label: "status-" + id, capability_mode: "all" })
}

fn serial_task(id, acceptance, roots, tests) {
    let p = rules();
    p += "TASK ";
    p += id;
    p += ". ACCEPTANCE: ";
    p += acceptance;
    p += ". EDIT ONLY: ";
    p += roots;
    p += ". TESTS: ";
    p += tests;
    p += ". Implement the smallest change that meets the acceptance, then run the tests. Commit on suite-experience-remediation.";
    agent(p, #{ label: "impl-" + id, capability_mode: "all" });
    let v = verify(id, acceptance, tests);
    let ok = passed_of(v);
    record(id, ok, evidence_of(v));
    #{ ok: ok, id: id, acceptance: acceptance, roots: roots, tests: tests }
}

fn isolated_job(id, acceptance, roots, tests) {
    let p = rules();
    p += "You are in an isolated worktree. TASK ";
    p += id;
    p += ". ACCEPTANCE: ";
    p += acceptance;
    p += ". EDIT ONLY: ";
    p += roots;
    p += ". TESTS: ";
    p += tests;
    p += ". Commit your work in this worktree. Return worktree as the absolute pwd, committed true only if the commit succeeded, and a one-line summary.";
    let impl_schema = #{
        "type": "object",
        "required": ["worktree", "committed", "summary"],
        "properties": #{
            "worktree": #{ "type": "string" },
            "committed": #{ "type": "boolean" },
            "summary": #{ "type": "string" },
        },
    };
    #{
        prompt: p,
        label: "impl-" + id,
        capability_mode: "all",
        isolation_worktree: true,
        output_schema: impl_schema,
    }
}

fn run_wave(name, jobs, ids, accepts, roots, tests) {
    log("wave " + name);
    let results = parallel(jobs);
    let prompt = "Integrate isolated worktrees into /home/vivek/Deployments/vivek-monorepo on branch suite-experience-remediation. Never checkout or commit main. ";
    let i = 0;
    for r in results {
        prompt += "Slot ";
        prompt += i.to_string();
        prompt += " ";
        prompt += ids[i];
        prompt += ": ";
        if r == () || !r.success || r.output == () || r.output.worktree == () {
            prompt += "no worktree. ";
        } else {
            prompt += r.output.worktree;
            prompt += ". ";
        }
        i += 1;
    }
    prompt += "For each path that exists, fetch that worktree HEAD and merge it. Keep each task inside its owned directory. Commit the merge. Do not edit STATUS.md.";
    agent(prompt, #{ label: "integrate-" + name, capability_mode: "all" });
    let failed = [];
    let vi = 0;
    for id in ids {
        let v = verify(id, accepts[vi], tests[vi]);
        let ok = passed_of(v);
        record(id, ok, evidence_of(v));
        if !ok {
            failed.push(#{ id: id, acceptance: accepts[vi], roots: roots[vi], tests: tests[vi] });
        }
        vi += 1;
    }
    failed
}

phase("Foundation");
log("Checklist: planning/suite-experience-remediation/STATUS.md. A row stays open until the verifier passes.");
let retries = [];

let qa = serial_task(
    "QA-00",
    "Write planning/suite-experience-remediation/evidence/QA-00.md quoting real output of make test-fast, git status, and the Travel and Media static entry files. Change no application source.",
    "planning/suite-experience-remediation/evidence",
    "test -s planning/suite-experience-remediation/evidence/QA-00.md"
);
if !qa.ok { retries.push(qa); }

let arc1 = serial_task(
    "ARC-01",
    "Read ARC-01 in planning/suite-experience-remediation/14-top-down-refactor.md. Prove one composition path on a real slice and delete the throwaway code. The tree must end with fewer routing or rendering paths than it started. Do not add apps/web while the old bootstraps remain.",
    "apps packages scripts Makefile",
    "make test-fast"
);
if !arc1.ok { retries.push(arc1); }

let arc2 = serial_task(
    "ARC-02",
    "Read ARC-02 in 14-top-down-refactor.md and DEL-08, DEL-09, and DEL-10 in 15-deletion-ledger.md. One create_app, one database lifecycle, one principal. Delete a duplicate only after its tests use the replacement.",
    "apps/server apps/finance/backend apps/travel/backend apps/media/backend",
    "./scripts/coverage-gate.sh server"
);
if !arc2.ok { retries.push(arc2); }

let api1 = serial_task(
    "API-01",
    "Read the contract section of 09-architecture-migrations.md. Keep provider IO outside DB write transactions and return typed errors. Do not rename API prefixes.",
    "apps/server apps/finance/backend apps/travel/backend apps/media/backend",
    "./scripts/coverage-gate.sh server"
);
if !api1.ok { retries.push(api1); }

let db1 = serial_task(
    "DB-01",
    "Read DB-01 in 09-architecture-migrations.md and TRV-02 in 05-travel.md. Add per-date PTO storage and a lossless backfill as one new revision on the existing unified Alembic chain. Do not create a second head.",
    "apps/server/alembic apps/travel",
    "./scripts/coverage-gate.sh travel"
);
if !db1.ok { retries.push(db1); }

let db2 = serial_task(
    "DB-02",
    "Read DB-02 in 09-architecture-migrations.md and MED-01 in 06-media-library.md. Add explicit music membership, portrait, follow, and lifecycle fields with a lossless mapping. One revision after DB-01. No second head.",
    "apps/server/alembic apps/media/backend",
    "./scripts/coverage-gate.sh media"
);
if !db2.ok { retries.push(db2); }

let arc3 = serial_task(
    "ARC-03",
    "Read ARC-03 in 14-top-down-refactor.md. Collapse a duplicate frontend install or config only by deleting the one it replaces. Do not upgrade framework majors. Existing test commands must still run.",
    "apps packages Makefile",
    "make test-fast"
);
if !arc3.ok { retries.push(arc3); }

let ux1 = serial_task(
    "UX-01",
    "Read 03-design-system.md. Apply the existing token and form contract to one representative screen in Finance, Travel, and Media. Do not create a new design-system package.",
    "packages/ui apps/finance/frontend/src apps/site/src apps/travel/backend/static apps/media/backend/static",
    "node --test packages/ui/*.test.mjs packages/browser/runtime/*.test.mjs"
);
if !ux1.ok { retries.push(ux1); }

let nav1 = serial_task(
    "NAV-01",
    "Read NAV-01 in 04-hub-finance.md. One visible Hub control on Finance, Travel, and Media routes at desktop and a narrow viewport. Delete the duplicate control it replaces. Keep deep links.",
    "apps/finance/frontend/src apps/travel/backend/static apps/media/backend/static apps/site/src packages/ui",
    "make test-fast"
);
if !nav1.ok { retries.push(nav1); }

phase("Domains");

let w1_ids = ["TRV-01", "MED-01", "NAV-02"];
let w1_acc = [
    "Read TRV-01 in 05-travel.md. One trip title, dates and destinations first, and a clear change-city action that does not drop data.",
    "Read MED-01 in 06-media-library.md. Library membership is an explicit personal save. Metadata availability must not insert albums or songs.",
    "Read NAV-02 in 04-hub-finance.md. Move Finance onto the persistent Hub control and delete the old Hub or tab duplicate. Guards and deep links still pass.",
];
let w1_roots = ["apps/travel", "apps/media/backend", "apps/finance/frontend"];
let w1_tests = [
    "node --test apps/travel/backend/static/tests/*.test.mjs",
    "./scripts/coverage-gate.sh media",
    "npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI",
];
let w1_failed = run_wave("w1", [
    isolated_job(w1_ids[0], w1_acc[0], w1_roots[0], w1_tests[0]),
    isolated_job(w1_ids[1], w1_acc[1], w1_roots[1], w1_tests[1]),
    isolated_job(w1_ids[2], w1_acc[2], w1_roots[2], w1_tests[2]),
], w1_ids, w1_acc, w1_roots, w1_tests);
for item in w1_failed { retries.push(item); }

let w2_ids = ["TRV-05", "MED-02", "HUB-01"];
let w2_acc = [
    "Read TRV-05 in 05-travel.md. Empty trips show a small add-transport action and quiet days. Remove the always-open verbose builders.",
    "Read MED-02 in 06-media-library.md. Saved artists use the same row or card as other saved items, collapsed, with a separate discography browse.",
    "Read HUB-01 in 04-hub-finance.md. The Hub summary recovers when one app fails and does not load the Finance vault implementation up front.",
];
let w2_roots = ["apps/travel", "apps/media", "apps/finance/frontend apps/site/src"];
let w2_tests = [
    "node --test apps/travel/backend/static/tests/*.test.mjs",
    "node --test apps/media/backend/static/tests/*.test.mjs",
    "npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI",
];
let w2_failed = run_wave("w2", [
    isolated_job(w2_ids[0], w2_acc[0], w2_roots[0], w2_tests[0]),
    isolated_job(w2_ids[1], w2_acc[1], w2_roots[1], w2_tests[1]),
    isolated_job(w2_ids[2], w2_acc[2], w2_roots[2], w2_tests[2]),
], w2_ids, w2_acc, w2_roots, w2_tests);
for item in w2_failed { retries.push(item); }

let w3_ids = ["TRV-02", "MED-04", "WEB-01"];
let w3_acc = [
    "Read TRV-02 in 05-travel.md. Each date has its own PTO choice, weekends default off, and every forecast uses that same choice.",
    "Read MED-04 in 06-media-library.md. Artists are following, not listening. Do not invent song plays.",
    "Read WEB-01 in 04-hub-finance.md. The public site keeps local ECDH secrets, static titles, and one obvious path into the workspace. Delete the retired Flask app and unused socket.io-client if nothing imports them.",
];
let w3_roots = ["apps/travel", "apps/media", "apps/site"];
let w3_tests = [
    "./scripts/coverage-gate.sh travel",
    "./scripts/coverage-gate.sh media",
    "npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI",
];
let w3_failed = run_wave("w3", [
    isolated_job(w3_ids[0], w3_acc[0], w3_roots[0], w3_tests[0]),
    isolated_job(w3_ids[1], w3_acc[1], w3_roots[1], w3_tests[1]),
    isolated_job(w3_ids[2], w3_acc[2], w3_roots[2], w3_tests[2]),
], w3_ids, w3_acc, w3_roots, w3_tests);
for item in w3_failed { retries.push(item); }

let w4_ids = ["TRV-03", "SRC-01", "FIN-01"];
let w4_acc = [
    "Read TRV-03 in 05-travel.md. A flight number and date fill a preview from the provider, and an explicit action overrides it without losing the typed edit.",
    "Read SRC-01 in 07-search-providers.md. Each supported media kind has one concrete search and detail path with pacing and provenance. Delete unused provider branches you replace.",
    "Read FIN-01 in 04-hub-finance.md. Refresh the Finance screens without changing vault crypto, import math, or the net-worth planes.",
];
let w4_roots = ["apps/travel", "apps/media/backend", "apps/finance"];
let w4_tests = [
    "node --test apps/travel/backend/static/tests/*.test.mjs",
    "./scripts/coverage-gate.sh media",
    "./scripts/coverage-gate.sh finance",
];
let w4_failed = run_wave("w4", [
    isolated_job(w4_ids[0], w4_acc[0], w4_roots[0], w4_tests[0]),
    isolated_job(w4_ids[1], w4_acc[1], w4_roots[1], w4_tests[1]),
    isolated_job(w4_ids[2], w4_acc[2], w4_roots[2], w4_tests[2]),
], w4_ids, w4_acc, w4_roots, w4_tests);
for item in w4_failed { retries.push(item); }

let w5_ids = ["TRV-04", "SRC-02"];
let w5_acc = [
    "Read TRV-04 in 05-travel.md. The map renders under the production content policy, or the screen shows a specific geocoder, tile, or no-coordinate error plus the place list.",
    "Read SRC-02 in 07-search-providers.md. The Gentlemen is reproducible for movie and series, relevance is not silently truncated, and partial failure is visible.",
];
let w5_roots = ["apps/travel", "apps/media"];
let w5_tests = [
    "node --test apps/travel/backend/static/tests/*.test.mjs",
    "node --test apps/media/backend/static/tests/*.test.mjs",
];
let w5_failed = run_wave("w5", [
    isolated_job(w5_ids[0], w5_acc[0], w5_roots[0], w5_tests[0]),
    isolated_job(w5_ids[1], w5_acc[1], w5_roots[1], w5_tests[1]),
], w5_ids, w5_acc, w5_roots, w5_tests);
for item in w5_failed { retries.push(item); }

let src3 = serial_task(
    "SRC-03",
    "Read SRC-03 in 07-search-providers.md. Ordinary search is ephemeral. Saved item details remain readable when the provider is down. Delete durable search-history writes.",
    "apps/media",
    "./scripts/coverage-gate.sh media"
);
if !src3.ok { retries.push(src3); }

let med3 = serial_task(
    "MED-03",
    "Read MED-03 in 06-media-library.md. The user can search, preview, choose, and reset a personal artist portrait with attribution and a fallback.",
    "apps/media",
    "node --test apps/media/backend/static/tests/*.test.mjs"
);
if !med3.ok { retries.push(med3); }

let tv1 = serial_task(
    "TV-01",
    "Read TV-01 in 08-tv-progress.md. Mark caught up is idempotent, undo restores the prior marks, and unknown or future air dates are not marked watched.",
    "apps/media",
    "./scripts/coverage-gate.sh media"
);
if !tv1.ok { retries.push(tv1); }

let tv2 = serial_task(
    "TV-02",
    "Read TV-02 in 08-tv-progress.md. A show distinguishes ongoing from ended, and a newly aired episode resurfaces after the user was caught up.",
    "apps/media",
    "node --test apps/media/backend/static/tests/*.test.mjs"
);
if !tv2.ok { retries.push(tv2); }

let err1 = serial_task(
    "ERR-01",
    "Read ERR-01 in 07-search-providers.md. Local validation and provider failure look different, and a partial provider failure names what is missing. Remove the generic alert you replace.",
    "apps/travel apps/media apps/finance/frontend/src apps/site/src",
    "make test-fast"
);
if !err1.ok { retries.push(err1); }

let arc5 = serial_task(
    "ARC-05",
    "Read ARC-05 in 14-top-down-refactor.md. Saved media reads do no provider IO. Search cache is bounded. PTO uses one calculation. Delete the eager path you replace.",
    "apps/media apps/travel",
    "./scripts/coverage-gate.sh media"
);
if !arc5.ok { retries.push(arc5); }

let del = serial_task(
    "DEL-ALL",
    "Read 15-deletion-ledger.md. Delete every candidate whose replacement is already in the tree and whose proof command passes. Leave a candidate in place only when the ledger says to keep it, and name that reason in evidence/DEL-ALL.md. Do not archive dead code into a new folder.",
    "apps packages scripts docs Makefile",
    "make test-fast"
);
if !del.ok { retries.push(del); }

let ux2 = serial_task(
    "UX-02",
    "Read UX-02 in 03-design-system.md. Finish the shared visual cleanup on the screens this refactor changed. Delete superseded CSS. Do not add a second theme engine.",
    "packages/ui apps/finance/frontend/src apps/site/src apps/travel/backend/static apps/media/backend/static",
    "node --test packages/ui/*.test.mjs"
);
if !ux2.ok { retries.push(ux2); }

let doc1 = serial_task(
    "DOC-01",
    "Update README, AGENTS.md, the Makefile, and the docs so they describe the one workflow the tree actually runs. Delete commands for stacks you removed. Doc path checks must pass.",
    "README.md AGENTS.md Makefile docs",
    "make test-fast"
);
if !doc1.ok { retries.push(doc1); }

phase("Release");
log("first-pass open count " + retries.len().to_string());
let still_open = [];
for item in retries {
    let again = serial_task(item.id, item.acceptance, item.roots, item.tests);
    if !again.ok {
        still_open.push(item.id);
    }
}
log("still open after retry " + still_open.len().to_string());

let qa_ok = false;
if still_open.len() == 0 {
    let qa1 = serial_task(
        "QA-01",
        "Run every command in the mandatory gate matrix in planning/suite-experience-remediation/11-verification.md. Write the command and exit code for each to evidence/QA-01.md. This task is done only when every one of those commands exited 0.",
        "planning/suite-experience-remediation/evidence",
        "make test-fast"
    );
    qa_ok = qa1.ok;
    if !qa_ok {
        still_open.push("QA-01");
        record("PR-01", false, "blocked until QA-01 is done");
    }
} else {
    record("QA-01", false, "blocked until every earlier STATUS row is done");
    record("PR-01", false, "blocked until QA-01 is done");
}

if qa_ok {
    let pr = serial_task(
        "PR-01",
        "Open one pull request from suite-experience-remediation to main only if evidence/QA-01.md lists every gate with exit 0. Push that branch only. Never push main. The PR body must link STATUS.md and state that every row is done.",
        "planning/suite-experience-remediation",
        "test -s planning/suite-experience-remediation/evidence/QA-01.md"
    );
    if !pr.ok {
        still_open.push("PR-01");
    }
}

complete(#{
    summary: "suite remediation finished its verified pass",
    still_open: still_open.len(),
});
