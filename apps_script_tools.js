/**
 * ============================================================
 *  🛠️ 실무비서 도구 (경제 데이터 업데이트 & 대용량 주입기)
 * ============================================================
 * 
 *  [수정 사항]
 *  - 2026-04-08: 시간 기반 트리거 실행 시 UI 에러(getUi) 방지 로직 추가
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 실무비서 도구')
    .addItem('📖 대용량 원문 주입기 열기', 'showSidebar')
    .addSeparator()
    .addItem('📈 CD금리 즉시 업데이트', 'refreshEconomicData')
    .addToUi();
}

// --- 1. 원문 주입기 기능 (기존 유지) ---
function showSidebar() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:sans-serif;padding:10px}textarea{width:100%;height:300px;margin-bottom:10px;border:1.5pt solid #ccc;padding:5px}button{width:100%;padding:10px;background:#0055A5;color:white;border:none;font-weight:bold;cursor:pointer}</style>' +
    '<h3>대용량 원문 주입기</h3><textarea id="longText" placeholder="원문을 붙여넣으세요..."></textarea>' +
    '<button onclick="injectText()">원문 자동 분할 주입 시작</button>' +
    '<script>function injectText(){var text = document.getElementById("longText").value;' +
    'google.script.run.withSuccessHandler(function(){alert("성공적으로 분할 주입되었습니다!");}).processLongText(text);}</script>'
  ).setTitle('원문 주입 서비스').setWidth(350);
  SpreadsheetApp.getUi().showSidebar(html);
}

function processLongText(text) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();
  var limit = 45000; 
  var row = cell.getRow();
  var col = cell.getColumn();
  for (var i = 0, j = 0; i < text.length; i += limit, j++) {
    sheet.getRange(row, col + j).setValue(text.substring(i, i + limit));
  }
}

// --- 2. [명세서 반영] CD금리 업데이트 ---
// [수정 2026-07-11] ECOS API "Address unavailable" 에러 해결
//   - User-Agent 헤더 추가 (Google Cloud IP 차단 우회)
//   - StatisticSearch API(메인) + KeyStatisticList API(폴백) 이중화
//   - 지수 백오프 재시도 (최대 5회)

var ECOS_API_KEY = "FB7FM1P6EE4V82XRXJJ4";
var ECOS_FETCH_OPTIONS = {
  muteHttpExceptions: true,
  validateHttpsCertificates: true,
  followRedirects: true,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  }
};

/** ECOS API를 지수 백오프로 재시도하며 호출 */
function fetchWithRetry_(url, maxRetries) {
  var lastError = null;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, ECOS_FETCH_OPTIONS);
      var code = response.getResponseCode();
      if (code === 200) {
        return response;
      }
      lastError = new Error("HTTP " + code + ": " + response.getContentText().substring(0, 200));
    } catch (e) {
      lastError = e;
    }
    // 지수 백오프 대기: 2초, 4초, 8초, 16초, 32초
    if (attempt < maxRetries - 1) {
      var waitSec = Math.pow(2, attempt + 1);
      Utilities.sleep(waitSec * 1000);
    }
  }
  throw lastError;
}

/** [방법1] StatisticSearch API로 CD(91일) 금리 직접 조회 */
function fetchCdRateViaStatisticSearch_() {
  // 최근 30일 범위로 일별 CD(91일) 금리 조회
  var today = new Date();
  var thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  var endDate = Utilities.formatDate(today, "Asia/Seoul", "yyyyMMdd");
  var startDate = Utilities.formatDate(thirtyDaysAgo, "Asia/Seoul", "yyyyMMdd");
  
  var url = "https://ecos.bok.or.kr/api/StatisticSearch/" + ECOS_API_KEY + 
            "/json/kr/1/30/817Y002/D/" + startDate + "/" + endDate + "/010502000";
  
  var response = fetchWithRetry_(url, 5);
  var result = JSON.parse(response.getContentText());
  
  if (result.StatisticSearch && result.StatisticSearch.row && result.StatisticSearch.row.length > 0) {
    var rows = result.StatisticSearch.row;
    var latest = rows[rows.length - 1]; // 가장 최근 데이터
    return { value: latest.DATA_VALUE, cycle: latest.TIME };
  }
  throw new Error("StatisticSearch API: CD(91일) 데이터 없음");
}

/** [방법2] KeyStatisticList(100대 지표) API에서 CD수익률 추출 (폴백) */
function fetchCdRateViaKeyStatistic_() {
  var url = "https://ecos.bok.or.kr/api/KeyStatisticList/" + ECOS_API_KEY + "/json/kr/1/100";
  
  var response = fetchWithRetry_(url, 3);
  var result = JSON.parse(response.getContentText());
  
  if (result.KeyStatisticList && result.KeyStatisticList.row) {
    var rows = result.KeyStatisticList.row;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].KEYSTAT_NAME.indexOf("CD수익률") !== -1) {
        return { value: rows[i].DATA_VALUE, cycle: rows[i].CYCLE };
      }
    }
  }
  throw new Error("KeyStatisticList API: CD수익률 항목을 찾을 수 없음");
}

function refreshEconomicData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet2");
  
  // UI 객체를 안전하게 가져오기 (트리거 실행 시 에러 방지)
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* 화면이 없는 환경 */ }

  if (!sheet) {
    if (ui) { ui.alert("'Sheet2' 시트가 없습니다."); }
    else { console.error("'Sheet2' 시트를 찾을 수 없습니다."); }
    return;
  }

  try {
    var cdData = null;
    
    // 1차: StatisticSearch API (CD 91일물 직접 조회)
    try {
      cdData = fetchCdRateViaStatisticSearch_();
      console.log("StatisticSearch API 성공");
    } catch (e1) {
      console.warn("StatisticSearch API 실패, 폴백 시도: " + e1.toString());
      
      // 2차: KeyStatisticList API (100대 지표에서 추출)
      cdData = fetchCdRateViaKeyStatistic_();
      console.log("KeyStatisticList API(폴백) 성공");
    }
    
    // C2(수치), D2(시점) 업데이트
    sheet.getRange(2, 3, 1, 2).setValues([[cdData.value, cdData.cycle]]);
    
    if (ui) {
      ss.toast("CD수익률(91일) " + cdData.value + "% (" + cdData.cycle + ")", "업데이트 완료");
    }
    console.log("업데이트 완료: CD수익률 " + cdData.value + "% (" + cdData.cycle + ")");

  } catch (e) {
    if (ui) { ui.alert("연동 오류: " + e.toString()); }
    else { 
      console.error("ECOS 연동 실패: " + e.toString()); 
      throw e;
    }
  }
}

