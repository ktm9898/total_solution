/**
 * ============================================================
 *  소상공인 종합지원 - 상담 데이터 관리 Apps Script
 * ============================================================
 *
 *  [사용법]
 *  1. Google Sheets에서 새 스프레드시트를 생성합니다.
 *  2. 시트 첫 행(A1~L1)에 아래 12개 헤더를 입력합니다:
 *     상담일자 | 업체번호 | 출생년도 | NICE CB점수 | 기보증금액 |
 *     설립일자 | 업종 | 종업원수 | 매출액 | 매출추이 | 설문지 | 리포트
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

// ── 인증 헬퍼 ──────────────────────────────────────
function unauthorizedResponse() {
    return jsonResponse({ success: false, error: 'Unauthorized – 잘못된 API 키입니다.' });
}

// ── POST: 상담 데이터 저장 ──────────────────────────
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // ★ API 키 검증
        if (data.apiKey !== API_SECRET) {
            return unauthorizedResponse();
        }

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

        if (!sheet) {
            return jsonResponse({ success: false, error: '시트를 찾을 수 없습니다: ' + SHEET_NAME });
        }

        // 12열 순서대로 행 추가 (apiKey는 저장하지 않음)
        sheet.appendRow([
            data.consultDate || '',   // A: 상담일자
            data.businessNumber || '',   // B: 업체번호
            data.birthYear || '',   // C: 출생년도
            data.niceScore || '',   // D: NICE CB점수
            data.guaranteedAmount || '', // E: 기보증금액
            data.foundationDate || '',   // F: 설립일자
            data.sector || '',   // G: 업종
            data.employeeCount || '',   // H: 종업원수
            data.annualSales || '',   // I: 매출액
            data.revenueStatus || '',   // J: 매출추이
            data.surveyData || '',   // K: 설문지 (JSON 문자열)
            data.reportData || ''    // L: 리포트 (텍스트)
        ]);

        return jsonResponse({ success: true, message: '저장 완료' });
    } catch (err) {
        return jsonResponse({ success: false, error: err.toString() });
    }
}

// ── GET: 상담 데이터 조회 ───────────────────────────
function doGet(e) {
    try {
        // ★ API 키 검증 (쿼리 파라미터: ?key=...)
        const key = (e && e.parameter && e.parameter.key) || '';
        if (key !== API_SECRET) {
            return unauthorizedResponse();
        }

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

        if (!sheet) {
            return jsonResponse({ success: false, error: '시트를 찾을 수 없습니다: ' + SHEET_NAME });
        }

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) {
            // 헤더만 있고 데이터 없음
            return jsonResponse({ success: true, data: [], total: 0 });
        }

        const range = sheet.getRange(2, 1, lastRow - 1, 12); // 2행부터 마지막 행까지, 12열
        const values = range.getValues();

        const records = values.map((row, idx) => ({
            rowIndex: idx + 2,
            consultDate: row[0] ? formatDate(row[0]) : '',
            businessNumber: String(row[1]),
            birthYear: String(row[2]),
            niceScore: String(row[3]),
            guaranteedAmount: String(row[4]),
            foundationDate: row[5] ? formatDate(row[5]) : '',
            sector: String(row[6]),
            employeeCount: String(row[7]),
            annualSales: String(row[8]),
            revenueStatus: String(row[9]),
            surveyData: String(row[10]),
            reportData: String(row[11])
        }));

        // 최신 순으로 정렬
        records.reverse();

        return jsonResponse({ success: true, data: records, total: records.length });
    } catch (err) {
        return jsonResponse({ success: false, error: err.toString() });
    }
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
