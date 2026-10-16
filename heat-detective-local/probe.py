"""Read-only API probe in a NEW automation Rhino instance; never saves documents."""
import os
import json
import traceback
import System
import Rhino

root = os.path.dirname(os.path.abspath(__file__))
runtime = os.path.join(root, 'runtime')
if not os.path.isdir(runtime):
    os.makedirs(runtime)
data = {'pid': System.Diagnostics.Process.GetCurrentProcess().Id,
        'rhinoVersion': str(Rhino.RhinoApp.Version),
        'docName': Rhino.RhinoDoc.ActiveDoc.Name if Rhino.RhinoDoc.ActiveDoc else None}
try:
    assert data['pid'] != 36596, 'Refusing the existing user Rhino process'
    gh = Rhino.RhinoApp.GetPlugInObject('Grasshopper')
    data['grasshopperAutomation'] = gh is not None
    if gh is not None:
        gh.DisableSolver()
        gh.LoadEditor()
        gh.HideEditor()
    import clr
    clr.AddReferenceToFileAndPath(r'C:\Program Files\Rhino 8\Plug-ins\Grasshopper\Grasshopper.dll')
    import Grasshopper
    data['grasshopperLoaded'] = True
    from honeybee.config import folders
    folders.default_simulation_folder = os.path.join(runtime, 'simulation')
    data['simulationFolder'] = folders.default_simulation_folder
    data['honeybeePython'] = folders.python_exe_path
    from honeybee_energy.config import folders as ef
    data['energyPlusPath'] = ef.energyplus_path
    data['energyPlusVersion'] = ef.energyplus_version
except Exception:
    data['error'] = traceback.format_exc()
with open(os.path.join(runtime, 'probe.json'), 'w') as f:
    json.dump(data, f, indent=2)
