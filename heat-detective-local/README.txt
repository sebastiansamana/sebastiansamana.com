HEAT DETECTIVE — LOCAL SIMULATION BRIDGE

Double-click START_LOCAL.cmd with Node.js installed. It reuses a healthy local
bridge, otherwise starts one hidden, checks readiness, and opens the demo at:
http://127.0.0.1:8780/heat-detective/

PowerShell alternative: START_LOCAL.ps1. Add -NoBrowser for a readiness check
without opening another browser tab. The launcher prepares the private engine;
it never starts a simulation. The previous port 8767 service is left untouched.

The local page connects automatically after the prepared model is uploaded;
the public page uses its explicit Connect control. GET /api/health returns
authToken. POST /api/analyse requires that value as X-Heat-Detective-Token.
Only the loopback host and explicit sebastiansamana.com origins are accepted;
the service listens on 127.0.0.1, never on the network's external interface.
Do not publish the runtime folder or expose this service through a tunnel.

DEPENDENCIES
Licensed Windows Rhino 8, Grasshopper, Ladybug/Honeybee, OpenStudio/EnergyPlus.
The exact source .gh, source .3dm, original EPW and semantic object manifest
are local copies under runtime/. Their known hashes are checked by the server.
No installation-wide settings or packages are changed by the bridge.

HOW A LIVE RUN WORKS
POST /api/warmup prepares one new Rhino.Application.8 automation process.
It never attaches to the user's current Rhino. Its random worker identity,
PID and process-start timestamp are checked before every dispatch; all other
existing Rhino processes remain protected. The engine stays prepared for up
to 60 idle minutes, then closes. It also closes if its bridge heartbeat ends.
Health reports warmWorker.state as starting, ready, busy, stopped or failed.

Every uncached request still copies the exact source model into its own job,
opens a fresh document, restores semantic layers, applies absolute edits and
loads a fresh Grasshopper document. Object GUIDs restore the original analysis
layer categories; only objects marked editable on the supplied changable layer
may be translated. A full fresh EnergyPlus calculation is performed.

After each run the GH document is disposed and the owned Rhino document is
reset to a new empty document with a different serial. Source bytes are checked
again. Reuse requires a successful cleanup receipt; failures quarantine and
close only that worker. No geometry, simulation SQL or model output is reused
between fresh analyses. Preparation retains only the application and libraries.

The original Grasshopper file is loaded. Its FF component code and locked
evaluation inputs remain unchanged. The weather download is replaced by a
byte-identical local EPW input. With includeSolar:true, the hot-week Ladybug
Incident Radiation dependency graph also runs on the transformed model.
Annual radiation and other unnecessary visual branches remain disabled.
The official EnergyPlus component and its original dependency graph
are actually solved, then its new 168-hour output is read. Each job has its
own weather and simulation output folder. No 3dm or gh source is saved.

PAUSE AND REVISION HANDLING
Editing does not execute anything. Resume submits a complete set of absolute
translations from source geometry, in metres, Z up. Only one simulation runs
at a time. Pause prevents new requests; an already started EnergyPlus run may
finish. The client must ignore results whose revision no longer matches the
edited model. A newer revision is never silently assigned an older result.

SCIENTIFIC SCOPE
The organiser definition keeps a fixed single atrium thermal room. Wall moves
do not change room boundaries, volume, floor area, occupancy or internal mass.
Geometry changes can affect measured glazing and shading; interior objects or
surfaces below the clerestory may have no effect at all. This is not a whole
building simulation, CFD model, thermal-bridge solver or structural assessment.

Current screenOpacity must be 0: no implicit shading multiplier is applied.
Only geometry actually read by the GH definition affects its shading result.

The prepared private runtime now matches the competition package pins and
EnergyPlus 25.2.0. Its executed baseline reproduced score 320.6 K.h and EVAL ID
EC2F526D. Every live result still reports the actual EVAL ID and engine version.
Only compare runs with identical EVAL IDs and engine fingerprints. The supplied EC2F526D reference is
separate from a newly calculated local baseline. GET /api/health and job results
include the session's latest unchanged baseline after one completes.

AUDIT FILES
runtime/jobs/<first 12 UUID hex characters>/request.json, progress.json,
result.json and launcher.log. Short directory names avoid native Windows path
limits. The verified baseline persists in runtime/baseline.json and reloads
only when model, definition, weather and private engine-config hashes match.
Result provenance includes source model, definition, weather and normalized
input SHA256 fingerprints, Rhino process ID, actual EVAL ID, engine version,
timestamps and changed object count. A failure is returned as a failure.

PRESENTATION RELIABILITY
Engine preparation and production fresh runs each have a 120-second deadline.
Fresh-run time is measured from submission,
including Rhino startup. Timeout is status failed with errorCode TIME_LIMIT;
it never becomes a calculated result. The presenter should use the separately
labelled recorded example instead of waiting for a long startup.

Only completed local physical executions can be cached. Every cache request
rechecks the source model/GH/weather bytes and requires identical normalized
parameters, object GUID translations, model/GH/weather/engine-config hashes.
The response explicitly uses mode and executionSource verified-cache, keeps
the original calculation timestamps, and identifies its source job. Revision
may change for the UI, but originalRevision remains in provenance.cache.
Previously verified cases can be returned even while worker cleanup is pending.
Failed, timed-out, incomplete and supplied-reference results are never cached.

The deadline creates cancel.flag and closes only the recorded new worker with
matching process-start identity. Every existing Rhino PID is protected. If COM
startup has not yet returned an owned PID, the UI still stops waiting at 120 s;
the active worker slot stays locked until the launcher safely releases its COM
instance. The bridge never guesses an unknown process identity. No new solve
starts in that slot while cleanup is pending.

Local diagnostics now include ownership.json, simulation-cli.json (CLI exit,
stdout/stderr), native-process-*.json (native exits), timing.json, and optional
watchdog.json. Instrumentation does not edit FF source or solver inputs.
For a controlled cleanup test only, a separate loopback port can use
HEAT_DETECTIVE_DIAGNOSTIC_TIMEOUT_SECONDS=1..120; normal launch uses 120 s.
Authenticated forceFresh:true on /api/analyse explicitly bypasses verified
result reuse for measurement; all normal source/input validation still applies.

WARM WORKER VALIDATION
Measured preparation took 33.995 s and 58.085 s in two sessions; allow about
one minute for this once per session. Four forced fresh analyses on the same owned
worker completed in 35.599 / 39.568 / 44.110 / 45.003 s including reset. They
were baseline, night ventilation 5 ACH, roof +5 m, then baseline reset. All
168 operative, air and outdoor hourly values matched the respective earlier
cold calculations exactly. Four new native EnergyPlus executions were verified.
The final baseline reset reproduced 320.6 K.h, proving no roof edit carried over.
The API exposes a fresh result as soon as its complete output, revision and
source fingerprints validate. cleanupPending remains true while the private
worker resets, and its active slot remains locked. Only a verified successful
reset admits the result to the cache/baseline. A separate 30 s cleanup deadline
retires a stuck worker without relabelling a completed physical result.
The final browser test (a new night ventilation 4 ACH setting) displayed a
fresh live result at 43.095 s; worker reset finished at 55.041 s. Its score
was 248.7 K.h, peak 39.453849 C and 39 occupied hours above 28 C. SQL verified
all 168 hourly values. Actual times vary with machine load; no subsecond fresh
simulation is claimed. Verified exact repeats remain a separate cache path.

The reported failure 92d8fc286701 had no SQL and an empty native error file,
after unusually slow Rhino startup. Its exact request subsequently completed
in 55.00 s with valid SQL, score 305.7 K.h and EVAL EC2F526D. Its original IDF also
completed directly in EnergyPlus, exit 0. Historical failure cause remains
unproven; no geometry-invalidity or OneDrive-lock cause has been established.

All source and backend additions belong only to the separate Hackathon clone.
The protected original Samana repository is not opened or changed here.

VERIFIED DEMO RUNS — 16 OCTOBER 2026
Three fresh runs of the supplied definition completed with EVAL ID EC2F526D:
* Unchanged case: score 320.6 K.h; peak 40.466707 C; 46 occupied hours >28 C.
* One editable roof object translated +5 m in Z: score 320.2 K.h;
  peak 40.462118 C; 46 occupied hours >28 C.
* Geometry reset, night ventilation changed from 1 to 6 ACH: score 235.9 K.h;
  peak 39.270930 C; 39 occupied hours >28 C.
Each result contains 168 freshly calculated hourly values. The two design
changes were submitted through the browser demo, not a lookup-table endpoint.
These are model-specific results, not a universal claim about moving roofs.

Reliability follow-up: an uncached night-ventilation 5 ACH run completed in
75.469 s, with score 241.2 K.h, peak 39.347190 C, EVAL EC2F526D, and both CLI
and native EnergyPlus exit 0. A separate diagnostic-port 45 s timeout test
reported TIME_LIMIT at 45.0 s and closed only its recorded new Rhino worker.
The production deadline remains 120 s. Exact-input verified cache reuse was
measured at 402 ms, retaining the original execution timestamps.

Peak metrics use the maximum of the actual hourly output before rounding.
The original GH card's one-decimal peak is retained as ghReportedPeakOperativeC.
Cached baseline reload after bridge restart was verified. Fifteen independent
HTTP guardrail requests were rejected without starting any simulation.
Those earlier per-run workers closed; original user Rhino PID 36596 remained.
The protected original repository's 507 tracked files still matched the saved
SHA256 manifest, including both pre-existing user edits.

EDITED SOLAR MAP — 16 OCTOBER 2026
Resume now requests both the thermal result and the actual hot-week mesh/face
values from LB Incident Radiation 1.10.0. The coloured mesh follows current
transformed envelope geometry. A solar failure is reported separately from a
valid thermal result; no old colours are substituted as an updated result.

The private solar dependency is official Radiance 6.0.2 in
runtime/engine/radiance6. Only the owned process receives its RAYPATH and
Ladybug configuration. No global Rhino settings or source GH code are edited.
Distribution: LBNL-ETA/Radiance, rad6R0P2, Radiance_c1700d56_Windows.zip.
SHA256: c4f02efcb4a33f4a43b7ce0ba58100544abc317a1be61f7b0425a64a66eb8a09.
Runtime binaries remain local and ignored by Git. Keep the prepared runtime
with this launcher; the source-only checkpoint does not bundle dependencies.

Validation: unchanged building returned 5,531 analysed faces. Roof object
486218b6-a4c4-45d2-a333-cb93a3080b22 translated +5 m on Z returned 5,547 faces.
Nineteen original roof faces were found at their translated coordinates;
18 changed by over 0.11 kWh/m2. Another 254 unchanged-position faces changed
by over 0.11 kWh/m2, confirming recalculated shading rather than moved colours.
Matched warm-worker timings: 36.2 seconds thermal-only, 41.9 seconds with solar
(+5.7 seconds); the Ladybug component itself took 4.612 seconds. These are
observations, not a duration guarantee. Preparation is separate.

Phase 1 retains the supplied organiser map. For a like-for-like Phase 3 solar
comparison, the frontend loads a cached freshly calculated unchanged baseline
once and verifies matching solver/definition/weather fingerprints. Both maps
use a shared colour scale. The old organiser map differs from the fresh engine
baseline and must not be used to attribute numerical differences to edits.
Solar exposure is kWh/m2, not indoor temperature; thermal figures are separate.

Solar cache validation checks exact submitted transforms, input/source hashes,
solver fingerprint, finite mesh coordinates, face indices and matching values.
Thermal-only cached results cannot satisfy a request that includes solar.
