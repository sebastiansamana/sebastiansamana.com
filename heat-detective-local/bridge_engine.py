"""Execute the supplied GH definition in our own automation Rhino process.

The definition's FF component source and locked inputs are never changed.
This module is loaded only by run_job.ps1 in a new Rhino.Application.8.
"""
import os
import json
import shutil
import hashlib
import traceback
import datetime
import re
import sys
import System
import Rhino

ROOT = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.path.join(ROOT, 'runtime')

def stamp():
    return datetime.datetime.utcnow().isoformat() + 'Z'

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def write_json(path, value):
    with open(path, 'w') as f:
        json.dump(value, f, indent=2)

def run(job_dir):
    started = stamp()
    status_path = os.path.join(job_dir, 'progress.json')
    result_path = os.path.join(job_dir, 'result.json')
    def progress(stage):
        write_json(status_path, {'status': 'running', 'stage': stage, 'updatedAt': stamp()})
    doc = None
    ghdoc = None
    try:
        progress('Starting isolated Rhino and Grasshopper')
        with open(os.path.join(job_dir, 'request.json')) as f:
            request = json.load(f)
        pid = System.Diagnostics.Process.GetCurrentProcess().Id
        if pid in request['protectedRhinoPids']:
            raise RuntimeError('Refusing an existing user Rhino process')
        definition = os.path.join(RUNTIME, 'source.gh')
        model_file = os.path.join(RUNTIME, 'source.3dm')
        if digest(definition) != request['definitionSha256'] or digest(model_file) != request['modelSha256']:
            raise RuntimeError('Source fingerprint changed; analysis refused')
        engine_config_path = os.path.join(RUNTIME, 'engine-config.json')
        engine_config = None
        if os.path.isfile(engine_config_path):
            with open(engine_config_path) as f:
                engine_config = json.load(f)
            # Existing 8.3 runtime path prevents native engine MAX_PATH failures.
            job_dir = os.path.join(os.path.dirname(engine_config['ladybugToolsFolder']), 'jobs', os.path.basename(job_dir))
            status_path = os.path.join(job_dir, 'progress.json')
            result_path = os.path.join(job_dir, 'result.json')
            sys.path.insert(0, engine_config['pythonPackagePath'])
            import ladybug.config as lb_config
            lb_config.folders.ladybug_tools_folder = engine_config['ladybugToolsFolder']
            import honeybee_energy.config as energy_config
            energy_config.folders.openstudio_path = engine_config['openstudioPath']
            energy_config.folders.energyplus_path = engine_config['energyplusPath']
        gh = Rhino.RhinoApp.GetPlugInObject('Grasshopper')
        gh.DisableSolver()
        gh.LoadEditor()
        gh.HideEditor()
        import clr
        clr.AddReference('Grasshopper')
        import Grasshopper
        write_json(os.path.join(job_dir, 'assembly-probe.json'),
                   [{'name':str(a.FullName),'path':str(a.Location)} for a in System.AppDomain.CurrentDomain.GetAssemblies()
                    if 'grasshopper' in str(a.FullName).lower() or 'gh_io' in str(a.FullName).lower() or 'ghpython' in str(a.FullName).lower()])
        from Grasshopper.Kernel import GH_Document, GH_DocumentIO, GH_SolutionMode, GH_RuntimeMessageLevel
        from Grasshopper.Kernel.Special import GH_Panel
        GH_Document.EnableSolutions = False
        # Loading GH creates a blank document in a new automation instance.
        # Refuse any populated/named/modified document, even in our new process.
        blank = Rhino.RhinoDoc.ActiveDoc
        if blank is not None and (blank.Modified or blank.Path or
                len(list(blank.Objects.GetObjectList(Rhino.DocObjects.ObjectType.AnyObject))) > 0):
            raise RuntimeError('Automation instance has a non-empty document; refusing to replace it')
        progress('Reading copied building and restoring semantic layers')
        opened = Rhino.RhinoDoc.Open(model_file)
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            raise RuntimeError('Could not open the copied 3dm')
        with open(os.path.join(RUNTIME, 'object-manifest.json')) as f:
            manifest = json.load(f)
        if manifest['sourceSha256'] != request['modelSha256']:
            raise RuntimeError('Semantic map does not belong to source model')
        layers = {}
        def layer_index(path):
            if path in layers:
                return layers[path]
            idx = doc.Layers.FindByFullPath(path, -1)
            if idx < 0:
                layer = Rhino.DocObjects.Layer()
                bits = path.rsplit('::', 1)
                layer.Name = bits[-1]
                if len(bits) > 1:
                    layer.ParentLayerId = doc.Layers[layer_index(bits[0])].Id
                idx = doc.Layers.Add(layer)
            if idx < 0:
                raise RuntimeError('Failed to create semantic layer ' + path)
            layers[path] = idx
            return idx
        objects = {}
        for item in manifest['objects']:
            guid = System.Guid(item['id'])
            obj = doc.Objects.FindId(guid)
            if obj is None:
                raise RuntimeError('Source object missing: ' + item['id'])
            attributes = obj.Attributes.Duplicate()
            attributes.LayerIndex = layer_index(item['originalCategory'])
            if not doc.Objects.ModifyAttributes(guid, attributes, True):
                raise RuntimeError('Could not restore semantic layer for ' + item['id'])
            objects[item['id'].lower()] = item
        for change in request['transforms']:
            item = objects.get(change['id'].lower())
            if item is None or item['layer'] != 'changable' or not item['editable']:
                raise RuntimeError('Only objects on supplied changable layer may move')
            dx, dy, dz = [float(v) * 1000.0 for v in change['translationM']]
            transform = Rhino.Geometry.Transform.Translation(dx, dy, dz)
            obj = doc.Objects.FindId(System.Guid(item['id']))
            geometry = obj.Geometry.Duplicate()
            if not geometry.Transform(transform) or not doc.Objects.Replace(obj.Id, geometry):
                raise RuntimeError('Could not transform object ' + item['id'])
        # Honeybee writes only inside this job. Weather morph also writes beside
        # this job's copy. The user's installation/configuration is not edited.
        from honeybee.config import folders as hb_folders
        hb_folders.default_simulation_folder = os.path.join(job_dir, 'simulation')
        weather = os.path.join(job_dir, 'present.epw')
        shutil.copyfile(os.path.join(RUNTIME, 'weather', 'present.epw'), weather)
        progress('Loading reviewed source Grasshopper definition')
        # Read through the public archive API to avoid the editor's file dialogs.
        clr.AddReference('GH_IO')
        from GH_IO.Serialization import GH_Archive
        proxies = Grasshopper.Instances.ComponentServer.ObjectProxies
        write_json(os.path.join(job_dir, 'component-probe.json'),
                   {'proxyCount':len(list(proxies)), 'types':[str(p.Guid) for p in proxies]})
        archive = GH_Archive()
        if not archive.ReadFromFile(definition):
            raise RuntimeError('Grasshopper could not read the supplied archive')
        ghdoc = GH_Document()
        if not archive.ExtractObject(ghdoc, 'Definition'):
            raise RuntimeError('Grasshopper could not deserialize the supplied definition')
        progress('Configuring original Grasshopper dependency graph')
        Grasshopper.Instances.DocumentServer.AddDocument(ghdoc)
        by_name = dict((o.NickName, o) for o in ghdoc.Objects)
        energy = by_name['FF Atrium EnergyPlus']
        climate = by_name['FF Climate Morph']
        evaluation = by_name['FF Evaluation ID']
        params = request['parameters']
        for name, key in [('Glazing g-value','g'), ('Glazing U W/m2K','U'),
                          ('Day ventilation ACH','dayACH'), ('Night ventilation ACH','nightACH')]:
            by_name[name].SetSliderValue(System.Decimal(params[key]))
            if abs(float(by_name[name].CurrentValue) - params[key]) > 0.000001:
                raise RuntimeError('Requested slider value cannot be represented: ' + key)
        for name in ['RUN envelope studies', 'RUN atrium study', 'Auto-refresh team design']:
            by_name[name].Value = False
        by_name['RUN EnergyPlus'].Value = True
        by_name['Write future EPW'].Value = True
        # Supply the exact local EPW bytes via a panel; bypass download component.
        # The settings key fingerprints EPW bytes, not its path.
        panel = GH_Panel()
        panel.CreateAttributes()
        panel.NickName = 'Local EPW byte-identical source'
        panel.UserText = weather
        ghdoc.AddObject(panel, False)
        for component in [climate, evaluation]:
            target = component.Params.Input[0]
            target.RemoveAllSources()
            target.AddSource(panel)
        # Solve only official energy dependencies. Keep all FF code in document
        # so the official runtime fingerprint continues to include every script.
        required = set()
        def need(obj):
            key = str(obj.InstanceGuid)
            if key in required:
                return
            required.add(key)
            if hasattr(obj, 'Params'):
                for param in obj.Params.Input:
                    for source in param.Sources:
                        need(source.Attributes.GetTopLevel.DocObject)
            elif hasattr(obj, 'Sources'):
                for source in obj.Sources:
                    need(source.Attributes.GetTopLevel.DocObject)
        need(energy)
        need(climate)
        for obj in ghdoc.Objects:
            if hasattr(obj, 'Locked') and str(obj.InstanceGuid) not in required:
                obj.Locked = True
        progress('Running supplied Grasshopper definition and EnergyPlus')
        ghdoc.Enabled = True
        GH_Document.EnableSolutions = True
        ghdoc.NewSolution(True, GH_SolutionMode.Silent)
        GH_Document.EnableSolutions = False
        def output(component, name):
            p = next(p for p in component.Params.Output if p.Name == name)
            values = list(p.VolatileData.AllData(True))
            if not values:
                return None
            if name == 'out':
                return '\n'.join(str(v.ScriptVariable() if hasattr(v, 'ScriptVariable') else v) for v in values)
            value = values[0]
            return value.ScriptVariable() if hasattr(value, 'ScriptVariable') else value
        errors = []
        for obj in ghdoc.Objects:
            if str(obj.InstanceGuid) in required and hasattr(obj, 'RuntimeMessages'):
                errors += [obj.NickName + ': ' + str(m) for m in obj.RuntimeMessages(GH_RuntimeMessageLevel.Error)]
        write_json(os.path.join(job_dir, 'solve-diagnostics.json'),
                   {'errors':errors, 'requiredCount':len(required),
                    'energyOutputs':[{'name':p.Name,'count':p.VolatileDataCount} for p in energy.Params.Output],
                    'stdout':output(energy,'out')})
        report = output(energy, 'out')
        score = output(energy, 'score')
        op = output(energy, 'op_temp')
        if errors or score is None or op is None:
            raise RuntimeError('Grasshopper analysis did not yield a valid result. ' + '\n'.join(errors))
        operative = [float(v) for v in op.values]
        occupied = [8 <= dt.hour < 18 for dt in op.datetimes]
        if len(operative) != 168:
            raise RuntimeError('Expected 168 newly calculated hourly values')
        future = output(climate, 'future_week')
        air = output(energy, 'air_temp')
        eval_match = re.search(r'EVAL ID:\s*([A-Fa-f0-9]+)', str(report))
        eval_id = eval_match.group(1) if eval_match else None
        from honeybee_energy.config import folders as ef
        hot_hours = sum(1 for v, occ in zip(operative, occupied) if occ and v > 26)
        gh_reported_peak = float(output(energy, 'peak_temp'))
        peak = max(operative)
        metrics = {'score': float(score), 'scoreKh': float(score), 'peak': peak,
                   'peakOperativeC': peak, 'hotHours': hot_hours, 'occupiedHoursAbove26': hot_hours,
                   'ghReportedPeakOperativeC': gh_reported_peak,
                   'occupiedHoursAbove28': sum(1 for v, occ in zip(operative, occupied) if occ and v > 28),
                   'occupiedHoursAbove30': sum(1 for v, occ in zip(operative, occupied) if occ and v > 30)}
        limitations = [
            'Single fixed reference atrium thermal zone; moving walls does not resize its thermal geometry, floor or volume.',
            'Source geometry is reread and changed geometry can affect measured glazing and shading. Interior walls or faces below 19.35 m may have no thermal effect in this definition.',
            'Future weather is the organiser crude temperature morph, not a validated future climate projection.',
            'No thermal bridge, structural safety, airflow distribution or local comfort calculation.',
            'Compare only fresh runs using identical EVAL IDs; supplied reference EC2F526D may use another engine stack.'
        ]
        result = {'schemaVersion':'1.0', 'mode':'live', 'calculationState':'completed',
                  'modelScope':'organiser-fixed-atrium', 'evalId':eval_id,
                  'revision':request['revision'], 'parameters':params, 'metrics':metrics,
                  'hourly':{'operativeC':operative, 'airC':[float(v) for v in air.values],
                            'outdoorDryBulbC':[float(v) for v in future.values],
                            'occupied':occupied, 'labels':[str(dt) for dt in op.datetimes]},
                  'provenance':{'definitionSha256':request['definitionSha256'],
                                'modelSha256':request['modelSha256'], 'inputSha256':request['inputSha256'],
                                'weatherSha256':digest(weather), 'startedAt':started, 'completedAt':stamp(),
                                'engineVersion':'EnergyPlus ' + '.'.join(str(v) for v in ef.energyplus_version),
                                'libraryVersions':engine_config['versions'] if engine_config else None,
                                'engineConfigSha256':digest(engine_config_path) if engine_config else None,
                                'metricDerivations':{'peakOperativeC':'Maximum of the 168 calculated operative-temperature values, before display rounding'},
                                'rhinoVersion':str(Rhino.RhinoApp.Version), 'isolatedProcessId':pid,
                                'evalId':eval_id, 'referenceComparable':eval_id == 'EC2F526D',
                                'transformedObjectCount':len(request['transforms']),
                                'semanticLayersRestored':True, 'definitionFFCodeUnmodified':True},
                  'report':str(report), 'limitations':limitations}
        write_json(result_path, {'status':'completed','revision':request['revision'],'result':result})
        progress('Completed real Grasshopper and EnergyPlus run')
    except Exception as error:
        write_json(result_path, {'status':'failed', 'message':str(error), 'details':traceback.format_exc()})
    finally:
        if ghdoc is not None:
            try:
                ghdoc.Enabled = False
                ghdoc.IsModified = False
                Grasshopper.Instances.DocumentServer.RemoveDocument(ghdoc)
                ghdoc.Dispose()
            except Exception:
                pass
        if doc is not None:
            doc.Modified = False
