"""
kordoc_server.py - total_solution 전용 로컬 Kordoc 파서 백엔드 서버

기능:
1. 웹 앱(index.html)에서 HWP, HWPX, PDF, XLSX, DOCX 문서 업로드 수신
2. 내 컴퓨터에 설치된 'kordoc' CLI(npx kordoc)로 100% 정밀 파싱
3. Gemini 2.5 Flash API로 total_solution 규격(자료명, 검색태그, 핵심요약, 분석대상) 1개 행 전용 추출
4. 구글 앱스 스크립트(GAS) Webhook으로 구글 시트 참고자료(Sheet1)에 행 추가
"""

import os
import sys
import json
import subprocess
import tempfile
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 5001

class KordocHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Private-Network')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self._set_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        response = {"status": "ok", "message": "total_solution Local Kordoc Server is running"}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def do_POST(self):
        if self.path != '/upload':
            self.send_response(404)
            self.end_headers()
            return

        try:
            content_type = self.headers.get('Content-Type', '')
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # Multipart form-data 파싱
            boundary_str = content_type.split("boundary=")[1].split(";")[0].strip('"')
            boundary = boundary_str.encode()
            parts = body.split(b"--" + boundary)

            file_bytes = None
            filename = "document.hwp"
            api_key = ""
            webhook_url = ""

            for part in parts:
                if b'Content-Disposition' in part:
                    try:
                        headers_part, content = part.split(b"\r\n\r\n", 1)
                        content = content.rsplit(b"\r\n", 1)[0]
                        headers_str = headers_part.decode('utf-8', errors='ignore')

                        if 'name="file"' in headers_str:
                            file_bytes = content
                            if 'filename="' in headers_str:
                                filename = headers_str.split('filename="')[1].split('"')[0]
                        elif 'name="apiKey"' in headers_str:
                            api_key = content.decode('utf-8', errors='ignore').strip()
                        elif 'name="webhookUrl"' in headers_str:
                            webhook_url = content.decode('utf-8', errors='ignore').strip()
                    except Exception as p_err:
                        pass

            if not file_bytes:
                self._send_json(400, {"error": "업로드된 파일이 없습니다."})
                return

            print(f"[total_solution Kordoc Parsing] Filename: {filename} ({len(file_bytes)} bytes)")

            # 임시 파일 저장 (확장자 유지)
            ext = os.path.splitext(filename)[1] or ".hwp"
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            parsed_text = ""
            try:
                # 1. 내 컴퓨터의 Kordoc CLI 실행 (npx kordoc)
                cmd = f'npx -y kordoc "{tmp_path}" --silent'
                res = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore', timeout=60)
                parsed_text = res.stdout.strip()
            except Exception as e:
                print(f"[Warning] Kordoc parse warning: {e}")
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except:
                        pass

            if not parsed_text or len(parsed_text.strip()) == 0:
                self._send_json(500, {"error": "Kordoc 문서 텍스트 파싱 실패 (암호화 문서 또는 스캔 이미지 여부를 확인해 주세요)"})
                return

            print(f"[Kordoc Parsing Complete] Extracted length: {len(parsed_text)}")

            # 2. total_solution 전용 Gemini AI 분석 (목차 분할 없이 1개 통합 행 생성)
            default_doc_title = os.path.splitext(filename)[0]
            ai_result = None

            if api_key:
                try:
                    print("[Gemini AI] Analyzing document for total_solution Reference Knowledge DB...")
                    prompt = f"""당신은 소상공인 지원사업 참고자료 데이터 분석 전문가입니다.
아래 제공되는 [문서 원문 텍스트]를 정밀하게 분석하여 구글 시트 지식DB 참고자료 시트1에 등록할 단 1개의 데이터 정보(JSON Object)를 작성해 주세요.

[문서 원문 텍스트]
{parsed_text[:16000]}

[필수 JSON 추출 구조]
- title: 문서 대표 제목 (기본값: "{default_doc_title}")
- tags: 핵심 검색태그 4~7개 (#용산구 #소상공인 #상권분석 등 띄어쓰기로 구분된 문자열)
- summary: 문서 전체의 핵심 수치, 통계, 주요 내용 요약 (마크다운 포맷, 3~6문장)
- target: 분석 대상 지역/업종/시기 (예: "서울 전체 / 전업종 / 2025년")"""

                    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
                    schema_json = {
                        "type": "OBJECT",
                        "properties": {
                            "title": {"type": "STRING"},
                            "tags": {"type": "STRING"},
                            "summary": {"type": "STRING"},
                            "target": {"type": "STRING"}
                        },
                        "required": ["title", "tags", "summary", "target"]
                    }

                    req_data = json.dumps({
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.2,
                            "responseMimeType": "application/json",
                            "responseSchema": schema_json
                        }
                    }).encode('utf-8')

                    req = urllib.request.Request(gemini_url, data=req_data, headers={'Content-Type': 'application/json'})
                    with urllib.request.urlopen(req) as response:
                        g_res = json.loads(response.read().decode('utf-8'))
                        g_text = g_res['candidates'][0]['content']['parts'][0]['text']
                        ai_result = json.loads(g_text)
                except Exception as ai_err:
                    import traceback
                    print(f"[Warning] Gemini Analysis failed: {ai_err}")
                    traceback.print_exc()

            if not ai_result:
                self._send_json(500, {"error": "Gemini AI 분석 실패: API 키를 확인해 주시거나 잠시 후 다시 시도해 주세요."})
                return

            print(f"[Analysis Result] Title: {ai_result.get('title')}")

            # 3. 구글 앱스 스크립트 Webhook으로 total_solution 구글 시트에 전송
            sheet_appended = False
            if webhook_url:
                try:
                    payload = json.dumps({
                        "sheetName": "Sheet1",
                        "priority": "", # 우선순위 공란
                        "title": ai_result.get("title", default_doc_title),
                        "tags": ai_result.get("tags", ""),
                        "summary": ai_result.get("summary", ""),
                        "target": ai_result.get("target", ""),
                        "fullText": parsed_text
                    }).encode('utf-8')

                    gas_req = urllib.request.Request(webhook_url, data=payload, headers={'Content-Type': 'application/json'})
                    with urllib.request.urlopen(gas_req) as gas_res:
                        sheet_appended = True
                        print("[Google Sheets] Reference data appended successfully")
                except Exception as gas_err:
                    print(f"[Error] Google Sheets append failed: {gas_err}")

            self._send_json(200, {
                "success": True,
                "filename": filename,
                "title": ai_result.get("title", default_doc_title),
                "sheetAppended": sheet_appended
            })

        except Exception as err:
            print(f"[Error] Server error: {err}")
            self._send_json(500, {"error": str(err)})

    def _send_json(self, status_code, obj):
        self.send_response(status_code)
        self._set_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode('utf-8'))

def run_server():
    server_address = ('127.0.0.1', PORT)
    httpd = HTTPServer(server_address, KordocHandler)
    print(f"[OK] total_solution Local Kordoc Server Started! (http://127.0.0.1:{PORT})")
    print("[Info] Ready for document upload requests. (Press Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == '__main__':
    run_server()
