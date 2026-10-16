"""Private CLI observability only: retain native exit codes without changing inputs."""
import json
import os
import subprocess
import time

_directory = os.environ.get('HEAT_DETECTIVE_DIAGNOSTIC_DIR')
if _directory:
    _original = subprocess.Popen

    class LoggedPopen(_original):
        def __init__(self, *args, **kwargs):
            self._hd_started = time.time()
            self._hd_record = {'command': str(args[0] if args else kwargs.get('args')),
                               'cwd': str(kwargs.get('cwd') or os.getcwd()),
                               'startedUnix': self._hd_started}
            super().__init__(*args, **kwargs)
            self._hd_save()

        def _hd_save(self, stdout=None, stderr=None):
            try:
                self._hd_record.update(pid=self.pid, returncode=self.returncode,
                                       elapsedSeconds=round(time.time() - self._hd_started, 3))
                for name, value in [('stdoutTail', stdout), ('stderrTail', stderr)]:
                    if value is not None:
                        self._hd_record[name] = value.decode('utf-8', 'replace')[-12000:] if isinstance(value, bytes) else str(value)[-12000:]
                with open(os.path.join(_directory, 'native-process-%s.json' % self.pid), 'w', encoding='utf-8') as stream:
                    json.dump(self._hd_record, stream, indent=2)
            except Exception:
                pass  # Instrumentation cannot change solver success or failure.

        def wait(self, *args, **kwargs):
            result = super().wait(*args, **kwargs)
            self._hd_save()
            return result

        def communicate(self, *args, **kwargs):
            result = super().communicate(*args, **kwargs)
            self._hd_save(*result)
            return result

    subprocess.Popen = LoggedPopen
