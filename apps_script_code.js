/**
 * ============================================================
 *  소상공인 종합지원 - 상담 데이터 관리 Apps Script
 * ============================================================
 *
 *  [사용법]
 *  1. Google Sheets에서 새 스프레드시트를 생성합니다.
 *  2. 시트 첫 행(A1~N1)에 아래 14개 헤더를 입력합니다:
 *     상담일자 | 업체번호 | 출생년도 | NICE CB점수 | 기보증금액 | 사업자구분 |
 *     설립일자 | 업종 | 종업원수 | 매출액 | 매출추이 | 진단모델 | 설문지 | 리포트
 *
 *  3. 확장 프로그램 > Apps Script 를 클릭합니다.
 *  4. 이 파일의 전체 코드를 붙여넣고 저장합니다.
 *  5. 배포 > 새 배포 > 유형: 웹 앱
 *     - 실행 사용자: 본인
 *     - 액세스 권한: 모든 사용자 (Anyone)
 *  6. 배포 후 생성되는 URL을 복사하여
 *     index.html 과 admin.html 코드 내에 URL이 이미 하드코딩되어 있습니다.
 *
 *  [주의]
 *  - 코드를 수정할 때마다 "새 배포"를 만들어야 변경사항이 반영됩니다.
 *  - "배포 관리"에서 기존 배포를 수정해도 캐시 때문에 반영이 안 될 수 있습니다.
 * ============================================================
 */

// ── 설정 ───────────────────────────────────────────
const SHEET_NAME = 'Sheet1'; // 상담 데이터가 저장될 시트 이름

// ★ API 비밀키 (index.html, admin.html 코드에도 동일한 값이 들어 있어야 합니다)
const API_SECRET = 'Vk9xTm2rWs7pLd4Q';

// ★ 관리자 페이지 접속 비밀번호 (admin.html의 비밀번호가 이 값과 일치해야 합니다)
const ADMIN_PASSWORD = '2082';

// ── 인증 헬퍼 ──────────────────────────────────────
function unauthorizedResponse() {
    return jsonResponse({ success: false, error: 'Unauthorized – 잘못된 API 키입니다.' });
}

// ── POST: 상담 데이터 저장 및 조회 (보안 패치 됨) ──────────────────────────
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // [1] 관리자 데이터 조회 요청인 경우 (pw 파라미터가 있는 경우)
        if (data.pw !== undefined) {
            // API 키 검증 (admin.html 에서는 'key' 로 전송 중)
            const key = data.key || '';
            if (key !== API_SECRET) {
                return unauthorizedResponse();
            }

            // 관리자 비밀번호 검증
            if (data.pw !== ADMIN_PASSWORD) {
                return jsonResponse({ success: false, error: '잘못된 비밀번호입니다.' });
            }

            const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
            if (!sheet) {
                return jsonResponse({ success: false, error: '시트를 찾을 수 없습니다: ' + SHEET_NAME });
            }

            const lastRow = sheet.getLastRow();
            if (lastRow < 2) {
                return jsonResponse({ success: true, data: [], total: 0 });
            }

            const range = sheet.getRange(2, 1, lastRow - 1, 14);
            const values = range.getValues();

            const records = values.map((row, idx) => ({
                rowIndex: idx + 2,
                consultDate: row[0] ? formatDate(row[0]) : '',
                businessNumber: String(row[1]),
                birthYear: String(row[2]),
                niceScore: String(row[3]),
                guaranteedAmount: String(row[4]),
                businessType: String(row[5]),
                foundationDate: row[6] ? formatDate(row[6]) : '',
                sector: String(row[7]),
                employeeCount: String(row[8]),
                annualSales: String(row[9]),
                revenueStatus: String(row[10]),
                modelName: String(row[11]),
                surveyData: String(row[12]),
                reportData: String(row[13])
            }));

            records.reverse(); // 최신 순 정렬
            return jsonResponse({ success: true, data: records, total: records.length });
        }

        // [2] 클라이언트 설문 데이터 저장 요청인 경우
        else {
            // API 키 검증 (index.html 에서는 'apiKey' 로 전송 중)
            if (data.apiKey !== API_SECRET) {
                return unauthorizedResponse();
            }

            const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
            if (!sheet) {
                return jsonResponse({ success: false, error: '시트를 찾을 수 없습니다: ' + SHEET_NAME });
            }

            // 14열 순서대로 행 추가
            sheet.appendRow([
                data.consultDate || '',
                data.businessNumber || '',
                data.birthYear || '',
                data.niceScore || '',
                data.guaranteedAmount || '',
                data.businessType || '',
                data.foundationDate || '',
                data.sector || '',
                data.employeeCount || '',
                data.annualSales || '',
                data.revenueStatus || '',
                data.modelName || '',
                data.surveyData || '',
                data.reportData || ''
            ]);

            return jsonResponse({ success: true, message: '저장 완료' });
        }

    } catch (err) {
        return jsonResponse({ success: false, error: err.toString() });
    }
}

// ── GET: 잘못된 접근 차단 처리 ───────────────────────────
function doGet(e) {
    return ContentService.createTextOutput("GET 요청은 지원하지 않습니다. (잘못된 접근)");
}

// ── 유틸리티 ────────────────────────────────────────
function jsonResponse(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

function formatDate(value) {
    let d = value;
    // 이미 YYYY-MM-DD 형식이면 그대로 반환
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
    }
    // 문자열이면 Date로 변환 시도
    if (!(value instanceof Date)) {
        d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
