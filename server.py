"""
Serveur local pour le planning MMI.
Lancer avec : python server.py
Puis ouvrir : http://localhost:8000
"""
import http.server
import webbrowser
import os

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silencieux

print(f"Serveur démarré sur http://localhost:{PORT}")
print("Appuyez sur Ctrl+C pour arrêter.")
webbrowser.open(f"http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
