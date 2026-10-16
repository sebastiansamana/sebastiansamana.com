HEAT DETECTIVE — LOCAL SIMULATION BRIDGE

Double-click START_LOCAL.cmd with Node.js installed. It reuses a healthy local
bridge, otherwise starts one hidden, checks readiness, and opens the demo at:
http://127.0.0.1:8767/heat-detective/

PowerShell alternative: START_LOCAL.ps1. Add -NoBrowser for a readiness check
without opening another browser tab. The launcher never starts a simulation.

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
Each uncached request starts a new Rhino.Application.8 automation process. It does not
attach to the user's current Rhino. Process IDs that existed at job submission
are recorded and explicitly refused. The source copy is opened in that new
process. Object GUIDs restore the original analysis layer categories; only
objects marked editable on the supplied changable layer may be translated.

The original Grasshopper file is loaded. Its FF component code and locked
evaluation inputs remain unchanged. The weather download is replaced by a
byte-identical local EPW input. Unneeded radiation/visual components are not
solved. The official EnergyPlus component and its original dependency graph
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
Production fresh runs have a 120-second total deadline from submission,
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
HEAT_DETECTIVE_DIAGNOSTIC_TIMEOUT_SECONDS=1..120. Port 8767 always uses 120 s.

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
All worker Rhino processes closed; original user Rhino PID 36596 remained.
The protected original repository's 507 tracked files still matched the saved
SHA256 manifest, including both pre-existing user edits.
