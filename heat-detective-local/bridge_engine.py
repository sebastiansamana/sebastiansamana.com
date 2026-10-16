# -*- coding: utf-8 -*-
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
import time
import math
import System
import Rhino

ROOT = os.path.dirname(os.path.abspath(__file__))
RUNTIME = os.path.join(ROOT, 'runtime')
_WORKER = None

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

def assert_blank_document():
    blank = Rhino.RhinoDoc.ActiveDoc
    if blank is not None and (blank.Modified or blank.Path or
            len(list(blank.Objects.GetObjectList(Rhino.DocObjects.ObjectType.AnyObject))) > 0):
        raise RuntimeError('Private instance has an unexpected populated or modified document')
    return blank

def prepare_worker(worker_dir):
    """Warm only a newly created, explicitly owned Rhino; do not run an analysis."""
    global _WORKER
    started = stamp()
    try:
        with open(os.path.join(worker_dir, 'safety.json')) as stream:
            safety = json.load(stream)
        process = System.Diagnostics.Process.GetCurrentProcess()
        if process.Id in safety['protectedRhinoPids']:
            raise RuntimeError('Refusing an existing protected Rhino process')
        identity = {'pid':process.Id, 'processStartTicksUtc':str(process.StartTime.ToUniversalTime().Ticks),
                    'workerId':safety['workerId'], 'recordedAt':stamp()}
        write_json(os.path.join(worker_dir, 'ownership.json'), identity)
        if os.path.isfile(os.path.join(worker_dir, 'stop.flag')):
            raise RuntimeError('Warmup cancelled')
        assert_blank_document()
        engine_path = os.path.join(RUNTIME, 'engine-config.json')
        if digest(engine_path) != safety['engineConfigSha256'] or digest(__file__) != safety['bridgeCodeSha256']:
            raise RuntimeError('Worker configuration changed before preparation')
        with open(engine_path) as stream:
            cfg = json.load(stream)
        sys.path.insert(0, cfg['pythonPackagePath'])
        import ladybug.config as lc
        lc.folders.ladybug_tools_folder = cfg['ladybugToolsFolder']
        import honeybee_energy.config as ec
        ec.folders.openstudio_path = cfg['openstudioPath']
        ec.folders.energyplus_path = cfg['energyplusPath']
        gh = Rhino.RhinoApp.GetPlugInObject('Grasshopper')
        gh.DisableSolver()
        gh.LoadEditor()
        gh.HideEditor()
        import clr
        clr.AddReference('Grasshopper')
        import Grasshopper
        Grasshopper.Kernel.GH_Document.EnableSolutions = False
        assert_blank_document()
        if os.path.isfile(os.path.join(worker_dir, 'stop.flag')):
            raise RuntimeError('Warmup cancelled')
        _WORKER = {'identity':identity, 'safety':safety, 'directory':worker_dir, 'gh':gh}
        write_json(os.path.join(worker_dir,'prepared.json'), {'ready':True, 'startedAt':started,'readyAt':stamp(),'identity':identity})
    except Exception as error:
        _WORKER = None
        write_json(os.path.join(worker_dir,'prepared.json'), {'ready':False,'message':str(error),'details':traceback.format_exc()})

def run(job_dir):
    started = stamp()
    started_clock = time.time()
    stages = []
    status_path = os.path.join(job_dir, 'progress.json')
    result_path = os.path.join(job_dir, 'result.json')
    def progress(stage):
        if os.path.isfile(os.path.join(job_dir, 'cancel.flag')):
            raise RuntimeError('Job cancelled at the bridge time limit')
        stages.append({'stage':stage, 'at':stamp(), 'elapsedSeconds':round(time.time()-started_clock,3)})
        write_json(status_path, {'status': 'running', 'stage': stage, 'updatedAt': stamp(), 'stages':stages})
    doc = None
    ghdoc = None
    request = None
    warm = False
    owned_doc_serial = None
    try:
        with open(os.path.join(job_dir, 'request.json')) as f:
            request = json.load(f)
        process = System.Diagnostics.Process.GetCurrentProcess()
        pid = process.Id
        warm = bool(request.get('workerIdentity'))
        if warm:
            if _WORKER is None or request['workerIdentity'] != _WORKER['identity']:
                raise RuntimeError('Warm worker ownership does not match this private process')
            if digest(os.path.join(RUNTIME,'engine-config.json')) != _WORKER['safety']['engineConfigSha256'] or digest(__file__) != _WORKER['safety']['bridgeCodeSha256']:
                raise RuntimeError('Loaded worker configuration changed; worker must be recreated')
            if str(process.StartTime.ToUniversalTime().Ticks) != _WORKER['identity']['processStartTicksUtc']:
                raise RuntimeError('Warm process identity changed')
        if pid in request['protectedRhinoPids']:
            raise RuntimeError('Refusing an existing user Rhino process')
        write_json(os.path.join(job_dir, 'ownership.json'),
                   {'pid':pid, 'processStartTicksUtc':str(process.StartTime.ToUniversalTime().Ticks), 'recordedAt':stamp()})
        progress('Starting isolated Rhino and Grasshopper')
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
        gh = _WORKER['gh'] if warm else Rhino.RhinoApp.GetPlugInObject('Grasshopper')
        gh.DisableSolver()
        if not warm:
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
        blank = assert_blank_document()
        progress('Reading copied building and restoring semantic layers')
        if warm:
            # Even an unexpected save during document reset cannot change the
            # immutable source: only this job's disposable copy is opened.
            model_file = os.path.join(job_dir,'analysis.3dm')
            shutil.copyfile(os.path.join(RUNTIME,'source.3dm'),model_file)
        opened = Rhino.RhinoDoc.Open(model_file)
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            raise RuntimeError('Could not open the copied 3dm')
        owned_doc_serial = int(doc.RuntimeSerialNumber)
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
        include_solar = request.get('includeSolar', False)
        solar_component = None
        solar_setup_error = None
        for name, key in [('Glazing g-value','g'), ('Glazing U W/m2K','U'),
                          ('Day ventilation ACH','dayACH'), ('Night ventilation ACH','nightACH')]:
            by_name[name].SetSliderValue(System.Decimal(params[key]))
            if abs(float(by_name[name].CurrentValue) - params[key]) > 0.000001:
                raise RuntimeError('Requested slider value cannot be represented: ' + key)
        for name in ['RUN envelope studies', 'RUN atrium study', 'Auto-refresh team design']:
            by_name[name].Value = False
        if include_solar:
            try:
                # Configure only this private process, retaining original source code.
                radiance_root = os.path.join(os.path.dirname(engine_config['ladybugToolsFolder']), 'engine', 'radiance6')
                if not os.path.isfile(os.path.join(radiance_root, 'bin', 'gendaymtx.exe')):
                    radiance_root = os.path.join(ROOT, 'radiance6')
                os.environ['RAYPATH'] = '.' + os.pathsep + os.path.join(radiance_root, 'lib')
                from ladybug_radiance.config import folders as lr_folders
                from honeybee_radiance.config import folders as hr_folders
                lr_folders.radiance_path = radiance_root
                hr_folders.radiance_path = radiance_root
                import ladybug_radiance.skymatrix as sm_module
                sm_module.GENDAYMTX_EXE = os.path.join(radiance_root, 'bin', 'gendaymtx.exe')
                if not os.path.isfile(sm_module.GENDAYMTX_EXE):
                    raise RuntimeError('Private gendaymtx executable missing')
                solar_component = ghdoc.FindObject(System.Guid('df8c45bd-26d1-41e8-b61f-228bcfbe2a14'), True)
                if solar_component is None:
                    raise RuntimeError('Source hot-week Ladybug component missing')
                by_name['RUN envelope studies'].Value = True
            except Exception as solar_error:
                solar_setup_error = str(solar_error)
                solar_component = None
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
        energy_required = set(required)
        if solar_component is not None:
            sky = ghdoc.FindObject(System.Guid('a908ad6e-df93-4ce4-bf29-1365ef3068e1'), True)
            folder_panel = GH_Panel()
            folder_panel.CreateAttributes()
            folder_panel.NickName = 'Private solar calculation folder'
            solar_sky_folder = os.path.join(job_dir, 'solar-sky')
            if not os.path.isdir(solar_sky_folder):
                os.makedirs(solar_sky_folder)
            folder_panel.UserText = solar_sky_folder
            ghdoc.AddObject(folder_panel, False)
            sky_folder_input = next(p for p in sky.Params.Input if p.Name == '_folder_')
            sky_folder_input.RemoveAllSources()
            sky_folder_input.AddSource(folder_panel)
            need(solar_component)
        for obj in ghdoc.Objects:
            if hasattr(obj, 'Locked') and str(obj.InstanceGuid) not in required:
                obj.Locked = True
        progress('Running supplied Grasshopper definition, EnergyPlus and Ladybug solar' if solar_component is not None else 'Running supplied Grasshopper definition and EnergyPlus')
        # Observe the original FF subprocess call without changing its source,
        # arguments, model, weather or solver settings. Preserve discarded output.
        import subprocess
        original_popen = subprocess.Popen
        cli_records = []
        def observed_popen(args, *positional, **kwargs):
            is_simulation = isinstance(args, (list, tuple)) and 'honeybee_energy' in args and 'simulate' in args
            if not is_simulation:
                return original_popen(args, *positional, **kwargs)
            env = dict(kwargs.get('env') or os.environ)
            env['PYTHONPATH'] = os.path.join(ROOT, 'diagnostics') + os.pathsep + env.get('PYTHONPATH','')
            env['HEAT_DETECTIVE_DIAGNOSTIC_DIR'] = job_dir
            kwargs['env'] = env
            begin = time.time()
            child = original_popen(args, *positional, **kwargs)
            class ObservedProcess(object):
                def __getattr__(self, name):
                    return getattr(child, name)
                def communicate(self, *a, **kw):
                    out, err = child.communicate(*a, **kw)
                    def decoded(value):
                        return value.decode('utf-8','replace') if hasattr(value,'decode') else str(value or '')
                    record = {'pid':child.pid, 'returncode':child.returncode,
                              'elapsedSeconds':round(time.time()-begin,3),
                              'stdout':decoded(out), 'stderr':decoded(err)}
                    cli_records.append(record)
                    try:
                        write_json(os.path.join(job_dir,'simulation-cli.json'),record)
                    except Exception:
                        pass
                    return out, err
            return ObservedProcess()
        subprocess.Popen = observed_popen
        ghdoc.Enabled = True
        GH_Document.EnableSolutions = True
        try:
            ghdoc.NewSolution(True, GH_SolutionMode.Silent)
        finally:
            subprocess.Popen = original_popen
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
            if str(obj.InstanceGuid) in energy_required and hasattr(obj, 'RuntimeMessages'):
                errors += [obj.NickName + ': ' + str(m) for m in obj.RuntimeMessages(GH_RuntimeMessageLevel.Error)]
        write_json(os.path.join(job_dir, 'solve-diagnostics.json'),
                   {'errors':errors, 'requiredCount':len(required),
                    'energyOutputs':[{'name':p.Name,'count':p.VolatileDataCount} for p in energy.Params.Output],
                    'stdout':output(energy,'out')})
        report = output(energy, 'out')
        score = output(energy, 'score')
        op = output(energy, 'op_temp')
        if errors or score is None or op is None:
            diagnostic = ''
            if cli_records:
                cli = cli_records[-1]
                diagnostic = '\nSimulation CLI exit: %s; elapsed: %s s. Output: %s' % (cli['returncode'],cli['elapsedSeconds'],(cli['stderr']+'\n'+cli['stdout'])[-2500:])
            raise RuntimeError('Grasshopper analysis did not yield a valid result. ' + '\n'.join(errors) + diagnostic)
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
        result = {'schemaVersion':'1.0', 'mode':'live', 'executionSource':'fresh', 'calculationState':'completed',
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
                                'workerMode':'warm-isolated' if warm else 'new-isolated',
                                'workerId':_WORKER['identity']['workerId'] if warm else None,
                                'analysisDocumentSerial':owned_doc_serial,
                                'diagnostics':'CLI stdout/stderr and native exit codes captured without modifying FF source or solver inputs',
                                'ghElapsedSeconds':round(time.time()-started_clock,3),
                                'evalId':eval_id, 'referenceComparable':eval_id == 'EC2F526D',
                                'transformedObjectCount':len(request['transforms']),
                                'semanticLayersRestored':True, 'definitionFFCodeUnmodified':True},
                  'report':str(report), 'limitations':limitations}
        if include_solar:
            solar_started = time.time()
            try:
                if solar_setup_error:
                    raise RuntimeError(solar_setup_error)
                solar_errors = []
                for obj in ghdoc.Objects:
                    if str(obj.InstanceGuid) in required and str(obj.InstanceGuid) not in energy_required and hasattr(obj, 'RuntimeMessages'):
                        solar_errors += [obj.NickName + ': ' + str(m) for m in obj.RuntimeMessages(GH_RuntimeMessageLevel.Error)]
                if solar_errors:
                    raise RuntimeError('\n'.join(solar_errors))
                solar_mesh = output(solar_component, 'mesh')
                values_param = next(p for p in solar_component.Params.Output if p.Name == 'results')
                solar_values = [float(v.ScriptVariable() if hasattr(v, 'ScriptVariable') else v) for v in values_param.VolatileData.AllData(True)]
                if solar_mesh is None or solar_mesh.Faces.Count != len(solar_values) or not solar_values:
                    raise RuntimeError('Ladybug solar mesh and values are empty or misaligned')
                if any(math.isnan(v) or math.isinf(v) or v < 0 for v in solar_values):
                    raise RuntimeError('Ladybug solar values must be finite and non-negative')
                to_m = Rhino.RhinoMath.UnitScale(doc.ModelUnitSystem, Rhino.UnitSystem.Meters)
                solar_mesh.FaceNormals.ComputeFaceNormals()
                vertices = [[float(v.X)*to_m,float(v.Y)*to_m,float(v.Z)*to_m] for v in solar_mesh.Vertices]
                faces, areas, categories = [], [], []
                for face in solar_mesh.Faces:
                    indices = [face.A,face.B,face.C] + ([face.D] if face.IsQuad else [])
                    faces.append(indices)
                    pts = [solar_mesh.Vertices[k] for k in indices]
                    area = sum(Rhino.Geometry.Vector3d.CrossProduct(Rhino.Geometry.Vector3d(pts[k]-pts[0]),Rhino.Geometry.Vector3d(pts[k+1]-pts[0])).Length / 2.0 for k in range(1,len(pts)-1))
                    areas.append(float(area)*to_m*to_m)
                    n = solar_mesh.FaceNormals[len(faces)-1]
                    categories.append('roof' if n.Z>0.7 else 'facade')
                solar_provenance = {'component':'LB Incident Radiation','componentVersion':'1.10.0','componentGuid':'df8c45bd-26d1-41e8-b61f-228bcfbe2a14',
                    'definitionSha256':request['definitionSha256'],'modelSha256':request['modelSha256'],'inputSha256':request['inputSha256'],
                    'revision':request['revision'],'completedAt':stamp(),'gridSizeM':float(by_name['Envelope grid mm'].CurrentValue)*to_m,
                    'northDegrees':float(by_name['North deg'].CurrentValue),'geometry':'current-transformed-model','transforms':request['transforms'],
                    'sourceCodeUnmodified':True,'geometryOffsetM':0.15,'sensorOffsetM':0.1,'skyPatches':145,
                    'radiancePath':radiance_root,'weatherSha256':digest(weather)}
                solar_provenance['gendaymtxSha256'] = digest(sm_module.GENDAYMTX_EXE)
                solar_provenance['radianceVersion'] = str(lr_folders.radiance_version_str)
                solar_provenance['solverFingerprint'] = hashlib.sha256(('|'.join([
                    'ladybug-incident-radiation-1.10.0-envelope-grid-v1',
                    'c4f02efcb4a33f4a43b7ce0ba58100544abc317a1be61f7b0425a64a66eb8a09',
                    solar_provenance['gendaymtxSha256']])).encode('utf-8')).hexdigest()
                try:
                    solar_provenance['componentSeconds'] = float(solar_component.ProcessorTime.TotalSeconds)
                except Exception:
                    pass
                result['solarRadiation'] = {'schemaVersion':1,'kind':'ladybug-edited-radiation','modelSha256':request['modelSha256'],
                    'revision':request['revision'],'inputSha256':request['inputSha256'],'transforms':request['transforms'],
                    'mesh':{'vertices':vertices,'faces':faces,'units':'m','upAxis':'Z','category':categories,'areaM2':areas},
                    'studies':{'hot_week':{'values':solar_values,'min':min(solar_values),'max':max(solar_values),'unit':'kWh/m2',
                        'label':'Edited-design incident solar radiation','period':str(output(climate,'hot_week')),
                        'meaning':'Incident solar energy per square metre of current envelope; not indoor temperature.'}},
                    'provenance':solar_provenance,
                    'limitations':['Original Ladybug component: no inter-surface solar reflections.','Exterior envelope only; not indoor thermal comfort.']}
                # Validate serialization while inside the solar-only error boundary.
                json.dumps(result['solarRadiation'])
                result['provenance']['solarExportSeconds'] = round(time.time()-solar_started,3)
            except Exception as solar_error:
                result.pop('solarRadiation', None)
                result['solarRadiationError'] = {'code':'SOLAR_UNAVAILABLE','message':str(solar_error),'details':traceback.format_exc(),'inputSha256':request['inputSha256'],'revision':request['revision']}
            write_json(os.path.join(job_dir,'solar-diagnostics.json'),{'available':'solarRadiation' in result,'error':result.get('solarRadiationError'),
                'requiredCount':len(required),'energyRequiredCount':len(energy_required),'exportSeconds':round(time.time()-solar_started,3),
                'outputs':[{'name':p.Name,'count':p.VolatileDataCount} for p in solar_component.Params.Output] if solar_component is not None else []})
        write_json(result_path, {'status':'completed','revision':request['revision'],'result':result})
        progress('Completed real Grasshopper and EnergyPlus run')
    except Exception as error:
        write_json(result_path, {'status':'failed', 'errorCode':'ENGINE_FAILURE', 'message':str(error), 'details':traceback.format_exc(), 'elapsedSeconds':round(time.time()-started_clock,3)})
    finally:
        cleanup_errors = []
        try:
            import Grasshopper
            Grasshopper.Kernel.GH_Document.EnableSolutions = False
            if warm:
                _WORKER['gh'].DisableSolver()
        except Exception as error:
            if warm:
                cleanup_errors.append('Disable solver: '+str(error))
        if ghdoc is not None:
            try:
                ghdoc.Enabled = False
                ghdoc.IsModified = False
                Grasshopper.Instances.DocumentServer.RemoveDocument(ghdoc)
                ghdoc.Dispose()
                if warm and any(item is ghdoc for item in Grasshopper.Instances.DocumentServer):
                    raise RuntimeError('Owned GH document remains registered')
            except Exception as error:
                if warm:
                    cleanup_errors.append('GH disposal: '+str(error))
        if doc is not None:
            doc.Modified = False
        if warm:
            try:
                if doc is not None:
                    active = Rhino.RhinoDoc.ActiveDoc
                    if active is None or int(active.RuntimeSerialNumber) != owned_doc_serial:
                        raise RuntimeError('Unexpected active document; refusing reset')
                    # This is only our job copy, never the user's document.
                    fresh = Rhino.RhinoDoc.Create(None)
                    active = assert_blank_document()
                    if active is None or int(active.RuntimeSerialNumber) == owned_doc_serial:
                        raise RuntimeError('Fresh empty document was not made active')
                    if any(int(item.RuntimeSerialNumber) == owned_doc_serial for item in Rhino.RhinoDoc.OpenDocuments()):
                        raise RuntimeError('Previous private analysis document remains open')
                else:
                    assert_blank_document()
                if digest(os.path.join(RUNTIME,'source.3dm')) != request['modelSha256'] or digest(os.path.join(RUNTIME,'source.gh')) != request['definitionSha256']:
                    raise RuntimeError('Immutable source hash changed')
                if os.path.isfile(os.path.join(job_dir,'analysis.3dm')):
                    # Delete only the exact disposable file in this known job.
                    os.remove(os.path.join(job_dir,'analysis.3dm'))
            except Exception as error:
                cleanup_errors.append('Rhino reset/source verification: '+str(error))
            write_json(os.path.join(job_dir,'cleanup.json'),
                       {'readyForReuse':not cleanup_errors,'message':'; '.join(cleanup_errors),
                        'at':stamp(),'previousDocumentSerial':owned_doc_serial,
                        'activeDocumentSerial':int(Rhino.RhinoDoc.ActiveDoc.RuntimeSerialNumber) if Rhino.RhinoDoc.ActiveDoc else None,
                        'sourceModelSha256':digest(os.path.join(RUNTIME,'source.3dm'))})
