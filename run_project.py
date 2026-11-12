"""Inicia o servidor Flask e o coletor realtime em um único comando."""

import os
import subprocess
import sys
import time
from pathlib import Path

from flask_app.config import BASE_DIR, _load_dotenv


def main():
    _load_dotenv(BASE_DIR / '.env')
    interval = os.environ.get('COLLECTOR_INTERVAL', '30')
    processes = [
        subprocess.Popen([sys.executable, 'run_flask.py'], cwd=BASE_DIR),
        subprocess.Popen(
            [sys.executable, 'run_flask_collector.py', '--loop', '--interval', interval],
            cwd=BASE_DIR,
        ),
    ]
    print('Projeto iniciado.', flush=True)
    print('Dashboard: http://127.0.0.1:5000/dashboard', flush=True)
    print(f'Coletor: ciclo a cada {interval}s', flush=True)
    print('Pressione Ctrl+C para encerrar os dois processos.', flush=True)

    try:
        while True:
            for process in processes:
                if process.poll() is not None:
                    raise SystemExit(process.returncode or 1)
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        for process in processes:
            if process.poll() is None:
                if os.name == 'nt':
                    subprocess.run(
                        ['taskkill', '/PID', str(process.pid), '/T', '/F'],
                        capture_output=True,
                        check=False,
                    )
                else:
                    process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        raise


if __name__ == '__main__':
    main()