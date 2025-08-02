import http.server
import socketserver
import requests
import os
from urllib.parse import urlparse, parse_qs
import json

PORT = 8000
TARGET_URL = "http://0.0.0.0:11434"  # Change this to the API server's address

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_request()
        elif self.path.startswith('/internal/cpu'):
            data = json.dumps({"cpu_count": os.cpu_count()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request()
        else:
            self.send_error(405, "Method Not Allowed")

    def proxy_request(self):
        target_url = f"{TARGET_URL}{self.path}"
        headers = {key: value for key, value in self.headers.items()}

        try:
            if self.command == 'GET':
                response = requests.get(target_url, headers=headers, params=self.parse_params(), stream=True)
            elif self.command == 'POST':
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length) if content_length else None
                response = requests.post(target_url, headers=headers, data=post_data, stream=True)

            # Send the response status and headers.
            self.send_response(response.status_code)
            for key, value in response.headers.items():
                # Skip 'Transfer-Encoding' header if present.
                if key.lower() == 'transfer-encoding':
                    continue
                self.send_header(key, value)
            self.end_headers()

            # Stream the response content.
            for chunk in response.iter_content(chunk_size=4096):
                if chunk:
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error: {str(e)}".encode())

    def parse_params(self):
        query = urlparse(self.path).query
        return parse_qs(query)

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.ThreadingTCPServer(("", PORT), ProxyHandler) as httpd:
    print(f"Serving proxy and static content on port {PORT}")
    httpd.serve_forever()
