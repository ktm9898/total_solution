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
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "close"
  }
};

/** ECOS API를 짧은 지수 백오프로 재시도하며 호출 */
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
    // 짧은 지수 백오프 대기: 1.5초, 3초
    if (attempt < maxRetries - 1) {
      var waitSec = 1.5 * (attempt + 1);
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
  
  // 최대 2회 재시도 (실패 시 빠르게 폴백 및 트리거 재시도로 전환)
  var response = fetchWithRetry_(url, 2);
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
  
  // 최대 2회 재시도
  var response = fetchWithRetry_(url, 2);
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

/** [방법3] ECOS 메인 홈페이지 스크래핑 (ECOS API 소켓/접속 실패 시 3차 폴백) */
function fetchCdRateViaEcosHomepage_() {
  var url = "https://ecos.bok.or.kr";
  var response = fetchWithRetry_(url, 2);
  var html = response.getContentText("UTF-8");
  
  // ECOS 메인 홈페이지의 일일지표 영역 파싱 (예: CD(91일) ... 2.93 ... 08.10 마감)
  var cdMatch = html.match(/CD\s*\(\s*91일\s*\)[\s\S]*?([\d\.]+)/i);
  var dateMatch = html.match(/CD\s*\(\s*91일\s*\)[\s\S]*?(\d{2}\.\d{2})/i);
  
  if (cdMatch && cdMatch[1]) {
    var today = new Date();
    var currentYear = today.getFullYear();
    var cycle = dateMatch && dateMatch[1] 
      ? currentYear + dateMatch[1].replace(".", "") 
      : Utilities.formatDate(today, "Asia/Seoul", "yyyyMMdd");
    return { value: cdMatch[1], cycle: cycle };
  }
  
  throw new Error("ECOS 메인 홈페이지 파싱 실패");
}

/** [방법4] 네이버 금융 수집 (4차 예비 폴백) */
function fetchCdRateViaNaverFinance_() {
  var url = "https://finance.naver.com/marketindex/interestDetail.naver?marketindexCd=IRR_CD91";
  var response = fetchWithRetry_(url, 2);
  var html = response.getContentText("EUC-KR");
  
  // 네이버 금융 금리 추출 (no_today 내 숫자 태그 또는 blind 태그)
  var match = html.match(/<span\s+class="blind">([\d\.]+)<\/span>/) ||
              html.match(/<p\s+class="no_today"[\s\S]*?>([\s\S]*?)<\/p>/i);
              
  var dateMatch = html.match(/<span\s+class="date">([\d\.]+)/);
  
  if (match) {
    var valStr = match[1];
    if (valStr.indexOf("<span") !== -1) {
      // 이미지 폰트 span 내 숫자 결합 (<span class="no2">2</span><span class="jum">.</span>...)
      valStr = valStr.replace(/<span\s+class="jum">\.<span[^>]*>/g, ".")
                     .replace(/<[^>]+>/g, "").trim();
    }
    if (valStr && !isNaN(parseFloat(valStr))) {
      var today = new Date();
      var cycle = dateMatch ? dateMatch[1].replace(/\./g, "") : Utilities.formatDate(today, "Asia/Seoul", "yyyyMMdd");
      return { value: valStr, cycle: cycle };
    }
  }
  throw new Error("Naver Finance API: CD(91일) 금리 추출 실패");
}

function refreshEconomicData() {
  var ss = SpreadsheetApp.getActive();
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
      console.warn("StatisticSearch API 실패: " + e1.toString());
      
      try {
        // 2차: KeyStatisticList API (100대 지표에서 추출)
        cdData = fetchCdRateViaKeyStatistic_();
        console.log("KeyStatisticList API(2차 폴백) 성공");
      } catch (e2) {
        console.warn("KeyStatisticList API 실패: " + e2.toString());
        
        try {
          // 3차: ECOS 메인 홈페이지 웹 스크래핑
          cdData = fetchCdRateViaEcosHomepage_();
          console.log("ECOS 메인 홈페이지(3차 폴백) 성공");
        } catch (e3) {
          console.warn("ECOS 메인 홈페이지 실패, 4차 네이버 금융 시도: " + e3.toString());
          // 4차: 네이버 금융 수집 (ECOS 도메인 전체 차단 대비 4차 독립 폴백)
          cdData = fetchCdRateViaNaverFinance_();
          console.log("네이버 금융(4차 폴백) 성공");
        }
      }
    }
    
    // C2(수치), D2(시점) 업데이트
    sheet.getRange(2, 3, 1, 2).setValues([[cdData.value, cdData.cycle]]);
    
    // 성공 시 재시도 카운트 초기화 및 임시 트리거 정리
    resetRetryState_();
    
    if (ui) {
      ss.toast("CD수익률(91일) " + cdData.value + "% (" + cdData.cycle + ")", "업데이트 완료");
    }
    console.log("업데이트 완료: CD수익률 " + cdData.value + "% (" + cdData.cycle + ")");

  } catch (e) {
    if (ui) { 
      ui.alert("연동 오류: " + e.toString()); 
    } else { 
      console.error("CD금리 데이터 연동 실패: " + e.toString()); 
      // 트리거(비화면) 실행 시 예외를 던져 구글 오류 알림 메일이 즉시 전달되도록 함 (타임아웃 방지)
      handleTriggerFailure_(e);
    }
  }
}

/**
 * 트리거 실행 중 실패 처리: 실패 사유를 구글 에러 리포팅 메일로 전달되도록 명시적 예외 발생
 */
function handleTriggerFailure_(error) {
  resetRetryState_();
  throw new Error("[실무비서 CD금리 업데이트 실패] 원인: " + error.toString());
}

/** 30분 후 실행될 일회성 트리거 생성 */
function scheduleAutoRetry_() {
  cleanUpRetryTriggers_();
  ScriptApp.newTrigger('refreshEconomicDataRetry_')
    .timeBased()
    .after(30 * 60 * 1000)
    .create();
}

/** 30분 후 자동 재시도 실행 핸들러 */
function refreshEconomicDataRetry_() {
  try {
    console.log("30분 후 자동 재시도 실행 중...");
    refreshEconomicData();
  } catch (e) {
    console.error("재시도 중 에러 발생: " + e.toString());
    throw e;
  } finally {
    cleanUpRetryTriggers_();
  }
}

/** 임시 재시도 트리거 정리 */
function cleanUpRetryTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'refreshEconomicDataRetry_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/** 재시도 카운트 및 임시 트리거 상태 초기화 */
function resetRetryState_() {
  PropertiesService.getScriptProperties().deleteProperty("ECOS_RETRY_COUNT");
  cleanUpRetryTriggers_();
}

