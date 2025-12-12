from http.server import BaseHTTPRequestHandler
import subprocess
import sys
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Install streamlit if not available
        try:
            import streamlit
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "streamlit"])
        
        # Set up Streamlit to run in headless mode
        os.environ['STREAMLIT_SERVER_HEADLESS'] = 'true'
        os.environ['STREAMLIT_SERVER_PORT'] = '8501'
        os.environ['STREAMLIT_SERVER_ADDRESS'] = '0.0.0.0'
        
        # Run Streamlit app
        try:
            # Copy the main app.py to the api directory for Vercel
            import shutil
            app_source = '/var/task/app.py'
            app_dest = '/var/task/api/streamlit_app.py'
            
            if os.path.exists(app_source):
                shutil.copy2(app_source, app_dest)
            
            # Start Streamlit
            cmd = [sys.executable, "-m", "streamlit", "run", "streamlit_app.py", "--server.port=8501", "--server.address=0.0.0.0", "--server.headless=true"]
            process = subprocess.Popen(cmd, cwd='/var/task/api')
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            html_content = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>Market Scanner - Loading</title>
                <meta http-equiv="refresh" content="3;url=https://your-app.vercel.app:8501">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <h1>Market Scanner Starting...</h1>
                <div class="spinner"></div>
                <p>Your trading dashboard is loading. You'll be redirected automatically.</p>
                <p><a href="https://your-app.vercel.app:8501">Click here if not redirected</a></p>
            </body>
            </html>
            """
            
            self.wfile.write(html_content.encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            error_html = f"""
            <html>
            <body>
                <h1>Error Starting Market Scanner</h1>
                <p>Error: {str(e)}</p>
                <p><a href="/">Return to Dashboard</a></p>
            </body>
            </html>
            """
            self.wfile.write(error_html.encode())