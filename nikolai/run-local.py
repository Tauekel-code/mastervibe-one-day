"""Локальный просмотр. Требуется Python 3, без дополнительных библиотек."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    server = ThreadingHTTPServer(('127.0.0.1', 8080), partial(SimpleHTTPRequestHandler, directory=str(root)))
    print('Откройте http://localhost:8080 ; остановка Ctrl+C')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
